"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  Loader2,
  Minus,
  Play,
  RotateCcw,
  ArrowRight,
} from "lucide-react"
import { useRunEngine, RUN_PHASES, type LogLevel } from "@/lib/run-engine"
import { mockReport } from "@/lib/mock-data"
import type { PhaseStatus } from "@/lib/schema"
import { cn } from "@/lib/utils"

function StatusIcon({ status }: { status: PhaseStatus }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-foreground" />
  if (status === "done") return <Check className="size-3.5 text-[color:var(--sev-ok)]" />
  if (status === "skipped") return <Minus className="size-3 text-muted-foreground" />
  return <span className="size-1.5 rounded-full bg-muted-foreground/40" />
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  command: "text-foreground font-medium",
  info: "text-muted-foreground",
  success: "text-[color:var(--sev-ok)]",
  warn: "text-[color:var(--sev-medium)]",
  error: "text-[color:var(--sev-critical)]",
}

const LEVEL_TAG: Record<LogLevel, string> = {
  command: "»",
  info: "·",
  success: "✓",
  warn: "!",
  error: "×",
}

export function RunWorkflow() {
  const report = mockReport
  const aiEnabled = report.meta.aiEnabled
  const { phases, logs, running, done, elapsedMs, start } = useRunEngine(aiEnabled, true)

  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [logs])

  const completed = RUN_PHASES.filter((p) => phases[p.id] === "done" || phases[p.id] === "skipped").length
  const progress = Math.round((completed / RUN_PHASES.length) * 100)

  const { lint, types, security } = report
  const results = [
    { label: "Lint", value: lint.errorCount + lint.warningCount, sub: `${lint.errorCount} err` },
    { label: "Types", value: types.diagnostics.length, sub: "errors" },
    { label: "Deps", value: security.dependencies.length, sub: "advisories" },
    { label: "Security", value: security.findings.length, sub: "findings" },
  ]

  return (
    <main className="min-h-svh bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to dashboard"
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-mono text-lg font-semibold text-foreground">Run checks</h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {report.meta.project.framework} · {report.meta.project.root}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono text-xs tabular-nums text-muted-foreground">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
          {done ? (
            <>
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-4" />
                Re-run
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                View results
                <ArrowRight className="size-4" />
              </Link>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 font-mono text-sm text-foreground">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? "Running…" : "Ready"}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-4">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Phase list */}
          <aside className="w-full lg:w-72 lg:shrink-0">
            <ol className="flex flex-col gap-1">
              {RUN_PHASES.map((p, i) => {
                const status = phases[p.id]
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 rounded-sm border px-3 py-2.5 transition-colors",
                      status === "running"
                        ? "border-foreground/30 bg-foreground/[0.04]"
                        : "border-border",
                    )}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <StatusIcon status={status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-mono text-sm",
                          status === "idle" ? "text-muted-foreground/60" : "text-foreground",
                        )}
                      >
                        {p.label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground/60">{p.command}</p>
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </li>
                )
              })}
            </ol>
          </aside>

          {/* Terminal log */}
          <section className="min-w-0 flex-1">
            <div className="flex h-[28rem] flex-col rounded-sm border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="size-2.5 rounded-full border border-border" />
                    <span className="size-2.5 rounded-full border border-border" />
                    <span className="size-2.5 rounded-full border border-border" />
                  </div>
                  <span className="ml-1 font-mono text-xs text-muted-foreground">codelens — run log</span>
                </div>
                <span className="font-mono text-[10px] uppercase text-muted-foreground/60">
                  {logs.length} lines
                </span>
              </div>
              <div className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
                {logs.length === 0 && (
                  <p className="text-muted-foreground/60">Waiting for output…</p>
                )}
                {logs.map((line) => (
                  <div key={line.id} className="flex gap-3">
                    <span className="shrink-0 tabular-nums text-muted-foreground/40">
                      {line.t.toFixed(1).padStart(4, " ")}s
                    </span>
                    <span className={cn("shrink-0 w-3 text-center", LEVEL_STYLES[line.level])}>
                      {LEVEL_TAG[line.level]}
                    </span>
                    <span className={cn("whitespace-pre-wrap", LEVEL_STYLES[line.level])}>{line.text}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Results summary */}
            <div
              className={cn(
                "mt-4 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-4",
                done ? "opacity-100" : "opacity-40",
              )}
            >
              {results.map((r) => (
                <div key={r.label} className="rounded-sm border border-border bg-card px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{r.label}</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{r.value}</p>
                  <p className="font-mono text-[10px] text-muted-foreground/70">{r.sub}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
