import { promises as fs } from "node:fs"
import path from "node:path"
import type { ProjectInfo } from "../types.js"

/** Directories we never descend into. */
export const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".next-export",
  "out",
  "dist",
  "build",
  ".svelte-kit",
  ".nuxt",
  ".turbo",
  ".vercel",
  "coverage",
  ".projectlens",
  ".cache",
  "vendor",
])

/** Source-code extensions we treat as analyzable code. */
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"])

export interface ScannedFile {
  /** Project-relative POSIX path. */
  rel: string
  /** Absolute path on disk. */
  abs: string
  ext: string
  sizeBytes: number
  isCode: boolean
  isTest: boolean
}

const MAX_FILES = 8000
const MAX_READ_BYTES = 512_000

function toPosix(p: string): string {
  return p.split(path.sep).join("/")
}

function isTestPath(rel: string): boolean {
  return /(\.|\/)(test|spec)\.[mc]?[jt]sx?$/.test(rel) || /(^|\/)(__tests__|tests?|e2e|cypress)\//.test(rel)
}

/**
 * Shared, read-once view of the project that every insight collector reuses.
 * The filesystem is walked a single time; file contents are read lazily and
 * cached so multiple collectors scanning the same file pay the cost once.
 */
export class ScanContext {
  readonly root: string
  readonly project: ProjectInfo
  readonly files: ScannedFile[]
  readonly pkg: Record<string, unknown> | null
  readonly deps: Record<string, string>
  private cache = new Map<string, string | null>()

  private constructor(
    root: string,
    project: ProjectInfo,
    files: ScannedFile[],
    pkg: Record<string, unknown> | null,
    deps: Record<string, string>,
  ) {
    this.root = root
    this.project = project
    this.files = files
    this.pkg = pkg
    this.deps = deps
  }

  static async create(root: string, project: ProjectInfo): Promise<ScanContext> {
    const files: ScannedFile[] = []

    async function walk(dir: string) {
      if (files.length >= MAX_FILES) return
      let entries: import("node:fs").Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (files.length >= MAX_FILES) return
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (IGNORE_DIRS.has(entry.name)) continue
          await walk(abs)
        } else if (entry.isFile()) {
          const rel = toPosix(path.relative(root, abs))
          const ext = path.extname(entry.name).toLowerCase()
          let sizeBytes = 0
          try {
            sizeBytes = (await fs.stat(abs)).size
          } catch {
            /* ignore */
          }
          files.push({
            rel,
            abs,
            ext,
            sizeBytes,
            isCode: CODE_EXT.has(ext),
            isTest: isTestPath(rel),
          })
        }
      }
    }

    await walk(root)

    let pkg: Record<string, unknown> | null = null
    try {
      pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
    } catch {
      pkg = null
    }
    const deps: Record<string, string> = {
      ...((pkg?.dependencies as Record<string, string>) ?? {}),
      ...((pkg?.devDependencies as Record<string, string>) ?? {}),
    }

    return new ScanContext(root, project, files, pkg, deps)
  }

  /** Lazily read & cache a file's text. Returns null when unreadable/too big. */
  async read(rel: string): Promise<string | null> {
    if (this.cache.has(rel)) return this.cache.get(rel) ?? null
    const file = this.files.find((f) => f.rel === rel)
    const abs = file?.abs ?? path.join(this.root, rel)
    if (file && file.sizeBytes > MAX_READ_BYTES) {
      this.cache.set(rel, null)
      return null
    }
    try {
      const text = await fs.readFile(abs, "utf8")
      this.cache.set(rel, text)
      return text
    } catch {
      this.cache.set(rel, null)
      return null
    }
  }

  /** All code files, optionally filtered by a predicate on the relative path. */
  codeFiles(filter?: (rel: string) => boolean): ScannedFile[] {
    return this.files.filter((f) => f.isCode && (!filter || filter(f.rel)))
  }

  hasDep(name: string): boolean {
    return name in this.deps
  }

  /** First dependency present from a candidate list (for client/ORM detection). */
  firstDep(names: string[]): string | null {
    return names.find((n) => n in this.deps) ?? null
  }
}

/** Extract a small code snippet centered on `line` (1-based). */
export function snippetAround(content: string, line: number, radius = 2): { startLine: number; code: string } {
  const lines = content.split("\n")
  const start = Math.max(1, line - radius)
  const end = Math.min(lines.length, line + radius)
  return { startLine: start, code: lines.slice(start - 1, end).join("\n") }
}

/** Count lines: total, code, comment, blank for a source string. */
export function countLoc(content: string): { total: number; code: number; comment: number; blank: number } {
  const lines = content.split("\n")
  let code = 0
  let comment = 0
  let blank = 0
  let inBlock = false
  for (const raw of lines) {
    const l = raw.trim()
    if (inBlock) {
      comment++
      if (l.includes("*/")) inBlock = false
      continue
    }
    if (l === "") blank++
    else if (l.startsWith("//") || l.startsWith("#")) comment++
    else if (l.startsWith("/*")) {
      comment++
      if (!l.includes("*/")) inBlock = true
    } else code++
  }
  return { total: lines.length, code, comment, blank }
}

export function severityForCount(n: number, high: number, medium: number): "high" | "medium" | "low" {
  if (n >= high) return "high"
  if (n >= medium) return "medium"
  return "low"
}
