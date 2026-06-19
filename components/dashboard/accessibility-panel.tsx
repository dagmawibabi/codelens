"use client"

import { useMemo, useState } from "react"
import { Accessibility, ShieldCheck, ChevronRight, Eye } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { useInspector, TrackedBadge } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { a11yToIssue } from "@/lib/issues"
import type { A11yResult, A11yViolation, A11yImpact } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

type Filter = "all" | A11yImpact

const IMPACT_SEVERITY = {
  critical: "critical",
  serious: "high",
  moderate: "medium",
  minor: "low",
} as const

function ViolationRow({ violation }: { violation: A11yViolation }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(IMPACT_SEVERITY[violation.impact])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(a11yToIssue(violation))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(a11yToIssue(violation))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">{violation.rule}</span>
          <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{violation.impact}</Badge>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{violation.principle}</span>
        </div>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{violation.help}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span className="truncate">
            {violation.filePath}:{violation.line}
          </span>
          <span className="rounded-sm border border-border px-1.5 py-0.5">{violation.nodes} node{violation.nodes === 1 ? "" : "s"}</span>
          {violation.wcag.filter((w) => /^\d/.test(w)).map((w) => (
            <span key={w} className="rounded-sm border border-border px-1.5 py-0.5">
              WCAG {w}
            </span>
          ))}
        </div>
      </div>
      <TrackedBadge issue={a11yToIssue(violation)} variant="dot" className="mt-0.5" />
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function AccessibilityPanel({ accessibility }: { accessibility: A11yResult }) {
  const [filter, setFilter] = useState<Filter>("all")

  const sorted = useMemo(
    () =>
      [...accessibility.violations].sort(
        (a, b) => severityStyle(IMPACT_SEVERITY[b.impact]).rank - severityStyle(IMPACT_SEVERITY[a.impact]).rank,
      ),
    [accessibility.violations],
  )

  const filtered = useMemo(
    () => (filter === "all" ? sorted : sorted.filter((v) => v.impact === filter)),
    [sorted, filter],
  )

  const impactSegments = [
    { label: "Critical", value: accessibility.counts.critical, color: "var(--chart-1)" },
    { label: "Serious", value: accessibility.counts.serious, color: "var(--chart-2)" },
    { label: "Moderate", value: accessibility.counts.moderate, color: "var(--chart-3)" },
    { label: "Minor", value: accessibility.counts.minor, color: "var(--chart-4)" },
  ]

  const principleRows = accessibility.byPrinciple.map((p) => ({
    key: p.principle,
    label: p.principle,
    count: p.count,
  }))

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: accessibility.violations.length },
    { key: "critical", label: "Critical", count: accessibility.counts.critical },
    { key: "serious", label: "Serious", count: accessibility.counts.serious },
    { key: "moderate", label: "Moderate", count: accessibility.counts.moderate },
    { key: "minor", label: "Minor", count: accessibility.counts.minor },
  ]

  const scoreColor =
    accessibility.score >= 90 ? "var(--sev-ok)" : accessibility.score >= 70 ? "var(--sev-medium)" : "var(--sev-high)"

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Accessibility score">
          <div className="flex items-end justify-between">
            <span className="font-mono text-4xl font-semibold tabular-nums" style={{ color: scoreColor }}>
              {accessibility.score}
            </span>
            <span className="text-[11px] text-muted-foreground">out of 100</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-lg font-semibold tabular-nums text-[color:var(--sev-ok)]">{accessibility.passes}</span>
              <span className="text-[11px] text-muted-foreground">checks passed</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{accessibility.incomplete}</span>
              <span className="text-[11px] text-muted-foreground">need review</span>
            </div>
          </div>
        </InsightCard>

        <InsightCard title="By impact">
          <ProportionBar segments={impactSegments} />
        </InsightCard>

        <InsightCard title="By WCAG principle">
          <CountList rows={principleRows} />
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                filter === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Accessibility className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">WCAG violations</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {filtered.length}
          </Badge>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted-foreground">
            <Eye className="size-3" />
            axe-core
          </span>
        </div>

        {filtered.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No violations in this category.
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            {filtered.map((v) => (
              <ViolationRow key={v.id} violation={v} />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
