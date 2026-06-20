import { detectProject } from "../detect.js"
import { runEslint } from "../runners/eslint.js"
import { runTsc } from "../runners/tsc.js"
import { runAudit } from "../runners/audit.js"
import { runSecurityAudit } from "../ai/audit.js"
import { buildReport } from "../report.js"
import { buildDependencyResult } from "../deps-graph.js"
import { collectInsights, ScanContext } from "../insights/index.js"
import type {
  AnalysisReport,
  MonorepoInfo,
  ProjectInsights,
  RunEvent,
  WorkspacePackage,
} from "../types.js"

export interface PackageRunOptions {
  pkg: WorkspacePackage
  ai: boolean
  monorepo: MonorepoInfo
  onEvent?: (event: RunEvent) => void
}

export interface PackageRunResult {
  report: AnalysisReport
  insights: ProjectInsights
}

/**
 * Run the full analysis pipeline on a single workspace package.
 * Each package gets its own ProjectInfo, runners, and insights scan,
 * scoped to its own directory and node_modules.
 */
export async function runPackageAnalysis(opts: PackageRunOptions): Promise<PackageRunResult> {
  const { pkg, ai, monorepo, onEvent } = opts
  const cwd = pkg.path
  const emit = (e: RunEvent) => onEvent?.(e)
  const startedAt = Date.now()

  emit({ type: "package-start", packageName: pkg.name, packagePath: pkg.path })

  const project = await detectProject(cwd)
  emit({ type: "phase", phase: "detect", status: "done", project })

  // Lint
  emit({ type: "phase", phase: "lint", status: "running" })
  const lint = await runEslint(cwd, project)
  emit({ type: "phase", phase: "lint", status: "done", lint })

  // Types
  emit({ type: "phase", phase: "types", status: "running" })
  const types = await runTsc(cwd, project)
  emit({ type: "phase", phase: "types", status: "done", types })

  // Dependency audit
  emit({ type: "phase", phase: "deps", status: "running" })
  const advisories = await runAudit(cwd, project)

  // AI security pass
  emit({ type: "phase", phase: "security", status: ai ? "running" : "skipped" })
  const security = ai
    ? await runSecurityAudit({ cwd, project, advisories, lint, types })
    : { findings: [], dependencies: advisories, skipped: true as const }
  emit({ type: "phase", phase: "security", status: "done", security })

  // Insights scan
  emit({ type: "phase", phase: "insights", status: "running" })
  const scan = await ScanContext.create(cwd, project)
  const [deps, bundle] = await Promise.all([
    buildDependencyResult(scan, advisories),
    collectInsights(scan),
  ])
  emit({ type: "phase", phase: "deps", status: "done" })

  types.definitions = bundle.typeDefinitions
  const insights = bundle.insights
  emit({ type: "phase", phase: "insights", status: "done" })

  const report = buildReport({
    meta: {
      cwd,
      project,
      startedAt: new Date(startedAt).toISOString(),
      aiEnabled: ai,
      workspace: {
        monorepo,
        packageName: pkg.name,
      },
    },
    startedAt,
    lint,
    types,
    security,
    deps,
    insights,
  })

  emit({ type: "package-done", packageName: pkg.name, report })

  return { report, insights }
}
