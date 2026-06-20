"use client"

import { useMemo, useState } from "react"
import { TrendingUp, TrendingDown, Minus, History, Activity } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"
import { InsightCard } from "./insights"

/** The series users can plot. Each maps to a numeric field on TrendPoint. */
type MetricKey = "score" | "lintErrors" | "lintWarnings" | "typeErrors" | "securityFindings"

const METRICS: { key: MetricKey; label: string; invert: boolean; stroke: string }[] = [
  { key: "score", label: "Health score", invert: false, stroke: "var(--chart-1)" },
  { key: "lintErrors", label: "Lint errors", invert: true, stroke: "var(--chart-2)" },
  { key: "lintWarnings", label: "Lint warnings", invert: true, stroke: "var(--chart-3)" },
  { key: "typeErrors", label: "Type errors", invert: true, stroke: "var(--chart-4)" },
  { key: "securityFindings", label: "Security findings", invert: true, stroke: "var(--chart-5)" },
]

export function TrendsPanel({ history, report }: { history: TrendPoint[]; report: AnalysisReport }) {
  const [active, setActive] = useState<MetricKey>("score")
  const [hover, setHover] = useState<number | null>(null)

  const metric = METRICS.find((m) => m.key === active)!

  // Newest run first for the timeline; chart uses chronological order.
  const chrono = history
  const reversed = useMemo(() => [...history].reverse(), [history])

  if (history.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <History className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">No run history yet</p>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
            CodeLens records a trend point after every analysis in <span className="font-mono">.codelens/history.json</span>.
            Run checks a few times to watch your project&apos;s health evolve here.
          </p>
        </div>
      </Card>
    )
  }

  const first = chrono[0]
  const last = chrono[chrono.length - 1]
  const scoreDelta = last.score - first.score

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Metric selector */}
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setActive(m.key)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
                active === m.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="size-2 rounded-[2px]" style={{ background: m.stroke }} aria-hidden />
              {m.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <Card className="p-4">
          <TrendGraph points={chrono} metric={metric} hover={hover} onHover={setHover} />
        </Card>

        {/* Run timeline */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <History className="size-4 text-muted-foreground" />
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Run history
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground/60">{history.length} runs</span>
          </div>
          <div className="overflow-hidden rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30 text-left font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Lint</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Types</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Security</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {reversed.map((p, i) => {
                  // Delta vs the chronologically previous run.
                  const prevIdx = history.length - 1 - i - 1
                  const prev = prevIdx >= 0 ? history[prevIdx] : null
                  const delta = prev ? p.score - prev.score : 0
                  const isLatest = i === 0
                  return (
                    <tr
                      key={p.runId}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors hover:bg-secondary/30",
                        isLatest && "bg-secondary/20",
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-foreground">
                        {formatWhen(p.timestamp)}
                        {isLatest && (
                          <span className="ml-2 rounded-sm bg-primary px-1 py-0.5 font-mono text-[9px] uppercase text-primary-foreground">
                            latest
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{p.score}</td>
                      <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground sm:table-cell">
                        {p.lintErrors + p.lintWarnings}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground sm:table-cell">
                        {p.typeErrors}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground sm:table-cell">
                        {p.securityFindings}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <DeltaBadge value={delta} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-4">
        <InsightCard title="Current">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tabular-nums text-foreground">{report.health.score}</span>
            <span className="font-mono text-sm text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-foreground">
              {report.health.grade}
            </span>
            <span className="text-xs text-muted-foreground">grade</span>
          </div>
        </InsightCard>

        <InsightCard title="Since first run">
          <div className="flex flex-col gap-2.5">
            <StatRow label="Score change" value={signed(scoreDelta)} positive={scoreDelta > 0} negative={scoreDelta < 0} />
            <StatRow
              label="Lint resolved"
              value={signed(first.lintErrors + first.lintWarnings - (last.lintErrors + last.lintWarnings))}
              positive={first.lintErrors + first.lintWarnings - (last.lintErrors + last.lintWarnings) > 0}
            />
            <StatRow
              label="Type errors fixed"
              value={signed(first.typeErrors - last.typeErrors)}
              positive={first.typeErrors - last.typeErrors > 0}
            />
            <StatRow
              label="Security closed"
              value={signed(first.securityFindings - last.securityFindings)}
              positive={first.securityFindings - last.securityFindings > 0}
            />
          </div>
        </InsightCard>

        <InsightCard title="Best & worst">
          <div className="flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Peak score</span>
              <span className="font-mono text-foreground">{Math.max(...history.map((h) => h.score))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Lowest score</span>
              <span className="font-mono text-foreground">{Math.min(...history.map((h) => h.score))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Average</span>
              <span className="font-mono text-foreground">
                {Math.round(history.reduce((s, h) => s + h.score, 0) / history.length)}
              </span>
            </div>
          </div>
        </InsightCard>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Interactive SVG line chart                                          */
/* ------------------------------------------------------------------ */

function TrendGraph({
  points,
  metric,
  hover,
  onHover,
}: {
  points: TrendPoint[]
  metric: { key: MetricKey; label: string; invert: boolean; stroke: string }
  hover: number | null
  onHover: (i: number | null) => void
}) {
  const W = 100
  const H = 140
  const padTop = 8
  const padBottom = 8

  if (points.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center text-xs text-muted-foreground">
        Need at least two runs to plot a trend.
      </div>
    )
  }

  const values = points.map((p) => p[metric.key])
  const maxV = Math.max(...values)
  const minV = Math.min(...values)
  const range = maxV - minV || 1
  const usableH = H - padTop - padBottom

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W
    const norm = (p[metric.key] - minV) / range
    const y = padTop + (1 - norm) * usableH
    return { x, y, p }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ")
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`
  const active = hover != null ? coords[hover] : coords[coords.length - 1]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[160px] w-full overflow-visible"
        role="img"
        aria-label={`${metric.label} across ${points.length} runs`}
      >
        <defs>
          <linearGradient id={`fill-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metric.stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={metric.stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={padTop + g * usableH}
            y2={padTop + g * usableH}
            stroke="var(--border)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2 2"
          />
        ))}
        <path d={areaPath} fill={`url(#fill-${metric.key})`} />
        <path d={linePath} fill="none" stroke={metric.stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {/* hover guide */}
        {hover != null && (
          <line
            x1={active.x}
            x2={active.x}
            y1={padTop}
            y2={H}
            stroke="var(--foreground)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            strokeOpacity="0.4"
          />
        )}
        <circle cx={active.x} cy={active.y} r="2.5" fill={metric.stroke} vectorEffect="non-scaling-stroke" />
        {/* invisible hit targets */}
        {coords.map((c, i) => (
          <rect
            key={i}
            x={c.x - W / points.length / 2}
            y={0}
            width={W / points.length}
            height={H}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
          />
        ))}
      </svg>

      {/* readout */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">{formatWhen(active.p.timestamp)}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{metric.label}:</span>
          <span className="font-mono font-semibold text-foreground">{active.p[metric.key]}</span>
        </span>
      </div>
    </div>
  )
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground">
        <Minus className="size-3" />0
      </span>
    )
  }
  const up = value > 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs",
        up ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {signed(value)}
    </span>
  )
}

function StatRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono",
          positive ? "font-semibold text-foreground" : negative ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {positive ? <TrendingUp className="size-3" /> : negative ? <TrendingDown className="size-3" /> : <Activity className="size-3" />}
        {value}
      </span>
    </div>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}
