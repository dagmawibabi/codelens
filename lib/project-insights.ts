import type { Severity } from "./schema"

/**
 * Extended project intelligence emitted by the CodeLens CLI beyond the core
 * lint/types/security/deps results: environment variables, network calls,
 * git + CI/CD state, project setup/config, and documentation readiness.
 *
 * Like the rest of the dashboard data, these mirror the JSON the CLI streams
 * and fall back to the bundled fixture in the v0 preview.
 */

/* ------------------------------------------------------------------ */
/* Environment variables                                               */
/* ------------------------------------------------------------------ */

export type EnvScope = "client" | "server"

export type EnvStatus =
  | "ok"
  | "missing" // referenced in code but never defined
  | "undocumented" // defined/used but absent from .env.example
  | "unused" // defined but never referenced
  | "exposed" // secret-looking value reachable from the client bundle
  | "empty" // defined with an empty value

export interface EnvVariable {
  key: string
  scope: EnvScope
  status: EnvStatus
  severity: Severity
  /** Where it is referenced in source. */
  usedIn: string[]
  /** Which env files declare it. */
  definedIn: string[]
  /** Short human explanation of the finding. */
  note: string
  /** Masked sample value when known. */
  sample?: string
}

export interface EnvResult {
  /** Files scanned for declarations. */
  files: { path: string; present: boolean; vars: number }[]
  variables: EnvVariable[]
  counts: { total: number; client: number; server: number; issues: number }
}

/* ------------------------------------------------------------------ */
/* Network                                                             */
/* ------------------------------------------------------------------ */

export type NetworkClient = "fetch" | "axios" | "ky" | "xhr" | "script" | "image" | "websocket"

export interface NetworkIssue {
  kind: "insecure" | "no-timeout" | "no-error-handling" | "hardcoded-url" | "cors-wildcard" | "no-auth" | "mixed-content"
  severity: Severity
  message: string
}

export interface NetworkCall {
  id: string
  method: string
  url: string
  host: string
  external: boolean
  secure: boolean
  client: NetworkClient
  filePath: string
  line: number
  issues: NetworkIssue[]
}

export interface NetworkDomain {
  host: string
  calls: number
  external: boolean
  category: "api" | "cdn" | "analytics" | "auth" | "payment" | "internal" | "other"
}

export interface NetworkResult {
  calls: NetworkCall[]
  domains: NetworkDomain[]
  counts: { total: number; external: number; insecure: number; issues: number }
}

/* ------------------------------------------------------------------ */
/* Git + CI/CD                                                         */
/* ------------------------------------------------------------------ */

export interface GitFileChange {
  path: string
  status: "modified" | "added" | "deleted" | "untracked" | "renamed"
}

export interface GitIssue {
  id: string
  kind: "secret-in-history" | "large-file" | "gitignore" | "uncommitted" | "stale-branch" | "no-signoff" | "force-push"
  severity: Severity
  title: string
  detail: string
  filePath?: string
  recommendation?: string
}

export interface GitState {
  branch: string
  defaultBranch: string
  ahead: number
  behind: number
  remote: string
  lastCommit: { hash: string; message: string; author: string; relative: string }
  changes: GitFileChange[]
  staged: number
  contributors: number
  totalCommits: number
}

export type CiStatus = "passing" | "failing" | "no-runs" | "disabled"

export interface CiJob {
  name: string
  status: CiStatus
  durationMs?: number
}

export interface CiWorkflow {
  id: string
  name: string
  file: string
  provider: "GitHub Actions" | "GitLab CI" | "CircleCI" | "Other"
  triggers: string[]
  status: CiStatus
  jobs: CiJob[]
  issues: GitIssue[]
}

export interface GitResult {
  state: GitState
  issues: GitIssue[]
  workflows: CiWorkflow[]
}

/* ------------------------------------------------------------------ */
/* Project setup / configuration                                       */
/* ------------------------------------------------------------------ */

export interface ConfigEntry {
  id: string
  name: string
  file: string
  present: boolean
  tool: string
  /** Short status line describing what is configured. */
  summary: string
  /** Key→value config highlights to render in a table. */
  highlights?: { label: string; value: string; good?: boolean }[]
  /** Number of rules/options configured, when meaningful. */
  ruleCount?: number
}

export interface LanguageStat {
  language: string
  files: number
  loc: number
  /** Share of total LOC, 0–1. */
  share: number
}

export interface WorkspaceStats {
  totalFiles: number
  totalLoc: number
  codeLoc: number
  commentLoc: number
  blankLoc: number
  testFiles: number
  testLoc: number
  components: number
  routes: number
  largestFiles: { path: string; loc: number }[]
  languages: LanguageStat[]
  /** Comment-to-code ratio, 0–1. */
  commentRatio: number
  /** Test-to-code ratio, 0–1. */
  testRatio: number
  todoCount: number
}

export interface SetupResult {
  configs: ConfigEntry[]
  stats: WorkspaceStats
  /** Detected tooling not necessarily backed by a single config file. */
  tooling: { name: string; version?: string; detected: boolean }[]
}

/* ------------------------------------------------------------------ */
/* Documentation / AI readiness                                        */
/* ------------------------------------------------------------------ */

export type DocCheckStatus = "pass" | "warn" | "fail"

export interface DocCheck {
  id: string
  label: string
  status: DocCheckStatus
  /** Why this matters and what to do. */
  detail: string
  /** Contribution to the overall score. */
  weight: number
  /** Whether this check specifically gates AI/agent readiness. */
  agent: boolean
}

export interface DocFile {
  name: string
  path: string
  present: boolean
  /** 0–100 quality score for present docs. */
  score: number
  words: number
  note: string
}

export interface DocsResult {
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  agentReady: boolean
  /** 0–100 score specifically for AI/agent consumption. */
  agentScore: number
  documents: DocFile[]
  checks: DocCheck[]
}

/* ------------------------------------------------------------------ */
/* Aggregate                                                           */
/* ------------------------------------------------------------------ */

export interface ProjectInsights {
  env: EnvResult
  network: NetworkResult
  git: GitResult
  setup: SetupResult
  docs: DocsResult
}

/* ================================================================== */
/* Mock fixture                                                        */
/* ================================================================== */

export const projectInsights: ProjectInsights = {
  env: {
    files: [
      { path: ".env.local", present: true, vars: 9 },
      { path: ".env.example", present: true, vars: 6 },
      { path: ".env.production", present: false, vars: 0 },
    ],
    counts: { total: 11, client: 3, server: 8, issues: 5 },
    variables: [
      {
        key: "DATABASE_URL",
        scope: "server",
        status: "ok",
        severity: "info",
        usedIn: ["lib/db.ts"],
        definedIn: [".env.local", ".env.example"],
        note: "Server-only connection string. Correctly excluded from the client bundle.",
        sample: "postgres://••••@db.neon.tech/main",
      },
      {
        key: "STRIPE_SECRET_KEY",
        scope: "server",
        status: "exposed",
        severity: "critical",
        usedIn: ["app/checkout/actions.ts", "components/price-tag.tsx"],
        definedIn: [".env.local"],
        note: "Secret key is imported in a Client Component (price-tag.tsx). It will be inlined into the browser bundle and leak to every visitor.",
        sample: "sk_live_••••••••",
      },
      {
        key: "NEXT_PUBLIC_API_URL",
        scope: "client",
        status: "ok",
        severity: "info",
        usedIn: ["lib/api.ts", "app/products/page.tsx"],
        definedIn: [".env.local", ".env.example"],
        note: "Public client variable, correctly prefixed with NEXT_PUBLIC_.",
        sample: "https://api.storefront.dev",
      },
      {
        key: "REDIS_URL",
        scope: "server",
        status: "missing",
        severity: "high",
        usedIn: ["lib/cache.ts"],
        definedIn: [],
        note: "Referenced in lib/cache.ts but not defined in any env file. Builds will read undefined at runtime.",
      },
      {
        key: "SENTRY_DSN",
        scope: "server",
        status: "undocumented",
        severity: "low",
        usedIn: ["lib/monitoring.ts"],
        definedIn: [".env.local"],
        note: "Used and defined locally but missing from .env.example, so new contributors won't know to set it.",
        sample: "https://••••@sentry.io/123",
      },
      {
        key: "OPENAI_API_KEY",
        scope: "server",
        status: "ok",
        severity: "info",
        usedIn: ["app/api/chat/route.ts"],
        definedIn: [".env.local", ".env.example"],
        note: "Server-only secret, used inside a Route Handler. Good.",
        sample: "sk-••••••••",
      },
      {
        key: "NEXT_PUBLIC_GA_ID",
        scope: "client",
        status: "ok",
        severity: "info",
        usedIn: ["app/layout.tsx"],
        definedIn: [".env.local", ".env.example"],
        note: "Analytics id, safe to expose to the client.",
        sample: "G-XXXXXXX",
      },
      {
        key: "LEGACY_TOKEN",
        scope: "server",
        status: "unused",
        severity: "low",
        usedIn: [],
        definedIn: [".env.local"],
        note: "Defined in .env.local but never referenced anywhere in the codebase. Safe to remove.",
        sample: "••••",
      },
      {
        key: "SMTP_PASSWORD",
        scope: "server",
        status: "empty",
        severity: "medium",
        usedIn: ["lib/email.ts"],
        definedIn: [".env.local"],
        note: "Declared with an empty value. Email sending in lib/email.ts will fail silently.",
        sample: "(empty)",
      },
      {
        key: "AUTH_SECRET",
        scope: "server",
        status: "ok",
        severity: "info",
        usedIn: ["lib/auth.ts"],
        definedIn: [".env.local", ".env.example"],
        note: "Session signing secret, server-only. Good.",
        sample: "••••••••",
      },
      {
        key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        scope: "client",
        status: "undocumented",
        severity: "low",
        usedIn: ["lib/supabase.ts"],
        definedIn: [".env.local"],
        note: "Public anon key — safe to expose, but missing from .env.example.",
        sample: "eyJ••••",
      },
    ],
  },

  network: {
    counts: { total: 14, external: 8, insecure: 2, issues: 6 },
    domains: [
      { host: "api.storefront.dev", calls: 5, external: false, category: "api" },
      { host: "api.stripe.com", calls: 2, external: true, category: "payment" },
      { host: "cdn.shopify.com", calls: 2, external: true, category: "cdn" },
      { host: "www.google-analytics.com", calls: 1, external: true, category: "analytics" },
      { host: "api.openai.com", calls: 1, external: true, category: "api" },
      { host: "legacy-tracker.net", calls: 1, external: true, category: "analytics" },
      { host: "fonts.googleapis.com", calls: 1, external: true, category: "cdn" },
      { host: "internal-metrics.local", calls: 1, external: false, category: "internal" },
    ],
    calls: [
      {
        id: "n1",
        method: "GET",
        url: "http://legacy-tracker.net/collect",
        host: "legacy-tracker.net",
        external: true,
        secure: false,
        client: "image",
        filePath: "components/analytics/legacy-pixel.tsx",
        line: 12,
        issues: [
          { kind: "insecure", severity: "high", message: "Loads over plain HTTP — browsers will block this as mixed content on an HTTPS site." },
          { kind: "mixed-content", severity: "medium", message: "Mixed-content request from a secure page; the pixel will be dropped silently." },
        ],
      },
      {
        id: "n2",
        method: "POST",
        url: "https://api.stripe.com/v1/payment_intents",
        host: "api.stripe.com",
        external: true,
        secure: true,
        client: "fetch",
        filePath: "app/checkout/actions.ts",
        line: 41,
        issues: [
          { kind: "no-timeout", severity: "medium", message: "No timeout or AbortController — a hung Stripe request blocks the checkout action indefinitely." },
        ],
      },
      {
        id: "n3",
        method: "GET",
        url: "https://api.storefront.dev/products",
        host: "api.storefront.dev",
        external: false,
        secure: true,
        client: "fetch",
        filePath: "lib/api.ts",
        line: 8,
        issues: [
          { kind: "no-error-handling", severity: "medium", message: "Response is parsed with .json() without checking res.ok; 4xx/5xx bodies will throw an opaque parse error." },
        ],
      },
      {
        id: "n4",
        method: "GET",
        url: "http://internal-metrics.local/ping",
        host: "internal-metrics.local",
        external: false,
        secure: false,
        client: "fetch",
        filePath: "lib/monitoring.ts",
        line: 27,
        issues: [
          { kind: "insecure", severity: "low", message: "Plain HTTP to an internal host. Acceptable inside a private network but flagged for visibility." },
        ],
      },
      {
        id: "n5",
        method: "POST",
        url: "https://api.openai.com/v1/chat/completions",
        host: "api.openai.com",
        external: true,
        secure: true,
        client: "fetch",
        filePath: "app/api/chat/route.ts",
        line: 19,
        issues: [],
      },
      {
        id: "n6",
        method: "GET",
        url: "https://www.google-analytics.com/g/collect",
        host: "www.google-analytics.com",
        external: true,
        secure: true,
        client: "script",
        filePath: "app/layout.tsx",
        line: 34,
        issues: [
          { kind: "no-auth", severity: "info", message: "Third-party analytics script loaded without Subresource Integrity (SRI)." },
        ],
      },
      {
        id: "n7",
        method: "GET",
        url: "https://api.storefront.dev/cart",
        host: "api.storefront.dev",
        external: false,
        secure: true,
        client: "axios",
        filePath: "lib/cart.ts",
        line: 15,
        issues: [
          { kind: "hardcoded-url", severity: "low", message: "Base URL is hardcoded instead of read from NEXT_PUBLIC_API_URL, making environment overrides impossible." },
        ],
      },
    ],
  },

  git: {
    state: {
      branch: "feat/checkout-redesign",
      defaultBranch: "main",
      ahead: 3,
      behind: 7,
      remote: "github.com/acme/storefront",
      lastCommit: {
        hash: "a1b2c3d",
        message: "wip: tweak price tag layout",
        author: "Jordan Lee",
        relative: "2 hours ago",
      },
      changes: [
        { path: "app/checkout/actions.ts", status: "modified" },
        { path: "components/price-tag.tsx", status: "modified" },
        { path: ".env.local", status: "untracked" },
        { path: "lib/cache.ts", status: "added" },
        { path: "notes.todo", status: "untracked" },
      ],
      staged: 0,
      contributors: 6,
      totalCommits: 1284,
    },
    issues: [
      {
        id: "g1",
        kind: "secret-in-history",
        severity: "critical",
        title: "Possible secret committed in history",
        detail: "A Stripe-style key (sk_live_…) appears in commit 9f2a11c from 14 days ago in config/payments.ts. Even after deletion it remains recoverable from git history.",
        filePath: "config/payments.ts",
        recommendation: "Rotate the key immediately, then purge it from history with git filter-repo or BFG and force-push.",
      },
      {
        id: "g2",
        kind: "uncommitted",
        severity: "medium",
        title: ".env.local is untracked and contains secrets",
        detail: "Untracked .env.local holds live secrets. One careless `git add .` would commit them.",
        filePath: ".env.local",
        recommendation: "Confirm .env.local is matched by .gitignore (it currently is) and never force-add it.",
      },
      {
        id: "g3",
        kind: "large-file",
        severity: "low",
        title: "Large binary committed to the repo",
        detail: "public/demo.mp4 (48 MB) is tracked in git, bloating clone size for everyone.",
        filePath: "public/demo.mp4",
        recommendation: "Move large media to Git LFS or external storage and remove it from history.",
      },
      {
        id: "g4",
        kind: "stale-branch",
        severity: "info",
        title: "Branch is 7 commits behind main",
        detail: "feat/checkout-redesign has diverged from main by 7 commits. Rebasing now avoids a painful merge later.",
        recommendation: "Run git fetch && git rebase origin/main.",
      },
      {
        id: "g5",
        kind: "gitignore",
        severity: "low",
        title: "notes.todo is untracked and unignored",
        detail: "A scratch file is neither tracked nor ignored, so it shows up as noise in every status check.",
        filePath: "notes.todo",
        recommendation: "Add it to .gitignore or remove it.",
      },
    ],
    workflows: [
      {
        id: "w1",
        name: "CI",
        file: ".github/workflows/ci.yml",
        provider: "GitHub Actions",
        triggers: ["push", "pull_request"],
        status: "failing",
        jobs: [
          { name: "lint", status: "passing", durationMs: 42000 },
          { name: "typecheck", status: "failing", durationMs: 38000 },
          { name: "test", status: "passing", durationMs: 96000 },
        ],
        issues: [
          {
            id: "w1i1",
            kind: "force-push",
            severity: "medium",
            title: "No dependency caching",
            detail: "The workflow runs `pnpm install` without actions/cache or setup-node caching, adding ~40s to every run.",
            filePath: ".github/workflows/ci.yml",
            recommendation: "Enable cache: 'pnpm' in actions/setup-node to reuse the store between runs.",
          },
          {
            id: "w1i2",
            kind: "no-signoff",
            severity: "low",
            title: "Node version is not pinned",
            detail: "setup-node uses 'node-version: latest', so builds can break unexpectedly when a new major ships.",
            filePath: ".github/workflows/ci.yml",
            recommendation: "Pin to a specific major (e.g. node-version: 20) matching your engines field.",
          },
        ],
      },
      {
        id: "w2",
        name: "Deploy",
        file: ".github/workflows/deploy.yml",
        provider: "GitHub Actions",
        triggers: ["push: main"],
        status: "passing",
        jobs: [
          { name: "build", status: "passing", durationMs: 120000 },
          { name: "deploy", status: "passing", durationMs: 54000 },
        ],
        issues: [
          {
            id: "w2i1",
            kind: "secret-in-history",
            severity: "high",
            title: "Secret echoed in a run step",
            detail: "A step runs `echo $DEPLOY_TOKEN` for debugging, which prints the secret into public build logs.",
            filePath: ".github/workflows/deploy.yml",
            recommendation: "Remove the echo and mask the value with ::add-mask:: if it must be referenced.",
          },
        ],
      },
    ],
  },

  setup: {
    tooling: [
      { name: "TypeScript", version: "5.4.5", detected: true },
      { name: "ESLint", version: "8.56.0", detected: true },
      { name: "Prettier", version: "3.2.5", detected: true },
      { name: "Tailwind CSS", version: "3.4.1", detected: true },
      { name: "Vitest", version: "1.4.0", detected: true },
      { name: "Husky", detected: false },
      { name: "Playwright", detected: false },
      { name: "EditorConfig", detected: false },
    ],
    configs: [
      {
        id: "c1",
        name: "ESLint",
        file: ".eslintrc.json",
        present: true,
        tool: "eslint",
        summary: "Extends next/core-web-vitals with 4 custom rule overrides.",
        ruleCount: 28,
        highlights: [
          { label: "extends", value: "next/core-web-vitals" },
          { label: "no-unused-vars", value: "warn" },
          { label: "no-console", value: "off", good: false },
          { label: "flat config", value: "no (legacy)", good: false },
        ],
      },
      {
        id: "c2",
        name: "TypeScript",
        file: "tsconfig.json",
        present: true,
        tool: "tsc",
        summary: "strict mode on, but two safety flags are disabled.",
        ruleCount: 14,
        highlights: [
          { label: "strict", value: "true", good: true },
          { label: "noUncheckedIndexedAccess", value: "false", good: false },
          { label: "noImplicitOverride", value: "false", good: false },
          { label: "target", value: "ES2022", good: true },
        ],
      },
      {
        id: "c3",
        name: "Prettier",
        file: ".prettierrc",
        present: true,
        tool: "prettier",
        summary: "Standard config — 2-space, single quotes, 100 print width.",
        highlights: [
          { label: "semi", value: "false" },
          { label: "singleQuote", value: "true" },
          { label: "printWidth", value: "100" },
        ],
      },
      {
        id: "c4",
        name: "Tailwind",
        file: "tailwind.config.ts",
        present: true,
        tool: "tailwindcss",
        summary: "Custom theme with 3 plugins; content globs cover app + components.",
        highlights: [
          { label: "darkMode", value: "class", good: true },
          { label: "plugins", value: "3" },
        ],
      },
      {
        id: "c5",
        name: "Git hooks",
        file: ".husky/",
        present: false,
        tool: "husky",
        summary: "No pre-commit hooks — lint/format/type checks don't run before commits.",
      },
      {
        id: "c6",
        name: "EditorConfig",
        file: ".editorconfig",
        present: false,
        tool: "editorconfig",
        summary: "Missing — editors won't share indentation/charset settings across the team.",
      },
    ],
    stats: {
      totalFiles: 248,
      totalLoc: 18460,
      codeLoc: 14820,
      commentLoc: 1840,
      blankLoc: 1800,
      testFiles: 22,
      testLoc: 2380,
      components: 64,
      routes: 18,
      commentRatio: 0.124,
      testRatio: 0.16,
      todoCount: 37,
      largestFiles: [
        { path: "lib/api.ts", loc: 612 },
        { path: "app/checkout/actions.ts", loc: 548 },
        { path: "components/product-grid.tsx", loc: 503 },
        { path: "lib/db.ts", loc: 472 },
        { path: "app/dashboard/page.tsx", loc: 441 },
      ],
      languages: [
        { language: "TypeScript (TSX)", files: 132, loc: 9240, share: 0.5 },
        { language: "TypeScript", files: 78, loc: 6180, share: 0.335 },
        { language: "CSS", files: 12, loc: 1420, share: 0.077 },
        { language: "JSON", files: 18, loc: 980, share: 0.053 },
        { language: "Markdown", files: 8, loc: 640, share: 0.035 },
      ],
    },
  },

  docs: {
    score: 64,
    grade: "C",
    agentReady: false,
    agentScore: 48,
    documents: [
      { name: "README.md", path: "README.md", present: true, score: 72, words: 840, note: "Has setup and scripts, but no architecture overview or env-var table." },
      { name: "AGENTS.md", path: "AGENTS.md", present: false, score: 0, words: 0, note: "Missing. Agents have no machine-readable guide to conventions, commands, or boundaries." },
      { name: "llms.txt", path: "llms.txt", present: false, score: 0, words: 0, note: "Missing. No curated index of routes/docs for LLM consumption." },
      { name: "CONTRIBUTING.md", path: "CONTRIBUTING.md", present: true, score: 58, words: 320, note: "Covers PR flow but omits local setup and test commands." },
      { name: "CHANGELOG.md", path: "CHANGELOG.md", present: false, score: 0, words: 0, note: "No changelog — release history is undocumented." },
      { name: "API reference", path: "docs/api.md", present: true, score: 44, words: 510, note: "Partially documents 6 of 18 routes; many endpoints undocumented." },
    ],
    checks: [
      { id: "d1", label: "README has quick-start", status: "pass", weight: 10, agent: false, detail: "Install + dev commands are present and runnable." },
      { id: "d2", label: "AGENTS.md present", status: "fail", weight: 15, agent: true, detail: "No AGENTS.md. AI agents lack a machine-readable description of build/test commands, conventions, and do-not-touch areas." },
      { id: "d3", label: "llms.txt index", status: "fail", weight: 10, agent: true, detail: "No llms.txt at the project root to point LLMs at the most relevant docs and routes." },
      { id: "d4", label: "Environment variables documented", status: "warn", weight: 12, agent: true, detail: ".env.example exists but 3 used variables are undocumented and none have descriptions." },
      { id: "d5", label: "Public API/JSDoc coverage", status: "warn", weight: 12, agent: true, detail: "Only 38% of exported functions have JSDoc. Agents infer intent better with typed, documented signatures." },
      { id: "d6", label: "Scripts documented", status: "pass", weight: 8, agent: true, detail: "All package.json scripts are explained in the README." },
      { id: "d7", label: "Architecture overview", status: "fail", weight: 10, agent: false, detail: "No high-level description of how app/, lib/, and components/ fit together." },
      { id: "d8", label: "Code examples / usage", status: "warn", weight: 8, agent: true, detail: "README shows one snippet; key utilities have no usage examples." },
      { id: "d9", label: "License & contributing", status: "pass", weight: 5, agent: false, detail: "LICENSE and CONTRIBUTING.md are present." },
      { id: "d10", label: "Consistent doc structure", status: "warn", weight: 10, agent: true, detail: "Headings are inconsistent across docs, making automated extraction less reliable." },
    ],
  },
}
