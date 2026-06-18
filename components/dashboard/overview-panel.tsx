import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { HealthRing } from "./health-ring"
import { TrendChart } from "./trend-chart"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"

interface OverviewPanelProps {
  report: AnalysisReport
  history: TrendPoint[]
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub: string
  accent: string
}) {
  return (
    <Card className="gap-2 p-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </Card>
  )
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  )
}

export function OverviewPanel({ report, history }: OverviewPanelProps) {
  const { health, lint, types, security } = report
  const critical = security.findings.filter((f) => f.severity === "critical").length
  const high = security.findings.filter((f) => f.severity === "high").length
  const prev = history.length >= 2 ? history[history.length - 2].score : null
  const delta = prev != null ? health.score - prev : null

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Health score */}
      <Card className="flex flex-col items-center justify-center gap-4 p-6 lg:row-span-1">
        <HealthRing score={health.score} grade={health.grade} />
        <div className="flex items-center gap-2 text-sm">
          {delta != null && (
            <span
              className="font-mono tabular-nums"
              style={{ color: delta >= 0 ? "var(--sev-ok)" : "var(--sev-critical)" }}
            >
              {delta >= 0 ? "+" : ""}
              {delta}
            </span>
          )}
          <span className="text-muted-foreground">vs previous run</span>
        </div>
      </Card>

      {/* Breakdown */}
      <Card className="flex flex-col justify-center gap-4 p-6">
        <h3 className="text-sm font-semibold">Score breakdown</h3>
        <BreakdownBar label="Lint" value={health.breakdown.lint} />
        <BreakdownBar label="Types" value={health.breakdown.types} />
        <BreakdownBar label="Security" value={health.breakdown.security} />
      </Card>

      {/* Trend */}
      <Card className="flex flex-col gap-3 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Health trend</h3>
          <span className="text-xs text-muted-foreground">{history.length} runs</span>
        </div>
        <TrendChart data={history} />
      </Card>

      {/* Stat row */}
      <StatCard
        label="Lint errors"
        value={lint.errorCount}
        sub={`${lint.warningCount} warnings · ${lint.fixableCount} auto-fixable`}
        accent={lint.errorCount > 0 ? "var(--sev-critical)" : "var(--sev-ok)"}
      />
      <StatCard
        label="Type errors"
        value={types.diagnostics.length}
        sub={types.unavailable ? "TypeScript not detected" : "from tsc --noEmit"}
        accent={types.diagnostics.length > 0 ? "var(--sev-high)" : "var(--sev-ok)"}
      />
      <StatCard
        label="Security findings"
        value={security.findings.length}
        sub={`${critical} critical · ${high} high · ${security.dependencies.length} vuln deps`}
        accent={critical > 0 ? "var(--sev-critical)" : high > 0 ? "var(--sev-high)" : "var(--sev-ok)"}
      />
    </div>
  )
}
