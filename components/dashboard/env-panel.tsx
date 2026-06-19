"use client"

import { useMemo, useState } from "react"
import {
  KeyRound,
  ShieldCheck,
  FileCode2,
  ChevronRight,
  Monitor,
  Server,
  Eye,
  EyeOff,
  Copy,
  Check,
  ListChecks,
  ListTree,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { useInspector, TrackedBadge } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { envToIssue } from "@/lib/issues"
import type { EnvResult, EnvVariable, EnvStatus } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<EnvStatus, string> = {
  ok: "Healthy",
  missing: "Missing",
  undocumented: "Undocumented",
  unused: "Unused",
  exposed: "Exposed",
  empty: "Empty",
}

type Filter = "all" | "issues" | EnvStatus

function EnvRow({ v }: { v: EnvVariable }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(v.severity)
  const isIssue = v.status !== "ok"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(envToIssue(v))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(envToIssue(v))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      {v.scope === "client" ? (
        <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-foreground">{v.key}</span>
          {v.sample && <span className="font-mono text-xs text-muted-foreground">{v.sample}</span>}
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {v.scope}
          </span>
          {isIssue ? (
            <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>
              {STATUS_LABEL[v.status]}
            </Badge>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--sev-ok)]/12 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[color:var(--sev-ok)]">
              <ShieldCheck className="size-3" />
              OK
            </span>
          )}
        </div>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{v.note}</p>
      </div>
      <TrackedBadge issue={envToIssue(v)} variant="dot" className="mt-0.5" />
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function ValueRow({ v, shown, onToggle }: { v: EnvVariable; shown: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false)
  const notSet = v.value === undefined
  const display = notSet ? "(not set)" : v.value === "" ? "(empty)" : v.value

  const copy = () => {
    if (notSet) return
    navigator.clipboard?.writeText(v.value ?? "").then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }

  // Per-file values for comparing across .env.local, .env.example, etc.
  const perFileValues = v.values ? [...v.values].sort((a, b) => {
    // .env.local first, then .env.example, then others
    const order = { ".env.local": 0, ".env.example": 1 }
    return (order[a.file as keyof typeof order] ?? 2) - (order[b.file as keyof typeof order] ?? 2)
  }) : []

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3 first:border-t-0">
      {/* Primary value row */}
      <div className="flex items-start gap-3">
        {v.scope === "client" ? (
          <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-foreground">{v.key}</span>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {v.scope}
            </span>
          </div>
          <p
            className={cn(
              "mt-1.5 break-all font-mono text-xs",
              notSet ? "text-muted-foreground/60 italic" : shown ? "text-foreground" : "tracking-widest text-muted-foreground",
            )}
          >
            {notSet ? display : shown ? display : "•".repeat(Math.min(28, Math.max(8, (v.value || "").length || 12)))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!notSet && (
            <button
              type="button"
              onClick={copy}
              aria-label="Copy value"
              className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-[color:var(--sev-ok)]" /> : <Copy className="size-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            disabled={notSet}
            aria-label={shown ? "Hide value" : "Reveal value"}
            aria-pressed={shown}
            className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Per-file comparison when available */}
      {perFileValues.length > 1 && (
        <div className="ml-7 flex flex-col gap-1 border-l border-border/50 pl-3 text-xs">
          {perFileValues.map((fv) => (
            <div key={fv.file} className="flex items-center gap-2">
              <span className="text-muted-foreground">{fv.file}</span>
              <span className={cn("font-mono truncate", fv.value === null ? "text-muted-foreground/60 italic" : "text-foreground")}>
                {fv.value === null ? "(not set)" : fv.value === "" ? "(empty)" : shown ? fv.value : "•".repeat(Math.min(12, Math.max(4, (fv.value || "").length || 8)))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ValuesView({ env }: { env: EnvResult }) {
  const [showAll, setShowAll] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const rows = useMemo(() => [...env.variables].sort((a, b) => a.key.localeCompare(b.key)), [env.variables])
  const settable = rows.filter((v) => v.value !== undefined)

  const isShown = (key: string) => showAll || revealed.has(key)
  const toggle = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Variable values</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {settable.length} set
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowAll((v) => !v)
            setRevealed(new Set())
          }}
          aria-pressed={showAll}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {showAll ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showAll ? "Hide all" : "Reveal all"}
        </button>
      </div>

      <p className="rounded-sm border border-border bg-secondary/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Values are read from your local env files and rendered only in your browser. They are hidden by default — use the
        eye toggle to reveal a single value or reveal all at once.
      </p>

      {rows.length === 0 ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
          No environment variables found.
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          {rows.map((v) => (
            <ValueRow key={v.key} v={v} shown={isShown(v.key)} onToggle={() => toggle(v.key)} />
          ))}
        </Card>
      )}
    </div>
  )
}

export function EnvPanel({ env }: { env: EnvResult }) {
  const [view, setView] = useState<"audit" | "values">("audit")
  const [filter, setFilter] = useState<Filter>("all")

  const sorted = useMemo(() => [...env.variables].sort(bySeverityDesc), [env.variables])

  const filtered = useMemo(() => {
    if (filter === "all") return sorted
    if (filter === "issues") return sorted.filter((v) => v.status !== "ok")
    return sorted.filter((v) => v.status === filter)
  }, [sorted, filter])

  const statusRows = useMemo(() => {
    const map = new Map<EnvStatus, number>()
    for (const v of env.variables) map.set(v.status, (map.get(v.status) ?? 0) + 1)
    return [...map.entries()]
      .map(([key, count]) => ({ key, label: STATUS_LABEL[key], count }))
      .sort((a, b) => b.count - a.count)
  }, [env.variables])

  const scopeSegments = [
    { label: "Server", value: env.counts.server, color: "var(--chart-1)" },
    { label: "Client", value: env.counts.client, color: "var(--chart-3)" },
  ]

  const exposed = env.variables.filter((v) => v.status === "exposed").length
  const missing = env.variables.filter((v) => v.status === "missing").length

  const subTabs: { key: "audit" | "values"; label: string; icon: typeof ListChecks; count: number }[] = [
    { key: "audit", label: "Audit", icon: ListChecks, count: env.counts.issues },
    { key: "values", label: "Values", icon: ListTree, count: env.counts.total },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 self-start rounded-sm border border-border bg-card p-1">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
              view === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>

      {view === "values" ? (
        <ValuesView env={env} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Variables">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{env.counts.total}</span>
              <span className="text-[11px] text-muted-foreground">total</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{env.counts.issues}</span>
              <span className="text-[11px] text-muted-foreground">with issues</span>
            </div>
            <div className="flex flex-col">
              <span
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: exposed > 0 ? "var(--sev-critical)" : "var(--sev-ok)" }}
              >
                {exposed}
              </span>
              <span className="text-[11px] text-muted-foreground">exposed</span>
            </div>
            <div className="flex flex-col">
              <span
                className="font-mono text-2xl font-semibold tabular-nums"
                style={{ color: missing > 0 ? "var(--sev-high)" : "var(--sev-ok)" }}
              >
                {missing}
              </span>
              <span className="text-[11px] text-muted-foreground">missing</span>
            </div>
          </div>
        </InsightCard>

        <InsightCard title="By scope">
          <ProportionBar segments={scopeSegments} />
        </InsightCard>

        <InsightCard title="By status">
          <CountList
            rows={statusRows}
            activeKey={filter === "all" || filter === "issues" ? null : filter}
            onSelect={(k) => setFilter((p) => (p === k ? "all" : (k as Filter)))}
          />
        </InsightCard>

        <InsightCard title="Env files">
          <ul className="flex flex-col gap-1.5">
            {env.files.map((f) => (
              <li key={f.path} className="flex items-center justify-between font-mono text-xs">
                <span className="flex items-center gap-2">
                  <FileCode2 className="size-3.5 text-muted-foreground" />
                  <span className={cn(f.present ? "text-foreground" : "text-muted-foreground line-through")}>{f.path}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{f.present ? `${f.vars}` : "—"}</span>
              </li>
            ))}
          </ul>
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
          {([
            { key: "all", label: "All", count: env.counts.total },
            { key: "issues", label: "Issues", count: env.counts.issues },
            ...statusRows.filter((r) => r.key !== "ok").map((r) => ({ key: r.key as Filter, label: r.label, count: r.count })),
          ] as { key: Filter; label: string; count: number }[]).map((t) => (
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
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Environment variables</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {filtered.length}
          </Badge>
        </div>

        {filtered.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No variables in this category.
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            {filtered.map((v) => (
              <EnvRow key={v.key} v={v} />
            ))}
          </Card>
        )}
        </div>
        </div>
      )}
    </div>
  )
}
