"use client"

import { useMemo, useState } from "react"
import { Gauge, ShieldCheck, ChevronRight, Zap, Package } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insights"
import { useInspector } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { perfToIssue } from "@/lib/issues"
import type { PerfResult, PerfFinding, WebVital, BundleRoute, VitalRating } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const RATING_COLOR: Record<VitalRating, string> = {
  good: "var(--sev-ok)",
  "needs-improvement": "var(--sev-medium)",
  poor: "var(--sev-high)",
}

const RATING_LABEL: Record<VitalRating, string> = {
  good: "Good",
  "needs-improvement": "Needs work",
  poor: "Poor",
}

function VitalCard({ vital }: { vital: WebVital }) {
  const color = RATING_COLOR[vital.rating]
  // Position the marker along a 0 → 1.5× poor-threshold track.
  const max = vital.threshold.poor * 1.5
  const pct = Math.min(100, (vital.value / max) * 100)
  const goodPct = Math.min(100, (vital.threshold.good / max) * 100)
  const poorPct = Math.min(100, (vital.threshold.poor / max) * 100)

  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-foreground">{vital.id}</span>
        <span className="font-mono text-[10px] uppercase" style={{ color }}>
          {RATING_LABEL[vital.rating]}
        </span>
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
        {vital.value}
        <span className="ml-0.5 text-sm text-muted-foreground">{vital.unit}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{vital.label}</span>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        {/* good / needs / poor zones */}
        <span className="absolute inset-y-0 left-0 bg-[color:var(--sev-ok)]/30" style={{ width: `${goodPct}%` }} aria-hidden />
        <span
          className="absolute inset-y-0 bg-[color:var(--sev-medium)]/30"
          style={{ left: `${goodPct}%`, width: `${poorPct - goodPct}%` }}
          aria-hidden
        />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
          style={{ left: `${pct}%`, background: color }}
          aria-hidden
        />
      </div>
    </Card>
  )
}

function BundleRow({ bundle }: { bundle: BundleRoute }) {
  const color = RATING_COLOR[bundle.rating]
  const max = 320
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-mono text-foreground">{bundle.route}</span>
        <span className="shrink-0 font-mono tabular-nums" style={{ color }}>
          {bundle.firstLoadKb} KB
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, (bundle.firstLoadKb / max) * 100)}%`, background: color }}
        />
      </div>
    </li>
  )
}

function FindingRow({ finding }: { finding: PerfFinding }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(finding.severity)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(perfToIssue(finding))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(perfToIssue(finding))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{finding.kind.replace(/-/g, " ")}</span>
          {finding.estimatedSavingKb != null && finding.estimatedSavingKb > 0 && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--sev-ok)]">
              <Zap className="size-2.5" />
              save ~{finding.estimatedSavingKb} KB
            </span>
          )}
        </div>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{finding.title}</p>
        <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
          {finding.filePath}
          {finding.line ? `:${finding.line}` : ""}
        </span>
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function PerformancePanel({ performance }: { performance: PerfResult }) {
  const [onlySavings, setOnlySavings] = useState(false)

  const findings = useMemo(() => {
    const sorted = [...performance.findings].sort((a, b) => severityStyle(b.severity).rank - severityStyle(a.severity).rank)
    return onlySavings ? sorted.filter((f) => (f.estimatedSavingKb ?? 0) > 0) : sorted
  }, [performance.findings, onlySavings])

  const totalSavings = performance.findings.reduce((s, f) => s + (f.estimatedSavingKb ?? 0), 0)
  const scoreColor =
    performance.score >= 90 ? "var(--sev-ok)" : performance.score >= 50 ? "var(--sev-medium)" : "var(--sev-high)"

  return (
    <div className="flex flex-col gap-4">
      {/* Score + Core Web Vitals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Perf score</span>
          <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color: scoreColor }}>
            {performance.score}
          </span>
          <span className="text-[11px] text-muted-foreground">Lighthouse-style</span>
        </Card>
        {performance.vitals.map((v) => (
          <VitalCard key={v.id} vital={v} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
          <InsightCard title="First Load JS by route">
            <ul className="flex flex-col gap-3">
              {performance.bundles.map((b) => (
                <BundleRow key={b.route} bundle={b} />
              ))}
            </ul>
          </InsightCard>

          <InsightCard title="Budget">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{performance.totalBundleKb}</span>
                <span className="text-[11px] text-muted-foreground">KB shared JS</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-2xl font-semibold tabular-nums text-[color:var(--sev-ok)]">{totalSavings}</span>
                <span className="text-[11px] text-muted-foreground">KB recoverable</span>
              </div>
            </div>
          </InsightCard>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Optimization opportunities</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {findings.length}
            </Badge>
            <button
              type="button"
              onClick={() => setOnlySavings((s) => !s)}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[10px] uppercase transition-colors",
                onlySavings ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Package className="size-3" />
              Has savings
            </button>
          </div>

          {findings.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
              No optimization opportunities in this view.
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              {findings.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
