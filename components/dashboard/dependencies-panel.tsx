"use client"

import { useMemo, useState } from "react"
import { Package, ShieldCheck, ArrowUpRight, Boxes, ListTree, Share2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { DependencyGraph } from "./dependency-graph"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { depToIssue } from "@/lib/issues"
import type { DependencyResult, DependencyFinding, DependencyIssueKind } from "@/lib/schema"
import { cn } from "@/lib/utils"

const KIND_LABEL: Record<DependencyIssueKind, string> = {
  vulnerability: "Vulnerable",
  outdated: "Outdated",
  deprecated: "Deprecated",
  unused: "Unused",
  missing: "Missing",
  license: "License",
}

type Filter = "all" | DependencyIssueKind

function FindingRow({ dep }: { dep: DependencyFinding }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(dep.severity)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(depToIssue(dep))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(depToIssue(dep))
        }
      }}
      className="flex w-full cursor-pointer flex-col gap-2 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40 sm:flex-row sm:items-start sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-foreground">{dep.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{dep.current}</span>
            <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {KIND_LABEL[dep.kind]}
            </span>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {dep.type}
            </span>
          </div>
          <p className="mt-1.5 text-pretty text-sm text-foreground">{dep.title}</p>
          <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{dep.detail}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
            {dep.cves?.map((cve) => (
              <span key={cve} className="rounded-sm bg-secondary px-1.5 py-0.5">
                {cve}
              </span>
            ))}
            {dep.license && <span className="rounded-sm bg-secondary px-1.5 py-0.5">{dep.license}</span>}
            {dep.usedIn && dep.usedIn.length > 0 && (
              <span className="inline-flex items-center gap-1">
                used in <FileLink path={dep.usedIn[0]} />
              </span>
            )}
          </div>
        </div>
      </div>
      {dep.fixedIn && (
        <div className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-[color:var(--sev-ok)]/40 bg-[color:var(--sev-ok)]/10 px-2.5 py-1 font-mono text-xs text-[color:var(--sev-ok)]">
          {dep.current} <ArrowUpRight className="size-3" /> {dep.fixedIn}
        </div>
      )}
    </div>
  )
}

export function DependenciesPanel({ deps }: { deps: DependencyResult }) {
  const [view, setView] = useState<"findings" | "graph">("findings")

  const subTabs: { key: "findings" | "graph"; label: string; icon: typeof ListTree; count?: number }[] = [
    { key: "findings", label: "Findings", icon: ListTree, count: deps.findings.length },
    { key: "graph", label: "Dependency graph", icon: Share2, count: deps.graph?.nodes.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 self-start rounded-sm border border-border bg-card p-1">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            disabled={t.key === "graph" && !deps.graph}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
              view === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {t.count != null && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {view === "graph" && deps.graph ? <DependencyGraph graph={deps.graph} /> : <FindingsView deps={deps} />}
    </div>
  )
}

function FindingsView({ deps }: { deps: DependencyResult }) {
  const [filter, setFilter] = useState<Filter>("all")

  const findings = useMemo(() => [...deps.findings].sort(bySeverityDesc), [deps.findings])

  const filtered = useMemo(
    () => (filter === "all" ? findings : findings.filter((f) => f.kind === filter)),
    [findings, filter],
  )

  const kindRows = useMemo(() => {
    const map = new Map<DependencyIssueKind, number>()
    for (const f of deps.findings) map.set(f.kind, (map.get(f.kind) ?? 0) + 1)
    return [...map.entries()]
      .map(([key, count]) => ({ key, label: KIND_LABEL[key], count }))
      .sort((a, b) => b.count - a.count)
  }, [deps.findings])

  const typeRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of deps.findings) map.set(f.type, (map.get(f.type) ?? 0) + 1)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [deps.findings])

  const sevSegments = (["critical", "high", "medium", "low", "info"] as const).map((s, i) => ({
    label: severityStyle(s).label,
    value: deps.findings.filter((f) => f.severity === s).length,
    color: `var(--chart-${i + 1})`,
  }))

  const upgradable = deps.findings.filter((f) => f.fixedIn).length
  const vulnCount = deps.findings.filter((f) => f.kind === "vulnerability").length

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: deps.findings.length },
    ...kindRows.map((r) => ({ key: r.key as Filter, label: r.label, count: r.count })),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      {/* Insights rail */}
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Inventory">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{deps.counts.total}</span>
              <span className="text-[11px] text-muted-foreground">total deps</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{deps.counts.direct}</span>
              <span className="text-[11px] text-muted-foreground">direct</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{deps.counts.dev}</span>
              <span className="text-[11px] text-muted-foreground">dev</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{upgradable}</span>
              <span className="text-[11px] text-muted-foreground">upgradable</span>
            </div>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{vulnCount}</span> with known advisories ·{" "}
            <span className="font-mono text-foreground">{deps.counts.transitive}</span> transitive
          </p>
        </InsightCard>

        <InsightCard title="By severity">
          <ProportionBar segments={sevSegments} />
        </InsightCard>

        <InsightCard title="By issue type">
          <CountList
            rows={kindRows}
            activeKey={filter === "all" ? null : filter}
            onSelect={(k) => setFilter((p) => (p === k ? "all" : (k as Filter)))}
          />
        </InsightCard>

        <InsightCard title="By dependency type">
          <CountList rows={typeRows} />
        </InsightCard>
      </aside>

      {/* Main list */}
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
          <Boxes className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Dependency findings</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {filtered.length}
          </Badge>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            from <FileLink path={deps.manifestPath} />
          </span>
        </div>

        {filtered.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No dependency issues in this category.
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            {filtered.map((dep) => (
              <FindingRow key={dep.id} dep={dep} />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
