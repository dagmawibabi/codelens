"use client"

import { Settings2, Check, X, BarChart3, FileWarning } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { FileLink } from "./inspector"
import type { SetupResult, ConfigEntry } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-4">
      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs font-medium text-foreground">{label}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

function ConfigRow({ c }: { c: ConfigEntry }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm",
            c.present ? "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]" : "bg-[color:var(--sev-medium)]/15 text-[color:var(--sev-medium)]",
          )}
        >
          {c.present ? <Check className="size-3.5" /> : <X className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{c.name}</span>
            {c.present ? (
              <FileLink path={c.file} className="text-[11px]" />
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground line-through">{c.file}</span>
            )}
            {c.ruleCount != null && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {c.ruleCount} rules
              </Badge>
            )}
          </div>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{c.summary}</p>
          {c.highlights && c.highlights.length > 0 && (
            <dl className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
              {c.highlights.map((h) => (
                <div key={h.label} className="flex items-center justify-between gap-2 bg-card px-2.5 py-1.5">
                  <dt className="font-mono text-[11px] text-muted-foreground">{h.label}</dt>
                  <dd
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      h.good === false ? "text-[color:var(--sev-high)]" : h.good ? "text-[color:var(--sev-ok)]" : "text-foreground",
                    )}
                  >
                    {h.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </Card>
  )
}

export function SetupPanel({ setup }: { setup: SetupResult }) {
  const { stats } = setup

  const composition = [
    { label: "Code", value: stats.codeLoc, color: "var(--chart-1)" },
    { label: "Comments", value: stats.commentLoc, color: "var(--chart-3)" },
    { label: "Blank", value: stats.blankLoc, color: "var(--chart-5)" },
  ]

  const langRows = stats.languages.map((l) => ({
    key: l.language,
    label: l.language,
    count: l.loc,
    hint: `${l.files} files · ${Math.round(l.share * 100)}%`,
  }))

  const largestRows = stats.largestFiles.map((f) => ({ key: f.path, label: f.path, count: f.loc }))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Tooling detected">
          <ul className="flex flex-col gap-1.5">
            {setup.tooling.map((t) => (
              <li key={t.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-[3px]",
                      t.detected ? "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.detected ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <span className={cn(t.detected ? "text-foreground" : "text-muted-foreground")}>{t.name}</span>
                </span>
                {t.version && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{t.version}</span>}
              </li>
            ))}
          </ul>
        </InsightCard>

        <InsightCard title="LOC composition">
          <ProportionBar segments={composition} />
          <p className="mt-3 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
            {(stats.commentRatio * 100).toFixed(1)}% comments · {(stats.testRatio * 100).toFixed(0)}% test ratio
          </p>
        </InsightCard>

        <InsightCard title="Languages">
          <CountList rows={langRows} />
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Workspace statistics</h3>
          </div>
          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border p-0 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Files" value={stats.totalFiles} />
            <StatTile label="Lines of code" value={stats.totalLoc.toLocaleString()} sub={`${stats.codeLoc.toLocaleString()} code`} />
            <StatTile label="Components" value={stats.components} />
            <StatTile label="Routes" value={stats.routes} />
            <StatTile label="Test files" value={stats.testFiles} sub={`${stats.testLoc.toLocaleString()} LOC`} />
            <StatTile label="Comments" value={`${(stats.commentRatio * 100).toFixed(1)}%`} sub="of code" />
            <StatTile label="Test ratio" value={`${(stats.testRatio * 100).toFixed(0)}%`} sub="tests : code" />
            <StatTile label="TODO / FIXME" value={stats.todoCount} sub="markers" />
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileWarning className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Largest files</h3>
          </div>
          <Card className="p-3">
            <CountList rows={largestRows} />
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Configuration & rules</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {setup.configs.filter((c) => c.present).length}/{setup.configs.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            {setup.configs.map((c) => (
              <ConfigRow key={c.id} c={c} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
