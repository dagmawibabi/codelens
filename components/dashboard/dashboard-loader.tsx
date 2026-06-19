"use client"

import { Dashboard } from "@/components/dashboard/dashboard"
import { useDashboardData } from "@/lib/use-dashboard-data"

/**
 * Client entry point for the dashboard. Resolves live CLI data (via
 * `/api/state` + `/ws`) with a graceful fallback to bundled mock data when
 * running in the standalone preview with no CodeLens backend.
 */
export function DashboardLoader() {
  const { data, source } = useDashboardData()

  return (
    <>
      {source === "mock" && (
        <div className="fixed bottom-3 right-3 z-50 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground shadow-sm">
          Sample data — run{" "}
          <span className="font-semibold text-foreground">codelens</span> in a project for live results
        </div>
      )}
      <Dashboard report={data.report} history={data.history} insights={data.insights} />
    </>
  )
}
