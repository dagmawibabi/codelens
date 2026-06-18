"use client"

import Link from "next/link"
import { Play, Loader2, Check, Minus, Terminal, Sparkles, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { HelpDialog } from "./help-dialog"
import { ThemeToggle } from "./theme-toggle"
import type { ProjectInfo, RunPhase, PhaseStatus } from "@/lib/schema"

const PHASES: { id: RunPhase; label: string }[] = [
  { id: "detect", label: "Detect" },
  { id: "lint", label: "ESLint" },
  { id: "types", label: "tsc" },
  { id: "deps", label: "Audit" },
  { id: "security", label: "AI Review" },
]

function PhasePip({ status, label }: { status: PhaseStatus; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full",
          status === "done" && "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]",
          status === "running" && "bg-primary/15 text-primary",
          status === "skipped" && "bg-secondary text-muted-foreground",
          status === "idle" && "bg-secondary text-muted-foreground/40",
        )}
      >
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "done" && <Check className="size-3" />}
        {status === "skipped" && <Minus className="size-2.5" />}
        {status === "idle" && <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <span
        className={cn(
          "font-mono text-xs",
          status === "idle" ? "text-muted-foreground/50" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  )
}

interface RunHeaderProps {
  project: ProjectInfo
  aiEnabled: boolean
  running: boolean
  phases: Record<RunPhase, PhaseStatus>
  durationMs: number | null
  onRun: () => void
}

export function RunHeader({ project, aiEnabled, running, phases, durationMs, onRun }: RunHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border bg-card/50 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Terminal className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-foreground">CodeLens</h1>
            {aiEnabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase text-primary">
                <Sparkles className="size-2.5" />
                AI
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {project.framework} · {project.packageManager} · {project.root}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {PHASES.map((p) => (
            <PhasePip key={p.id} status={phases[p.id]} label={p.label} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {durationMs != null && !running && (
            <span className="mr-1 font-mono text-xs text-muted-foreground">{(durationMs / 1000).toFixed(1)}s</span>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={running}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm px-4 py-2 font-mono text-sm font-medium transition-colors",
              running
                ? "cursor-not-allowed bg-secondary text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Running…" : "Run checks"}
          </button>
          <HelpDialog />
          <Link
            href="/settings"
            aria-label="Settings"
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
