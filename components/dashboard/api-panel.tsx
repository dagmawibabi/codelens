"use client"

import { useMemo, useState } from "react"
import {
  Network,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Database,
  CheckCircle2,
  CircleSlash,
  ChevronRight,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ApiResult, ApiEndpoint, HttpMethod } from "@/lib/project-insights"
import { severityStyle } from "@/lib/severity"
import { InsightCard, ProportionBar } from "./insights"
import { FileLink } from "./inspector"

/**
 * Method chips stay within the monochrome system. Read methods are light/quiet;
 * mutating methods (POST/PUT/DELETE) get the inked, high-contrast treatment so
 * state-changing routes read as more prominent at a glance.
 */
function methodStyle(method: HttpMethod): { text: string; bg: string; border: string } {
  switch (method) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return { text: "text-muted-foreground", bg: "bg-secondary", border: "border-border" }
    case "POST":
      return { text: "text-primary-foreground", bg: "bg-primary", border: "border-primary" }
    case "PUT":
    case "PATCH":
      return { text: "text-foreground", bg: "bg-accent", border: "border-foreground/40" }
    case "DELETE":
      return { text: "text-foreground", bg: "bg-background", border: "border-foreground/60" }
    default:
      return { text: "text-muted-foreground", bg: "bg-secondary", border: "border-border" }
  }
}

const MUTATION_METHODS: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"]

type Filter = "all" | "mutations" | "public" | "issues"

export function ApiPanel({ api }: { api: ApiResult }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")

  const sorted = useMemo(
    () => [...api.endpoints].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    [api.endpoints],
  )

  const filtered = useMemo(() => {
    let list = sorted
    if (filter === "mutations") list = list.filter((e) => MUTATION_METHODS.includes(e.method))
    else if (filter === "public") list = list.filter((e) => !e.flags.auth && MUTATION_METHODS.includes(e.method))
    else if (filter === "issues") list = list.filter((e) => e.findings.length > 0)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((e) => e.path.toLowerCase().includes(q) || e.method.toLowerCase().includes(q))
    return list
  }, [sorted, filter, query])

  // Group filtered endpoints by their top-level segment for the explorer.
  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>()
    for (const e of filtered) {
      const seg = segmentOf(e.path)
      if (!map.has(seg)) map.set(seg, [])
      map.get(seg)!.push(e)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  if (!api.present) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <Network className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">No API endpoints detected</p>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
            CodeLens maps route handlers and server actions across Next.js, Express, Hono, Fastify, SvelteKit and Nuxt.
            Add a server route to see your API surface here.
          </p>
        </div>
      </Card>
    )
  }

  const filterTabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: api.counts.endpoints },
    { key: "mutations", label: "Mutations", count: api.counts.mutations },
    { key: "public", label: "Public mutations", count: api.endpoints.filter((e) => !e.flags.auth && MUTATION_METHODS.includes(e.method)).length },
    { key: "issues", label: "With issues", count: api.endpoints.filter((e) => e.findings.length > 0).length },
  ]

  const protectedPct = api.counts.endpoints > 0 ? Math.round((api.counts.protected / api.counts.endpoints) * 100) : 0
  const validatedPct = api.counts.endpoints > 0 ? Math.round((api.counts.validated / api.counts.endpoints) * 100) : 0

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Main column */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* Filter + search bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter routes…"
            className="w-full rounded-sm border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:w-44"
            aria-label="Filter routes"
          />
        </div>

        {/* Endpoint groups */}
        {grouped.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <CircleSlash className="size-5 text-muted-foreground" />
            No endpoints match this filter.
          </Card>
        ) : (
          grouped.map(([segment, endpoints]) => (
            <div key={segment} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">/{segment}</span>
                <span className="font-mono text-[11px] text-muted-foreground/60">
                  {endpoints.length} {endpoints.length === 1 ? "route" : "routes"}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {endpoints.map((e) => (
                  <EndpointRow key={e.id} endpoint={e} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-4">
        <InsightCard title="Surface">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Endpoints</span>
              <span className="font-mono text-foreground">{api.counts.endpoints}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Mutations</span>
              <span className="font-mono text-foreground">{api.counts.mutations}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Dynamic routes</span>
              <span className="font-mono text-foreground">{api.counts.dynamic}</span>
            </div>
            {api.style && (
              <div className="border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">{api.style}</div>
            )}
          </div>
        </InsightCard>

        <InsightCard title="Coverage">
          <div className="flex flex-col gap-3">
            <CoverageBar label="Protected" pct={protectedPct} count={api.counts.protected} total={api.counts.endpoints} />
            <CoverageBar label="Validated" pct={validatedPct} count={api.counts.validated} total={api.counts.endpoints} />
          </div>
        </InsightCard>

        {api.methodCounts.length > 0 && (
          <InsightCard title="By method">
            <ProportionBar
              segments={api.methodCounts.map((m) => ({
                label: m.method,
                value: m.count,
                color: methodBarColor(m.method),
              }))}
            />
            <div className="mt-3 flex flex-col gap-1.5">
              {api.methodCounts.map((m) => (
                <div key={m.method} className="flex items-center justify-between text-xs">
                  <span className={cn("font-mono font-semibold", methodStyle(m.method).text)}>{m.method}</span>
                  <span className="font-mono text-muted-foreground">{m.count}</span>
                </div>
              ))}
            </div>
          </InsightCard>
        )}

        <InsightCard title="Findings">
          <div className="flex items-center gap-2">
            {api.counts.findings === 0 ? (
              <>
                <ShieldCheck className="size-4 text-[color:var(--sev-ok)]" />
                <span className="text-sm text-muted-foreground">No API issues found</span>
              </>
            ) : (
              <>
                <ShieldAlert className="size-4 text-[color:var(--sev-high)]" />
                <span className="text-sm text-foreground">
                  {api.counts.findings} {api.counts.findings === 1 ? "issue" : "issues"} across the surface
                </span>
              </>
            )}
          </div>
        </InsightCard>
      </aside>
    </div>
  )
}

function EndpointRow({ endpoint }: { endpoint: ApiEndpoint }) {
  const [open, setOpen] = useState(false)
  const m = methodStyle(endpoint.method)
  const hasFindings = endpoint.findings.length > 0
  const topSeverity = hasFindings
    ? endpoint.findings.reduce((acc, f) => (sevRank(f.severity) > sevRank(acc) ? f.severity : acc), endpoint.findings[0].severity)
    : null

  return (
    <Card className={cn("overflow-hidden transition-colors", open && "ring-1 ring-border")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-secondary/40"
      >
        <span
          className={cn(
            "shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase",
            m.bg,
            m.border,
            m.text,
          )}
        >
          {endpoint.method}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{endpoint.path}</span>

        {/* Flag chips */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <FlagChip ok={endpoint.flags.auth} okIcon={Lock} noIcon={Unlock} okLabel="auth" noLabel="public" />
          <FlagChip ok={endpoint.flags.validation} okIcon={CheckCircle2} noIcon={CircleSlash} okLabel="valid" noLabel="no schema" muted={!MUTATION_METHODS.includes(endpoint.method)} />
          {endpoint.flags.database && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <Database className="size-3" />
              db
            </span>
          )}
        </div>

        {hasFindings && topSeverity && (
          <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase", severityStyle(topSeverity).bg, severityStyle(topSeverity).text)}>
            {endpoint.findings.length}
          </span>
        )}
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border bg-background/40 p-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <FileLink path={endpoint.filePath} line={endpoint.line} />
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase">{kindLabel(endpoint.kind)}</span>
            {endpoint.dynamic && <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px]">dynamic</span>}
            {endpoint.handler && <span className="font-mono text-[10px]">handler: {endpoint.handler}</span>}
          </div>

          {/* Full flag grid */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border font-mono text-xs sm:grid-cols-3">
            <FlagCell label="auth" on={endpoint.flags.auth} />
            <FlagCell label="validation" on={endpoint.flags.validation} />
            <FlagCell label="error handling" on={endpoint.flags.errorHandling} />
            <FlagCell label="reads input" on={endpoint.flags.inputs} neutral />
            <FlagCell label="database" on={endpoint.flags.database} neutral />
            <FlagCell label="env access" on={endpoint.flags.env} neutral />
          </dl>

          {/* Findings */}
          {hasFindings && (
            <ul className="flex flex-col gap-2">
              {endpoint.findings.map((f) => {
                const s = severityStyle(f.severity)
                return (
                  <li key={f.id} className="rounded-sm border border-border bg-card p-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
                      <span className="text-sm font-medium text-foreground">{f.title}</span>
                      <span className={cn("ml-auto font-mono text-[10px] uppercase", s.text)}>{s.label}</span>
                    </div>
                    <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{f.detail}</p>
                    <p className="mt-1.5 text-pretty text-xs leading-relaxed text-foreground/80">
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">fix:</span> {f.recommendation}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

function FlagChip({
  ok,
  okIcon: OkIcon,
  noIcon: NoIcon,
  okLabel,
  noLabel,
  muted,
}: {
  ok: boolean
  okIcon: typeof Lock
  noIcon: typeof Unlock
  okLabel: string
  noLabel: string
  muted?: boolean
}) {
  if (muted) return null
  const Icon = ok ? OkIcon : NoIcon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
        ok
          ? "border-border bg-secondary text-muted-foreground"
          : "border-foreground/40 bg-background font-semibold text-foreground",
      )}
    >
      <Icon className="size-3" />
      {ok ? okLabel : noLabel}
    </span>
  )
}

function FlagCell({ label, on, neutral }: { label: string; on: boolean; neutral?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-card px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          neutral ? "text-foreground/70" : on ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {on ? "yes" : "no"}
      </span>
    </div>
  )
}

function CoverageBar({ label, pct, count, total }: { label: string; pct: number; count: number; total: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {count}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} aria-hidden />
      </div>
    </div>
  )
}

function methodBarColor(method: HttpMethod): string {
  switch (method) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "var(--chart-4)"
    case "POST":
      return "var(--chart-1)"
    case "PUT":
    case "PATCH":
      return "var(--chart-2)"
    case "DELETE":
      return "var(--chart-3)"
    default:
      return "var(--chart-5)"
  }
}

function segmentOf(path: string): string {
  const parts = path.replace(/^\//, "").split("/")
  return parts[0] || "(root)"
}

function kindLabel(kind: ApiEndpoint["kind"]): string {
  switch (kind) {
    case "next-app":
      return "App Route"
    case "next-pages":
      return "Pages API"
    case "next-action":
      return "Server Action"
    case "sveltekit":
      return "SvelteKit"
    case "nuxt":
      return "Nuxt"
    default:
      return kind
  }
}

function sevRank(s: string): number {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[s] ?? 0
}
