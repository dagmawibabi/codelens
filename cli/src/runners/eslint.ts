import { execa } from "execa"
import path from "node:path"
import { promises as fs } from "node:fs"
import type { LintMessage, LintResult, ProjectInfo } from "../types.js"

/** ESLint's `--format json` output shape (only the fields we use). */
interface RawEslintFile {
  filePath: string
  messages: {
    line: number
    column: number
    endLine?: number
    endColumn?: number
    severity: 1 | 2
    ruleId: string | null
    message: string
    fix?: unknown
  }[]
}

async function resolveBin(root: string): Promise<string | null> {
  const local = path.join(root, "node_modules", ".bin", "eslint")
  try {
    await fs.access(local)
    return local
  } catch {
    return null
  }
}

/**
 * Runs the project's own ESLint with the machine-readable JSON formatter so the
 * results exactly match what the developer sees in CI. Falls back to `npx`.
 */
export async function runEslint(
  root: string,
  project: ProjectInfo,
): Promise<LintResult> {
  const bin = await resolveBin(root)
  const cmd = bin ?? "npx"
  const baseArgs = bin ? [] : ["--no-install", "eslint"]
  const args = [...baseArgs, ".", "--format", "json", "--ext", ".js,.jsx,.ts,.tsx,.vue,.svelte"]

  let stdout = ""
  try {
    const res = await execa(cmd, args, {
      cwd: root,
      reject: false, // ESLint exits non-zero when it finds problems.
      timeout: 120_000,
    })
    stdout = res.stdout
  } catch (err) {
    return {
      messages: [],
      errorCount: 0,
      warningCount: 0,
      fixableCount: 0,
      unavailable: true,
      note:
        "Could not run ESLint. Ensure it is installed in the project. " +
        (err instanceof Error ? err.message : String(err)),
    }
  }

  let raw: RawEslintFile[]
  try {
    raw = JSON.parse(stdout) as RawEslintFile[]
  } catch {
    return {
      messages: [],
      errorCount: 0,
      warningCount: 0,
      fixableCount: 0,
      unavailable: true,
      note: "ESLint produced no parseable JSON output.",
    }
  }

  const messages: LintMessage[] = []
  for (const file of raw) {
    const rel = path.relative(root, file.filePath) || file.filePath
    for (const m of file.messages) {
      messages.push({
        filePath: rel,
        line: m.line,
        column: m.column,
        endLine: m.endLine,
        endColumn: m.endColumn,
        severity: m.severity === 2 ? "error" : "warning",
        ruleId: m.ruleId,
        message: m.message,
        fixable: m.fix != null,
      })
    }
  }

  return {
    messages,
    errorCount: messages.filter((m) => m.severity === "error").length,
    warningCount: messages.filter((m) => m.severity === "warning").length,
    fixableCount: messages.filter((m) => m.fixable).length,
  }
}
