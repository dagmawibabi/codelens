"use client"

import {
  ArrowUpRight,
  Wrench,
  ShieldAlert,
  FileWarning,
  ArrowUpCircle,
  ChevronRight,
  Boxes,
  Cpu,
  Clock,
  Layers,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { HealthRing } from "./health-ring"
import { TrendChart } from "./trend-chart"
import { ReportExport } from "./report-export"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { useInspector } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { securityToIssue, type Issue } from "@/lib/issues"
import { computeUnifiedHealth, type HealthCategory } from "@/lib/health"
import type { AnalysisReport, TrendPoint, Severity } from "@/lib/schema"
import type { ProjectInsights } from "@/lib/project-insights"

interface OverviewPanelProps {
  report: AnalysisReport
  history: TrendPoint[]
  insights: ProjectInsights
  /** Jump to another dashboard tab when a surface/stat is clicked. */
  onSelectTab?: (tab: string) => void
}

/** Maps a health-category key to its dashboard tab value. */
const CATEGORY_TAB: Record<string, string> = {
  security: "security",
  types: "types",
  deps: "deps",
  lint: "lint",
  database: "database",
  tests: "tests",
  perf: "performance",
  a11y: "accessibility",
  env: "env",
  network: "network",
  docs: "docs",
}

function StatCard({
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  label: string
  value: string | number
  sub: string
  accent: string
  onClick?: () => void
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {onClick && <ChevronRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />}
      </div>
      <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex flex-col gap-2 overflow-hidden rounded-xl bg-card p-4 text-left text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
      >
        {body}
      </button>
    )
  }
  return <Card className="gap-2 p-4">{body}</Card>
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--sev-ok)"
  if (score >= 60) return "var(--sev-medium)"
  if (score >= 40) return "var(--sev-high)"
  return "var(--sev-critical)"
}

function CategoryBar({ category, onSelect }: { category: HealthCategory; onSelect?: () => void }) {
  const color = scoreColor(category.score)
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      className="group flex flex-col gap-1.5 rounded-sm p-1.5 text-left transition-colors enabled:hover:bg-secondary/50"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-muted-foreground group-enabled:group-hover:text-foreground">{category.label}</span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {category.issues} {category.issues === 1 ? "issue" : "issues"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="font-mono tabular-nums" style={{ color }}>
            {category.score}
          </span>
          {onSelect && (
            <ChevronRight className="size-3 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
          )}
        </span>
      </div>
      <Progress value={category.score} className="h-1.5" />
    </button>
  )
}

interface Action {
  id: string
  icon: React.ElementType
  severity: Severity
  title: string
  detail: string
  /** When set, clicking opens this issue in the detail sheet. */
  issue?: Issue
  /** Otherwise, clicking navigates to this tab. */
  tab?: string
}

/** Derive a prioritized, actionable to-do list from the full report. */
function buildActions(report: AnalysisReport): Action[] {
  const { lint, types, security } = report
  const actions: Action[] = []

  for (const f of security.findings) {
    if (f.severity === "critical" || f.severity === "high") {
      actions.push({
        id: `sec-${f.id}`,
        icon: ShieldAlert,
        severity: f.severity,
        title: f.title,
        detail: `${f.filePath}:${f.line}`,
        issue: securityToIssue(f),
      })
    }
  }

  for (const d of security.dependencies) {
    if (d.fixedIn && (d.severity === "critical" || d.severity === "high")) {
      actions.push({
        id: `dep-${d.name}`,
        icon: ArrowUpCircle,
        severity: d.severity,
        title: `Upgrade ${d.name} to ${d.fixedIn}`,
        detail: d.cves.join(", ") || d.title,
        tab: "deps",
      })
    }
  }

  if (lint.fixableCount > 0) {
    actions.push({
      id: "lint-fix",
      icon: Wrench,
      severity: "warning",
      title: `Auto-fix ${lint.fixableCount} lint ${lint.fixableCount === 1 ? "issue" : "issues"}`,
      detail: "eslint . --fix",
      tab: "lint",
    })
  }

  if (types.diagnostics.length > 0) {
    actions.push({
      id: "types",
      icon: FileWarning,
      severity: "high",
      title: `Resolve ${types.diagnostics.length} type ${types.diagnostics.length === 1 ? "error" : "errors"}`,
      detail: "tsc --noEmit",
      tab: "types",
    })
  }

  return actions.sort((a, b) => severityStyle(b.severity).rank - severityStyle(a.severity).rank).slice(0, 6)
}

/** Rank files by total issue count across lint, types, and security. */
function topFiles(report: AnalysisReport) {
  const counts = new Map<string, number>()
  const bump = (f: string) => counts.set(f, (counts.get(f) ?? 0) + 1)
  report.lint.messages.forEach((m) => bump(m.filePath))
  report.types.diagnostics.forEach((d) => bump(d.filePath))
  report.security.findings.forEach((f) => bump(f.filePath))
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

/** Compact, optionally-clickable key/value chip used in the run-context strip. */
function ContextItem({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  onClick?: () => void
}) {
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
        <span className="truncate font-mono text-sm text-foreground">{value}</span>
      </span>
    </>
  )
  const base = "flex min-w-0 items-center gap-2.5 rounded-sm px-3 py-2"
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} text-left transition-colors hover:bg-secondary/50`}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}

export function OverviewPanel({ report, history, insights, onSelectTab }: OverviewPanelProps) {
  const { lint, types, security } = report
  const { viewIssue, viewFile } = useInspector()
  const health = computeUnifiedHealth(report, insights)
  const critical = security.findings.filter((f) => f.severity === "critical").length
  const high = security.findings.filter((f) => f.severity === "high").length
  const prev = history.length >= 2 ? history[history.length - 2].score : null
  const delta = prev != null ? health.score - prev : null

  const actions = buildActions(report)
  const files = topFiles(report)
  const totalIssues = health.categories.reduce((s, c) => s + c.issues, 0)
  const cleanSurfaces = health.categories.filter((c) => c.issues === 0).length

  const go = (tab?: string) => {
    if (tab && onSelectTab) onSelectTab(tab)
  }

  const handleAction = (a: Action) => {
    if (a.issue) viewIssue(a.issue)
    else go(a.tab)
  }

  const sevSegments = (["critical", "high", "medium", "low", "info"] as const).map((s, i) => ({
    label: severityStyle(s).label,
    value: security.findings.filter((f) => f.severity === s).length,
    color: `var(--chart-${i + 1})`,
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Section header with export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Project health</h2>
          <p className="text-xs text-muted-foreground">
            Weighted across {health.categories.length} analysis surfaces
          </p>
        </div>
        <ReportExport report={report} insights={insights} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Health score */}
        <Card className="flex flex-col items-center justify-center gap-4 p-6">
          <HealthRing score={health.score} grade={health.grade} />
          <div className="flex items-center gap-2 text-sm">
            {delta != null && (
              <span
                className="font-mono tabular-nums"
                style={{ color: delta >= 0 ? "var(--sev-ok)" : "var(--sev-critical)" }}
              >
                {delta >= 0 ? "+" : ""}
                {delta}
              </span>
            )}
            <span className="text-muted-foreground">vs previous run</span>
          </div>
        </Card>

        {/* Breakdown — every surface, weighted, click to open its tab */}
        <Card className="flex flex-col gap-3 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Score breakdown</h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              issues · score
            </span>
          </div>
          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {health.categories.map((c) => (
              <CategoryBar key={c.key} category={c} onSelect={onSelectTab ? () => go(CATEGORY_TAB[c.key]) : undefined} />
            ))}
          </div>
        </Card>
      </div>

      {/* Run context — concrete facts about this analysis run */}
      <Card className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 lg:grid-cols-6">
        <ContextItem icon={Boxes} label="Framework" value={report.meta.project.framework} />
        <ContextItem icon={Layers} label="Package manager" value={report.meta.project.packageManager} />
        <ContextItem
          icon={Cpu}
          label="AI review"
          value={report.meta.aiEnabled ? "Enabled" : "Skipped"}
          onClick={onSelectTab ? () => go("security") : undefined}
        />
        <ContextItem icon={Clock} label="Duration" value={`${(report.meta.durationMs / 1000).toFixed(1)}s`} />
        <ContextItem icon={ShieldAlert} label="Total issues" value={String(totalIssues)} />
        <ContextItem icon={Layers} label="Clean surfaces" value={`${cleanSurfaces}/${health.categories.length}`} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Trend */}
        <Card className="flex flex-col gap-3 p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Health trend</h3>
            <button
              type="button"
              onClick={() => go("trends")}
              disabled={!onSelectTab}
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors enabled:hover:text-foreground"
            >
              {history.length} runs
              {onSelectTab && <ArrowUpRight className="size-3" />}
            </button>
          </div>
          <TrendChart data={history} />
        </Card>

        {/* Stat row — click through to the relevant tab */}
        <StatCard
          label="Lint errors"
          value={lint.errorCount}
          sub={`${lint.warningCount} warnings · ${lint.fixableCount} auto-fixable`}
          accent={lint.errorCount > 0 ? "var(--sev-critical)" : "var(--sev-ok)"}
          onClick={onSelectTab ? () => go("lint") : undefined}
        />
        <StatCard
          label="Type errors"
          value={types.diagnostics.length}
          sub={types.unavailable ? "TypeScript not detected" : "from tsc --noEmit"}
          accent={types.diagnostics.length > 0 ? "var(--sev-high)" : "var(--sev-ok)"}
          onClick={onSelectTab ? () => go("types") : undefined}
        />
        <StatCard
          label="Security findings"
          value={security.findings.length}
          sub={`${critical} critical · ${high} high · ${security.dependencies.length} vuln deps`}
          accent={critical > 0 ? "var(--sev-critical)" : high > 0 ? "var(--sev-high)" : "var(--sev-ok)"}
          onClick={onSelectTab ? () => go("security") : undefined}
        />

        {/* Recommended actions — click to open the issue or jump to its tab */}
        <div className="lg:col-span-2">
          <InsightCard title="Recommended next actions">
            {actions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">All clear — nothing urgent to address.</p>
            ) : (
              <ol className="flex flex-col">
                {actions.map((a, i) => {
                  const sev = severityStyle(a.severity)
                  const Icon = a.icon
                  return (
                    <li key={a.id} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        onClick={() => handleAction(a)}
                        className="group flex w-full items-start gap-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
                      >
                        <span className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-pretty text-sm text-foreground">{a.title}</span>
                          <span className="font-mono text-xs text-muted-foreground">{a.detail}</span>
                        </span>
                        <span
                          className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${sev.bg} ${sev.text}`}
                        >
                          {sev.label}
                        </span>
                        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </InsightCard>
        </div>

        {/* Findings by severity */}
        <InsightCard
          title="Findings by severity"
          action={
            onSelectTab ? (
              <button
                type="button"
                onClick={() => go("security")}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                view <ArrowUpRight className="size-3" />
              </button>
            ) : undefined
          }
        >
          <ProportionBar segments={sevSegments} />
        </InsightCard>

        {/* Top affected files — click to open the file viewer */}
        <div className="lg:col-span-3">
          <InsightCard
            title="Most affected files"
            action={
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                issues <ArrowUpRight className="size-3" />
              </span>
            }
          >
            <div className="sm:columns-2 sm:gap-6">
              <CountList rows={files} emptyLabel="No issues across any files." onSelect={(key) => viewFile(key)} />
            </div>
          </InsightCard>
        </div>
      </div>
    </div>
  )
}
