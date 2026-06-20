"use client"

import { useMemo, useState } from "react"
import { FlaskConical, ShieldCheck, ChevronRight, CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insights"
import { useInspector, TrackedBadge } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { testToIssue } from "@/lib/issues"
import type { TestsResult, TestFinding, TestSuite, CoverageFile } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

type View = "findings" | "suites" | "coverage"

function coverageColor(pct: number): string {
  if (pct >= 80) return "var(--sev-ok)"
  if (pct >= 50) return "var(--sev-medium)"
  if (pct > 0) return "var(--sev-high)"
  return "var(--sev-critical)"
}

function CoverageStat({ label, value }: { label: string; value: number }) {
  const color = coverageColor(value)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function FindingRow({ finding }: { finding: TestFinding }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(finding.severity)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(testToIssue(finding))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(testToIssue(finding))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <span className={cn("mt-0.5 size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{finding.kind.replace(/-/g, " ")}</span>
        </div>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{finding.title}</p>
        <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
          {finding.filePath}
          {finding.line ? `:${finding.line}` : ""}
        </span>
      </div>
      <TrackedBadge issue={testToIssue(finding)} variant="dot" className="mt-0.5" />
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function SuiteRow({ suite, expanded, onToggle }: { suite: TestSuite; expanded: boolean; onToggle: () => void }) {
  const failed = suite.status === "failed"
  const tests = suite.tests ?? []

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
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/40"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="inline-flex size-4 shrink-0 items-center justify-center">
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
          </div>
          {failed ? (
            <XCircle className="size-4 shrink-0 text-[color:var(--sev-critical)]" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-[color:var(--sev-ok)]" />
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm text-foreground">{suite.name}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{suite.filePath}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums">
          <span className="inline-flex items-center gap-1 text-[color:var(--sev-ok)]">
            <CheckCircle2 className="size-3" />
            {suite.passed}
          </span>
          {suite.failed > 0 && (
            <span className="inline-flex items-center gap-1 text-[color:var(--sev-critical)]">
              <XCircle className="size-3" />
              {suite.failed}
            </span>
          )}
          {suite.skipped > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MinusCircle className="size-3" />
              {suite.skipped}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" />
            {(suite.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Expanded test details */}
      {expanded && tests.length > 0 && (
        <div className="border-t border-border/50 bg-secondary/20">
          <div className="flex flex-col divide-y divide-border/50">
            {tests.map((test) => (
              <div key={test.name} className="flex flex-col gap-2 p-3 font-mono text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {test.status === "passed" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-[color:var(--sev-ok)]" />
                    ) : test.status === "failed" ? (
                      <XCircle className="size-3.5 shrink-0 text-[color:var(--sev-critical)]" />
                    ) : (
                      <MinusCircle className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className={cn("truncate font-medium", test.status === "failed" ? "text-foreground" : "text-muted-foreground")}>
                      {test.name}
                    </span>
                  </div>
                  {test.durationMs != null && (
                    <span className="shrink-0 text-muted-foreground/70">
                      {(test.durationMs / 1000).toFixed(2)}s
                    </span>
                  )}
                </div>
                {test.error && (
                  <div className="ml-5 rounded-sm border border-[color:var(--sev-critical)]/20 bg-[color:var(--sev-critical)]/5 px-2 py-1.5 text-[10px]">
                    <div className="font-semibold text-[color:var(--sev-critical)]">{test.error}</div>
                  </div>
                )}
                {test.assertions && test.assertions.length > 0 && (
                  <div className="ml-5 flex flex-col gap-1">
                    {test.assertions.map((assert, i) => (
                      <div key={i} className="flex items-start gap-2 text-muted-foreground/80">
                        <span className="mt-0.5 inline-flex size-1.5 shrink-0 rounded-full bg-current" />
                        <span className="truncate">{assert}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CoverageFileRow({ file }: { file: CoverageFile }) {
  const color = coverageColor(file.lines)
  return (
    <div className="flex items-center gap-3 border-t border-border p-4 first:border-t-0">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-mono text-sm text-foreground">{file.filePath}</span>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <span className="block h-full rounded-full" style={{ width: `${file.lines}%`, background: color }} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-sm tabular-nums" style={{ color }}>
          {file.lines}%
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">lines</span>
      </div>
    </div>
  )
}

export function TestsPanel({ tests }: { tests: TestsResult }) {
  const [view, setView] = useState<View>("findings")
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())

  const findings = useMemo(
    () => [...tests.findings].sort((a, b) => severityStyle(b.severity).rank - severityStyle(a.severity).rank),
    [tests.findings],
  )
  const suites = useMemo(() => [...tests.suites].sort((a, b) => b.failed - a.failed || b.durationMs - a.durationMs), [tests.suites])
  const coverageFiles = useMemo(() => [...tests.files].sort((a, b) => a.lines - b.lines), [tests.files])

  const toggleSuiteExpand = (suiteId: string) => {
    const next = new Set(expandedSuites)
    if (next.has(suiteId)) next.delete(suiteId)
    else next.add(suiteId)
    setExpandedSuites(next)
  }

  const passRate = tests.counts.total ? Math.round((tests.counts.passed / tests.counts.total) * 100) : 0

  const views: { key: View; label: string; count: number }[] = [
    { key: "findings", label: "Findings", count: findings.length },
    { key: "suites", label: "Suites", count: suites.length },
    { key: "coverage", label: "Coverage", count: coverageFiles.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pass rate</span>
          <span
            className="font-mono text-3xl font-semibold tabular-nums"
            style={{ color: tests.counts.failed > 0 ? "var(--sev-high)" : "var(--sev-ok)" }}
          >
            {passRate}%
          </span>
          <span className="text-xs text-muted-foreground">
            {tests.counts.passed}/{tests.counts.total} passing · {tests.counts.skipped} skipped
          </span>
        </Card>
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Failing</span>
          <span
            className="font-mono text-3xl font-semibold tabular-nums"
            style={{ color: tests.counts.failed > 0 ? "var(--sev-critical)" : "var(--sev-ok)" }}
          >
            {tests.counts.failed}
          </span>
          <span className="text-xs text-muted-foreground">across {tests.counts.suites} suites</span>
        </Card>
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Line coverage</span>
          <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: coverageColor(tests.coverage.lines) }}>
            {tests.coverage.lines}%
          </span>
          <span className="text-xs text-muted-foreground">{tests.framework}</span>
        </Card>
        <Card className="gap-2 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Duration</span>
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
            {(tests.counts.durationMs / 1000).toFixed(1)}s
          </span>
          <span className="text-xs text-muted-foreground">full suite run</span>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
          <InsightCard title="Coverage breakdown">
            <div className="flex flex-col gap-3">
              <CoverageStat label="Lines" value={tests.coverage.lines} />
              <CoverageStat label="Functions" value={tests.coverage.functions} />
              <CoverageStat label="Branches" value={tests.coverage.branches} />
              <CoverageStat label="Statements" value={tests.coverage.statements} />
            </div>
          </InsightCard>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
            {views.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                  view === v.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{v.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <FlaskConical className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              {view === "findings" ? "Test findings" : view === "suites" ? "Test suites" : "Lowest coverage files"}
            </h3>
          </div>

          {view === "findings" &&
            (findings.length === 0 ? (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
                No test findings — suite is healthy.
              </Card>
            ) : (
              <Card className="gap-0 overflow-hidden py-0">
                {findings.map((f) => (
                  <FindingRow key={f.id} finding={f} />
                ))}
              </Card>
            ))}

          {view === "suites" && (
            <Card className="gap-0 overflow-hidden py-0">
              {suites.map((s) => (
                <SuiteRow
                  key={s.id}
                  suite={s}
                  expanded={expandedSuites.has(s.id)}
                  onToggle={() => toggleSuiteExpand(s.id)}
                />
              ))}
            </Card>
          )}

          {view === "coverage" && (
            <Card className="gap-0 overflow-hidden py-0">
              {coverageFiles.map((f) => (
                <CoverageFileRow key={f.filePath} file={f} />
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
