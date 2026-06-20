"use client"

import { useEffect, useMemo, useState } from "react"
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
  GitGraph,
  GitFork,
  Tag,
  Eye,
  EyeOff,
  Archive,
  ExternalLink,
  Check,
  Rocket,
  Network,
  Clock,
  FileDiff,
  Copy,
  Terminal,
  Stethoscope,
  Layers,
  GitMerge,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { InsightCard } from "./insights"
import { FileLink, useInspector, TrackedBadge } from "./inspector"
import { GithubReleases } from "./github-releases"
import { GithubOverview, RepoSourceBar, type RepoSource } from "./github-overview"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { gitToIssue } from "@/lib/issues"
import { loadSettings } from "@/lib/settings"
import type {
  GitResult,
  GitIssue,
  GitState,
  GitCommit as GitCommitType,
  GitTag,
  CiWorkflow,
  CiStatus,
  CiJob,
  CiStep,
  GitBranch as GitBranchType,
  GitRemoteInfo,
} from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const CHANGE_LABEL: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  untracked: "??",
  renamed: "R",
}

const CHANGE_COLOR: Record<string, string> = {
  modified: "var(--sev-medium)",
  added: "var(--sev-ok)",
  deleted: "var(--sev-critical)",
  untracked: "var(--sev-medium)",
  renamed: "var(--sev-info)",
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

/* ------------------------------------------------------------------ */
/* Detail sheet (branches / commits / tags)                            */
/* ------------------------------------------------------------------ */

type GitDetail =
  | { kind: "commit"; commit: GitCommitType }
  | { kind: "branch"; branch: GitBranchType }
  | { kind: "tag"; tag: GitTag }

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{children}</span>
    </div>
  )
}

function GitDetailSheet({
  detail,
  remoteInfo,
  onClose,
}: {
  detail: GitDetail | null
  remoteInfo?: GitRemoteInfo
  onClose: () => void
}) {
  const ghBase = remoteInfo?.provider === "GitHub" ? remoteInfo.url : null

  return (
    <Sheet open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-xl">
        {detail?.kind === "commit" && <CommitDetail commit={detail.commit} ghBase={ghBase} />}
        {detail?.kind === "branch" && <BranchDetail branch={detail.branch} ghBase={ghBase} />}
        {detail?.kind === "tag" && <TagDetail tag={detail.tag} ghBase={ghBase} />}
      </SheetContent>
    </Sheet>
  )
}

function CommitDetail({ commit, ghBase }: { commit: GitCommitType; ghBase: string | null }) {
  const sha = commit.fullHash || commit.hash
  const [subject, ...bodyLines] = commit.message.split("\n")
  const body = commit.body || bodyLines.join("\n").trim()
  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center gap-2 pr-8">
          <GitCommit className="size-4 shrink-0 text-muted-foreground" />
          <SheetTitle className="truncate text-sm">{subject}</SheetTitle>
        </div>
        <SheetDescription className="sr-only">Commit detail</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{commit.hash}</span>
          <CopyButton value={sha} label="Copy SHA" />
          {ghBase && (
            <a
              href={`${ghBase}/commit/${sha}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" /> View on GitHub
            </a>
          )}
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {body && (
          <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
        )}
        <div className="rounded-sm border border-border bg-card">
          <div className="divide-y divide-border">
            <MetaRow label="Author">
              {commit.author}
              {commit.email && <span className="ml-1.5 font-mono text-xs text-muted-foreground">&lt;{commit.email}&gt;</span>}
            </MetaRow>
            <MetaRow label="Date">
              <span className="font-mono text-xs">{commit.relative}</span>
              {commit.date && <span className="ml-2 text-xs text-muted-foreground">{new Date(commit.date).toLocaleString()}</span>}
            </MetaRow>
            <MetaRow label="Commit">
              <span className="break-all font-mono text-xs">{sha}</span>
            </MetaRow>
            {(commit.insertions != null || commit.deletions != null) && (
              <MetaRow label="Changes">
                <span className="font-mono text-xs">
                  <span className="text-[color:var(--sev-ok)]">+{commit.insertions ?? 0}</span>{" "}
                  <span className="text-[color:var(--sev-critical)]">-{commit.deletions ?? 0}</span>
                  {commit.files ? ` · ${commit.files.length} files` : ""}
                </span>
              </MetaRow>
            )}
            {commit.refs && commit.refs.length > 0 && (
              <MetaRow label="Refs">
                <span className="flex flex-wrap gap-1">
                  {commit.refs.map((r) => (
                    <span key={r} className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{r}</span>
                  ))}
                </span>
              </MetaRow>
            )}
          </div>
        </div>

        {commit.files && commit.files.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <FileDiff className="size-3.5" /> Files changed ({commit.files.length})
            </p>
            <Card className="gap-0 overflow-hidden py-0">
              {commit.files.map((f) => (
                <div key={f.path} className="flex items-center gap-2.5 border-t border-border px-3 py-2 first:border-t-0">
                  <span className="w-5 shrink-0 text-center font-mono text-[10px]" style={{ color: CHANGE_COLOR[f.status] }}>
                    {CHANGE_LABEL[f.status]}
                  </span>
                  <FileLink path={f.path} className="text-xs" />
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </>
  )
}

function BranchDetail({ branch, ghBase }: { branch: GitBranchType; ghBase: string | null }) {
  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center gap-2 pr-8">
          {branch.remote ? <GitFork className="size-4 shrink-0 text-muted-foreground" /> : <GitBranch className="size-4 shrink-0 text-muted-foreground" />}
          <SheetTitle className="truncate font-mono text-sm">{branch.name}</SheetTitle>
        </div>
        <SheetDescription className="sr-only">Branch detail</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {branch.current && (
            <Badge className="border-0 bg-[color:var(--sev-ok)]/15 font-mono text-[10px] text-[color:var(--sev-ok)]">current</Badge>
          )}
          {branch.merged && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              <GitMerge className="size-3" /> merged
            </span>
          )}
          <CopyButton value={branch.name} label="Copy name" />
          {ghBase && !branch.remote && (
            <a
              href={`${ghBase}/tree/${branch.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" /> View on GitHub
            </a>
          )}
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
          <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
            <span className="inline-flex items-center gap-1 font-mono text-lg tabular-nums text-foreground">
              <ArrowUp className="size-3.5 text-[color:var(--sev-ok)]" /> {branch.ahead ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ahead of default</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-card px-3 py-2.5">
            <span className="inline-flex items-center gap-1 font-mono text-lg tabular-nums text-foreground">
              <ArrowDown className="size-3.5 text-[color:var(--sev-high)]" /> {branch.behind ?? 0}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">behind default</span>
          </div>
        </div>
        <div className="rounded-sm border border-border bg-card">
          <div className="divide-y divide-border">
            <MetaRow label="Type">{branch.remote ? "Remote-tracking" : "Local"}</MetaRow>
            {branch.upstream && <MetaRow label="Upstream"><span className="font-mono text-xs">{branch.upstream}</span></MetaRow>}
            {branch.tip && <MetaRow label="Tip"><span className="font-mono text-xs">{branch.tip}</span></MetaRow>}
            {branch.subject && <MetaRow label="Last commit">{branch.subject}</MetaRow>}
            {branch.author && <MetaRow label="Author">{branch.author}</MetaRow>}
            {branch.lastCommitRelative && (
              <MetaRow label="Updated"><span className="font-mono text-xs">{branch.lastCommitRelative}</span></MetaRow>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function TagDetail({ tag, ghBase }: { tag: GitTag; ghBase: string | null }) {
  return (
    <>
      <SheetHeader className="border-b border-border">
        <div className="flex items-center gap-2 pr-8">
          <Tag className="size-4 shrink-0 text-muted-foreground" />
          <SheetTitle className="truncate font-mono text-sm">{tag.name}</SheetTitle>
        </div>
        <SheetDescription className="sr-only">Tag detail</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {tag.annotated ? "annotated" : "lightweight"}
          </span>
          <CopyButton value={tag.name} label="Copy tag" />
          {ghBase && (
            <a
              href={`${ghBase}/releases/tag/${tag.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3.5" /> View release
            </a>
          )}
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {tag.message && (
          <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-muted-foreground">{tag.message}</p>
        )}
        <div className="rounded-sm border border-border bg-card">
          <div className="divide-y divide-border">
            {tag.commit && <MetaRow label="Commit"><span className="font-mono text-xs">{tag.commit}</span></MetaRow>}
            {tag.tagger && <MetaRow label="Tagger">{tag.tagger}</MetaRow>}
            {tag.relative && (
              <MetaRow label="Date">
                <span className="font-mono text-xs">{tag.relative}</span>
                {tag.date && <span className="ml-2 text-xs text-muted-foreground">{new Date(tag.date).toLocaleDateString()}</span>}
              </MetaRow>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

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
      <TrackedBadge issue={gitToIssue(issue)} variant="dot" className="mt-0.5" />
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function StepRow({ step }: { step: CiStep }) {
  const hasDiag = step.diagnostics && step.diagnostics.length > 0
  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2 first:border-t-0">
      <div className="flex items-start gap-2">
        {hasDiag ? (
          <XCircle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--sev-high)]" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />
        )}
        <div className="min-w-0 flex-1">
          <span className="text-xs text-foreground">{step.name}</span>
          {step.uses && (
            <span className="ml-2 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{step.uses}</span>
          )}
          {step.run && (
            <pre className="mt-1 overflow-x-auto rounded-sm bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground/80">$ {step.run}</pre>
          )}
          {step.condition && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">if: {step.condition}</p>
          )}
          {hasDiag &&
            step.diagnostics!.map((d, i) => (
              <p key={i} className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-[color:var(--sev-high)]">
                <Stethoscope className="mt-0.5 size-3 shrink-0" /> {d}
              </p>
            ))}
        </div>
      </div>
    </div>
  )
}

function JobCard({ job }: { job: CiJob }) {
  const [open, setOpen] = useState(job.status === "failing")
  const jv = statusVisual(job.status)
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
      >
        <jv.Icon className="size-4 shrink-0" style={{ color: jv.color }} />
        <span className="font-mono text-sm text-foreground">{job.name}</span>
        {job.runsOn && (
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{job.runsOn}</span>
        )}
        {job.needs && job.needs.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">needs: {job.needs.join(", ")}</span>
        )}
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          {job.durationMs != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {(job.durationMs / 1000).toFixed(0)}s
            </span>
          )}
          {job.steps && <span>{job.steps.length} steps</span>}
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </span>
      </button>
      {open && job.condition && (
        <p className="border-t border-border bg-secondary/20 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
          if: {job.condition}
        </p>
      )}
      {open && job.steps && job.steps.length > 0 && (
        <div className="border-t border-border">
          {job.steps.map((s, i) => (
            <StepRow key={`${s.name}-${i}`} step={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ wf }: { wf: CiWorkflow }) {
  const vis = statusVisual(wf.status)
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-secondary/30 px-4 py-3">
        <Workflow className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{wf.name}</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px]" style={{ color: vis.color }}>
              <vis.Icon className="size-3.5" />
              {vis.label}
            </span>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{wf.provider}</span>
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

      {/* Workflow-level metadata */}
      {(wf.concurrency || (wf.permissions && wf.permissions.length > 0) || (wf.env && wf.env.length > 0)) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
          {wf.concurrency && <span>concurrency: {wf.concurrency}</span>}
          {wf.permissions && wf.permissions.length > 0 && <span>permissions: {wf.permissions.join(", ")}</span>}
          {wf.env && wf.env.length > 0 && <span>env: {wf.env.join(", ")}</span>}
        </div>
      )}

      {/* Jobs with expandable steps */}
      <div className="flex flex-col gap-2 p-3">
        {wf.jobs.map((j) => (
          <JobCard key={j.name} job={j} />
        ))}
      </div>

      {/* Diagnosis / run locally */}
      {wf.diagnosis && (
        <div className="flex flex-col gap-2 border-t border-border bg-secondary/20 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Stethoscope className="size-3.5" /> Diagnose &amp; run locally
          </p>
          {wf.diagnosis.localCommand && (
            <div className="flex items-center gap-2">
              <pre className="flex-1 overflow-x-auto rounded-sm border border-border bg-background/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                <Terminal className="mr-1.5 inline size-3 text-muted-foreground" />
                {wf.diagnosis.localCommand}
              </pre>
              <CopyButton value={wf.diagnosis.localCommand} />
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {wf.diagnosis.notes.map((n, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <ChevronRight className="mt-0.5 size-3 shrink-0" /> {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {wf.issues.length > 0 && (
        <div className="flex flex-col border-t border-border">
          {wf.issues.map((i) => (
            <GitIssueRow key={i.id} issue={i} />
          ))}
        </div>
      )}
    </Card>
  )
}

function BranchRow({ branch, onOpen }: { branch: GitBranchType; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 border-t border-border px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      {branch.current ? (
        <Check className="size-3.5 shrink-0 text-[color:var(--sev-ok)]" />
      ) : branch.remote ? (
        <GitFork className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-xs",
          branch.current ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {branch.name}
      </span>
      {(branch.ahead != null && branch.ahead > 0) || (branch.behind != null && branch.behind > 0) ? (
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          {branch.ahead != null && branch.ahead > 0 && (
            <span className="inline-flex items-center"><ArrowUp className="size-3" />{branch.ahead}</span>
          )}
          {branch.behind != null && branch.behind > 0 && (
            <span className="inline-flex items-center"><ArrowDown className="size-3" />{branch.behind}</span>
          )}
        </span>
      ) : null}
      {branch.current && (
        <Badge className="border-0 bg-[color:var(--sev-ok)]/15 font-mono text-[10px] text-[color:var(--sev-ok)]">
          current
        </Badge>
      )}
      {branch.remote && !branch.current && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">remote</span>
      )}
      {branch.lastCommitRelative && (
        <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{branch.lastCommitRelative}</span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

type SubTab = "repository" | "cicd" | "releases"

export function GitPanel({ git }: { git: GitResult }) {
  const { state } = git
  const [showRemote, setShowRemote] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>("repository")
  const [detail, setDetail] = useState<GitDetail | null>(null)
  const issues = [...git.issues].sort(bySeverityDesc)
  const localBranches = state.branches.filter((b) => !b.remote)
  const remoteBranches = state.branches.filter((b) => b.remote)
  const orderedBranches = [...localBranches, ...remoteBranches]

  // An explicit "owner/repo" set in Settings wins over auto-detection.
  const [override, setOverride] = useState<RepoSource | null>(null)
  useEffect(() => {
    const raw = loadSettings().defaultRepo.trim()
    const m = raw.match(/^([^/\s]+)\/([^/\s]+)$/)
    if (m) setOverride({ owner: m[1], repo: m[2] })
  }, [])

  const detected = useMemo<RepoSource | null>(() => {
    if (override) return override
    if (state.remoteInfo?.provider === "GitHub") {
      return { owner: state.remoteInfo.owner, repo: state.remoteInfo.name }
    }
    return null
  }, [state.remoteInfo, override])
  const [source, setSource] = useState<RepoSource | null>(detected)
  useEffect(() => {
    if (override) setSource(override)
  }, [override])

  const isGithub = state.remoteInfo?.provider === "GitHub" || Boolean(source)

  const tabs: { key: SubTab; label: string; Icon: typeof Network; show: boolean; count?: number }[] = [
    { key: "repository", label: "Repository", Icon: Network, show: true },
    { key: "cicd", label: "CI / CD", Icon: Workflow, show: true, count: git.workflows.length },
    { key: "releases", label: "Releases", Icon: Rocket, show: isGithub },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-xs transition-colors",
                subTab === t.key
                  ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <t.Icon className="size-3.5" />
              {t.label}
              {t.count != null && (
                <span className="rounded-sm bg-secondary px-1 font-mono text-[10px] tabular-nums text-muted-foreground">{t.count}</span>
              )}
            </button>
          ))}
      </div>

      {subTab === "releases" && isGithub ? (
        <div className="flex flex-col gap-4">
          <RepoSourceBar source={source} detected={detected} onChange={setSource} />
          {source ? (
            <GithubReleases owner={source.owner} repo={source.repo} />
          ) : (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Enter a GitHub owner/repo above to load releases.
            </Card>
          )}
        </div>
      ) : subTab === "cicd" ? (
        <CicdView git={git} />
      ) : (
        <RepositoryView
          git={git}
          state={state}
          issues={issues}
          orderedBranches={orderedBranches}
          localBranches={localBranches}
          remoteBranches={remoteBranches}
          showRemote={showRemote}
          setShowRemote={setShowRemote}
          source={source}
          detected={detected}
          setSource={setSource}
          isGithub={isGithub}
          onOpenDetail={setDetail}
        />
      )}

      <GitDetailSheet detail={detail} remoteInfo={state.remoteInfo} onClose={() => setDetail(null)} />
    </div>
  )
}

function CicdView({ git }: { git: GitResult }) {
  if (git.workflows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Workflow className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">No CI/CD workflows detected</p>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            Add a workflow under <span className="font-mono">.github/workflows</span> (or a GitLab/CircleCI config) to
            see jobs, steps, and diagnostics here.
          </p>
        </div>
      </Card>
    )
  }

  const passing = git.workflows.filter((w) => w.status === "passing").length
  const failing = git.workflows.filter((w) => w.status === "failing").length
  const totalJobs = git.workflows.reduce((s, w) => s + w.jobs.length, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Workflows</span>
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{git.workflows.length}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Passing</span>
          <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: "var(--sev-ok)" }}>{passing}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Failing</span>
          <span className="font-mono text-3xl font-semibold tabular-nums" style={{ color: failing > 0 ? "var(--sev-critical)" : "var(--sev-ok)" }}>{failing}</span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Jobs</span>
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{totalJobs}</span>
        </Card>
      </div>
      <div className="flex items-center gap-2">
        <Workflow className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Pipelines</h3>
        <span className="ml-auto font-mono text-xs text-muted-foreground">expand a job to inspect its steps</span>
      </div>
      <div className="flex flex-col gap-4">
        {git.workflows.map((wf) => (
          <WorkflowCard key={wf.id} wf={wf} />
        ))}
      </div>
    </div>
  )
}

function RepositoryView({
  git,
  state,
  issues,
  orderedBranches,
  localBranches,
  remoteBranches,
  showRemote,
  setShowRemote,
  source,
  detected,
  setSource,
  isGithub,
  onOpenDetail,
}: {
  git: GitResult
  state: GitState
  issues: GitIssue[]
  orderedBranches: GitBranchType[]
  localBranches: GitBranchType[]
  remoteBranches: GitBranchType[]
  showRemote: boolean
  setShowRemote: (fn: (v: boolean) => boolean) => void
  source: RepoSource | null
  detected: RepoSource | null
  setSource: (next: RepoSource) => void
  isGithub: boolean
  onOpenDetail: (d: GitDetail) => void
}) {
  const tagItems: GitTag[] = useMemo(() => {
    if (state.tagDetails && state.tagDetails.length > 0) return state.tagDetails
    return state.tags.map((name) => ({ name }))
  }, [state.tagDetails, state.tags])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        {state.remoteInfo && (
          <InsightCard title="Repository">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <GitGraph className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-sm text-foreground">
                  {state.remoteInfo.owner}/{state.remoteInfo.name}
                </span>
              </div>
              <a
                href={state.remoteInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 self-start rounded-sm bg-secondary px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary/70"
              >
                <ExternalLink className="size-3" />
                View on {state.remoteInfo.provider}
              </a>
            </div>
          </InsightCard>
        )}

        {isGithub && (
          <>
            {!detected && <RepoSourceBar source={source} detected={detected} onChange={setSource} />}
            {source && <GithubOverview source={source} />}
          </>
        )}

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
            <button
              type="button"
              onClick={() => onOpenDetail({ kind: "commit", commit: state.recentCommits[0] ?? { ...state.lastCommit } })}
              className="border-t border-border pt-3 text-left transition-colors hover:opacity-80"
            >
              <div className="flex items-start gap-2">
                <GitCommit className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-xs text-foreground">{state.lastCommit.message}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {state.lastCommit.hash} · {state.lastCommit.author} · {state.lastCommit.relative}
                  </p>
                </div>
              </div>
            </button>
            <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" /> {state.contributors} authors
              </span>
              <span>{state.totalCommits.toLocaleString()} commits</span>
            </div>
            {(state.firstCommitRelative || state.trackedFiles != null) && (
              <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
                {state.firstCommitRelative && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" /> since {state.firstCommitRelative}
                  </span>
                )}
                {state.trackedFiles != null && (
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-3.5" /> {state.trackedFiles.toLocaleString()} files
                  </span>
                )}
              </div>
            )}
            {(state.stashes > 0 || state.tags.length > 0) && (
              <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Archive className="size-3.5" /> {state.stashes} {state.stashes === 1 ? "stash" : "stashes"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Tag className="size-3.5" /> {state.tags.length} tags
                </span>
              </div>
            )}
          </div>
        </InsightCard>

        {state.topContributors && state.topContributors.length > 0 && (
          <InsightCard title="Top contributors">
            <ul className="flex flex-col gap-2">
              {state.topContributors.map((c) => {
                const max = state.topContributors![0].commits || 1
                return (
                  <li key={c.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="truncate text-foreground">{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">{c.commits}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full bg-foreground/40" style={{ width: `${(c.commits / max) * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </InsightCard>
        )}

        <InsightCard title={`Changes (${state.changes.length})`}>
          {state.changes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Working tree clean.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {state.changes.map((c) => (
                <li key={c.path} className="flex items-center gap-2 font-mono text-xs">
                  <span className="w-5 shrink-0 text-center text-[10px]" style={{ color: CHANGE_COLOR[c.status] }}>
                    {CHANGE_LABEL[c.status]}
                  </span>
                  <span className="truncate text-foreground">{c.path}</span>
                </li>
              ))}
            </ul>
          )}
        </InsightCard>

        {state.ignored.count > 0 && (
          <InsightCard title={`Ignored files (${state.ignored.count})`}>
            <ul className="flex flex-col gap-1.5">
              {state.ignored.samples.map((p) => (
                <li key={p} className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                  <EyeOff className="size-3.5 shrink-0" />
                  <span className="truncate">{p}</span>
                </li>
              ))}
              {state.ignored.count > state.ignored.samples.length && (
                <li className="font-mono text-[10px] text-muted-foreground">
                  +{state.ignored.count - state.ignored.samples.length} more
                </li>
              )}
            </ul>
          </InsightCard>
        )}

        <InsightCard
          title="Remote"
          action={
            state.remote ? (
              <button
                type="button"
                onClick={() => setShowRemote((v) => !v)}
                aria-pressed={showRemote}
                aria-label={showRemote ? "Hide remote URL" : "Reveal remote URL"}
                className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:text-foreground"
              >
                {showRemote ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showRemote ? "Hide" : "Reveal"}
              </button>
            ) : undefined
          }
        >
          {state.remote ? (
            showRemote ? (
              <p className="break-all font-mono text-xs text-foreground">{state.remote}</p>
            ) : (
              <p className="font-mono text-xs tracking-widest text-muted-foreground" aria-hidden>
                {"•".repeat(28)}
              </p>
            )
          ) : (
            <p className="font-mono text-xs text-muted-foreground">No remote configured</p>
          )}
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {orderedBranches.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Branches</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {localBranches.length} local · {remoteBranches.length} remote
              </Badge>
            </div>
            <Card className="gap-0 overflow-hidden py-0">
              {orderedBranches.map((b) => (
                <BranchRow
                  key={`${b.remote ? "r" : "l"}-${b.name}`}
                  branch={b}
                  onOpen={() => onOpenDetail({ kind: "branch", branch: b })}
                />
              ))}
            </Card>
          </section>
        )}

        {state.recentCommits.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <GitCommit className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Recent commits</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {state.recentCommits.length}
              </Badge>
            </div>
            <Card className="gap-0 overflow-hidden py-0">
              {state.recentCommits.map((c) => (
                <button
                  key={c.hash}
                  type="button"
                  onClick={() => onOpenDetail({ kind: "commit", commit: c })}
                  className="flex w-full items-start gap-3 border-t border-border px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
                >
                  <span className="mt-0.5 shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.hash}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">{c.message.split("\n")[0]}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {c.author} · {c.relative}
                      {c.insertions != null && (
                        <span className="ml-2">
                          <span className="text-[color:var(--sev-ok)]">+{c.insertions}</span>{" "}
                          <span className="text-[color:var(--sev-critical)]">-{c.deletions ?? 0}</span>
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </Card>
          </section>
        )}

        {tagItems.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Tags</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {tagItems.length}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tagItems.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onOpenDetail({ kind: "tag", tag: t })}
                  className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary/70"
                >
                  <Tag className="size-3" />
                  {t.name}
                  {t.relative && <span className="text-muted-foreground">· {t.relative}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

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
      </div>
    </div>
  )
}
