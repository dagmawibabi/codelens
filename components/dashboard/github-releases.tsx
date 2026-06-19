"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Rocket,
  Download,
  Tag,
  Users,
  Search,
  X,
  Loader2,
  AlertTriangle,
  GitCompareArrows,
  CalendarDays,
  FileText,
  Trophy,
  Heart,
  ArrowUpDown,
  ExternalLink,
  Package,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard } from "./insights"
import { Markdown } from "@/components/chat/markdown"
import type { ReleaseInfo, ReactionSummary } from "@/lib/github.server"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type SubView = "dashboard" | "notes" | "contributors" | "reactions" | "cadence" | "compare"

const SUBVIEWS: { id: SubView; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: Rocket },
  { id: "notes", label: "Release notes", icon: FileText },
  { id: "contributors", label: "Contributors", icon: Trophy },
  { id: "reactions", label: "Reactions", icon: Heart },
  { id: "cadence", label: "Cadence", icon: CalendarDays },
  { id: "compare", label: "Compare", icon: GitCompareArrows },
]

const REACTION_META: { key: keyof ReactionSummary; emoji: string; label: string }[] = [
  { key: "plusOne", emoji: "👍", label: "+1" },
  { key: "minusOne", emoji: "👎", label: "-1" },
  { key: "laugh", emoji: "😄", label: "Laugh" },
  { key: "hooray", emoji: "🎉", label: "Hooray" },
  { key: "heart", emoji: "❤️", label: "Heart" },
  { key: "rocket", emoji: "🚀", label: "Rocket" },
  { key: "eyes", emoji: "👀", label: "Eyes" },
  { key: "confused", emoji: "😕", label: "Confused" },
]

/* ----------------------------- helpers ----------------------------- */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

function shortDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000
}

/** Median of a numeric array. */
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/* --------------------------- small pieces -------------------------- */

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="flex flex-row items-center gap-3 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</p>
        {sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  )
}

function ReleaseBadges({ release }: { release: ReleaseInfo }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {release.prerelease && (
        <Badge className="border-0 bg-[color:var(--sev-medium)]/15 font-mono text-[10px] text-[color:var(--sev-medium)]">
          pre-release
        </Badge>
      )}
      {release.draft && (
        <Badge className="border-0 bg-secondary font-mono text-[10px] text-muted-foreground">draft</Badge>
      )}
    </div>
  )
}

/* ------------------------------ views ------------------------------ */

function DashboardView({ releases }: { releases: ReleaseInfo[] }) {
  const stats = useMemo(() => {
    const published = releases.filter((r) => r.publishedAt)
    const totalDownloads = releases.reduce((s, r) => s + r.totalDownloads, 0)
    const totalReactions = releases.reduce((s, r) => s + (r.reactions?.total ?? 0), 0)
    const dates = published
      .map((r) => r.publishedAt as string)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const gaps: number[] = []
    for (let i = 0; i < dates.length - 1; i++) gaps.push(daysBetween(dates[i], dates[i + 1]))
    return {
      total: releases.length,
      prereleases: releases.filter((r) => r.prerelease).length,
      totalDownloads,
      totalReactions,
      latest: published[0] ?? releases[0],
      medianGap: Math.round(median(gaps)),
    }
  }, [releases])

  const topDownloads = useMemo(
    () => [...releases].sort((a, b) => b.totalDownloads - a.totalDownloads).slice(0, 5),
    [releases],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Tag} label="Releases" value={formatNum(stats.total)} sub={`${stats.prereleases} pre-release`} />
        <StatTile icon={Download} label="Downloads" value={formatNum(stats.totalDownloads)} sub="across all assets" />
        <StatTile icon={Heart} label="Reactions" value={formatNum(stats.totalReactions)} sub="community feedback" />
        <StatTile
          icon={CalendarDays}
          label="Median cadence"
          value={stats.medianGap ? `${stats.medianGap}d` : "—"}
          sub="between releases"
        />
      </div>

      {stats.latest && (
        <InsightCard title="Latest release">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Rocket className="size-4 text-[color:var(--sev-ok)]" />
                <span className="font-semibold text-foreground">{stats.latest.name}</span>
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {stats.latest.tag}
                </span>
                <ReleaseBadges release={stats.latest} />
              </div>
              <a
                href={stats.latest.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" /> GitHub
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
              <span>{shortDate(stats.latest.publishedAt)}</span>
              {stats.latest.author && <span>by {stats.latest.author.login}</span>}
              <span className="inline-flex items-center gap-1">
                <Download className="size-3" /> {formatNum(stats.latest.totalDownloads)}
              </span>
            </div>
          </div>
        </InsightCard>
      )}

      <InsightCard title="Most downloaded">
        {topDownloads.every((r) => r.totalDownloads === 0) ? (
          <p className="text-xs text-muted-foreground">No downloadable assets attached to releases.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {topDownloads.map((r) => {
              const max = topDownloads[0].totalDownloads || 1
              const pct = (r.totalDownloads / max) * 100
              return (
                <div key={r.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="truncate text-foreground">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNum(r.totalDownloads)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </InsightCard>
    </div>
  )
}

function NotesView({ releases }: { releases: ReleaseInfo[] }) {
  const [active, setActive] = useState(releases[0]?.id ?? null)
  const release = releases.find((r) => r.id === active) ?? releases[0]
  if (!release) return null

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="flex max-h-[60vh] flex-col gap-1 overflow-auto rounded-sm border border-border bg-card p-2">
        {releases.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActive(r.id)}
            className={cn(
              "flex flex-col gap-0.5 rounded-sm px-2.5 py-2 text-left transition-colors",
              r.id === release.id ? "bg-secondary" : "hover:bg-secondary/50",
            )}
          >
            <span className="truncate font-mono text-xs font-medium text-foreground">{r.tag}</span>
            <span className="truncate text-[10px] text-muted-foreground">{shortDate(r.publishedAt)}</span>
          </button>
        ))}
      </div>

      <Card className="min-w-0 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{release.name}</h3>
            <ReleaseBadges release={release} />
          </div>
          <a
            href={release.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" /> View on GitHub
          </a>
        </div>
        {release.assets.length > 0 && (
          <div className="mb-4 flex flex-col gap-1.5">
            {release.assets.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-2 rounded-sm border border-border px-2.5 py-1.5 font-mono text-[11px]"
              >
                <Package className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground">{a.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                  <Download className="size-3" />
                  {formatNum(a.downloadCount)}
                </span>
              </div>
            ))}
          </div>
        )}
        {release.body.trim() ? (
          <Markdown>{release.body}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No release notes provided.</p>
        )}
      </Card>
    </div>
  )
}

function ContributorsView({ releases }: { releases: ReleaseInfo[] }) {
  const leaderboard = useMemo(() => {
    const map = new Map<
      string,
      { login: string; avatarUrl: string; htmlUrl: string; releases: number; downloads: number }
    >()
    for (const r of releases) {
      if (!r.author) continue
      const existing = map.get(r.author.login) ?? {
        login: r.author.login,
        avatarUrl: r.author.avatarUrl,
        htmlUrl: r.author.htmlUrl,
        releases: 0,
        downloads: 0,
      }
      existing.releases += 1
      existing.downloads += r.totalDownloads
      map.set(r.author.login, existing)
    }
    return [...map.values()].sort((a, b) => b.releases - a.releases)
  }, [releases])

  if (leaderboard.length === 0) {
    return <p className="text-sm text-muted-foreground">No release authors found.</p>
  }

  const maxReleases = leaderboard[0].releases

  return (
    <div className="flex flex-col gap-2.5">
      {leaderboard.map((c, i) => (
        <Card key={c.login} className="flex flex-row items-center gap-3 p-3">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold",
              i === 0
                ? "bg-[color:var(--sev-medium)]/20 text-[color:var(--sev-medium)]"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {i + 1}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.avatarUrl || "/placeholder.svg"} alt="" className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <a
              href={c.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium text-foreground hover:underline"
            >
              {c.login}
            </a>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(c.releases / maxReleases) * 100}%` }}
              />
            </div>
          </div>
          <div className="shrink-0 text-right font-mono text-[11px] text-muted-foreground">
            <p className="text-foreground">{c.releases} releases</p>
            <p>{formatNum(c.downloads)} downloads</p>
          </div>
        </Card>
      ))}
    </div>
  )
}

function ReactionsView({ releases }: { releases: ReleaseInfo[] }) {
  const { totals, ranked } = useMemo(() => {
    const totals: ReactionSummary = {
      total: 0,
      plusOne: 0,
      minusOne: 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    }
    for (const r of releases) {
      if (!r.reactions) continue
      for (const k of Object.keys(totals) as (keyof ReactionSummary)[]) {
        totals[k] += r.reactions[k]
      }
    }
    const ranked = releases
      .filter((r) => (r.reactions?.total ?? 0) > 0)
      .sort((a, b) => (b.reactions?.total ?? 0) - (a.reactions?.total ?? 0))
      .slice(0, 8)
    return { totals, ranked }
  }, [releases])

  if (totals.total === 0) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Heart className="size-5 text-muted-foreground" />
        No reactions on releases yet.
      </Card>
    )
  }

  const maxReaction = Math.max(...REACTION_META.map((m) => totals[m.key]))

  return (
    <div className="flex flex-col gap-5">
      <InsightCard title={`Community reactions (${formatNum(totals.total)})`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {REACTION_META.map((m) => (
            <div key={m.key} className="flex items-center gap-3">
              <span className="w-6 text-center text-base" aria-hidden>
                {m.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="tabular-nums text-foreground">{formatNum(totals[m.key])}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maxReaction ? (totals[m.key] / maxReaction) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </InsightCard>

      {ranked.length > 0 && (
        <InsightCard title="Most-loved releases">
          <div className="flex flex-col divide-y divide-border">
            {ranked.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="truncate font-mono text-xs text-foreground">{r.tag}</span>
                <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  {REACTION_META.filter((m) => (r.reactions?.[m.key] ?? 0) > 0).map((m) => (
                    <span key={m.key} className="inline-flex items-center gap-0.5">
                      <span aria-hidden>{m.emoji}</span>
                      {r.reactions?.[m.key]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </InsightCard>
      )}
    </div>
  )
}

function CadenceView({ releases }: { releases: ReleaseInfo[] }) {
  // Build a month-by-year grid of release counts (GitHub-style heatmap).
  const { years, months, grid, max } = useMemo(() => {
    const counts = new Map<string, number>() // `${year}-${month}`
    let minYear = Infinity
    let maxYear = -Infinity
    for (const r of releases) {
      if (!r.publishedAt) continue
      const d = new Date(r.publishedAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      counts.set(`${y}-${m}`, (counts.get(`${y}-${m}`) ?? 0) + 1)
      minYear = Math.min(minYear, y)
      maxYear = Math.max(maxYear, y)
    }
    const years: number[] = []
    if (Number.isFinite(minYear)) {
      for (let y = maxYear; y >= minYear; y--) years.push(y)
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const max = Math.max(1, ...counts.values())
    const grid = years.map((y) => ({
      year: y,
      cells: months.map((_, m) => counts.get(`${y}-${m}`) ?? 0),
    }))
    return { years, months, grid, max }
  }, [releases])

  function level(count: number): string {
    if (count === 0) return "bg-secondary"
    const ratio = count / max
    if (ratio > 0.66) return "bg-primary"
    if (ratio > 0.33) return "bg-primary/60"
    return "bg-primary/30"
  }

  if (years.length === 0) {
    return <p className="text-sm text-muted-foreground">No published releases to chart.</p>
  }

  return (
    <InsightCard title="Release cadence">
      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] gap-1">
            <span />
            {months.map((m) => (
              <span key={m} className="text-center font-mono text-[10px] text-muted-foreground">
                {m}
              </span>
            ))}
          </div>
          {grid.map((row) => (
            <div key={row.year} className="mb-1 grid grid-cols-[40px_repeat(12,1fr)] items-center gap-1">
              <span className="font-mono text-[10px] text-muted-foreground">{row.year}</span>
              {row.cells.map((c, i) => (
                <div
                  key={i}
                  title={`${months[i]} ${row.year}: ${c} release${c === 1 ? "" : "s"}`}
                  className={cn("aspect-square rounded-sm", level(c))}
                />
              ))}
            </div>
          ))}
          <div className="mt-3 flex items-center justify-end gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span>less</span>
            <div className="size-3 rounded-sm bg-secondary" />
            <div className="size-3 rounded-sm bg-primary/30" />
            <div className="size-3 rounded-sm bg-primary/60" />
            <div className="size-3 rounded-sm bg-primary" />
            <span>more</span>
          </div>
        </div>
      </div>
    </InsightCard>
  )
}

function CompareView({ releases }: { releases: ReleaseInfo[] }) {
  const [leftId, setLeftId] = useState(releases[1]?.id ?? releases[0]?.id ?? null)
  const [rightId, setRightId] = useState(releases[0]?.id ?? null)
  const left = releases.find((r) => r.id === leftId)
  const right = releases.find((r) => r.id === rightId)

  function Picker({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-sm border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-foreground/30"
      >
        {releases.map((r) => (
          <option key={r.id} value={r.id}>
            {r.tag} — {shortDate(r.publishedAt)}
          </option>
        ))}
      </select>
    )
  }

  function Column({ release }: { release: ReleaseInfo | undefined }) {
    if (!release) return <Card className="p-5 text-sm text-muted-foreground">Select a release.</Card>
    return (
      <Card className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="truncate font-semibold text-foreground">{release.name}</span>
          <ReleaseBadges release={release} />
        </div>
        <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <dt className="text-muted-foreground">Published</dt>
          <dd className="text-right text-foreground">{shortDate(release.publishedAt)}</dd>
          <dt className="text-muted-foreground">Author</dt>
          <dd className="truncate text-right text-foreground">{release.author?.login ?? "—"}</dd>
          <dt className="text-muted-foreground">Downloads</dt>
          <dd className="text-right tabular-nums text-foreground">{formatNum(release.totalDownloads)}</dd>
          <dt className="text-muted-foreground">Assets</dt>
          <dd className="text-right tabular-nums text-foreground">{release.assets.length}</dd>
          <dt className="text-muted-foreground">Reactions</dt>
          <dd className="text-right tabular-nums text-foreground">{formatNum(release.reactions?.total ?? 0)}</dd>
        </dl>
        <div className="max-h-72 overflow-auto border-t border-border pt-3">
          {release.body.trim() ? (
            <Markdown>{release.body}</Markdown>
          ) : (
            <p className="text-xs text-muted-foreground">No notes.</p>
          )}
        </div>
      </Card>
    )
  }

  // Diff summary between the two selected releases.
  const diff = useMemo(() => {
    if (!left || !right) return null
    return {
      days: Math.round(daysBetween(left.publishedAt ?? left.createdAt, right.publishedAt ?? right.createdAt)),
      downloads: right.totalDownloads - left.totalDownloads,
      reactions: (right.reactions?.total ?? 0) - (left.reactions?.total ?? 0),
    }
  }, [left, right])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Picker value={leftId} onChange={setLeftId} />
        <ArrowUpDown className="mx-auto size-4 rotate-90 text-muted-foreground sm:rotate-0" />
        <Picker value={rightId} onChange={setRightId} />
      </div>

      {diff && (
        <Card className="grid grid-cols-3 divide-x divide-border p-0">
          <div className="flex flex-col items-center gap-0.5 p-3">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Time apart</span>
            <span className="font-semibold tabular-nums text-foreground">{diff.days}d</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 p-3">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Δ downloads</span>
            <span className="font-semibold tabular-nums text-foreground">
              {diff.downloads > 0 ? "+" : ""}
              {formatNum(diff.downloads)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 p-3">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Δ reactions</span>
            <span className="font-semibold tabular-nums text-foreground">
              {diff.reactions > 0 ? "+" : ""}
              {formatNum(diff.reactions)}
            </span>
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Column release={left} />
        <Column release={right} />
      </div>
    </div>
  )
}

/* ----------------------------- shell ------------------------------- */

export function GithubReleases({ owner, repo }: { owner: string; repo: string }) {
  const [view, setView] = useState<SubView>("dashboard")
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<"all" | "stable" | "prerelease">("all")

  const { data, isLoading, error } = useSWR<{ releases?: ReleaseInfo[]; error?: string }>(
    owner && repo ? `/api/github/releases?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const all = useMemo(() => data?.releases ?? [], [data])

  // Search + filter apply to every view's input set.
  const releases = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((r) => {
      if (filter === "stable" && r.prerelease) return false
      if (filter === "prerelease" && !r.prerelease) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        r.tag.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q) ||
        (r.author?.login.toLowerCase().includes(q) ?? false)
      )
    })
  }, [all, query, filter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 font-mono text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading releases from GitHub…
      </div>
    )
  }

  if (error || data?.error) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <AlertTriangle className="size-5 text-[color:var(--sev-medium)]" />
        {data?.error ?? "Could not load releases from GitHub."}
      </Card>
    )
  }

  if (all.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Tag className="size-5 text-muted-foreground" />
        This repository has no published releases.
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-view tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SUBVIEWS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setView(s.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-xs transition-colors",
              view === s.id
                ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <s.icon className="size-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Advanced search & filter (applies across views) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tag, title, notes, author…"
            className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-8 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "stable", "prerelease"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-sm border px-2.5 py-1.5 font-mono text-[11px] capitalize transition-colors",
                filter === f
                  ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <p className="font-mono text-[11px] text-muted-foreground">
        {releases.length} of {all.length} releases
      </p>

      {releases.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No releases match your search.</Card>
      ) : (
        <>
          {view === "dashboard" && <DashboardView releases={releases} />}
          {view === "notes" && <NotesView releases={releases} />}
          {view === "contributors" && <ContributorsView releases={releases} />}
          {view === "reactions" && <ReactionsView releases={releases} />}
          {view === "cadence" && <CadenceView releases={releases} />}
          {view === "compare" && <CompareView releases={releases} />}
        </>
      )}
    </div>
  )
}
