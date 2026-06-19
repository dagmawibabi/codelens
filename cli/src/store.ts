import { promises as fs } from "node:fs"
import path from "node:path"
import type { AnalysisReport, DashboardState, ProjectInsights, TrendPoint } from "./types.js"

const DIR = ".codelens"
const HISTORY_FILE = "history.json"
const LATEST_FILE = "latest.json"
const INSIGHTS_FILE = "insights.json"

function dir(cwd: string) {
  return path.join(cwd, DIR)
}

/** Persist a run: write latest.json + insights.json and append a trend point to history.json. */
export async function saveRun(
  cwd: string,
  report: AnalysisReport,
  insights: ProjectInsights,
): Promise<void> {
  const base = dir(cwd)
  await fs.mkdir(base, { recursive: true })

  await fs.writeFile(path.join(base, LATEST_FILE), JSON.stringify(report, null, 2), "utf8")
  await fs.writeFile(path.join(base, INSIGHTS_FILE), JSON.stringify(insights, null, 2), "utf8")

  const history = await readHistory(cwd)
  const point: TrendPoint = {
    runId: report.meta.id,
    timestamp: report.meta.finishedAt,
    score: report.health.score,
    lintErrors: report.lint.messages.filter((m) => m.severity === "error").length,
    lintWarnings: report.lint.messages.filter((m) => m.severity === "warning").length,
    typeErrors: report.types.diagnostics.length,
    securityFindings: report.security.findings.length,
  }

  history.push(point)
  // Keep the last 50 runs for trend display.
  const trimmed = history.slice(-50)

  await fs.writeFile(path.join(base, HISTORY_FILE), JSON.stringify(trimmed, null, 2), "utf8")
}

export async function readHistory(cwd: string): Promise<TrendPoint[]> {
  try {
    const raw = await fs.readFile(path.join(dir(cwd), HISTORY_FILE), "utf8")
    return JSON.parse(raw) as TrendPoint[]
  } catch {
    return []
  }
}

export async function readLatest(cwd: string): Promise<AnalysisReport | null> {
  try {
    const raw = await fs.readFile(path.join(dir(cwd), LATEST_FILE), "utf8")
    return JSON.parse(raw) as AnalysisReport
  } catch {
    return null
  }
}

export async function readLatestInsights(cwd: string): Promise<ProjectInsights | null> {
  try {
    const raw = await fs.readFile(path.join(dir(cwd), INSIGHTS_FILE), "utf8")
    return JSON.parse(raw) as ProjectInsights
  } catch {
    return null
  }
}

/** Load the full persisted dashboard state (report + insights + history), if present. */
export async function readState(cwd: string): Promise<DashboardState | null> {
  const [report, insights, history] = await Promise.all([
    readLatest(cwd),
    readLatestInsights(cwd),
    readHistory(cwd),
  ])
  if (!report || !insights) return null
  return { report, insights, history }
}
