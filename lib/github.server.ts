import "server-only"

/**
 * Thin server-side client for the public GitHub REST API. Unauthenticated by
 * default (60 req/hr/IP); if a GITHUB_TOKEN is present we use it to raise the
 * limit to 5,000 req/hr. All responses are cached for a few minutes so the
 * dashboard can poll freely without burning the rate limit.
 */

const API = "https://api.github.com"
const REVALIDATE = 300 // seconds

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) h.authorization = `Bearer ${token}`
  return h
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function gh<T>(path: string, init?: { reactions?: boolean }): Promise<T> {
  const h = headers()
  if (init?.reactions) {
    // Opt into the reactions preview fields on issues/releases.
    h.accept = "application/vnd.github.squirrel-girl-preview+json"
  }
  const res = await fetch(`${API}${path}`, { headers: h, next: { revalidate: REVALIDATE } })
  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining")
    if (res.status === 403 && remaining === "0") {
      throw new GitHubError("GitHub API rate limit reached. Try again later.", 429)
    }
    if (res.status === 404) throw new GitHubError("Repository not found.", 404)
    throw new GitHubError(`GitHub API error (${res.status}).`, res.status)
  }
  return (await res.json()) as T
}

/* ------------------------------ Types ------------------------------ */

export interface RepoOverview {
  fullName: string
  description: string | null
  homepage: string | null
  htmlUrl: string
  stars: number
  watchers: number
  forks: number
  openIssues: number
  subscribers: number
  network: number
  defaultBranch: string
  license: string | null
  language: string | null
  topics: string[]
  createdAt: string
  updatedAt: string
  pushedAt: string
  archived: boolean
  size: number
  languages: { name: string; bytes: number }[]
  contributors: ContributorStat[]
}

export interface ContributorStat {
  login: string
  avatarUrl: string
  htmlUrl: string
  contributions: number
}

export interface ReactionSummary {
  total: number
  plusOne: number
  minusOne: number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

export interface ReleaseAsset {
  name: string
  downloadCount: number
  size: number
  downloadUrl: string
}

export interface ReleaseInfo {
  id: number
  name: string
  tag: string
  htmlUrl: string
  author: { login: string; avatarUrl: string; htmlUrl: string } | null
  draft: boolean
  prerelease: boolean
  createdAt: string
  publishedAt: string | null
  body: string
  reactions: ReactionSummary | null
  assets: ReleaseAsset[]
  totalDownloads: number
}

/* ----------------------------- Fetchers ---------------------------- */

interface RawRepo {
  full_name: string
  description: string | null
  homepage: string | null
  html_url: string
  stargazers_count: number
  watchers_count: number
  forks_count: number
  open_issues_count: number
  subscribers_count: number
  network_count: number
  default_branch: string
  license: { spdx_id: string | null; name: string } | null
  language: string | null
  topics?: string[]
  created_at: string
  updated_at: string
  pushed_at: string
  archived: boolean
  size: number
}

export async function fetchRepoOverview(owner: string, repo: string): Promise<RepoOverview> {
  const [raw, languages, contributors] = await Promise.all([
    gh<RawRepo>(`/repos/${owner}/${repo}`),
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`).catch(() => ({})),
    gh<
      { login: string; avatar_url: string; html_url: string; contributions: number }[]
    >(`/repos/${owner}/${repo}/contributors?per_page=30`).catch(() => []),
  ])

  return {
    fullName: raw.full_name,
    description: raw.description,
    homepage: raw.homepage,
    htmlUrl: raw.html_url,
    stars: raw.stargazers_count,
    watchers: raw.watchers_count,
    forks: raw.forks_count,
    openIssues: raw.open_issues_count,
    subscribers: raw.subscribers_count ?? raw.watchers_count,
    network: raw.network_count ?? raw.forks_count,
    defaultBranch: raw.default_branch,
    license: raw.license?.spdx_id && raw.license.spdx_id !== "NOASSERTION" ? raw.license.spdx_id : raw.license?.name ?? null,
    language: raw.language,
    topics: raw.topics ?? [],
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    pushedAt: raw.pushed_at,
    archived: raw.archived,
    size: raw.size,
    languages: Object.entries(languages)
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes),
    contributors: (Array.isArray(contributors) ? contributors : []).map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      htmlUrl: c.html_url,
      contributions: c.contributions,
    })),
  }
}

interface RawReaction {
  total_count: number
  "+1": number
  "-1": number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

interface RawRelease {
  id: number
  name: string | null
  tag_name: string
  html_url: string
  author: { login: string; avatar_url: string; html_url: string } | null
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string | null
  body: string | null
  reactions?: RawReaction
  assets: { name: string; download_count: number; size: number; browser_download_url: string }[]
}

function mapReactions(r?: RawReaction): ReactionSummary | null {
  if (!r) return null
  return {
    total: r.total_count,
    plusOne: r["+1"],
    minusOne: r["-1"],
    laugh: r.laugh,
    hooray: r.hooray,
    confused: r.confused,
    heart: r.heart,
    rocket: r.rocket,
    eyes: r.eyes,
  }
}

export async function fetchReleases(owner: string, repo: string): Promise<ReleaseInfo[]> {
  const raw = await gh<RawRelease[]>(`/repos/${owner}/${repo}/releases?per_page=100`, {
    reactions: true,
  })
  return raw.map((r) => {
    const totalDownloads = r.assets.reduce((s, a) => s + a.download_count, 0)
    return {
      id: r.id,
      name: r.name?.trim() || r.tag_name,
      tag: r.tag_name,
      htmlUrl: r.html_url,
      author: r.author
        ? { login: r.author.login, avatarUrl: r.author.avatar_url, htmlUrl: r.author.html_url }
        : null,
      draft: r.draft,
      prerelease: r.prerelease,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      body: r.body ?? "",
      reactions: mapReactions(r.reactions),
      assets: r.assets.map((a) => ({
        name: a.name,
        downloadCount: a.download_count,
        size: a.size,
        downloadUrl: a.browser_download_url,
      })),
      totalDownloads,
    }
  })
}
