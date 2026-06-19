"use client"

import { useEffect, useRef } from "react"
import { Check, Loader2, Minus, Play, RotateCcw } from "lucide-react"
import { useRunEngine, RUN_PHASES, type LogLevel } from "@/lib/run-engine"
import type { AnalysisReport, PhaseStatus } from "@/lib/schema"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

/**
 * Inner body that drives the run engine. Mounted only while the dialog is open
 * so that each open starts a fresh run (the hook auto-starts on mount).
 */
function RunDialogBody({ report }: { report: AnalysisReport }) {
  const aiEnabled = report.meta.aiEnabled
  const { phases, logs, running, done, elapsedMs, start } = useRunEngine(aiEnabled, true)

  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [logs])

  // When a real CodeLens backend is present, trigger an actual re-analysis.
  // The live socket drives the dashboard's data; this animation reflects it.
  useEffect(() => {
    void fetch("/api/run", { method: "POST" }).catch(() => {
      /* no backend (preview) — the simulated engine still plays */
    })
  }, [])

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
    <div className="flex flex-col gap-4">
      {/* Status row + progress */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-foreground">
          {done ? (
            <Check className="size-3.5 text-[color:var(--sev-ok)]" />
          ) : running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {done ? "Complete" : running ? "Running…" : "Ready"}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {(elapsedMs / 1000).toFixed(1)}s · {progress}%
        </span>
        {done && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Re-run
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Phase list */}
        <aside className="w-full lg:w-64 lg:shrink-0">
          <ol className="flex flex-col gap-1">
            {RUN_PHASES.map((p, i) => {
              const status = phases[p.id]
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-sm border px-3 py-2 transition-colors",
                    status === "running" ? "border-foreground/30 bg-foreground/[0.04]" : "border-border",
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
          <div className="flex h-72 flex-col rounded-sm border border-border bg-card sm:h-80">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full border border-border" />
                  <span className="size-2.5 rounded-full border border-border" />
                  <span className="size-2.5 rounded-full border border-border" />
                </div>
                <span className="ml-1 font-mono text-xs text-muted-foreground">codelens — run log</span>
              </div>
              <span className="font-mono text-[10px] uppercase text-muted-foreground/60">{logs.length} lines</span>
            </div>
            <div className="flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed">
              {logs.length === 0 && <p className="text-muted-foreground/60">Waiting for output…</p>}
              {logs.map((line) => (
                <div key={line.id} className="flex gap-3">
                  <span className="shrink-0 tabular-nums text-muted-foreground/40">
                    {line.t.toFixed(1).padStart(4, " ")}s
                  </span>
                  <span className={cn("w-3 shrink-0 text-center", LEVEL_STYLES[line.level])}>
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
  )
}

interface RunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  report: AnalysisReport
}

export function RunDialog({ open, onOpenChange, report }: RunDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="font-mono">Run checks</DialogTitle>
          <DialogDescription>
            {report.meta.project.framework} · {report.meta.project.packageManager} · {report.meta.project.root}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-5">{open && <RunDialogBody report={report} />}</div>
      </DialogContent>
    </Dialog>
  )
}
