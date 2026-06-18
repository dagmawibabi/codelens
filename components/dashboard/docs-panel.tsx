"use client"

import { BookOpen, Bot, FileText, Check, AlertTriangle, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { InsightCard } from "./insights"
import { FileLink } from "./inspector"
import type { DocsResult, DocCheck, DocCheckStatus, DocFile } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

function checkVisual(status: DocCheckStatus) {
  switch (status) {
    case "pass":
      return { Icon: Check, color: "var(--sev-ok)", label: "Pass" }
    case "warn":
      return { Icon: AlertTriangle, color: "var(--sev-medium)", label: "Warn" }
    default:
      return { Icon: X, color: "var(--sev-critical)", label: "Fail" }
  }
}

function ScoreDial({ score, label, sub }: { score: number; label: string; sub: string }) {
  const color = score >= 80 ? "var(--sev-ok)" : score >= 60 ? "var(--sev-medium)" : "var(--sev-high)"
  return (
    <div className="flex flex-col items-center gap-2 p-6">
      <div className="relative flex size-28 items-center justify-center">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 264} 264`}
          />
        </svg>
        <span className="absolute font-mono text-3xl font-semibold tabular-nums text-foreground">{score}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-center text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

function CheckRow({ check }: { check: DocCheck }) {
  const vis = checkVisual(check.status)
  return (
    <div className="flex items-start gap-3 border-t border-border p-4 first:border-t-0">
      <vis.Icon className="mt-0.5 size-4 shrink-0" style={{ color: vis.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{check.label}</span>
          {check.agent && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              <Bot className="size-3" />
              agent
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">+{check.weight}</span>
        </div>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
      </div>
    </div>
  )
}

function DocFileRow({ doc }: { doc: DocFile }) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
      <FileText className={cn("size-4 shrink-0", doc.present ? "text-foreground" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        {doc.present ? (
          <FileLink path={doc.path} className="text-xs" />
        ) : (
          <span className="font-mono text-xs text-muted-foreground line-through">{doc.path}</span>
        )}
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{doc.note}</p>
      </div>
      {doc.present ? (
        <span
          className="shrink-0 font-mono text-xs tabular-nums"
          style={{ color: doc.score >= 70 ? "var(--sev-ok)" : doc.score >= 50 ? "var(--sev-medium)" : "var(--sev-high)" }}
        >
          {doc.score}
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[10px] uppercase text-[color:var(--sev-high)]">missing</span>
      )}
    </div>
  )
}

export function DocsPanel({ docs }: { docs: DocsResult }) {
  const agentChecks = docs.checks.filter((c) => c.agent)
  const passing = docs.checks.filter((c) => c.status === "pass").length

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Card className="flex flex-col items-center gap-1 py-0">
          <ScoreDial score={docs.score} label={`Documentation · ${docs.grade}`} sub={`${passing} of ${docs.checks.length} checks passing`} />
        </Card>

        <InsightCard
          title="AI / Agent readiness"
          action={
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase",
                docs.agentReady ? "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]" : "bg-[color:var(--sev-high)]/15 text-[color:var(--sev-high)]",
              )}
            >
              {docs.agentReady ? "Ready" : "Not ready"}
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Bot className="size-4" /> Agent score
              </span>
              <span className="font-mono tabular-nums text-foreground">{docs.agentScore}/100</span>
            </div>
            <Progress value={docs.agentScore} className="h-1.5" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {agentChecks.filter((c) => c.status === "pass").length}/{agentChecks.length} agent-readiness checks pass.
              Adding AGENTS.md and llms.txt has the highest impact.
            </p>
          </div>
        </InsightCard>

        <InsightCard title="Documents">
          <div className="-mx-3 -mb-3">
            {docs.documents.map((d) => (
              <DocFileRow key={d.path} doc={d} />
            ))}
          </div>
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Agent-readiness checks</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {agentChecks.length}
            </Badge>
          </div>
          <Card className="gap-0 overflow-hidden py-0">
            {agentChecks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">All documentation checks</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {docs.checks.length}
            </Badge>
          </div>
          <Card className="gap-0 overflow-hidden py-0">
            {docs.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
