"use client"

import { useMemo, useState } from "react"
import { Globe, ShieldCheck, Lock, Unlock, ChevronRight, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { useInspector } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { networkToIssue } from "@/lib/issues"
import type { NetworkResult, NetworkCall } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

type Filter = "all" | "external" | "insecure" | "issues"

function worstSeverity(c: NetworkCall) {
  const ranks = c.issues.map((i) => severityStyle(i.severity).rank)
  return ranks.length ? Math.max(...ranks) : 0
}

function CallRow({ call }: { call: NetworkCall }) {
  const { viewIssue } = useInspector()
  const top = [...call.issues].sort((a, b) => severityStyle(b.severity).rank - severityStyle(a.severity).rank)[0]
  const sev = top ? severityStyle(top.severity) : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(networkToIssue(call))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(networkToIssue(call))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      {call.secure ? (
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Unlock className="mt-0.5 size-4 shrink-0 text-[color:var(--sev-high)]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
            {call.method}
          </span>
          <span className="truncate font-mono text-sm text-foreground">{call.url}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase text-muted-foreground">
          <span className="rounded-sm border border-border px-1.5 py-0.5">{call.client}</span>
          <span className="rounded-sm border border-border px-1.5 py-0.5">{call.external ? "external" : "internal"}</span>
          {sev && (
            <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>
              {call.issues.length} {call.issues.length === 1 ? "issue" : "issues"}
            </Badge>
          )}
        </div>
        {top && <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{top.message}</p>}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function NetworkPanel({ network }: { network: NetworkResult }) {
  const [filter, setFilter] = useState<Filter>("all")

  const sorted = useMemo(
    () => [...network.calls].sort((a, b) => worstSeverity(b) - worstSeverity(a)),
    [network.calls],
  )

  const filtered = useMemo(() => {
    switch (filter) {
      case "external":
        return sorted.filter((c) => c.external)
      case "insecure":
        return sorted.filter((c) => !c.secure)
      case "issues":
        return sorted.filter((c) => c.issues.length > 0)
      default:
        return sorted
    }
  }, [sorted, filter])

  const categoryRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of network.domains) map.set(d.category, (map.get(d.category) ?? 0) + d.calls)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [network.domains])

  const schemeSegments = [
    { label: "HTTPS", value: network.calls.filter((c) => c.secure).length, color: "var(--chart-1)" },
    { label: "HTTP", value: network.calls.filter((c) => !c.secure).length, color: "var(--chart-3)" },
  ]

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: network.counts.total },
    { key: "issues", label: "Issues", count: network.counts.issues },
    { key: "external", label: "External", count: network.counts.external },
    { key: "insecure", label: "Insecure", count: network.counts.insecure },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Requests">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{network.counts.total}</span>
              <span className="text-[11px] text-muted-foreground">total calls</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{network.counts.external}</span>
              <span className="text-[11px] text-muted-foreground">external</span>
            </div>
            <div className="flex flex-col">
              <span
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: network.counts.insecure > 0 ? "var(--sev-high)" : "var(--sev-ok)" }}
              >
                {network.counts.insecure}
              </span>
              <span className="text-[11px] text-muted-foreground">insecure</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{network.domains.length}</span>
              <span className="text-[11px] text-muted-foreground">hosts</span>
            </div>
          </div>
        </InsightCard>

        <InsightCard title="By scheme">
          <ProportionBar segments={schemeSegments} />
        </InsightCard>

        <InsightCard title="Traffic by category">
          <CountList rows={categoryRows} />
        </InsightCard>

        <InsightCard title="Hosts">
          <ul className="flex flex-col gap-1.5">
            {network.domains.map((d) => (
              <li key={d.host} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  {d.external ? (
                    <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <Globe className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-foreground">{d.host}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{d.calls}</span>
              </li>
            ))}
          </ul>
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
          <Globe className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Outbound requests</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {filtered.length}
          </Badge>
        </div>

        {filtered.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No requests in this category.
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            {filtered.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
