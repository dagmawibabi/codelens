"use client"

import { useMemo, useState } from "react"
import { Database, ShieldCheck, Lock, LockOpen, Layers, Timer, Gauge, AlertTriangle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { dbToIssue } from "@/lib/issues"
import type { DbResult, DbFinding, DbIssueKind, DbEngine, DbConnection, DbQuery } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const KIND_LABEL: Record<DbIssueKind, string> = {
  "n+1": "N+1 query",
  "missing-index": "Missing index",
  "no-pooling": "No pooling",
  injection: "Injection",
  unparameterized: "Unparameterized",
  "schema-drift": "Schema drift",
  "no-migration": "No migration",
  "unbounded-query": "Unbounded query",
  "no-ssl": "No SSL",
  "connection-leak": "Connection leak",
  "missing-ttl": "Missing TTL",
  "full-scan": "Full scan",
  "no-validation": "No validation",
}

const ENGINE_LABEL: Record<DbEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  redis: "Redis",
  other: "Other",
}

type Filter = "all" | DbIssueKind

function EngineBadge({ engine }: { engine: DbEngine }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
      {ENGINE_LABEL[engine]}
    </span>
  )
}

function ConnectionRow({ conn }: { conn: DbConnection }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5 first:border-t-0">
      <div className="flex items-center gap-2">
        <Database className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs text-foreground">{conn.name}</span>
        <EngineBadge engine={conn.engine} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 font-mono text-[10px] text-muted-foreground">
        <span className="truncate">{conn.client}</span>
        <span className="inline-flex items-center gap-1">
          {conn.ssl ? <Lock className="size-3 text-[color:var(--sev-ok)]" /> : <LockOpen className="size-3 text-[color:var(--sev-high)]" />}
          {conn.ssl ? "TLS" : "no TLS"}
        </span>
        <span className={cn(conn.pooled ? "text-muted-foreground" : "text-[color:var(--sev-medium)]")}>
          {conn.pooled ? "pooled" : "unpooled"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3" />
          {conn.collections}
        </span>
      </div>
    </div>
  )
}

function FindingRow({ f }: { f: DbFinding }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(f.severity)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(dbToIssue(f))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(dbToIssue(f))
        }
      }}
      className="flex w-full cursor-pointer flex-col gap-2 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
            <EngineBadge engine={f.engine} />
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {KIND_LABEL[f.kind]}
            </span>
            {f.target && (
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {f.target}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-pretty text-sm text-foreground">{f.title}</p>
          <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{f.detail}</p>
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            <FileLink path={f.filePath} line={f.line} />
          </div>
        </div>
      </div>
    </div>
  )
}

function QueryRow({ q }: { q: DbQuery }) {
  const slow = q.estMs >= 1000
  const color = q.estMs >= 1500 ? "var(--sev-critical)" : q.estMs >= 1000 ? "var(--sev-high)" : q.estMs >= 300 ? "var(--sev-medium)" : "var(--sev-ok)"
  return (
    <div className="flex items-center gap-3 border-t border-border p-3 first:border-t-0">
      <span className="w-16 shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{q.operation}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs text-foreground">{q.target}</span>
          <EngineBadge engine={q.engine} />
          {q.fullScan && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--sev-high)]/12 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[color:var(--sev-high)]">
              <AlertTriangle className="size-3" /> scan
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{q.note}</p>
        <div className="mt-1 font-mono text-[10px] text-muted-foreground">
          <FileLink path={q.filePath} line={q.line} />
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums" style={{ color }}>
        <Timer className="size-3" />
        {q.estMs >= 1000 ? `${(q.estMs / 1000).toFixed(1)}s` : `${q.estMs}ms`}
      </span>
    </div>
  )
}

export function DatabasePanel({ database }: { database: DbResult }) {
  const [filter, setFilter] = useState<Filter>("all")

  const findings = useMemo(() => [...database.findings].sort(bySeverityDesc), [database.findings])
  const filtered = useMemo(
    () => (filter === "all" ? findings : findings.filter((f) => f.kind === filter)),
    [findings, filter],
  )

  const kindRows = useMemo(() => {
    const map = new Map<DbIssueKind, number>()
    for (const f of database.findings) map.set(f.kind, (map.get(f.kind) ?? 0) + 1)
    return [...map.entries()]
      .map(([key, count]) => ({ key, label: KIND_LABEL[key], count }))
      .sort((a, b) => b.count - a.count)
  }, [database.findings])

  const engineSegments = useMemo(() => {
    const engines = [...new Set(database.findings.map((f) => f.engine))]
    return engines.map((e, i) => ({
      label: ENGINE_LABEL[e],
      value: database.findings.filter((f) => f.engine === e).length,
      color: `var(--chart-${(i % 5) + 1})`,
    }))
  }, [database.findings])

  const sevSegments = (["critical", "high", "medium", "low", "info"] as const).map((s, i) => ({
    label: severityStyle(s).label,
    value: database.findings.filter((f) => f.severity === s).length,
    color: `var(--chart-${i + 1})`,
  }))

  const slowQueries = useMemo(() => [...database.queries].sort((a, b) => b.estMs - a.estMs), [database.queries])

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: database.findings.length },
    ...kindRows.map((r) => ({ key: r.key as Filter, label: r.label, count: r.count })),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Datastores">
          <div className="grid grid-cols-2 gap-3 pb-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {database.counts.connections}
              </span>
              <span className="text-[11px] text-muted-foreground">connections</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {database.counts.collections}
              </span>
              <span className="text-[11px] text-muted-foreground">tables / collections</span>
            </div>
          </div>
          <div className="-mx-3 border-t border-border">
            {database.connections.map((c) => (
              <ConnectionRow key={c.id} conn={c} />
            ))}
          </div>
        </InsightCard>

        <InsightCard title="By engine">
          <ProportionBar segments={engineSegments} />
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
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-4">
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
            <Database className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Database findings</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {filtered.length}
            </Badge>
          </div>

          {filtered.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
              No database issues in this category.
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              {filtered.map((f) => (
                <FindingRow key={f.id} f={f} />
              ))}
            </Card>
          )}
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Slowest queries</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {database.counts.slowQueries} slow
            </Badge>
          </div>
          <Card className="gap-0 overflow-hidden py-0">
            {slowQueries.map((q) => (
              <QueryRow key={q.id} q={q} />
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
