"use client"

import {
  GitBranch,
  GitCommit,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Workflow,
  CheckCircle2,
  XCircle,
  CircleSlash,
  Users,
  ShieldCheck,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { gitToIssue } from "@/lib/issues"
import type { GitResult, GitIssue, CiWorkflow, CiStatus } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const CHANGE_LABEL: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "??",
  renamed: "R",
}

function statusVisual(status: CiStatus) {
  switch (status) {
    case "passing":
      return { Icon: CheckCircle2, color: "var(--sev-ok)", label: "Passing" }
    case "failing":
      return { Icon: XCircle, color: "var(--sev-critical)", label: "Failing" }
    case "disabled":
      return { Icon: CircleSlash, color: "var(--sev-info)", label: "Disabled" }
    default:
      return { Icon: CircleSlash, color: "var(--sev-info)", label: "No runs" }
  }
}

function GitIssueRow({ issue }: { issue: GitIssue }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(issue.severity)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => viewIssue(gitToIssue(issue))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          viewIssue(gitToIssue(issue))
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <span className={cn("mt-1 size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{issue.title}</span>
          <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {issue.kind.replace(/-/g, " ")}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{issue.detail}</p>
        {issue.filePath && (
          <div className="mt-1.5">
            <FileLink path={issue.filePath} className="text-[11px]" />
          </div>
        )}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function WorkflowCard({ wf }: { wf: CiWorkflow }) {
  const vis = statusVisual(wf.status)
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-3 border-b border-border bg-secondary/30 px-4 py-3">
        <Workflow className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{wf.name}</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]" style={{ color: vis.color }}>
              <vis.Icon className="size-3.5" />
              {vis.label}
            </span>
          </div>
          <FileLink path={wf.file} className="text-[11px]" />
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {wf.triggers.map((t) => (
            <span key={t} className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-px bg-border">
        {wf.jobs.map((j) => {
          const jv = statusVisual(j.status)
          return (
            <div key={j.name} className="flex min-w-[120px] flex-1 flex-col gap-1 bg-card px-3 py-2.5">
              <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
                <jv.Icon className="size-3.5" style={{ color: jv.color }} />
                {j.name}
              </span>
              {j.durationMs != null && (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {(j.durationMs / 1000).toFixed(0)}s
                </span>
              )}
            </div>
          )
        })}
      </div>

      {wf.issues.length > 0 && (
        <div className="flex flex-col">
          {wf.issues.map((i) => (
            <GitIssueRow key={i.id} issue={i} />
          ))}
        </div>
      )}
    </Card>
  )
}

export function GitPanel({ git }: { git: GitResult }) {
  const { state } = git
  const issues = [...git.issues].sort(bySeverityDesc)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Working tree">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-sm text-foreground">{state.branch}</span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowUp className="size-3.5" /> {state.ahead}
              </span>
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowDown className="size-3.5" /> {state.behind}
              </span>
              <span className="text-muted-foreground">vs {state.defaultBranch}</span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-start gap-2">
                <GitCommit className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{state.lastCommit.message}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {state.lastCommit.hash} · {state.lastCommit.author} · {state.lastCommit.relative}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {state.contributors} authors
              </span>
              <span>{state.totalCommits.toLocaleString()} commits</span>
            </div>
          </div>
        </InsightCard>

        <InsightCard title={`Changes (${state.changes.length})`}>
          {state.changes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Working tree clean.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {state.changes.map((c) => (
                <li key={c.path} className="flex items-center gap-2 font-mono text-xs">
                  <span
                    className={cn(
                      "w-5 shrink-0 text-center text-[10px]",
                      c.status === "untracked" ? "text-[color:var(--sev-medium)]" : "text-muted-foreground",
                    )}
                  >
                    {CHANGE_LABEL[c.status]}
                  </span>
                  <span className="truncate text-foreground">{c.path}</span>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        <InsightCard title="Remote">
          <p className="break-all font-mono text-xs text-muted-foreground">{state.remote}</p>
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Repository findings</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {issues.length}
            </Badge>
          </div>
          {issues.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
              No repository hygiene issues detected.
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              {issues.map((i) => (
                <GitIssueRow key={i.id} issue={i} />
              ))}
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Workflow className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">CI / CD workflows</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {git.workflows.length}
            </Badge>
          </div>
          <div className="flex flex-col gap-4">
            {git.workflows.map((wf) => (
              <WorkflowCard key={wf.id} wf={wf} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
