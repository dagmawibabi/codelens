"use client"

import { Play, Terminal, Sparkles, Clock, Search, ChevronDown, FlaskConical, XCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  /** True before any analysis has run — hides project context. */
  empty?: boolean
  /** Whether bundled demo data is currently shown. */
  demoActive?: boolean
  /** Toggle the bundled demo data on/off. */
  onToggleDemo?: (on: boolean) => void
  /** Opens the command palette / search. */
  onOpenSearch?: () => void
  /** Opens the run-checks dialog within the dashboard layout. */
  onRunChecks?: () => void
}

export function RunHeader({
  project,
  aiEnabled,
  lastRunMs,
  lastRunLabel,
  empty,
  demoActive,
  onToggleDemo,
  onOpenSearch,
  onRunChecks,
}: RunHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/60 sm:px-6">
      {/* Left: compact brand on mobile (sidebar owns it on desktop), project context on desktop */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
            <Terminal className="size-4" />
          </div>
          <span className="font-mono text-sm font-semibold text-foreground">CodeLens</span>
          {aiEnabled && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
              <Sparkles className="size-2.5" />
              AI
            </span>
          )}
        </div>
        <p className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground lg:block">
          {empty
            ? demoActive
              ? "Demo data · sample project"
              : "No analysis yet"
            : `${project.framework} · ${project.packageManager} · ${project.root}`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {lastRunMs != null && (
          <span className="mr-1 hidden items-center gap-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
            <Clock className="size-3.5" />
            last run {lastRunLabel ?? `${(lastRunMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <div className="inline-flex items-stretch">
          <button
            type="button"
            onClick={onRunChecks}
            className="inline-flex items-center gap-2 rounded-l-sm bg-primary px-4 py-2 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="size-4" />
            <span className="hidden sm:inline">Run checks</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Run options"
              className="inline-flex items-center justify-center rounded-r-sm border-l border-primary-foreground/20 bg-primary px-2 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {demoActive ? (
                <DropdownMenuItem onClick={() => onToggleDemo?.(false)}>
                  <XCircle className="size-4" />
                  <span>Clear demo data</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onToggleDemo?.(true)}>
                  <FlaskConical className="size-4" />
                  <span>Load demo data</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="size-4" />
          </button>
        )}
        <HelpDialog />
        <ThemeToggle />
      </div>
    </header>
  )
}
