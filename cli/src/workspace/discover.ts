import { promises as fs } from "node:fs"
import path from "node:path"
import type { MonorepoInfo, WorkspacePackage } from "../types.js"

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8")) as T
  } catch {
    return null
  }
}

/**
 * Parse the `packages:` array from a pnpm-workspace.yaml file.
 * Handles both inline array and multi-line dash formats:
 *   packages:\n  - packages/**
 *   packages:\n  - "packages/*"
 */
function parsePnpmWorkspaceYaml(content: string): string[] {
  const lines = content.split("\n")
  const globs: string[] = []
  let inPackages = false

  for (const line of lines) {
    const trimmed = line.trim()
    // Start of packages section
    if (/^packages\s*:/.test(trimmed)) {
      inPackages = true
      // Inline array: packages: ["a", "b"]
      const inlineMatch = trimmed.match(/^packages\s*:\s*\[(.*)\]\s*$/)
      if (inlineMatch) {
        return inlineMatch[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
      }
      continue
    }
    // New top-level key ends the packages section
    if (inPackages && trimmed && !trimmed.startsWith("-") && !trimmed.startsWith("#") && /^[a-zA-Z]/.test(trimmed)) {
      break
    }
    // Collect glob entries
    if (inPackages && trimmed.startsWith("-")) {
      const glob = trimmed.replace(/^-\s+/, "").replace(/^["']|["']$/g, "")
      if (glob) globs.push(glob)
    }
  }

  return globs
}

/**
 * Convert a glob pattern to a regex for matching directories.
 * Supports: `*` (single dir), `**` (recursive), `?` (single char).
 */
function globToRegex(glob: string): RegExp {
  let regexStr = glob
    // Escape special regex chars except * and ?
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Replace ** with a placeholder
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    // Replace * with [^/]+
    .replace(/\*/g, "[^/]+")
    // Replace ? with [^/]
    .replace(/\?/g, "[^/]")
    // Restore ** as .* (matches anything including /)
    .replace(/\{\{GLOBSTAR\}\}/g, ".*")

  return new RegExp(`^${regexStr}$`)
}

/**
 * Resolve glob patterns against the filesystem to find actual directories.
 * Returns absolute paths of matching directories that contain a package.json.
 */
async function resolveGlobs(root: string, globs: string[]): Promise<string[]> {
  const dirs = new Set<string>()

  for (const glob of globs) {
    // Handle patterns like "packages/*" or "packages/**" or "e2e/**"
    const segments = glob.split("/")
    const regex = globToRegex(glob)

    // For simple patterns like "packages/*", walk the first segment and match
    if (segments.length <= 2 && !glob.includes("**")) {
      const baseDir = path.join(root, segments[0])
      try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const candidate = path.join(baseDir, entry.name)
            const relFromRoot = path.relative(root, candidate).replace(/\\/g, "/")
            if (regex.test(relFromRoot) || regex.test(relFromRoot + "/")) {
              if (await exists(path.join(candidate, "package.json"))) {
                dirs.add(candidate)
              }
            }
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    } else {
      // For complex patterns, do a recursive walk
      await walkForGlobs(root, root, regex, dirs)
    }
  }

  return [...dirs].sort()
}

async function walkForGlobs(
  base: string,
  current: string,
  regex: RegExp,
  result: Set<string>,
  depth = 0,
): Promise<void> {
  if (depth > 5) return // prevent deep recursion
  try {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue
      const full = path.join(current, entry.name)
      const rel = path.relative(base, full).replace(/\\/g, "/")
      if (regex.test(rel) || regex.test(rel + "/")) {
        if (await exists(path.join(full, "package.json"))) {
          result.add(full)
        }
      }
      await walkForGlobs(base, full, regex, result, depth + 1)
    }
  } catch {
    // permission error or similar, skip
  }
}

/**
 * Detect the monorepo tool from configuration files present at the root.
 */
function detectMonorepoTool(
  hasPnpmWorkspace: boolean,
  hasTurboJson: boolean,
  hasLernaJson: boolean,
  hasNxJson: boolean,
  hasPackageWorkspaces: boolean,
): MonorepoInfo["tool"] {
  if (hasPnpmWorkspace) return "pnpm"
  if (hasTurboJson) return "turborepo"
  if (hasLernaJson) return "lerna"
  if (hasNxJson) return "nx"
  if (hasPackageWorkspaces) return "unknown" // npm/yarn, indistinguishable without lockfile
  return "unknown"
}

/**
 * Detect whether the root directory is itself a workspace package.
 * Returns true if the root package.json has a "name" and either:
 * - has src/ directory
 * - is listed in its own workspaces (monorepo root as a package)
 */
async function rootIsPackage(root: string): Promise<boolean> {
  const pkg = await readJson<{
    name?: string
    workspaces?: string[] | { packages?: string[] }
  }>(path.join(root, "package.json"))
  if (!pkg?.name) return false
  // Check for src/ directory as a signal the root is a real package
  return exists(path.join(root, "src"))
}

/**
 * Detect a monorepo at the given root and enumerate its workspace packages.
 * Returns null if this is not a monorepo (single-project mode).
 */
export async function discoverWorkspace(root: string): Promise<MonorepoInfo | null> {
  const pnpmPath = path.join(root, "pnpm-workspace.yaml")
  const turboPath = path.join(root, "turbo.json")
  const lernaPath = path.join(root, "lerna.json")
  const nxPath = path.join(root, "nx.json")
  const pkgJsonPath = path.join(root, "package.json")

  const [hasPnpmWorkspace, hasTurboJson, hasLernaJson, hasNxJson] = await Promise.all([
    exists(pnpmPath),
    exists(turboPath),
    exists(lernaPath),
    exists(nxPath),
  ])

  let globs: string[] = []
  let hasPackageWorkspaces = false

  // 1. Try pnpm-workspace.yaml
  if (hasPnpmWorkspace) {
    const content = await fs.readFile(pnpmPath, "utf8")
    globs = parsePnpmWorkspaceYaml(content)
  }

  // 2. Try package.json workspaces field
  if (globs.length === 0) {
    const pkg = await readJson<{
      workspaces?: string[] | { packages?: string[] }
    }>(pkgJsonPath)
    if (pkg?.workspaces) {
      if (Array.isArray(pkg.workspaces)) {
        globs = pkg.workspaces
      } else if (pkg.workspaces.packages) {
        globs = pkg.workspaces.packages
      }
      hasPackageWorkspaces = true
    }
  }

  // No workspace globs found → not a monorepo
  if (globs.length === 0) return null

  // Resolve globs to actual package directories
  const packageDirs = await resolveGlobs(root, globs)

  if (packageDirs.length === 0) return null

  // Build WorkspacePackage list
  const packages: WorkspacePackage[] = []
  for (const dir of packageDirs) {
    const pkgJson = await readJson<{
      name?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>(path.join(dir, "package.json"))

    packages.push({
      name: pkgJson?.name ?? path.basename(dir),
      path: dir,
      relPath: path.relative(root, dir).replace(/\\/g, "/"),
      pkgJson: pkgJson
        ? {
            dependencies: pkgJson.dependencies,
            devDependencies: pkgJson.devDependencies,
            scripts: pkgJson.scripts,
          }
        : null,
    })
  }

  const isRootPkg = await rootIsPackage(root)

  // Include the root as a package if it qualifies and isn't already in the list
  if (isRootPkg && !packages.some((p) => p.path === root)) {
    const rootPkg = await readJson<{
      name?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>(pkgJsonPath)

    packages.unshift({
      name: rootPkg?.name ?? path.basename(root),
      path: root,
      relPath: ".",
      pkgJson: rootPkg
        ? {
            dependencies: rootPkg.dependencies,
            devDependencies: rootPkg.devDependencies,
            scripts: rootPkg.scripts,
          }
        : null,
    })
  }

  return {
    root,
    tool: detectMonorepoTool(hasPnpmWorkspace, hasTurboJson, hasLernaJson, hasNxJson, hasPackageWorkspaces),
    packages,
    rootIsPackage: isRootPkg,
  }
}
