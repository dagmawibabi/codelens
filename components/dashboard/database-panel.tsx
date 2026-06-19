"use client"

import { useMemo, useState } from "react"
import {
  Database,
  ShieldCheck,
  Lock,
  LockOpen,
  Layers,
  Timer,
  Gauge,
  AlertTriangle,
  ChevronRight,
  Key,
  Activity,
  Plug,
  Server,
  FileCode,
  Hash,
  Boxes,
  Network,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar } from "./insights"
import { DbRelationshipGraph } from "./db-relationship-graph"
import { FileLink, useInspector } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { dbToIssue } from "@/lib/issues"
import type {
  DbResult,
  DbFinding,
  DbIssueKind,
  DbEngine,
  DbConnection,
  DbQuery,
  DbTable,
  DbDetectionSource,
} from "@/lib/project-insights"
import type { Severity } from "@/lib/schema"
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

const DETECTION_LABEL: Record<DbDetectionSource, string> = {
  dependency: "Dependency",
  env: "Env var",
  "connection-string": "Connection string",
  "schema-file": "Schema file",
  config: "Config",
}

type MainTab = "connections" | "schema" | "relationships" | "queries" | "findings"
type SevFilter = "all" | Severity

function EngineBadge({ engine }: { engine: DbEngine }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
      {ENGINE_LABEL[engine]}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Sub-tab bar                                                         */
/* ------------------------------------------------------------------ */

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {count != null && <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Connections                                                         */
/* ------------------------------------------------------------------ */

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
          {conn.ssl ? (
            <Lock className="size-3 text-[color:var(--sev-ok)]" />
          ) : (
            <LockOpen className="size-3 text-[color:var(--sev-high)]" />
          )}
          {conn.ssl ? "TLS" : "no TLS"}
        </span>
        <span className={cn(conn.pooled ? "text-muted-foreground" : "text-[color:var(--sev-medium)]")}>
          {conn.pooled ? "pooled" : "unpooled"}
        </span>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right text-xs text-foreground", mono && "font-mono")}>{value}</span>
    </div>
  )
}

function ConnectionCard({ conn }: { conn: DbConnection }) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-secondary">
          <Database className="size-4 text-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-medium text-foreground">{conn.name}</span>
            <EngineBadge engine={conn.engine} />
          </div>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{conn.client}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {conn.ssl ? (
            <Badge className="border-0 bg-[color:var(--sev-ok)]/12 font-mono text-[10px] uppercase text-[color:var(--sev-ok)]">
              <Lock className="mr-1 size-3" />
              TLS
            </Badge>
          ) : (
            <Badge className="border-0 bg-[color:var(--sev-high)]/12 font-mono text-[10px] uppercase text-[color:var(--sev-high)]">
              <LockOpen className="mr-1 size-3" />
              No TLS
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col px-4 py-2">
        <DetailRow label="Host" value={conn.host} />
        {conn.scheme && <DetailRow label="Scheme" value={conn.scheme} />}
        {conn.envVar && <DetailRow label="Env var" value={conn.envVar} />}
        <DetailRow
          label="Detected via"
          value={conn.detectedVia ? DETECTION_LABEL[conn.detectedVia] : "—"}
          mono={false}
        />
        {conn.schemaSource && <DetailRow label="Schema" value={conn.schemaSource} mono={false} />}
        <DetailRow label="Pooling" value={conn.pooled ? "Pooled" : "Direct / unpooled"} mono={false} />
        <DetailRow
          label={conn.engine === "mongodb" ? "Collections" : "Tables"}
          value={conn.collections.toLocaleString()}
        />
      </div>
      <div className="border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
        <FileLink path={conn.filePath} />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

function ColumnFlags({ flags }: { flags: DbTable["columns"][number]["flags"] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {flags.includes("pk") && (
        <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--sev-ok)]/12 px-1.5 py-0.5 text-[color:var(--sev-ok)]">
          <Key className="size-3" />
          PK
        </span>
      )}
      {flags.includes("fk") && <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">Link</span>}
      {flags.includes("unique") && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">Unique</span>
      )}
      {flags.includes("index") && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">Index</span>
      )}
      {flags.includes("nullable") && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">Nullable</span>
      )}
      {flags.includes("default") && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">Default</span>
      )}
    </div>
  )
}

function TableRow({ table, expanded, onToggle }: { table: DbTable; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-t border-border first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggle()
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-medium text-foreground">{table.name}</span>
              <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                {table.kind}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span>{table.columns.length} columns</span>
              {table.rowCount > 0 && <span>{table.rowCount.toLocaleString()} rows</span>}
              {table.sizeKb ? <span>{(table.sizeKb / 1024).toFixed(1)} MB</span> : null}
              {table.indexes.length > 0 && <span>{table.indexes.length} indexes</span>}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-secondary/20 p-4">
          <div className="flex flex-col gap-3">
            {table.columns.map((col) => (
              <div key={col.name} className="flex items-start justify-between gap-2 font-mono text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{col.name}</span>
                    <span className="text-muted-foreground/70">{col.type}</span>
                    {col.references && (
                      <span className="text-muted-foreground/70">{`→ ${col.references}`}</span>
                    )}
                  </div>
                  <ColumnFlags flags={col.flags} />
                </div>
              </div>
            ))}
          </div>

          {table.indexes.length > 0 && (
            <div className="mt-4 border-t border-border/50 pt-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Indexes</p>
              <div className="flex flex-col gap-1.5">
                {table.indexes.map((idx) => (
                  <div key={idx.name} className="flex items-center gap-2 font-mono text-[11px]">
                    <Hash className="size-3 text-muted-foreground" />
                    <span className="text-foreground">{idx.name}</span>
                    <span className="text-muted-foreground/70">({idx.columns.join(", ")})</span>
                    {idx.unique && (
                      <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">unique</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {table.filePath && (
            <div className="mt-3 border-t border-border/50 pt-3 font-mono text-[10px] text-muted-foreground">
              <FileLink path={table.filePath} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

function QueryRow({ q }: { q: DbQuery }) {
  const color =
    q.estMs >= 1500
      ? "var(--sev-critical)"
      : q.estMs >= 1000
        ? "var(--sev-high)"
        : q.estMs >= 300
          ? "var(--sev-medium)"
          : "var(--sev-ok)"
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

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"]

export function DatabasePanel({ database }: { database: DbResult }) {
  const tables = database.tables ?? []
  const hasConnections = database.connections.length > 0

  const [tab, setTab] = useState<MainTab>(hasConnections ? "connections" : "findings")
  const [sevFilter, setSevFilter] = useState<SevFilter>("all")
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const findings = useMemo(() => [...database.findings].sort(bySeverityDesc), [database.findings])
  const filteredFindings = useMemo(
    () => (sevFilter === "all" ? findings : findings.filter((f) => f.severity === sevFilter)),
    [findings, sevFilter],
  )

  const slowQueries = useMemo(() => [...database.queries].sort((a, b) => b.estMs - a.estMs), [database.queries])

  const engineSegments = useMemo(() => {
    const engines = [...new Set(database.connections.map((c) => c.engine))]
    return engines.map((e, i) => ({
      label: ENGINE_LABEL[e],
      value: Math.max(1, database.connections.filter((c) => c.engine === e).length),
      color: `var(--chart-${(i % 5) + 1})`,
    }))
  }, [database.connections])

  const sevSegments = SEV_ORDER.map((s, i) => ({
    label: severityStyle(s).label,
    value: database.findings.filter((f) => f.severity === s).length,
    color: `var(--chart-${i + 1})`,
  })).filter((s) => s.value > 0)

  // Severity sub-tabs: only those with findings, plus "All".
  const sevTabs: { key: SevFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: findings.length },
    ...SEV_ORDER.map((s) => ({
      key: s as SevFilter,
      label: severityStyle(s).label,
      count: findings.filter((f) => f.severity === s).length,
    })).filter((t) => t.count > 0),
  ]

  // Count foreign-key relationships across the schema (for the tab badge).
  const relationshipCount = useMemo(() => {
    const names = new Set(tables.map((t) => t.name))
    let count = 0
    for (const t of tables) {
      for (const col of t.columns) {
        if (!col.references) continue
        const dot = col.references.lastIndexOf(".")
        const target = dot > 0 ? col.references.slice(0, dot) : ""
        if (target && target !== t.name && names.has(target)) count++
      }
    }
    return count
  }, [tables])

  // Group schema tables by connection for the explorer.
  const tablesByConnection = useMemo(() => {
    const map = new Map<string, DbTable[]>()
    for (const t of tables) {
      const arr = map.get(t.connectionId) ?? []
      arr.push(t)
      map.set(t.connectionId, arr)
    }
    return map
  }, [tables])

  const toggleTableExpand = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

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
            {!hasConnections && (
              <p className="px-3 py-3 text-[11px] text-muted-foreground">No datastore detected.</p>
            )}
          </div>
        </InsightCard>

        {engineSegments.length > 0 && (
          <InsightCard title="By engine">
            <ProportionBar segments={engineSegments} />
          </InsightCard>
        )}

        {sevSegments.length > 0 && (
          <InsightCard title="Findings by severity">
            <ProportionBar segments={sevSegments} />
          </InsightCard>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {/* Main view tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
          <TabButton
            active={tab === "connections"}
            onClick={() => setTab("connections")}
            icon={<Plug className="size-4" />}
            label="Connections"
            count={database.connections.length}
          />
          <TabButton
            active={tab === "schema"}
            onClick={() => setTab("schema")}
            icon={<Layers className="size-4" />}
            label="Schema"
            count={tables.length}
          />
          <TabButton
            active={tab === "relationships"}
            onClick={() => setTab("relationships")}
            icon={<Network className="size-4" />}
            label="Relationships"
            count={relationshipCount}
          />
          <TabButton
            active={tab === "queries"}
            onClick={() => setTab("queries")}
            icon={<Gauge className="size-4" />}
            label="Queries"
            count={database.queries.length}
          />
          <TabButton
            active={tab === "findings"}
            onClick={() => setTab("findings")}
            icon={<AlertTriangle className="size-4" />}
            label="Findings"
            count={database.findings.length}
          />
        </div>

        {/* Connections tab */}
        {tab === "connections" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Detected datastores</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {database.connections.length}
              </Badge>
            </div>
            {hasConnections ? (
              <div className="grid gap-4 md:grid-cols-2">
                {database.connections.map((c) => (
                  <ConnectionCard key={c.id} conn={c} />
                ))}
              </div>
            ) : (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Database className="size-5" />
                No database connection detected. Add a connection string (e.g. DATABASE_URL or MONGODB_URI) or a
                database client dependency.
              </Card>
            )}
          </div>
        )}

        {/* Schema tab */}
        {tab === "schema" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Schema explorer</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {tables.length} {tables.length === 1 ? "table" : "tables"}
              </Badge>
            </div>
            {tables.length === 0 ? (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Activity className="size-5" />
                No schema discovered. Add a Prisma/Drizzle schema, Mongoose models, or provide a reachable connection
                string for live introspection.
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {[...tablesByConnection.entries()].map(([connId, connTables]) => {
                  const conn = database.connections.find((c) => c.id === connId)
                  return (
                    <div key={connId} className="flex flex-col gap-2">
                      {conn && (
                        <div className="flex items-center gap-2 px-1">
                          <Boxes className="size-3.5 text-muted-foreground" />
                          <span className="font-mono text-xs text-foreground">{conn.name}</span>
                          <EngineBadge engine={conn.engine} />
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {connTables.length} {conn.engine === "mongodb" ? "collections" : "tables"}
                          </span>
                        </div>
                      )}
                      <Card className="gap-0 overflow-hidden py-0">
                        {connTables.map((t) => (
                          <TableRow
                            key={`${connId}:${t.name}`}
                            table={t}
                            expanded={expandedTables.has(`${connId}:${t.name}`)}
                            onToggle={() => toggleTableExpand(`${connId}:${t.name}`)}
                          />
                        ))}
                      </Card>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Relationships tab — ER diagram */}
        {tab === "relationships" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Network className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Relationship map</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {relationshipCount} {relationshipCount === 1 ? "relation" : "relations"}
              </Badge>
            </div>
            <DbRelationshipGraph tables={tables} connections={database.connections} />
          </div>
        )}

        {/* Queries tab */}
        {tab === "queries" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Slowest queries</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {database.counts.slowQueries} slow
              </Badge>
            </div>
            {slowQueries.length === 0 ? (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
                No notable or slow queries detected.
              </Card>
            ) : (
              <Card className="gap-0 overflow-hidden py-0">
                {slowQueries.map((q) => (
                  <QueryRow key={q.id} q={q} />
                ))}
              </Card>
            )}
          </div>
        )}

        {/* Findings tab — grouped by severity */}
        {tab === "findings" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
              {sevTabs.map((t) => (
                <TabButton
                  key={t.key}
                  active={sevFilter === t.key}
                  onClick={() => setSevFilter(t.key)}
                  label={t.label}
                  count={t.count}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Database className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Database findings</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {filteredFindings.length}
              </Badge>
            </div>

            {filteredFindings.length === 0 ? (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
                No database issues in this severity.
              </Card>
            ) : (
              <Card className="gap-0 overflow-hidden py-0">
                {filteredFindings.map((f) => (
                  <FindingRow key={f.id} f={f} />
                ))}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
