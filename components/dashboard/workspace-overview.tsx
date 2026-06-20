"use client"

import { HealthRing } from "./health-ring"
import type { WorkspaceReport } from "@/lib/schema"

interface WorkspaceOverviewProps {
  workspace: WorkspaceReport
  onSelectPackage: (name: string) => void
}

export function WorkspaceOverview({ workspace, onSelectPackage }: WorkspaceOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="font-mono text-sm font-medium text-foreground">Packages</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {workspace.monorepo.packages.length} packages · {workspace.monorepo.tool}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {workspace.aggregate.packageScores.map((ps) => {
          const report = workspace.packages[ps.name]
          return (
            <button
              key={ps.name}
              type="button"
              onClick={() => onSelectPackage(ps.name)}
              className="group flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
            >
              <HealthRing score={ps.score} grade={ps.grade} size={64} />
              <div className="text-center">
                <p className="font-mono text-xs font-medium text-foreground truncate max-w-[180px]">
                  {ps.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {report?.lint.errorCount ?? 0} lint ·{" "}
                  {report?.types.diagnostics.length ?? 0} types ·{" "}
                  {report?.security.findings.length ?? 0} security
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
