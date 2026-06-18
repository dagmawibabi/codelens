"use client"

import Link from "next/link"
import { Play, Terminal, Sparkles, Settings, Clock } from "lucide-react"
import { HelpDialog } from "./help-dialog"
import { ThemeToggle } from "./theme-toggle"
import type { ProjectInfo } from "@/lib/schema"

interface RunHeaderProps {
  project: ProjectInfo
  aiEnabled: boolean
  /** Duration of the most recent run, shown as a subtle indicator. */
  lastRunMs: number | null
  /** When the most recent run finished, as a human label. */
  lastRunLabel?: string
}

export function RunHeader({ project, aiEnabled, lastRunMs, lastRunLabel }: RunHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border bg-card/50 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
          <Terminal className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-foreground">CodeLens</h1>
            {aiEnabled && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase text-foreground">
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

      <div className="flex items-center gap-2">
        {lastRunMs != null && (
          <span className="mr-1 hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
            <Clock className="size-3.5" />
            last run {lastRunLabel ?? `${(lastRunMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <Link
          href="/run"
          prefetch
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Play className="size-4" />
          Run checks
        </Link>
        <HelpDialog />
        <Link
          href="/settings"
          prefetch
          aria-label="Settings"
          className="inline-flex size-9 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="size-4" />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}
