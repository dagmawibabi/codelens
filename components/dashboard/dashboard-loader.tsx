"use client"

import { Dashboard } from "@/components/dashboard/dashboard"
import { useDashboardData } from "@/lib/use-dashboard-data"

/**
 * Client entry point for the dashboard. Resolves live CLI data (via
 * `/api/state` + `/ws`) and otherwise defaults to an empty "no analysis yet"
 * state. Users can load bundled sample data on demand from the Run-checks menu.
 */
export function DashboardLoader() {
  const { data, source, demo, setDemo } = useDashboardData()
  const empty = source === "empty" || source === "loading"

  return (
    <>
      {source === "demo" && (
        <div className="fixed bottom-3 right-3 z-50 rounded-sm border border-border bg-card px-2.5 py-1 font-mono text-[10px] text-muted-foreground shadow-sm">
          Demo data — run <span className="font-semibold text-foreground">codelens</span> in a project for live results
        </div>
      )}
      <Dashboard
        report={data.report}
        history={data.history}
        insights={data.insights}
        empty={empty}
        demoActive={source === "demo"}
        onToggleDemo={setDemo}
      />
    </>
  )
}
