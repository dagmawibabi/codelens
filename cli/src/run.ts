import { detectProject } from "./detect.js"
import { runEslint } from "./runners/eslint.js"
import { runTsc } from "./runners/tsc.js"
import { runAudit } from "./runners/audit.js"
import { runSecurityAudit } from "./ai/audit.js"
import { buildReport } from "./report.js"
import type { AnalysisReport, RunEvent } from "./types.js"

export interface RunOptions {
  cwd: string
  /** Skip the AI security pass (no model key, or --no-ai). */
  ai: boolean
  /** Callback for streaming progress to the dashboard. */
  onEvent?: (event: RunEvent) => void
}

/**
 * Full analysis pipeline. Each phase emits a streaming event so the dashboard
 * can render results progressively instead of waiting for the whole run.
 */
export async function runAnalysis(opts: RunOptions): Promise<AnalysisReport> {
  const { cwd, ai, onEvent } = opts
  const emit = (e: RunEvent) => onEvent?.(e)
  const startedAt = Date.now()

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
  emit({ type: "phase", phase: "deps", status: "done" })

  // AI security pass (code + dependency prioritization)
  emit({ type: "phase", phase: "security", status: ai ? "running" : "skipped" })
  const security = ai
    ? await runSecurityAudit({ cwd, project, advisories, lint, types })
    : { findings: [], dependencies: advisories, skipped: true as const }
  emit({ type: "phase", phase: "security", status: "done", security })

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
  })

  emit({ type: "report", report })
  return report
}
