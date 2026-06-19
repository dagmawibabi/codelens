"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Star,
  GitFork,
  Eye,
  CircleDot,
  Scale,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Pencil,
  Check,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { InsightCard } from "./insights"
import { GithubMark } from "@/components/icons/github-mark"
import type { RepoOverview } from "@/lib/github.server"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export interface RepoSource {
  owner: string
  repo: string
}

/** A small palette for the language bar; cycles if there are more languages. */
const LANG_COLORS = [
  "var(--primary)",
  "var(--sev-ok)",
  "var(--sev-medium)",
  "var(--sev-info)",
  "var(--sev-high)",
  "var(--muted-foreground)",
]

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Editable owner/repo bar. Auto-detected from the git remote, with a manual
 * override so any public repo can be explored.
 */
export function RepoSourceBar({
  source,
  detected,
  onChange,
}: {
  source: RepoSource | null
  detected: RepoSource | null
  onChange: (next: RepoSource) => void
}) {
  const [editing, setEditing] = useState(false)
  const [owner, setOwner] = useState(source?.owner ?? "")
  const [repo, setRepo] = useState(source?.repo ?? "")

  function commit() {
    const o = owner.trim()
    const r = repo.trim().replace(/\.git$/, "")
    if (o && r) {
      onChange({ owner: o, repo: r })
      setEditing(false)
    }
  }

  if (editing || !source) {
    return (
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <GithubMark className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-1 items-center gap-1.5 font-mono text-xs">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="owner"
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground/30"
          />
          <span className="text-muted-foreground">/</span>
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="repo"
            onKeyDown={(e) => e.key === "Enter" && commit()}
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-foreground/30"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={commit}
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-2.5 py-1.5 font-mono text-xs text-primary-foreground hover:bg-primary/90"
          >
            <Check className="size-3.5" /> Load
          </button>
          {source && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label="Cancel"
              className="inline-flex items-center rounded-sm border border-border px-2 py-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
          {detected && (detected.owner !== owner || detected.repo !== repo) && (
            <button
              type="button"
              onClick={() => {
                setOwner(detected.owner)
                setRepo(detected.repo)
                onChange(detected)
                setEditing(false)
              }}
              className="font-mono text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              reset to detected
            </button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex items-center justify-between gap-2 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <GithubMark className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-sm text-foreground">
          {source.owner}/{source.repo}
        </span>
        {detected && detected.owner === source.owner && detected.repo === source.repo && (
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            detected
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Pencil className="size-3" /> Change
      </button>
    </Card>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
        <span className="ml-1 font-mono text-[10px] text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}

export function GithubOverview({ source }: { source: RepoSource }) {
  const { data, isLoading, error } = useSWR<{ overview?: RepoOverview; error?: string }>(
    `/api/github/repo?owner=${encodeURIComponent(source.owner)}&repo=${encodeURIComponent(source.repo)}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return (
      <InsightCard title="GitHub">
        <div className="flex items-center gap-2 py-3 font-mono text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading repository…
        </div>
      </InsightCard>
    )
  }

  if (error || data?.error || !data?.overview) {
    return (
      <InsightCard title="GitHub">
        <div className="flex items-start gap-2 py-1 font-mono text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[color:var(--sev-medium)]" />
          {data?.error ?? "Could not reach the GitHub API."}
        </div>
      </InsightCard>
    )
  }

  const o = data.overview
  const totalBytes = o.languages.reduce((s, l) => s + l.bytes, 0) || 1

  return (
    <InsightCard title="GitHub">
      <div className="flex flex-col gap-3">
        {o.description && <p className="text-pretty text-xs leading-relaxed text-foreground">{o.description}</p>}

        <div className="grid grid-cols-2 gap-2.5">
          <Stat icon={Star} label="stars" value={formatNum(o.stars)} />
          <Stat icon={GitFork} label="forks" value={formatNum(o.forks)} />
          <Stat icon={Eye} label="watchers" value={formatNum(o.subscribers)} />
          <Stat icon={CircleDot} label="open issues" value={formatNum(o.openIssues)} />
        </div>

        {o.license && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Scale className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-[11px] text-muted-foreground">{o.license}</span>
          </div>
        )}

        {/* Language breakdown bar */}
        {o.languages.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <div className="flex h-2 overflow-hidden rounded-full">
              {o.languages.slice(0, 6).map((l, i) => (
                <div
                  key={l.name}
                  title={`${l.name} ${((l.bytes / totalBytes) * 100).toFixed(1)}%`}
                  style={{ width: `${(l.bytes / totalBytes) * 100}%`, background: LANG_COLORS[i % LANG_COLORS.length] }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {o.languages.slice(0, 4).map((l, i) => (
                <span key={l.name} className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: LANG_COLORS[i % LANG_COLORS.length] }}
                    aria-hidden
                  />
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Top contributors */}
        {o.contributors.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Top contributors</span>
            <div className="flex flex-wrap gap-1.5">
              {o.contributors.slice(0, 8).map((c) => (
                <a
                  key={c.login}
                  href={c.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${c.login} · ${c.contributions} commits`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.avatarUrl || "/placeholder.svg"}
                    alt={c.login}
                    className="size-7 rounded-full ring-1 ring-border transition-transform hover:scale-110"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        <a
          href={o.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-sm border border-border px-2 py-1.5",
            "font-mono text-[11px] text-foreground transition-colors hover:bg-secondary",
          )}
        >
          <ExternalLink className="size-3" />
          Open on GitHub
        </a>
      </div>
    </InsightCard>
  )
}
