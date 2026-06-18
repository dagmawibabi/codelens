import { execa } from "execa"
import path from "node:path"
import { promises as fs } from "node:fs"
import type { ProjectInfo, TypeCheckResult, TypeDiagnostic } from "../types.js"

async function resolveBin(root: string): Promise<string | null> {
  const local = path.join(root, "node_modules", ".bin", "tsc")
  try {
    await fs.access(local)
    return local
  } catch {
    return null
  }
}

// Matches: path/to/file.ts(12,5): error TS2345: message
const LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/

/**
 * Runs `tsc --noEmit --pretty false` and parses diagnostics.
 * Indented continuation lines are folded into the related-information chain
 * of the preceding diagnostic (the readable assignability tree).
 */
export async function runTsc(
  root: string,
  project: ProjectInfo,
): Promise<TypeCheckResult> {
  if (!project.hasTypeScript) {
    return { diagnostics: [], unavailable: true, note: "No TypeScript detected in this project." }
  }

  const bin = await resolveBin(root)
  const cmd = bin ?? "npx"
  const baseArgs = bin ? [] : ["--no-install", "tsc"]
  const args = [...baseArgs, "--noEmit", "--pretty", "false"]

  let output = ""
  try {
    const res = await execa(cmd, args, { cwd: root, reject: false, timeout: 180_000 })
    output = `${res.stdout}\n${res.stderr}`
  } catch (err) {
    return {
      diagnostics: [],
      unavailable: true,
      note: "Could not run tsc. " + (err instanceof Error ? err.message : String(err)),
    }
  }

  const diagnostics: TypeDiagnostic[] = []
  let current: TypeDiagnostic | null = null

  for (const rawLine of output.split("\n")) {
    const match = LINE_RE.exec(rawLine.trimEnd())
    if (match) {
      const [, file, line, col, code, message] = match
      current = {
        filePath: path.relative(root, file) || file,
        line: Number(line),
        column: Number(col),
        code,
        message,
        related: [],
      }
      diagnostics.push(current)
    } else if (current && /^\s+/.test(rawLine) && rawLine.trim().length > 0) {
      // Indented detail line: part of the error chain.
      const depth = Math.floor((rawLine.length - rawLine.trimStart().length) / 2)
      current.related.push({ message: rawLine.trim(), depth })
    }
  }

  return { diagnostics }
}
