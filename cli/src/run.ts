import { detectProject } from "./detect.js"
import { runEslint } from "./runners/eslint.js"
import { runTsc } from "./runners/tsc.js"
import { runAudit } from "./runners/audit.js"
import { runSecurityAudit } from "./ai/audit.js"
import { buildReport } from "./report.js"
import { buildDependencyResult } from "./deps-graph.js"
import { collectInsights, ScanContext } from "./insights/index.js"
import { gradeForScore } from "./health.js"
import { discoverWorkspace } from "./workspace/discover.js"
import { runPackageAnalysis } from "./workspace/run-package.js"
import type {
  AnalysisReport,
  AggregateHealth,
  DashboardState,
  MonorepoInfo,
  ProjectInsights,
  RunEvent,
  TrendPoint,
  WorkspacePackageData,
  WorkspaceReport,
} from "./types.js"

export type RunScope = "all" | "security"

export interface RunOptions {
  cwd: string
  /** Skip the AI security pass (no model key, or --no-ai). */
  ai: boolean
  /** Prior trend history to attach to the emitted state. */
  history?: TrendPoint[]
  /** Callback for streaming progress to the dashboard. */
  onEvent?: (event: RunEvent) => void
  /**
   * Which checks to run. `"security"` re-runs only the AI security pass and
   * reuses every other result from `prior`, for a fast targeted rescan. Falls
   * back to a full run when no prior result is available.
   */
  scope?: RunScope
  /** Previous dashboard state, required for a `"security"`-scoped rescan. */
  prior?: DashboardState | null
}

export interface RunResult {
  report: AnalysisReport
  insights: ProjectInsights
}

/**
 * Full analysis pipeline. Each phase emits a streaming event so the dashboard
 * can render results progressively instead of waiting for the whole run.
 *
 * Lint, types, dependency audit, and AI security run first (they shell out to
 * the project's own toolchain), then a single shared filesystem scan powers
 * the dependency graph and all project-intelligence collectors.
 */
export async function runAnalysis(opts: RunOptions): Promise<RunResult> {
  const { cwd, ai, onEvent, scope = "all", prior } = opts
  const emit = (e: RunEvent) => onEvent?.(e)
  const startedAt = Date.now()

  // Targeted rescan: re-run only the AI security pass and reuse everything else
  // from the previous run. Falls through to a full run if there's no prior data.
  if (scope === "security" && prior?.report) {
    return runSecurityOnly({ cwd, ai, prior, history: opts.history, emit, startedAt })
  }

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

  // Dependency audit (fast, deterministic) feeds the AI prioritization step.
  emit({ type: "phase", phase: "deps", status: "running" })
  const advisories = await runAudit(cwd, project)

  // AI security pass (code + dependency prioritization)
  emit({ type: "phase", phase: "security", status: ai ? "running" : "skipped" })
  const security = ai
    ? await runSecurityAudit({ cwd, project, advisories, lint, types })
    : { findings: [], dependencies: advisories, skipped: true as const }
  emit({ type: "phase", phase: "security", status: "done", security })

  // Single shared scan powers the dependency graph + every insight collector.
  emit({ type: "phase", phase: "insights", status: "running" })
  const scan = await ScanContext.create(cwd, project)
  const [deps, bundle] = await Promise.all([
    buildDependencyResult(scan, advisories),
    collectInsights(scan),
  ])
  emit({ type: "phase", phase: "deps", status: "done" })

  // Merge discovered type declarations into the type result for the explorer.
  types.definitions = bundle.typeDefinitions
  const insights = bundle.insights
  emit({ type: "phase", phase: "insights", status: "done" })

  const report = buildReport({
    meta: {
      cwd,
      project,
      startedAt: new Date(startedAt).toISOString(),
      aiEnabled: ai,
    },
    startedAt,
    lint,
    types,
    security,
    deps,
    insights,
  })

  emit({ type: "report", report })

  const history = [...(opts.history ?? [])]
  const state: DashboardState = { report, insights, history }
  emit({ type: "state", state })

  return { report, insights }
}

/**
 * Fast, targeted rescan: recompute only the AI security pass while reusing the
 * lint, type-check, dependency and insight results from the previous run. The
 * non-security phases are emitted as already-`done` so the run view stays
 * consistent, and the report's health score is recomputed from the fresh
 * security result + the reused surfaces.
 */
async function runSecurityOnly(args: {
  cwd: string
  ai: boolean
  prior: DashboardState
  history?: TrendPoint[]
  emit: (e: RunEvent) => void
  startedAt: number
}): Promise<RunResult> {
  const { cwd, ai, prior, emit, startedAt } = args
  const priorReport = prior.report
  const project = priorReport.meta.project

  // Reuse every non-security surface from the previous run.
  emit({ type: "phase", phase: "detect", status: "done", project })
  emit({ type: "phase", phase: "lint", status: "done", lint: priorReport.lint })
  emit({ type: "phase", phase: "types", status: "done", types: priorReport.types })
  emit({ type: "phase", phase: "deps", status: "done" })

  emit({ type: "phase", phase: "security", status: ai ? "running" : "skipped" })
  const advisories = priorReport.security.dependencies
  const security = ai
    ? await runSecurityAudit({ cwd, project, advisories, lint: priorReport.lint, types: priorReport.types })
    : { findings: [], dependencies: advisories, skipped: true as const }
  emit({ type: "phase", phase: "security", status: "done", security })

  emit({ type: "phase", phase: "insights", status: "done" })

  const report = buildReport({
    meta: {
      cwd,
      project,
      startedAt: new Date(startedAt).toISOString(),
      aiEnabled: ai,
    },
    startedAt,
    lint: priorReport.lint,
    types: priorReport.types,
    security,
    deps: priorReport.deps,
    insights: prior.insights,
  })

  emit({ type: "report", report })
  const history = [...(args.history ?? [])]
  const state: DashboardState = { report, insights: prior.insights, history }
  emit({ type: "state", state })

  return { report, insights: prior.insights }
}

/* -------------------------------------------------------------------------- */
/*                              Workspace analysis                             */
/* -------------------------------------------------------------------------- */

export interface WorkspaceRunResult {
  report: AnalysisReport
  insights: ProjectInsights
  workspace: WorkspaceReport
}

/**
 * Analyze a monorepo: discover workspace packages, run analysis on each,
 * and aggregate results into a single WorkspaceReport.
 */
export async function runWorkspaceAnalysis(opts: RunOptions): Promise<WorkspaceRunResult> {
  const { cwd, ai, onEvent } = opts
  const emit = (e: RunEvent) => onEvent?.(e)

  const monorepo = await discoverWorkspace(cwd)
  if (!monorepo) {
    // Fallback: single-project mode
    const result = await runAnalysis(opts)
    return {
      report: result.report,
      insights: result.insights,
      workspace: {
        monorepo: { root: cwd, tool: "unknown", packages: [], rootIsPackage: true },
        packages: {},
        rootReport: null,
        aggregate: {
          score: result.report.health.score,
          grade: result.report.health.grade,
          packageScores: [],
          totalLintErrors: result.report.lint.errorCount,
          totalTypeErrors: result.report.types.diagnostics.length,
          totalSecurityFindings: result.report.security.findings.length,
        },
      },
    }
  }

  emit({ type: "workspace", workspace: monorepo })

  const packageData: Record<string, WorkspacePackageData> = {}

  for (const pkg of monorepo.packages) {
    try {
      const { report, insights } = await runPackageAnalysis({
        pkg,
        ai,
        monorepo,
        onEvent,
      })
      packageData[pkg.name] = { report, insights }
    } catch (err) {
      // Isolate failures — one broken package shouldn't abort the whole workspace run
      if (process.env.PROJECTLENS_DEBUG) {
        console.error(`[Projectlens] package "${pkg.name}" failed:`, err)
      }
    }
  }

  const aggregate = buildAggregateHealth(packageData)

  // Use the root package's report as the "primary" report for backward compat
  const rootPkg = monorepo.packages.find((p) => p.path === monorepo.root)
  const primaryReport = rootPkg ? packageData[rootPkg.name]?.report ?? null : null
  const primaryInsights = rootPkg ? packageData[rootPkg.name]?.insights ?? null : null

  const workspace: WorkspaceReport = {
    monorepo,
    packages: packageData,
    rootReport: primaryReport,
    aggregate,
  }

  return {
    report: primaryReport ?? Object.values(packageData)[0]?.report,
    insights: primaryInsights ?? Object.values(packageData)[0]?.insights,
    workspace,
  }
}

/**
 * Analyze a single package within a monorepo.
 */
export async function runSinglePackage(opts: {
  cwd: string
  packageName: string
  ai: boolean
  onEvent?: (event: RunEvent) => void
  history?: TrendPoint[]
}): Promise<{ report: AnalysisReport; insights: ProjectInsights; workspace: WorkspaceReport }> {
  const { cwd, packageName, ai, onEvent } = opts
  const emit = (e: RunEvent) => onEvent?.(e)

  const monorepo = await discoverWorkspace(cwd)
  if (!monorepo) {
    throw new Error(`Not a monorepo: ${cwd}`)
  }

  const pkg = monorepo.packages.find((p) => p.name === packageName)
  if (!pkg) {
    throw new Error(`Package "${packageName}" not found in workspace. Available: ${monorepo.packages.map((p) => p.name).join(", ")}`)
  }

  emit({ type: "workspace", workspace: monorepo })

  const { report, insights } = await runPackageAnalysis({ pkg, ai, monorepo, onEvent })

  // Rebuild aggregate from the single result (or all if we want full context)
  const aggregate: AggregateHealth = {
    score: report.health.score,
    grade: report.health.grade,
    packageScores: [{ name: pkg.name, score: report.health.score, grade: report.health.grade }],
    totalLintErrors: report.lint.errorCount,
    totalTypeErrors: report.types.diagnostics.length,
    totalSecurityFindings: report.security.findings.length,
  }

  const workspace: WorkspaceReport = {
    monorepo,
    packages: { [pkg.name]: { report, insights } },
    rootReport: pkg.path === monorepo.root ? report : null,
    aggregate,
  }

  return { report, insights, workspace }
}

function buildAggregateHealth(packageData: Record<string, WorkspacePackageData>): AggregateHealth {
  const entries = Object.entries(packageData)
  const scores = entries.map(([name, d]) => ({
    name,
    score: d.report.health.score,
    grade: d.report.health.grade,
  }))
  const avgScore = scores.length
    ? Math.round(scores.reduce((s, e) => s + e.score, 0) / scores.length)
    : 0
  const totalLintErrors = entries.reduce((s, [, d]) => s + d.report.lint.errorCount, 0)
  const totalTypeErrors = entries.reduce((s, [, d]) => s + d.report.types.diagnostics.length, 0)
  const totalSecurityFindings = entries.reduce((s, [, d]) => s + d.report.security.findings.length, 0)

  return {
    score: avgScore,
    grade: gradeForScore(avgScore),
    packageScores: scores,
    totalLintErrors,
    totalTypeErrors,
    totalSecurityFindings,
  }
}
