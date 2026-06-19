"use client"

import { useMemo, useState } from "react"
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
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { GithubReleases } from "./github-releases"
import { GithubOverview, RepoSourceBar, type RepoSource } from "./github-overview"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import { gitToIssue } from "@/lib/issues"
import type { GitResult, GitIssue, CiWorkflow, CiStatus, GitBranch as GitBranchType } from "@/lib/project-insights"
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

function BranchRow({ branch }: { branch: GitBranchType }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5 first:border-t-0">
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
      {branch.current && (
        <Badge className="border-0 bg-[color:var(--sev-ok)]/15 font-mono text-[10px] text-[color:var(--sev-ok)]">
          current
        </Badge>
      )}
      {branch.remote && !branch.current && (
        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">remote</span>
      )}
      {branch.lastCommitRelative && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{branch.lastCommitRelative}</span>
      )}
    </div>
  )
}

export function GitPanel({ git }: { git: GitResult }) {
  const { state } = git
  const [showRemote, setShowRemote] = useState(false)
  const [subTab, setSubTab] = useState<"repository" | "releases">("repository")
  const issues = [...git.issues].sort(bySeverityDesc)
  const localBranches = state.branches.filter((b) => !b.remote)
  const remoteBranches = state.branches.filter((b) => b.remote)
  const orderedBranches = [...localBranches, ...remoteBranches]

  // Auto-detect the GitHub repo from the origin remote (GitHub only). The user
  // can override it via the source bar to explore any public repository.
  const detected = useMemo<RepoSource | null>(() => {
    if (state.remoteInfo?.provider === "GitHub") {
      return { owner: state.remoteInfo.owner, repo: state.remoteInfo.name }
    }
    return null
  }, [state.remoteInfo])
  const [source, setSource] = useState<RepoSource | null>(detected)

  const isGithub = state.remoteInfo?.provider === "GitHub" || Boolean(source)

  return (
    <div className="flex flex-col gap-4">
      {/* Repository / Releases sub-tabs (Releases only for GitHub remotes) */}
      {isGithub && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab("repository")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-xs transition-colors",
              subTab === "repository"
                ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Network className="size-3.5" />
            Repository
          </button>
          <button
            type="button"
            onClick={() => setSubTab("releases")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-xs transition-colors",
              subTab === "releases"
                ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Rocket className="size-3.5" />
            Releases
          </button>
        </div>
      )}

      {isGithub && subTab === "releases" ? (
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
        />
      )}
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
}: {
  git: GitResult
  state: GitResult["state"]
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
}) {
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

        {/* Live GitHub stats — auto-detected, with manual override. */}
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
                <BranchRow key={`${b.remote ? "r" : "l"}-${b.name}`} branch={b} />
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
                <div key={c.hash} className="flex items-start gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                  <span className="mt-0.5 shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.hash}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">{c.message}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {c.author} · {c.relative}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        )}

        {state.tags.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Tags</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {state.tags.length}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-1 font-mono text-[11px] text-foreground"
                >
                  <Tag className="size-3" />
                  {t}
                </span>
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
