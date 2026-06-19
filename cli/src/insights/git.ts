import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { ScanContext } from "./scan.js"
import type {
  GitResult,
  GitState,
  GitFileChange,
  GitIssue,
  GitBranch,
  GitCommit,
  GitTag,
  GitRemoteInfo,
  CiWorkflow,
  CiStatus,
  CiJob,
  CiStep,
} from "../types.js"

const exec = promisify(execFile)

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec("git", args, { cwd: root, timeout: 8000, maxBuffer: 8_000_000 })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Parses an `origin` remote URL (https or scp-style ssh) into structured repo
 * metadata so the UI can render a "view on GitHub" link and owner/name.
 */
function parseRemote(url: string): GitRemoteInfo | undefined {
  if (!url) return undefined
  let host = ""
  let path = ""

  const ssh = url.match(/^[\w.-]+@([\w.-]+):(.+?)(?:\.git)?$/)
  const https = url.match(/^https?:\/\/(?:[^@/]+@)?([\w.-]+)\/(.+?)(?:\.git)?$/)
  if (ssh) {
    host = ssh[1]
    path = ssh[2]
  } else if (https) {
    host = https[1]
    path = https[2]
  } else {
    return undefined
  }

  const segments = path.split("/").filter(Boolean)
  if (segments.length < 2) return undefined
  const owner = segments[0]
  const name = segments[segments.length - 1]
  const provider: GitRemoteInfo["provider"] = host.includes("github")
    ? "GitHub"
    : host.includes("gitlab")
      ? "GitLab"
      : host.includes("bitbucket")
        ? "Bitbucket"
        : "Other"

  return { provider, owner, name, host, url: `https://${host}/${owner}/${name}` }
}

function parseStatus(porcelain: string): { changes: GitFileChange[]; staged: number } {
  const changes: GitFileChange[] = []
  let staged = 0
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue
    const x = line[0]
    const y = line[1]
    const file = line.slice(3)
    if (x !== " " && x !== "?") staged++
    let status: GitFileChange["status"] = "modified"
    if (x === "?" || y === "?") status = "untracked"
    else if (x === "A" || y === "A") status = "added"
    else if (x === "D" || y === "D") status = "deleted"
    else if (x === "R") status = "renamed"
    changes.push({ path: file, status })
  }
  return { changes, staged }
}

const CI_FILES: Array<{ glob: RegExp; provider: CiWorkflow["provider"] }> = [
  { glob: /^\.github\/workflows\/.*\.ya?ml$/, provider: "GitHub Actions" },
  { glob: /^\.gitlab-ci\.ya?ml$/, provider: "GitLab CI" },
  { glob: /^\.circleci\/config\.ya?ml$/, provider: "CircleCI" },
]

/**
 * Parse `git log` records that use unit-separator (\u001f) between fields and
 * record-separator (\u001e) between commits, optionally followed by a
 * --numstat block for per-file diff stats.
 */
function parseRecentCommits(out: string): GitCommit[] {
  const commits: GitCommit[] = []
  for (const record of out.split("\u001e")) {
    if (!record.trim()) continue
    const [meta, ...statLines] = record.split("\n")
    const [hash = "", fullHash = "", subject = "", author = "", email = "", iso = "", body = ""] = meta.split("\u001f")
    if (!hash) continue
    const files: GitFileChange[] = []
    let insertions = 0
    let deletions = 0
    for (const sl of statLines) {
      const m = sl.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (!m) continue
      const add = m[1] === "-" ? 0 : Number.parseInt(m[1], 10)
      const del = m[2] === "-" ? 0 : Number.parseInt(m[2], 10)
      insertions += add
      deletions += del
      files.push({ path: m[3], status: add > 0 && del === 0 ? "added" : del > 0 && add === 0 ? "deleted" : "modified" })
    }
    commits.push({
      hash,
      fullHash: fullHash || undefined,
      message: subject || "(no message)",
      author: author || "unknown",
      email: email || undefined,
      date: iso || undefined,
      body: body.trim() || undefined,
      relative: iso ? relativeTime(iso) : "unknown",
      files: files.length ? files.slice(0, 50) : undefined,
      insertions: files.length ? insertions : undefined,
      deletions: files.length ? deletions : undefined,
    })
  }
  return commits
}

function parseBranches(out: string, current: string): GitBranch[] {
  const branches: GitBranch[] = []
  for (const line of out.split("\n")) {
    if (!line.trim()) continue
    const [name = "", head = "", upstream = "", rel = "", tip = "", subject = "", author = ""] = line.split("\u001f")
    if (!name || name.endsWith("/HEAD")) continue
    const remote = name.includes("/") && /^(origin|upstream)\//.test(name)
    branches.push({
      name,
      current: head.trim() === "*" || name === current,
      remote,
      upstream: upstream || undefined,
      lastCommitRelative: rel || undefined,
      tip: tip || undefined,
      subject: subject || undefined,
      author: author || undefined,
    })
  }
  return branches.slice(0, 50)
}

function parseTags(out: string): GitTag[] {
  const tags: GitTag[] = []
  for (const line of out.split("\n")) {
    if (!line.trim()) continue
    const [name = "", commit = "", iso = "", type = "", subject = "", tagger = ""] = line.split("\u001f")
    if (!name) continue
    tags.push({
      name,
      commit: commit || undefined,
      relative: iso ? relativeTime(iso) : undefined,
      date: iso || undefined,
      annotated: type === "tag",
      message: subject || undefined,
      tagger: tagger || undefined,
    })
  }
  return tags.slice(0, 30)
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "unknown"
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

/**
 * Git + CI/CD intelligence. Shells out to the local `git` binary for repo
 * state and scans for CI workflow definitions. Degrades gracefully to an
 * "uninitialized repo" state when git is unavailable or the dir isn't a repo.
 */
export async function collectGit(ctx: ScanContext): Promise<GitResult> {
  const root = ctx.root
  const issues: GitIssue[] = []

  const isRepo = (await git(root, ["rev-parse", "--is-inside-work-tree"])) === "true"

  if (!isRepo) {
    return {
      state: emptyState(),
      issues: [
        {
          id: "git-noinit",
          kind: "gitignore",
          severity: "medium",
          title: "Not a git repository",
          detail: "This project is not under version control. Initialize a repo to track changes and enable CI.",
          recommendation: "Run `git init` and commit your work.",
        },
      ],
      workflows: await collectWorkflows(ctx),
    }
  }

  const [
    branch,
    statusOut,
    recentLogOut,
    remoteOut,
    countOut,
    contribOut,
    defaultRef,
    branchOut,
    tagOut,
    ignoredOut,
    stashOut,
    firstCommitOut,
    trackedOut,
  ] = await Promise.all([
    git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(root, ["status", "--porcelain"]),
    // Recent commits with full metadata: hash, full hash, subject, author, email, date, body, then --numstat.
    git(root, [
      "log",
      "-15",
      "--format=%h%x1f%H%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%b%x1e",
      "--numstat",
    ]),
    git(root, ["remote", "get-url", "origin"]),
    git(root, ["rev-list", "--count", "HEAD"]),
    git(root, ["shortlog", "-sn", "--all", "--no-merges"]),
    git(root, ["symbolic-ref", "refs/remotes/origin/HEAD"]),
    // All branches with tip commit info: name, HEAD marker, upstream, relative date, tip hash, subject, tip author.
    git(root, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)%x1f%(HEAD)%x1f%(upstream:short)%x1f%(committerdate:relative)%x1f%(objectname:short)%x1f%(subject)%x1f%(authorname)",
      "refs/heads",
      "refs/remotes",
    ]),
    // Tags with full info: name, commit hash, creatordate, type, subject/annotation, tagger.
    git(root, [
      "tag",
      "-l",
      "--sort=-creatordate",
      "--format=%(refname:short)%x1f%(objectname:short)%x1f%(creatordate:iso)%x1f%(object:objecttype)%x1f%(contents:subject)%x1f%(taggername)",
    ]),
    git(root, ["ls-files", "--others", "--ignored", "--exclude-standard"]),
    git(root, ["stash", "list"]),
    // First commit date for repository age.
    git(root, ["log", "--diff-filter=A", "--follow", "-z", "--format=%aI", "--", "*"]),
    // Count of tracked files.
    git(root, ["ls-files", "--cached", "--format='%(path)'"]),
  ])

  const { changes, staged } = parseStatus(statusOut ?? "")
  const recentCommits = parseRecentCommits(recentLogOut ?? "")
  const [hash = "", message = "", author = "", date = ""] = recentCommits.length
    ? [
        recentCommits[0].hash,
        recentCommits[0].message,
        recentCommits[0].author,
        "",
      ]
    : ["", "", "", ""]
  const defaultBranch = defaultRef?.split("/").pop() ?? "main"
  const branchName = branch ?? "HEAD"
  const branches = parseBranches(branchOut ?? "", branchName)
  const tags = (tagOut ?? "").split("\n").filter(Boolean).slice(0, 30)
  const tagDetails = parseTags(tagOut ?? "")
  const ignoredAll = (ignoredOut ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
  const ignored = { count: ignoredAll.length, samples: ignoredAll.slice(0, 12) }
  const stashes = (stashOut ?? "").split("\n").filter((l) => l.trim()).length
  const remoteInfo = parseRemote(remoteOut ?? "")

  let ahead = 0
  let behind = 0
  const counts = await git(root, ["rev-list", "--left-right", "--count", `${defaultBranch}...HEAD`])
  if (counts) {
    const [b, a] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10))
    behind = Number.isFinite(b) ? b : 0
    ahead = Number.isFinite(a) ? a : 0
  }

  const contributorLines = (contribOut ?? "").split("\n").filter((l) => l.trim())
  const contributors = contributorLines.length || 1
  const totalCommits = Number.parseInt(countOut ?? "0", 10) || 0
  const trackedFiles = (trackedOut ?? "").split("\n").filter(Boolean).length
  const firstCommitDate = (firstCommitOut ?? "").split("\0").filter(Boolean).pop()
  const firstCommitRelative = firstCommitDate ? relativeTime(firstCommitDate) : undefined
  
  // Parse top contributors from shortlog.
  const topContributors = contributorLines
    .slice(0, 5)
    .map((line) => {
      const [commits = "", name = ""] = line.trim().split(/\s+/).reverse()
      return { name, commits: Number.parseInt(commits, 10) }
    })
    .filter((c) => !Number.isNaN(c.commits))

  const state: GitState = {
    branch: branchName,
    defaultBranch,
    ahead,
    behind,
    remote: remoteOut ?? "",
    remoteInfo,
    lastCommit: {
      hash,
      message: message || "(no commits yet)",
      author: author || "unknown",
      relative: recentCommits[0]?.relative ?? (date ? relativeTime(date) : "unknown"),
    },
    recentCommits,
    branches,
    tags,
    tagDetails,
    ignored,
    stashes,
    changes,
    staged,
    contributors,
    totalCommits,
    firstCommitRelative,
    trackedFiles,
    topContributors: topContributors.length ? topContributors : undefined,
  }

  // --- Issues -------------------------------------------------------------
  const gitignore = await ctx.read(".gitignore")
  if (gitignore == null) {
    issues.push({
      id: "git-gitignore",
      kind: "gitignore",
      severity: "high",
      title: "Missing .gitignore",
      detail: "No .gitignore found; build artifacts, secrets, and node_modules may be committed.",
      recommendation: "Add a .gitignore covering node_modules, .env*, and build output.",
    })
  } else {
    const missing = ["node_modules", ".env"].filter((p) => !gitignore.includes(p))
    if (missing.length) {
      issues.push({
        id: "git-gitignore-gaps",
        kind: "gitignore",
        severity: missing.includes(".env") ? "high" : "medium",
        title: `.gitignore missing ${missing.join(", ")}`,
        detail: `Patterns not ignored: ${missing.join(", ")}. Sensitive or bulky files may be tracked.`,
        filePath: ".gitignore",
        recommendation: `Add ${missing.join(" and ")} to .gitignore.`,
      })
    }
  }

  // Committed env files.
  for (const f of ctx.files) {
    if (/(^|\/)\.env(\.|$)/.test(f.rel) && !f.rel.endsWith(".example") && gitignore && !gitignore.includes(".env")) {
      issues.push({
        id: `git-env-${f.rel}`,
        kind: "secret-in-history",
        severity: "critical",
        title: `Potential secret file tracked: ${f.rel}`,
        detail: "An environment file may be committed to version control, exposing secrets in history.",
        filePath: f.rel,
        recommendation: "Remove it from tracking with `git rm --cached` and add it to .gitignore.",
      })
      break
    }
  }

  if (changes.length > 20) {
    issues.push({
      id: "git-uncommitted",
      kind: "uncommitted",
      severity: "low",
      title: `${changes.length} uncommitted changes`,
      detail: "A large number of pending changes makes review and rollback harder.",
      recommendation: "Commit work in focused, logical chunks.",
    })
  }

  // Large tracked files.
  const large = ctx.files.filter((f) => f.sizeBytes > 5_000_000).slice(0, 3)
  for (const f of large) {
    issues.push({
      id: `git-large-${f.rel}`,
      kind: "large-file",
      severity: "medium",
      title: `Large file: ${f.rel}`,
      detail: `${(f.sizeBytes / 1_000_000).toFixed(1)} MB file in the repo bloats clones. Consider Git LFS.`,
      filePath: f.rel,
      recommendation: "Track large binaries with Git LFS or move them to object storage.",
    })
  }

  return { state, issues, workflows: await collectWorkflows(ctx) }
}

async function collectWorkflows(ctx: ScanContext): Promise<CiWorkflow[]> {
  const workflows: CiWorkflow[] = []
  const ciFiles = ctx.files.filter((f) => CI_FILES.some((c) => c.glob.test(f.rel)))

  for (const f of ciFiles) {
    const provider = CI_FILES.find((c) => c.glob.test(f.rel))!.provider
    const body = (await ctx.read(f.rel)) ?? ""
    const triggers = extractTriggers(body)
    const jobNames = extractJobs(body)
    const status: CiStatus = "no-runs" // static analysis can't know live run status

    workflows.push({
      id: `wf-${workflows.length + 1}`,
      name: extractName(body) ?? f.rel.split("/").pop() ?? "workflow",
      file: f.rel,
      provider,
      triggers,
      status,
      jobs: jobNames.map((name) => ({ name, status })),
      issues: [],
    })
  }

  return workflows
}

function extractName(yaml: string): string | null {
  return yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/['"]/g, "") ?? null
}

function extractTriggers(yaml: string): string[] {
  const onBlock = yaml.match(/^on:\s*(.*)$/m)?.[1]?.trim()
  if (onBlock && onBlock !== "" && !onBlock.startsWith("#")) {
    if (onBlock.startsWith("[")) return onBlock.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
    if (!onBlock.includes(":")) return [onBlock]
  }
  const triggers = new Set<string>()
  for (const t of ["push", "pull_request", "workflow_dispatch", "schedule", "release", "merge_group"]) {
    if (new RegExp(`^\\s+${t}:`, "m").test(yaml) || new RegExp(`\\b${t}\\b`).test(onBlock ?? "")) triggers.add(t)
  }
  return [...triggers]
}

function extractJobs(yaml: string): string[] {
  const jobsIdx = yaml.indexOf("\njobs:")
  if (jobsIdx === -1) return []
  const after = yaml.slice(jobsIdx)
  const names: string[] = []
  const re = /^\s{2}([A-Za-z0-9_-]+):\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(after)) !== null) names.push(m[1])
  return names.slice(0, 12)
}

function emptyState(): GitState {
  return {
    branch: "—",
    defaultBranch: "main",
    ahead: 0,
    behind: 0,
    remote: "",
    remoteInfo: undefined,
    lastCommit: { hash: "", message: "(not a git repository)", author: "—", relative: "—" },
    recentCommits: [],
    branches: [],
    tags: [],
    ignored: { count: 0, samples: [] },
    stashes: 0,
    changes: [],
    staged: 0,
    contributors: 0,
    totalCommits: 0,
  }
}
