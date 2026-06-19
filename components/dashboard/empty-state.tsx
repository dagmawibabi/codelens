"use client"

import { Play, FlaskConical, ScanSearch, Terminal } from "lucide-react"

interface EmptyStateProps {
  /** Opens the run-checks dialog. */
  onRunChecks?: () => void
  /** Loads the bundled demo data. */
  onLoadDemo?: () => void
}

/**
 * Shown on every surface before an analysis has run. Rather than rendering
 * zeroed panels (which would imply a misleading perfect score), this invites
 * the user to run CodeLens against a real project or explore the demo data.
 */
export function EmptyState({ onRunChecks, onLoadDemo }: EmptyStateProps) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
        <ScanSearch className="size-7" />
      </div>

      <h2 className="mt-6 text-balance text-lg font-semibold text-foreground">No analysis yet</h2>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
        Run CodeLens against a project to populate every surface with real lint, type, security,
        dependency, and project-intelligence results.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRunChecks}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Play className="size-4" />
          Run checks
        </button>
        <button
          type="button"
          onClick={onLoadDemo}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <FlaskConical className="size-4" />
          Load demo data
        </button>
      </div>

      <div className="mt-8 flex items-center gap-2 rounded-sm border border-border bg-secondary/40 px-3 py-2 font-mono text-xs text-muted-foreground">
        <Terminal className="size-3.5 shrink-0" />
        <span>
          Or run <span className="font-semibold text-foreground">codelens</span> in your project directory
        </span>
      </div>
    </div>
  )
}
