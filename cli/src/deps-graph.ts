import { promises as fs } from "node:fs"
import path from "node:path"
import { builtinModules } from "node:module"
import type {
  DependencyFinding,
  DependencyGraph,
  DependencyKind,
  DependencyNode,
  DependencyResult,
  DependencyVuln,
  Severity,
} from "./types.js"
import type { ScanContext } from "./insights/scan.js"

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])
const MAX_GRAPH_NODES = 60

/**
 * Framework-provided virtual/alias import prefixes that are not real npm
 * packages and must never be reported as "missing" dependencies. SvelteKit
 * exposes `$app`, `$env`, `$lib`, `$service-worker` (and `$lib` is a
 * user-configurable alias); Nuxt/Vite-style `~`/`@/` aliases are handled by
 * the relative/alias checks below.
 */
function isVirtualAlias(spec: string): boolean {
  // Any `$`-prefixed specifier is a SvelteKit alias / virtual module.
  if (spec.startsWith("$")) return true
  // Common path-alias roots that resolve to local source, not packages.
  if (spec.startsWith("~/") || spec.startsWith("@/") || spec === "~" || spec === "@") return true
  return false
}

/** Extract the top-level package name from an import specifier. */
function packageOf(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("/")) return null
  if (isVirtualAlias(spec)) return null
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/")
    return scope && name ? `${scope}/${name}` : null
  }
  const name = spec.split("/")[0]
  if (!name || BUILTINS.has(name) || BUILTINS.has(`node:${name}`)) return null
  return name
}

const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g

/** Collect the set of external packages actually imported across the code. */
async function collectImported(ctx: ScanContext): Promise<Map<string, Set<string>>> {
  const used = new Map<string, Set<string>>()
  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel)
    if (!content) continue
    IMPORT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(content))) {
      const pkg = packageOf(m[1])
      if (!pkg) continue
      if (!used.has(pkg)) used.set(pkg, new Set())
      used.get(pkg)!.add(file.rel)
    }
  }
  return used
}

async function dirSizeKb(dir: string, budget = { files: 400 }): Promise<number | undefined> {
  let bytes = 0
  async function walk(d: string) {
    if (budget.files <= 0) return
    let entries: import("node:fs").Dirent[]
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (budget.files <= 0) return
      budget.files--
      const abs = path.join(d, e.name)
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue
        await walk(abs)
      } else if (e.isFile()) {
        try {
          bytes += (await fs.stat(abs)).size
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir)
  return bytes > 0 ? Math.round(bytes / 1024) : undefined
}

async function readDepPkg(
  root: string,
  name: string,
): Promise<{ version: string; deps: string[] } | null> {
  try {
    const raw = await fs.readFile(path.join(root, "node_modules", name, "package.json"), "utf8")
    const json = JSON.parse(raw) as { version?: string; dependencies?: Record<string, string> }
    return { version: json.version ?? "—", deps: Object.keys(json.dependencies ?? {}) }
  } catch {
    return null
  }
}

function worstSeverity(a: Severity | undefined, b: Severity): Severity {
  const order: Severity[] = ["info", "low", "warning", "medium", "high", "error", "critical"]
  if (!a) return b
  return order.indexOf(a) >= order.indexOf(b) ? a : b
}

/**
 * Builds the full DependencyResult the dashboard renders: counts, a 2-level
 * resolved module graph from node_modules, and findings derived from the real
 * audit advisories plus unused/missing detection via the import scan.
 */
export async function buildDependencyResult(
  ctx: ScanContext,
  advisories: DependencyVuln[],
): Promise<DependencyResult> {
  const pkg = ctx.pkg ?? {}
  const directDeps = (pkg.dependencies as Record<string, string>) ?? {}
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {}
  const peerDeps = (pkg.peerDependencies as Record<string, string>) ?? {}

  const directNames = Object.keys(directDeps)
  const devNames = Object.keys(devDeps)

  const imported = await collectImported(ctx)

  const findings: DependencyFinding[] = []
  const flagged = new Map<string, Severity>()

  // 1. Vulnerabilities (ground truth from the audit).
  advisories.forEach((v, i) => {
    const sev = v.severity as Severity
    findings.push({
      id: `vuln-${i}`,
      name: v.name,
      current: v.currentVersion,
      type: v.dependencyType === "transitive" ? "transitive" : v.dependencyType === "dev" ? "dev" : "direct",
      kind: "vulnerability",
      severity: sev,
      title: v.title,
      detail: v.impact ?? v.title,
      recommendation: v.fixedIn ? `Upgrade to ${v.fixedIn} or later.` : "Review the advisory and upgrade when a fix is available.",
      fixedIn: v.fixedIn,
      cves: v.cves,
    })
    flagged.set(v.name, worstSeverity(flagged.get(v.name), sev))
  })

  // 2. Unused direct dependencies (declared but never imported). Skip ones
  //    that are commonly used without an explicit import.
  const IMPLICIT = new Set([
    "typescript",
    "tailwindcss",
    "postcss",
    "autoprefixer",
    "eslint",
    "prettier",
    "@types/node",
  ])
  for (const name of directNames) {
    if (IMPLICIT.has(name) || name.startsWith("@types/")) continue
    if (!imported.has(name)) {
      findings.push({
        id: `unused-${name}`,
        name,
        current: directDeps[name],
        type: "direct",
        kind: "unused",
        severity: "low",
        title: `${name} appears unused`,
        detail: `${name} is listed in dependencies but no import of it was found in the scanned source.`,
        recommendation: `Remove ${name} from package.json if it is truly unused, or confirm it is loaded dynamically.`,
      })
      flagged.set(name, worstSeverity(flagged.get(name), "low"))
    }
  }

  // 3. Missing dependencies (imported but not declared anywhere).
  const declared = new Set([...directNames, ...devNames, ...Object.keys(peerDeps)])
  for (const [name, files] of imported) {
    if (!declared.has(name) && !name.startsWith("@types/")) {
      findings.push({
        id: `missing-${name}`,
        name,
        current: "—",
        type: "direct",
        kind: "missing",
        severity: "high",
        title: `${name} is imported but not declared`,
        detail: `${name} is imported in ${files.size} file(s) but is not listed in package.json. Installs may break in CI.`,
        recommendation: `Add ${name} to dependencies.`,
        usedIn: [...files].slice(0, 8),
      })
      flagged.set(name, worstSeverity(flagged.get(name), "high"))
    }
  }

  // ---- Graph (2 levels deep from direct + dev deps) ----
  const nodes: DependencyNode[] = []
  const seen = new Set<string>()
  const rootName = (pkg.name as string) ?? "project"

  async function addNode(name: string, type: DependencyKind, depth: number) {
    if (seen.has(name) || nodes.length >= MAX_GRAPH_NODES) return
    seen.add(name)
    const meta = await readDepPkg(ctx.root, name)
    const sizeKb = await dirSizeKb(path.join(ctx.root, "node_modules", name))
    const sev = flagged.get(name)
    nodes.push({
      id: name,
      version: meta?.version ?? "—",
      type,
      depth,
      sizeKb,
      dependencies: (meta?.deps ?? []).slice(0, 12),
      flagged: sev != null,
      severity: sev,
    })
  }

  for (const name of directNames) await addNode(name, "direct", 0)
  for (const name of devNames) await addNode(name, "dev", 0)
  // One level of transitive nodes for visualization.
  const firstLevel = nodes.slice()
  for (const node of firstLevel) {
    for (const child of node.dependencies) {
      await addNode(child, "transitive", node.depth + 1)
    }
  }

  const transitiveCount = nodes.filter((n) => n.type === "transitive").length

  const graph: DependencyGraph = { root: rootName, nodes }

  return {
    counts: {
      total: directNames.length + devNames.length,
      direct: directNames.length,
      dev: devNames.length,
      transitive: transitiveCount,
    },
    findings,
    manifestPath: "package.json",
    graph,
  }
}
