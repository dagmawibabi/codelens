"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ShieldAlert, ShieldCheck, ChevronRight, RotateCcw, Loader2, AlertTriangle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { FileLink, useInspector, TrackedBadge } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { securityToIssue } from "@/lib/issues"
import type { SecurityResult, SecurityFinding } from "@/lib/schema"
import { cn } from "@/lib/utils"

function FindingRow({ finding }: { finding: SecurityFinding }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(finding.severity)

  return (
    <Card className={cn("gap-0 overflow-hidden border-l-2 py-0", sev.border)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => viewIssue(securityToIssue(finding))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            viewIssue(securityToIssue(finding))
          }
        }}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", sev.text)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {finding.category}
            </span>
            <FileLink path={finding.filePath} line={finding.line} />
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {Math.round(finding.confidence * 100)}% conf.
            </span>
          </div>
          <p className="mt-2 text-pretty text-sm font-medium text-foreground">{finding.title}</p>
          <p className="mt-1 line-clamp-2 text-pretty text-sm leading-relaxed text-muted-foreground">
            {finding.description}
          </p>
        </div>
        <TrackedBadge issue={securityToIssue(finding)} variant="dot" className="mt-0.5" />
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
    </Card>
  )
}

type SevFilter = "all" | SecurityFinding["severity"]

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const

/**
 * Triggers a security-only rescan (re-runs just the AI security pass on the
 * connected Projectlens CLI backend, reusing every other result). Completion is
 * detected when fresh data arrives over the live socket and swaps the
 * `security` prop reference — at which point the spinner clears.
 */
function useSecurityRescan(security: SecurityResult) {
  const [rescanning, setRescanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prev = useRef(security)

  // New analysis data landed → the rescan is done.
  useEffect(() => {
    if (prev.current !== security) {
      prev.current = security
      setRescanning(false)
    }
  }, [security])

  // Safety net so the button can never spin forever if no update arrives.
  useEffect(() => {
    if (!rescanning) return
    const t = window.setTimeout(() => setRescanning(false), 120_000)
    return () => window.clearTimeout(t)
  }, [rescanning])

  const rescan = useCallback(async () => {
    setError(null)
    setRescanning(true)
    try {
      const res = await fetch("/api/run?scope=security", { method: "POST" })
      // 409 = a run is already in progress; its result will still arrive.
      if (!res.ok && res.status !== 409) {
        throw new Error(
          res.status === 501 ? "Rescan needs the Projectlens CLI backend" : `Rescan failed (${res.status})`,
        )
      }
    } catch (err) {
      setRescanning(false)
      setError(err instanceof Error ? err.message : "Rescan failed")
    }
  }, [])

  return { rescanning, error, rescan }
}

function RescanButton({ rescanning, onClick }: { rescanning: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={rescanning}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      {rescanning ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      {rescanning ? "Rescanning…" : "Rescan security"}
    </button>
  )
}

export function SecurityPanel({ security }: { security: SecurityResult }) {
  const [filter, setFilter] = useState<SevFilter>("all")
  const { rescanning, error: rescanError, rescan } = useSecurityRescan(security)

  const sortedFindings = useMemo(() => [...security.findings].sort(bySeverityDesc), [security.findings])

  const filtered = useMemo(
    () => (filter === "all" ? sortedFindings : sortedFindings.filter((f) => f.severity === filter)),
    [sortedFindings, filter],
  )

  // Severity tabs: "All" plus each severity that actually has findings (in
  // descending order), mirroring the Dependencies tab's filter bar.
  const filterTabs: { key: SevFilter; label: string; count: number }[] = useMemo(() => {
    const tabs: { key: SevFilter; label: string; count: number }[] = [
      { key: "all", label: "All", count: security.findings.length },
    ]
    for (const s of SEVERITY_ORDER) {
      const count = security.findings.filter((f) => f.severity === s).length
      if (count > 0) tabs.push({ key: s, label: severityStyle(s).label, count })
    }
    return tabs
  }, [security.findings])

  const sevSegments = (["critical", "high", "medium", "low", "info"] as const).map((s, i) => ({
    label: severityStyle(s).label,
    value: security.findings.filter((f) => f.severity === s).length,
    color: `var(--chart-${i + 1})`,
  }))

  const categoryRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of security.findings) map.set(f.category, (map.get(f.category) ?? 0) + 1)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [security.findings])

  const fileRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of security.findings) map.set(f.filePath, (map.get(f.filePath) ?? 0) + 1)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [security.findings])

  if (security.skipped) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">AI security audit skipped</p>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            No AI key was configured. Set AI_GATEWAY_API_KEY to enable the code review and dependency prioritization.
          </p>
        </div>
        <RescanButton rescanning={rescanning} onClick={rescan} />
        {rescanError && <p className="font-mono text-xs text-[color:var(--sev-critical)]">{rescanError}</p>}
      </Card>
    )
  }

  const criticalHigh = security.findings.filter((f) => f.severity === "critical" || f.severity === "high").length
  const avgConf =
    security.findings.length > 0
      ? Math.round((security.findings.reduce((s, f) => s + f.confidence, 0) / security.findings.length) * 100)
      : 0

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      {/* Posture rail */}
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Posture">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {security.findings.length}
              </span>
              <span className="text-[11px] text-muted-foreground">code findings</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{criticalHigh}</span>
              <span className="text-[11px] text-muted-foreground">critical + high</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {categoryRows.length}
              </span>
              <span className="text-[11px] text-muted-foreground">categories</span>
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{avgConf}%</span>
              <span className="text-[11px] text-muted-foreground">avg confidence</span>
            </div>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            Dependency advisories now live in the{" "}
            <span className="font-mono text-foreground">Dependencies</span> tab.
          </p>
        </InsightCard>

        <InsightCard title="By severity">
          <ProportionBar segments={sevSegments} />
        </InsightCard>

        <InsightCard title="By category">
          <CountList rows={categoryRows} emptyLabel="No findings." />
        </InsightCard>

        <InsightCard title="Affected files">
          <CountList rows={fileRows} emptyLabel="No findings." />
        </InsightCard>
      </aside>

      {/* Main findings filtered by severity */}
      <div className="flex min-w-0 flex-col gap-3">
        {(security.failed || rescanError) && (
          <Card className="flex items-start gap-3 border-l-2 border-l-[color:var(--sev-high)] bg-[color:var(--sev-high)]/[0.06] p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color:var(--sev-high)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">AI security review error</p>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                {rescanError ?? security.error ?? "The AI review failed. Results below may be incomplete."}
              </p>
            </div>
            <RescanButton rescanning={rescanning} onClick={rescan} />
          </Card>
        )}

        {security.findings.length > 0 && (
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
        )}

        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-[color:var(--sev-high)]" />
          <h3 className="text-sm font-semibold text-foreground">Code findings</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            {filtered.length}
          </Badge>
          <span className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">
            click a finding for full detail
          </span>
          {!security.failed && !rescanError && (
            <div className="ml-auto sm:ml-0">
              <RescanButton rescanning={rescanning} onClick={rescan} />
            </div>
          )}
        </div>
        {security.findings.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No code-level security issues found by the AI review.
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
            No findings at this severity.
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
