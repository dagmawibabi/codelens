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
  /** Raw, unmasked value parsed from the local env file. Read only from the
   *  developer's own machine and revealed behind an explicit toggle. */
  value?: string
  /** Per-file values so the UI can compare .env.local vs .env.example, etc.
   *  `value` is `null` when the file declares the key with no value. */
  values?: { file: string; value: string | null }[]
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

export interface GitCommit {
  hash: string
  message: string
  author: string
  relative: string
  /** Full 40-char SHA, when known. */
  fullHash?: string
  /** Author email. */
  email?: string
  /** Absolute commit date (ISO) for tooltips. */
  date?: string
  /** Extended commit body / description below the subject line. */
  body?: string
  /** Files touched by this commit. */
  files?: GitFileChange[]
  /** Diff stats. */
  insertions?: number
  deletions?: number
  /** Refs pointing at this commit (tags, branches). */
  refs?: string[]
}

export interface GitBranch {
  name: string
  current: boolean
  /** True for remote-tracking branches (e.g. origin/main). */
  remote: boolean
  /** Upstream tracking ref, if the branch tracks one. */
  upstream?: string
  /** Relative time of the branch tip's last commit. */
  lastCommitRelative?: string
  /** Commits ahead/behind the default branch. */
  ahead?: number
  behind?: number
  /** Short hash of the branch tip. */
  tip?: string
  /** Subject line of the tip commit. */
  subject?: string
  /** Author of the tip commit. */
  author?: string
  /** Whether the branch has been merged into the default branch. */
  merged?: boolean
}

/** Annotated or lightweight tag with metadata for the detail sheet. */
export interface GitTag {
  name: string
  /** Short hash of the tagged commit. */
  commit?: string
  /** Relative time of the tag / tagged commit. */
  relative?: string
  /** Absolute date (ISO). */
  date?: string
  /** Annotation message for annotated tags. */
  message?: string
  /** Tagger / author name. */
  tagger?: string
  /** True for annotated tags (vs lightweight). */
  annotated?: boolean
}

/** Parsed from the `origin` remote URL; powers the repo link in the UI. */
export interface GitRemoteInfo {
  provider: "GitHub" | "GitLab" | "Bitbucket" | "Other"
  owner: string
  name: string
  /** Browsable https URL for the repository. */
  url: string
  host: string
}

export interface GitState {
  branch: string
  defaultBranch: string
  ahead: number
  behind: number
  remote: string
  /** Structured remote metadata (owner/name/url), when an origin is set. */
  remoteInfo?: GitRemoteInfo
  lastCommit: { hash: string; message: string; author: string; relative: string }
  /** Most recent commits on the current branch, newest first. */
  recentCommits: GitCommit[]
  /** Local and remote-tracking branches. */
  branches: GitBranch[]
  /** Lightweight tags, newest first. */
  tags: string[]
  /** Rich tag metadata, when available (parallels `tags`). */
  tagDetails?: GitTag[]
  /** Git-ignored files: total count plus a sample for display. */
  ignored: { count: number; samples: string[] }
  /** Number of stash entries. */
  stashes: number
  changes: GitFileChange[]
  staged: number
  contributors: number
  totalCommits: number
  /** Relative time of the repository's first commit. */
  firstCommitRelative?: string
  /** Number of files in the working tree (tracked). */
  trackedFiles?: number
  /** Top contributors by commit count. */
  topContributors?: { name: string; commits: number }[]
}

export type CiStatus = "passing" | "failing" | "no-runs" | "disabled"

/** A single step within a CI job. */
export interface CiStep {
  name: string
  /** Marketplace action used (e.g. actions/checkout@v4). */
  uses?: string
  /** Inline shell command. */
  run?: string
  /** `if:` condition guarding the step. */
  condition?: string
  /** Static diagnostics found for this step. */
  diagnostics?: string[]
}

export interface CiJob {
  name: string
  status: CiStatus
  durationMs?: number
  /** Runner image (e.g. ubuntu-latest). */
  runsOn?: string
  /** Jobs this one depends on. */
  needs?: string[]
  /** `if:` condition guarding the whole job. */
  condition?: string
  /** Parsed steps. */
  steps?: CiStep[]
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
  /** Concurrency group config, if declared. */
  concurrency?: string
  /** Declared top-level permissions. */
  permissions?: string[]
  /** Env var names referenced at the workflow level. */
  env?: string[]
  /** Cron schedules, if any. */
  schedules?: string[]
  /** How to run / diagnose this workflow locally. */
  diagnosis?: {
    /** Suggested local command (e.g. `act -j build`). */
    localCommand?: string
    /** Whether a local runner (act) is applicable. */
    runnable: boolean
    notes: string[]
  }
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

export type DocCheckStatus = "pass" | "warn" | "fail" | "na"
export type DocBand = "excellent" | "good" | "needs-improvement" | "poor"

export interface DocCheck {
  id: string
  label: string
  status: DocCheckStatus
  /** Why this matters and what to do. */
  detail: string
  /** Max points this check contributes within its standard. */
  weight: number
  /** Grouping within a standard (e.g. "Discovery", "Structure", "Context"). */
  group?: string
  /** Whether this check specifically gates AI/agent readiness. */
  agent: boolean
  /** Concrete remediation step. */
  fix?: string
}

/**
 * One scoring standard contributing to the overall documentation benchmark.
 * We combine the Vercel Agent Readability spec, the llms.txt spec
 * (llmstxt.org), the farming-labs Agent Score, and a general documentation
 * quality rubric. Each yields a 0–100 sub-score; the benchmark is their
 * weighted blend.
 */
export interface DocStandard {
  id: "vercel" | "llmstxt" | "farming" | "quality"
  label: string
  /** One-line description of what the standard measures. */
  tagline: string
  /** Attribution / origin of the rubric. */
  source: string
  href: string
  /** 0–100 sub-score. */
  score: number
  /** Weight in the overall benchmark, 0–1 (sums to 1 across standards). */
  weight: number
  band: DocBand
  /** True when full evaluation requires probing a live docs URL. */
  liveOnly?: boolean
  checks: DocCheck[]
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
  /** Overall weighted benchmark score, 0–100. */
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  band: DocBand
  agentReady: boolean
  /** 0–100 score specifically for AI/agent consumption. */
  agentScore: number
  /** Live docs URL probed for farming-labs-style checks, if any. */
  liveUrl: string | null
  /** Per-standard sub-scores that make up the benchmark. */
  standards: DocStandard[]
  documents: DocFile[]
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

export type DbEngine = "postgres" | "mysql" | "mongodb" | "sqlite" | "redis" | "other"

export type DbIssueKind =
  | "n+1"
  | "missing-index"
  | "no-pooling"
  | "injection"
  | "unparameterized"
  | "schema-drift"
  | "no-migration"
  | "unbounded-query"
  | "no-ssl"
  | "connection-leak"
  | "missing-ttl"
  | "full-scan"
  | "no-validation"

/** How the datastore was detected, for transparency in the UI. */
export type DbDetectionSource = "dependency" | "env" | "connection-string" | "schema-file" | "config"

export interface DbConnection {
  id: string
  engine: DbEngine
  /** Logical name / database name. */
  name: string
  /** Driver or ORM used to connect (e.g. Prisma, Drizzle, mongoose, pg). */
  client: string
  host: string
  /** TLS/SSL enforced on the connection. */
  ssl: boolean
  /** Whether a connection pool / pooled URL is in use. */
  pooled: boolean
  /** Env var holding the connection string. */
  envVar: string
  /** Tables (SQL) or collections (Mongo). */
  collections: number
  /** Where the client is instantiated. */
  filePath: string
  /** How this datastore was identified. */
  detectedVia?: DbDetectionSource
  /** Detected scheme of the connection string (e.g. mongodb+srv, postgres). */
  scheme?: string
  /** Source of the schema (e.g. Prisma schema, Drizzle, mongoose models). */
  schemaSource?: string
}

export type DbColumnFlag = "pk" | "fk" | "unique" | "index" | "nullable" | "default"

export interface DbColumn {
  name: string
  /** SQL type or inferred document field type. */
  type: string
  flags: DbColumnFlag[]
  /** Referenced table.column for foreign keys. */
  references?: string
  note?: string
}

export interface DbIndexInfo {
  name: string
  columns: string[]
  unique: boolean
}

/** A table (SQL) or collection (document store). */
export interface DbTable {
  name: string
  /** Which connection this belongs to. */
  connectionId: string
  /** "table" for SQL, "collection" for document stores. */
  kind: "table" | "collection" | "view"
  columns: DbColumn[]
  indexes: DbIndexInfo[]
  /** Approximate row/document count. */
  rowCount: number
  /** On-disk size estimate. */
  sizeKb?: number
  /** Where the model/table is defined. */
  filePath?: string
}

export interface DbFinding {
  id: string
  engine: DbEngine
  kind: DbIssueKind
  severity: Severity
  title: string
  detail: string
  filePath: string
  line?: number
  recommendation: string
  /** Optional offending query/code snippet. */
  snippet?: { startLine: number; code: string }
  /** Target table/collection. */
  target?: string
}

export interface DbQuery {
  id: string
  engine: DbEngine
  /** SELECT / INSERT / find / aggregate / etc. */
  operation: string
  /** Table or collection. */
  target: string
  filePath: string
  line: number
  /** Estimated execution time in ms. */
  estMs: number
  /** Whether the planner reports a full scan. */
  fullScan: boolean
  note: string
}

export interface DbResult {
  connections: DbConnection[]
  findings: DbFinding[]
  /** Notable / slowest observed queries. */
  queries: DbQuery[]
  /** Schema: tables/collections discovered across connections. */
  tables?: DbTable[]
  counts: { connections: number; collections: number; findings: number; slowQueries: number }
}

/* ------------------------------------------------------------------ */
/* Accessibility                                                       */
/* ------------------------------------------------------------------ */

export type A11yImpact = "critical" | "serious" | "moderate" | "minor"

/** One of the four WCAG principles a violation maps to. */
export type WcagPrinciple = "Perceivable" | "Operable" | "Understandable" | "Robust"

export interface A11yViolation {
  id: string
  /** axe-core rule id, e.g. "color-contrast". */
  rule: string
  impact: A11yImpact
  principle: WcagPrinciple
  /** WCAG success criteria, e.g. ["1.4.3", "WCAG 2.1 AA"]. */
  wcag: string[]
  description: string
  /** How to fix it, short form. */
  help: string
  helpUrl: string
  filePath: string
  line: number
  /** CSS selector of the offending node. */
  selector: string
  /** Number of nodes affected by this rule on the page. */
  nodes: number
  recommendation: string
  snippet?: { startLine: number; code: string }
}

export interface A11yResult {
  /** 0–100 accessibility score. */
  score: number
  violations: A11yViolation[]
  /** Count of axe checks that passed. */
  passes: number
  /** Checks that need manual review. */
  incomplete: number
  counts: { critical: number; serious: number; moderate: number; minor: number }
  byPrinciple: { principle: WcagPrinciple; count: number }[]
}

/* ------------------------------------------------------------------ */
/* Performance                                                         */
/* ------------------------------------------------------------------ */

export type VitalRating = "good" | "needs-improvement" | "poor"

export interface WebVital {
  id: "LCP" | "INP" | "CLS" | "FCP" | "TTFB"
  label: string
  value: number
  unit: string
  rating: VitalRating
  /** Good ≤ good; poor ≥ poor (in the vital's unit). */
  threshold: { good: number; poor: number }
}

export interface BundleRoute {
  route: string
  /** Route-specific JS in KB. */
  sizeKb: number
  /** First Load JS (route + shared) in KB. */
  firstLoadKb: number
  rating: VitalRating
}

export type PerfIssueKind =
  | "large-bundle"
  | "render-blocking"
  | "unoptimized-image"
  | "no-memo"
  | "large-dependency"
  | "duplicate-dependency"
  | "no-code-split"
  | "sync-script"
  | "layout-shift"

export interface PerfFinding {
  id: string
  kind: PerfIssueKind
  severity: Severity
  title: string
  detail: string
  filePath: string
  line?: number
  recommendation: string
  /** Estimated KB saved if resolved. */
  estimatedSavingKb?: number
  snippet?: { startLine: number; code: string }
}

export interface PerfResult {
  /** 0–100 performance score (Lighthouse-style). */
  score: number
  vitals: WebVital[]
  bundles: BundleRoute[]
  findings: PerfFinding[]
  /** Total First Load JS shared across routes, in KB. */
  totalBundleKb: number
  counts: { findings: number }
}

/* ------------------------------------------------------------------ */
/* Tests & Coverage                                                    */
/* ------------------------------------------------------------------ */

export type TestStatus = "passed" | "failed" | "skipped"

/** An individual test case ("it"/"test") within a suite. */
export interface TestCase {
  name: string
  /** Full nested name including describe blocks. */
  fullName?: string
  status: TestStatus
  durationMs?: number
  line?: number
  /** Assertions / expectations the test makes (parsed from expect()). */
  assertions?: string[]
  /** Failure message for failed tests. */
  error?: string
  /** Expected vs received for a failed assertion. */
  expected?: string
  actual?: string
}

export interface TestSuite {
  id: string
  name: string
  filePath: string
  total: number
  passed: number
  failed: number
  skipped: number
  durationMs: number
  status: TestStatus
  /** Individual test cases, when collected. */
  tests?: TestCase[]
}

export type TestIssueKind = "failing" | "flaky" | "slow" | "uncovered" | "no-tests"

export interface TestFinding {
  id: string
  kind: TestIssueKind
  severity: Severity
  title: string
  detail: string
  filePath: string
  line?: number
  recommendation: string
  snippet?: { startLine: number; code: string }
}

export interface CoverageFile {
  filePath: string
  /** Coverage percentages. */
  lines: number
  functions: number
  branches: number
  statements: number
  uncoveredLines?: number[]
}

export interface TestsResult {
  framework: string
  coverage: { lines: number; functions: number; branches: number; statements: number }
  suites: TestSuite[]
  findings: TestFinding[]
  /** Per-file coverage, typically sorted lowest-first. */
  files: CoverageFile[]
  counts: {
    total: number
    passed: number
    failed: number
    skipped: number
    suites: number
    durationMs: number
  }
}

/* ------------------------------------------------------------------ */
/* Auth (Better Auth)                                                  */
/* ------------------------------------------------------------------ */

export type AuthStatus = "ok" | "warn" | "fail" | "info"

export type AuthPluginCategory =
  | "two-factor"
  | "passwordless"
  | "social"
  | "authorization"
  | "session"
  | "api"
  | "enterprise"
  | "integration"
  | "utility"
  | "other"

export interface AuthMethod {
  id: string
  label: string
  kind: "credential" | "social" | "passwordless"
  enabled: boolean
  detail: string
  providers?: string[]
}

export interface AuthPlugin {
  id: string
  name: string
  category: AuthPluginCategory
  side: "server" | "client" | "both"
  detectedServer: boolean
  detectedClient: boolean
  needsClient: boolean
  clientMissing: boolean
  description: string
  docsUrl: string
  addsTables?: string[]
}

export interface AuthConfigItem {
  key: string
  label: string
  value: string
  status: AuthStatus
  detail?: string
  recommendation?: string
}

export interface AuthFinding {
  id: string
  severity: Severity
  title: string
  detail: string
  recommendation: string
  filePath?: string
  line?: number
  docsUrl?: string
}

export type AuthProviderId =
  | "better-auth"
  | "clerk"
  | "next-auth"
  | "supabase"
  | "lucia"
  | "firebase"
  | "auth0"
  | "passport"

export interface AuthProviderInfo {
  id: AuthProviderId
  /** Display name, e.g. "Clerk", "Auth.js (NextAuth)". */
  name: string
  /** npm package the detection matched on. */
  packageName: string
  docsUrl: string
  /**
   * Whether CodeLens can introspect this provider's config in depth
   * (methods, plugins, session). Only Better Auth has full support today;
   * others are detected and surfaced with provider-level guidance.
   */
  deepSupport: boolean
}

export interface AuthResult {
  present: boolean
  /** Which auth library is in use. Undefined only when `present` is false. */
  provider?: AuthProviderInfo
  version?: string
  integration?: string
  configPath?: string
  clientPath?: string
  databaseAdapter?: { name: string; detail: string }
  methods: AuthMethod[]
  socialProviders: string[]
  plugins: AuthPlugin[]
  config: AuthConfigItem[]
  session: { expiresIn?: number; updateAge?: number; cookieCache?: boolean }
  findings: AuthFinding[]
  counts: { plugins: number; methods: number; providers: number; findings: number }
}

/* ------------------------------------------------------------------ */
/* API Surface Map                                                     */
/* ------------------------------------------------------------------ */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "ALL"

export type ApiRouteKind =
  | "next-app" // app/**/route.ts
  | "next-pages" // pages/api/**
  | "next-action" // "use server" server actions
  | "express" // app.get(...) / router.post(...)
  | "hono" // app.get(...) on a Hono instance
  | "fastify"
  | "sveltekit" // +server.ts
  | "nuxt" // server/api/**
  | "other"

export interface ApiEndpointFlags {
  /** Reads the authenticated session/user. */
  auth: boolean
  /** Validates input (zod/yup/valibot/manual). */
  validation: boolean
  /** References a database/ORM call. */
  database: boolean
  /** Touches process.env directly. */
  env: boolean
  /** Returns/handles errors explicitly (try/catch or error response). */
  errorHandling: boolean
  /** Reads request body / params. */
  inputs: boolean
}

export interface ApiEndpoint {
  id: string
  method: HttpMethod
  /** Normalized route path, e.g. /api/users/[id]. */
  path: string
  kind: ApiRouteKind
  filePath: string
  line: number
  /** Handler/export name when meaningful (e.g. "POST", action name). */
  handler?: string
  flags: ApiEndpointFlags
  /** Static issues found around the handler. */
  findings: ApiFinding[]
  /** True when the route segment is dynamic ([id], :id, etc). */
  dynamic: boolean
}

export interface ApiFinding {
  id: string
  severity: Severity
  kind: "no-auth" | "no-validation" | "no-error-handling" | "public-mutation" | "wildcard-method" | "hardcoded-secret"
  title: string
  detail: string
  recommendation: string
}

export interface ApiGroup {
  /** Top-level segment, e.g. "api", "auth", "(root)". */
  segment: string
  endpoints: ApiEndpoint[]
}

export interface ApiResult {
  /** True when at least one server endpoint was detected. */
  present: boolean
  /** Dominant framework/style for the surface. */
  style?: string
  endpoints: ApiEndpoint[]
  groups: ApiGroup[]
  /** Distribution of endpoints by HTTP method. */
  methodCounts: { method: HttpMethod; count: number }[]
  findings: ApiFinding[]
  counts: {
    endpoints: number
    dynamic: number
    mutations: number
    protected: number
    validated: number
    findings: number
  }
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
  database: DbResult
  auth: AuthResult
  api: ApiResult
  accessibility: A11yResult
  performance: PerfResult
  tests: TestsResult
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
        value: "postgres://app:s3cr3t_pw@db.neon.tech/main?sslmode=require",
        values: [
          { file: ".env.local", value: "postgres://app:s3cr3t_pw@db.neon.tech/main?sslmode=require" },
          { file: ".env.example", value: "postgres://app:YOUR_PASSWORD@db.neon.tech/main?sslmode=require" },
        ],
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
        value: "sk_live_51Hx9aBcDeFgHiJkLmNoPqRsT",
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
        value: "https://api.storefront.dev",
        values: [
          { file: ".env.local", value: "https://api.storefront.dev" },
          { file: ".env.example", value: "https://api.storefront.dev" },
        ],
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
        value: "https://a1b2c3d4@o123456.ingest.sentry.io/4505123",
        values: [
          { file: ".env.local", value: "https://a1b2c3d4@o123456.ingest.sentry.io/4505123" },
          { file: ".env.example", value: null },
        ],
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
        value: "sk-proj-AbC123XyZ456DeF789GhI",
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
        value: "G-7H9K2L4M8N",
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
        value: "legacy-tok-9920-unused",
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
        value: "",
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
        value: "9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
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
        value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo-anon-key",
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
      remote: "git@github.com:acme/storefront.git",
      remoteInfo: {
        provider: "GitHub",
        owner: "acme",
        name: "storefront",
        host: "github.com",
        url: "https://github.com/acme/storefront",
      },
      lastCommit: {
        hash: "a1b2c3d",
        message: "wip: tweak price tag layout",
        author: "Jordan Lee",
        relative: "2 hours ago",
      },
      recentCommits: [
        {
          hash: "a1b2c3d", fullHash: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          message: "wip: tweak price tag layout", author: "Jordan Lee", email: "jordan@acme.dev",
          relative: "2 hours ago", date: "2026-06-19T08:12:00Z", refs: ["HEAD -> feat/checkout-redesign"],
          body: "Adjust the discount badge so it aligns with the strikethrough price.\nStill WIP — needs the responsive breakpoint pass.",
          insertions: 34, deletions: 12,
          files: [
            { path: "components/price-tag.tsx", status: "modified" },
            { path: "app/checkout/page.tsx", status: "modified" },
          ],
        },
        {
          hash: "9f2a11c", fullHash: "9f2a11c0b1d2e3f405162738495a6b7c8d9e0f12",
          message: "feat: redesign checkout summary", author: "Jordan Lee", email: "jordan@acme.dev",
          relative: "5 hours ago", date: "2026-06-19T05:40:00Z",
          body: "New two-column summary with order totals on the right.",
          insertions: 212, deletions: 48,
          files: [
            { path: "app/checkout/page.tsx", status: "modified" },
            { path: "components/order-summary.tsx", status: "added" },
            { path: "config/payments.ts", status: "modified" },
          ],
        },
        {
          hash: "7c4e0b2", fullHash: "7c4e0b2a3948576675849302a1b0c9d8e7f60514",
          message: "refactor: extract usePricing hook", author: "Sam Rivera", email: "sam@acme.dev",
          relative: "1 day ago", date: "2026-06-18T10:05:00Z", insertions: 88, deletions: 96,
          files: [
            { path: "hooks/use-pricing.ts", status: "added" },
            { path: "components/price-tag.tsx", status: "modified" },
          ],
        },
        {
          hash: "3d9f8a1", fullHash: "3d9f8a1b2c3d4e5f60718293a4b5c6d7e8f90123",
          message: "fix: cart total rounding error", author: "Priya Nair", email: "priya@acme.dev",
          relative: "2 days ago", date: "2026-06-17T14:22:00Z", insertions: 9, deletions: 4,
          body: "Round to cents before summing instead of after — fixes the off-by-one-cent totals reported in #482.",
          files: [{ path: "lib/cart.ts", status: "modified" }],
        },
        {
          hash: "b50c7e4", fullHash: "b50c7e4f5a6b7c8d9e0f1a2b3c4d5e6f70819203",
          message: "chore: bump next to 16.0.1", author: "Jordan Lee", email: "jordan@acme.dev",
          relative: "3 days ago", date: "2026-06-16T09:00:00Z", insertions: 14, deletions: 14,
          files: [
            { path: "package.json", status: "modified" },
            { path: "pnpm-lock.yaml", status: "modified" },
          ],
        },
        {
          hash: "e1a2d3f", fullHash: "e1a2d3f4b5c6d7e8f90112233445566778899aab",
          message: "test: add checkout e2e coverage", author: "Sam Rivera", email: "sam@acme.dev",
          relative: "4 days ago", date: "2026-06-15T16:30:00Z", insertions: 156, deletions: 0,
          files: [{ path: "e2e/checkout.spec.ts", status: "added" }],
        },
      ],
      branches: [
        { name: "feat/checkout-redesign", current: true, remote: false, upstream: "origin/feat/checkout-redesign", lastCommitRelative: "2 hours ago", ahead: 3, behind: 7, tip: "a1b2c3d", subject: "wip: tweak price tag layout", author: "Jordan Lee", merged: false },
        { name: "main", current: false, remote: false, upstream: "origin/main", lastCommitRelative: "5 hours ago", ahead: 0, behind: 0, tip: "9f2a11c", subject: "feat: redesign checkout summary", author: "Jordan Lee", merged: false },
        { name: "fix/cart-rounding", current: false, remote: false, lastCommitRelative: "2 days ago", ahead: 1, behind: 4, tip: "3d9f8a1", subject: "fix: cart total rounding error", author: "Priya Nair", merged: true },
        { name: "origin/main", current: false, remote: true, lastCommitRelative: "5 hours ago", tip: "9f2a11c", subject: "feat: redesign checkout summary", author: "Jordan Lee" },
        { name: "origin/feat/checkout-redesign", current: false, remote: true, lastCommitRelative: "2 hours ago", tip: "a1b2c3d", subject: "wip: tweak price tag layout", author: "Jordan Lee" },
        { name: "origin/release/2.4", current: false, remote: true, lastCommitRelative: "3 weeks ago", tip: "f0d1e2c", subject: "release: cut 2.4.0", author: "Priya Nair" },
      ],
      tags: ["v2.3.0", "v2.2.1", "v2.2.0", "v2.1.0"],
      tagDetails: [
        { name: "v2.3.0", commit: "9f2a11c", relative: "5 hours ago", date: "2026-06-19T05:40:00Z", annotated: true, tagger: "Jordan Lee", message: "Checkout redesign + pricing hook. See CHANGELOG for the full list." },
        { name: "v2.2.1", commit: "3d9f8a1", relative: "2 days ago", date: "2026-06-17T14:22:00Z", annotated: true, tagger: "Priya Nair", message: "Patch: cart total rounding fix (#482)." },
        { name: "v2.2.0", commit: "c9b8a70", relative: "2 weeks ago", date: "2026-06-05T11:00:00Z", annotated: true, tagger: "Sam Rivera", message: "Minor: search filters + saved carts." },
        { name: "v2.1.0", commit: "1f2e3d4", relative: "5 weeks ago", date: "2026-05-15T09:30:00Z", annotated: false },
      ],
      ignored: {
        count: 5,
        samples: ["node_modules", ".next", ".env.local", "coverage", "*.log"],
      },
      stashes: 2,
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
      firstCommitRelative: "2 years ago",
      trackedFiles: 487,
      topContributors: [
        { name: "Jordan Lee", commits: 612 },
        { name: "Sam Rivera", commits: 398 },
        { name: "Priya Nair", commits: 201 },
        { name: "Alex Kim", commits: 54 },
        { name: "Dana Cho", commits: 19 },
      ],
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
        concurrency: "ci-${{ github.ref }}",
        permissions: ["contents: read"],
        env: ["CI", "TURBO_TOKEN"],
        diagnosis: {
          runnable: true,
          localCommand: "act pull_request -j typecheck",
          notes: [
            "Reproduce the failing job locally with nektos/act (runs the workflow in Docker).",
            "Or run the underlying script directly: pnpm typecheck.",
            "typecheck fails on a type error in app/checkout/actions.ts — see the job log.",
          ],
        },
        jobs: [
          {
            name: "lint", status: "passing", durationMs: 42000, runsOn: "ubuntu-latest",
            steps: [
              { name: "Checkout", uses: "actions/checkout@v4" },
              { name: "Setup Node", uses: "actions/setup-node@v4", diagnostics: ["No dependency cache configured (cache: 'pnpm')."] },
              { name: "Install", run: "pnpm install --frozen-lockfile" },
              { name: "Lint", run: "pnpm lint" },
            ],
          },
          {
            name: "typecheck", status: "failing", durationMs: 38000, runsOn: "ubuntu-latest", needs: ["lint"],
            steps: [
              { name: "Checkout", uses: "actions/checkout@v4" },
              { name: "Setup Node", uses: "actions/setup-node@v4" },
              { name: "Install", run: "pnpm install --frozen-lockfile" },
              { name: "Type check", run: "pnpm typecheck", diagnostics: ["This step failed: tsc reported 1 error in app/checkout/actions.ts:67."] },
            ],
          },
          {
            name: "test", status: "passing", durationMs: 96000, runsOn: "ubuntu-latest", needs: ["lint"],
            condition: "github.event_name == 'pull_request'",
            steps: [
              { name: "Checkout", uses: "actions/checkout@v4" },
              { name: "Setup Node", uses: "actions/setup-node@v4" },
              { name: "Install", run: "pnpm install --frozen-lockfile" },
              { name: "Unit tests", run: "pnpm test --coverage" },
            ],
          },
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
        concurrency: "deploy-production",
        permissions: ["contents: read", "deployments: write"],
        env: ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
        schedules: [],
        diagnosis: {
          runnable: true,
          localCommand: "act push -j build",
          notes: [
            "Deploy steps reference repository secrets; act needs a local --secret-file to run end to end.",
            "The build step mirrors `pnpm build`, which you can run directly to reproduce build issues.",
          ],
        },
        jobs: [
          {
            name: "build", status: "passing", durationMs: 120000, runsOn: "ubuntu-latest",
            steps: [
              { name: "Checkout", uses: "actions/checkout@v4" },
              { name: "Setup Node", uses: "actions/setup-node@v4" },
              { name: "Install", run: "pnpm install --frozen-lockfile" },
              { name: "Build", run: "pnpm build" },
            ],
          },
          {
            name: "deploy", status: "passing", durationMs: 54000, runsOn: "ubuntu-latest", needs: ["build"],
            condition: "github.ref == 'refs/heads/main'",
            steps: [
              { name: "Pull Vercel env", run: "vercel pull --yes --environment=production" },
              { name: "Debug token", run: "echo $DEPLOY_TOKEN", diagnostics: ["Secret printed to logs — remove this echo."] },
              { name: "Deploy", run: "vercel deploy --prod" },
            ],
          },
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
    score: 52,
    grade: "D",
    band: "needs-improvement",
    agentReady: false,
    agentScore: 44,
    liveUrl: null,
    documents: [
      { name: "README.md", path: "README.md", present: true, score: 72, words: 840, note: "Has setup and scripts, but no architecture overview or env-var table." },
      { name: "AGENTS.md", path: "AGENTS.md", present: false, score: 0, words: 0, note: "Missing. Agents have no machine-readable guide to conventions, commands, or boundaries." },
      { name: "llms.txt", path: "llms.txt", present: false, score: 0, words: 0, note: "Missing. No curated index of routes/docs for LLM consumption." },
      { name: "CONTRIBUTING.md", path: "CONTRIBUTING.md", present: true, score: 58, words: 320, note: "Covers PR flow but omits local setup and test commands." },
      { name: "CHANGELOG.md", path: "CHANGELOG.md", present: false, score: 0, words: 0, note: "No changelog — release history is undocumented." },
      { name: "API reference", path: "docs/api.md", present: true, score: 44, words: 510, note: "Partially documents 6 of 18 routes; many endpoints undocumented." },
    ],
    standards: [
      {
        id: "vercel",
        label: "Agent Readability",
        tagline: "Vercel's spec for making sites legible to AI agents",
        source: "Vercel Agent Readability Spec",
        href: "https://vercel.com/docs/agent-readability",
        score: 58,
        weight: 0.35,
        band: "needs-improvement",
        checks: [
          { id: "vr1", group: "Discovery", label: "llms.txt index at root", status: "fail", weight: 12, agent: true, detail: "No /llms.txt to point agents at the most relevant docs and routes. This is the single highest-impact discovery signal.", fix: "Add an llms.txt at the project root following the llmstxt.org format." },
          { id: "vr2", group: "Discovery", label: "AGENTS.md present", status: "fail", weight: 10, agent: true, detail: "No AGENTS.md describing build/test commands, conventions, and do-not-touch areas for coding agents.", fix: "Create AGENTS.md with setup, commands, architecture, and conventions sections." },
          { id: "vr3", group: "Discovery", label: "robots.txt allows AI crawlers", status: "na", weight: 6, agent: false, detail: "Requires a live URL to verify that GPTBot, ClaudeBot, PerplexityBot, etc. are not disallowed.", fix: "Provide a docs URL to probe robots.txt." },
          { id: "vr4", group: "Discovery", label: "sitemap.xml / sitemap.md", status: "na", weight: 6, agent: false, detail: "Requires a live URL to confirm a crawlable sitemap is served.", fix: "Provide a docs URL to probe the sitemap." },
          { id: "vr5", group: "Structure", label: "Page metadata (title + description)", status: "warn", weight: 8, agent: false, detail: "12 of 18 routes export metadata; 6 fall back to the default title, giving agents weak page context." },
          { id: "vr6", group: "Structure", label: "Canonical URLs", status: "na", weight: 6, agent: false, detail: "Requires a live URL to verify canonical link tags are present and self-referential." },
          { id: "vr7", group: "Structure", label: "Structured data (JSON-LD)", status: "fail", weight: 6, agent: false, detail: "No JSON-LD on key pages, so agents can't extract typed entities (products, articles, breadcrumbs).", fix: "Emit JSON-LD via a <script type=\"application/ld+json\"> in the route head." },
          { id: "vr8", group: "Context", label: "Semantic heading hierarchy", status: "warn", weight: 10, agent: true, detail: "Several docs skip from H1 to H3 or use multiple H1s, which degrades automated outline extraction." },
          { id: "vr9", group: "Context", label: "Code blocks tagged with language", status: "pass", weight: 8, agent: true, detail: "All fenced code blocks specify a language, so agents can parse and run examples reliably." },
          { id: "vr10", group: "Context", label: "Markdown route mirrors (.md)", status: "fail", weight: 12, agent: true, detail: "Pages don't expose a clean Markdown mirror (e.g. via content negotiation or .md routes), forcing agents to scrape HTML.", fix: "Serve a Markdown version of each page through content negotiation or a .md route." },
          { id: "vr11", group: "Context", label: "Descriptive link text", status: "pass", weight: 6, agent: false, detail: "Links use descriptive anchors rather than \"click here\", aiding both screen readers and agents." },
        ],
      },
      {
        id: "llmstxt",
        label: "llms.txt Spec",
        tagline: "Conformance with the llmstxt.org file format",
        source: "llmstxt.org specification",
        href: "https://llmstxt.org",
        score: 22,
        weight: 0.2,
        band: "poor",
        checks: [
          { id: "lt1", label: "/llms.txt exists", status: "fail", weight: 25, agent: true, detail: "The spec's required entry file is missing at the project root.", fix: "Create /llms.txt." },
          { id: "lt2", label: "H1 with project name", status: "fail", weight: 10, agent: true, detail: "A single H1 naming the project must be the first line. Cannot pass without the file." },
          { id: "lt3", label: "Blockquote summary", status: "fail", weight: 10, agent: false, detail: "A short > blockquote summary should follow the H1 to orient the model." },
          { id: "lt4", label: "H2 sections with link lists", status: "fail", weight: 15, agent: true, detail: "Curated H2 sections (Docs, Examples, Optional) with markdown link lists are required." },
          { id: "lt5", label: "Each link has a description", status: "fail", weight: 10, agent: false, detail: "Every link should carry a colon-separated description so models can prioritize." },
          { id: "lt6", label: "Optional section for low-priority links", status: "na", weight: 5, agent: false, detail: "An \"Optional\" section lets agents skip secondary content under tight context budgets." },
          { id: "lt7", label: "llms-full.txt expanded variant", status: "fail", weight: 10, agent: true, detail: "No llms-full.txt that inlines the full docs corpus for one-shot ingestion.", fix: "Generate llms-full.txt alongside llms.txt." },
          { id: "lt8", label: "Valid, parseable markdown", status: "na", weight: 15, agent: false, detail: "Cannot validate structure until the file exists." },
        ],
      },
      {
        id: "farming",
        label: "Agent Score",
        tagline: "farming-labs live-surface agent readiness probes",
        source: "@farming-labs/docs · doctor --agent",
        href: "https://docs.farming-labs.dev/score",
        score: 41,
        weight: 0.2,
        band: "poor",
        liveOnly: true,
        checks: [
          { id: "fl1", group: "Surfaces", label: "Docs discoverable from root", status: "na", weight: 12, agent: false, detail: "Needs a live URL: checks whether an agent landing on the homepage can find the docs within one hop.", fix: "Set a docs URL to enable live probing." },
          { id: "fl2", group: "Surfaces", label: "llms.txt served over HTTP", status: "fail", weight: 14, agent: true, detail: "No llms.txt in the repo, so the deployed site will return 404 for /llms.txt." },
          { id: "fl3", group: "Surfaces", label: "sitemap.xml / sitemap.md", status: "na", weight: 10, agent: false, detail: "Requires a live URL to fetch the sitemap." },
          { id: "fl4", group: "Surfaces", label: "robots.txt not blocking AI", status: "na", weight: 10, agent: false, detail: "Requires a live URL to confirm AI user-agents aren't disallowed." },
          { id: "fl5", group: "Surfaces", label: "AGENTS.md served", status: "fail", weight: 12, agent: true, detail: "No AGENTS.md in the repo to serve at /AGENTS.md." },
          { id: "fl6", group: "Surfaces", label: "skill.md present", status: "fail", weight: 8, agent: true, detail: "No skill.md describing reusable agent skills/workflows for this project.", fix: "Add a skill.md documenting common agent tasks." },
          { id: "fl7", group: "Surfaces", label: ".md route mirrors (content negotiation)", status: "na", weight: 14, agent: true, detail: "Requires a live URL to test whether pages return Markdown when requested with text/markdown." },
          { id: "fl8", group: "Surfaces", label: "MCP endpoint exposed", status: "fail", weight: 10, agent: true, detail: "No Model Context Protocol endpoint advertised for structured tool access to the docs.", fix: "Expose an MCP server or .well-known/mcp descriptor." },
          { id: "fl9", group: "Freshness", label: "Docs freshness / compaction", status: "warn", weight: 10, agent: false, detail: "Several docs reference APIs that changed two releases ago; agents may surface stale guidance." },
        ],
      },
      {
        id: "quality",
        label: "Documentation Quality",
        tagline: "Human-facing completeness and readability",
        source: "CodeLens quality rubric (readme-doctor + Vale)",
        href: "https://github.com/vercel-labs/codelens",
        score: 70,
        weight: 0.25,
        band: "good",
        checks: [
          { id: "ql1", label: "README quick-start", status: "pass", weight: 12, agent: false, detail: "Install and dev commands are present and runnable." },
          { id: "ql2", label: "Architecture overview", status: "fail", weight: 10, agent: false, detail: "No high-level description of how app/, lib/, and components/ fit together.", fix: "Add an Architecture section or docs/architecture.md." },
          { id: "ql3", label: "Environment variables documented", status: "warn", weight: 10, agent: true, detail: ".env.example exists but 3 used variables are undocumented and none have descriptions." },
          { id: "ql4", label: "Public API / JSDoc coverage", status: "warn", weight: 12, agent: true, detail: "Only 38% of exported functions have JSDoc. Typed, documented signatures help agents infer intent." },
          { id: "ql5", label: "Usage examples", status: "warn", weight: 8, agent: false, detail: "README shows one snippet; key utilities have no usage examples." },
          { id: "ql6", label: "CONTRIBUTING present", status: "pass", weight: 6, agent: false, detail: "CONTRIBUTING.md documents the PR flow." },
          { id: "ql7", label: "LICENSE present", status: "pass", weight: 5, agent: false, detail: "An MIT LICENSE is present at the root." },
          { id: "ql8", label: "CHANGELOG present", status: "fail", weight: 6, agent: false, detail: "No CHANGELOG.md — release history is undocumented.", fix: "Adopt Keep a Changelog or generate one from conventional commits." },
          { id: "ql9", label: "Readability (Flesch-Kincaid ≤ 12)", status: "pass", weight: 8, agent: false, detail: "Prose reads at a grade-10 level — accessible without being oversimplified." },
          { id: "ql10", label: "No broken relative links", status: "warn", weight: 8, agent: false, detail: "2 relative links in docs/api.md point to files that no longer exist." },
          { id: "ql11", label: "Consistent heading structure", status: "warn", weight: 10, agent: true, detail: "Headings are inconsistent across docs, reducing automated-extraction reliability." },
        ],
      },
    ],
  },

  database: {
    counts: { connections: 3, collections: 27, findings: 9, slowQueries: 4 },
    connections: [
      {
        id: "db1",
        engine: "postgres",
        name: "storefront",
        client: "Drizzle ORM (postgres-js)",
        host: "ep-cool-darkness.us-east-2.aws.neon.tech",
        ssl: true,
        pooled: true,
        envVar: "DATABASE_URL",
        collections: 14,
        filePath: "lib/db.ts",
        detectedVia: "connection-string",
        scheme: "postgres",
        schemaSource: "Drizzle ORM schema",
      },
      {
        id: "db2",
        engine: "mongodb",
        name: "analytics",
        client: "Mongoose",
        host: "cluster0.ab12c.mongodb.net",
        ssl: true,
        pooled: false,
        envVar: "MONGODB_URI",
        collections: 9,
        filePath: "lib/mongo.ts",
        detectedVia: "connection-string",
        scheme: "mongodb+srv",
        schemaSource: "Mongoose models",
      },
      {
        id: "db3",
        engine: "redis",
        name: "cache",
        client: "ioredis",
        host: "localhost:6379",
        ssl: false,
        pooled: true,
        envVar: "REDIS_URL",
        collections: 4,
        filePath: "lib/cache.ts",
        detectedVia: "dependency",
        scheme: "redis",
      },
    ],
    findings: [
      {
        id: "dbf1",
        engine: "postgres",
        kind: "n+1",
        severity: "high",
        title: "N+1 query loading order line items",
        detail:
          "The order list maps over orders and awaits a separate `lineItems` query per row. A 50-order page fires 51 round-trips to Postgres.",
        filePath: "app/dashboard/orders/page.tsx",
        line: 38,
        target: "line_items",
        recommendation:
          "Fetch line items in a single query with a JOIN or `inArray(orderIds)`, then group in memory.",
        snippet: {
          startLine: 37,
          code: "  const orders = await db.select().from(ordersTable)\n  for (const o of orders) {\n    o.items = await db.select().from(lineItems).where(eq(lineItems.orderId, o.id))\n  }",
        },
      },
      {
        id: "dbf2",
        engine: "postgres",
        kind: "missing-index",
        severity: "high",
        title: "Sequential scan on orders.email",
        detail:
          "`orders` is filtered by `email` on the lookup path but has no index on that column. EXPLAIN shows a full sequential scan over ~1.2M rows.",
        filePath: "lib/queries/orders.ts",
        line: 14,
        target: "orders",
        recommendation: "Add `CREATE INDEX CONCURRENTLY orders_email_idx ON orders (email);` via a migration.",
      },
      {
        id: "dbf3",
        engine: "mongodb",
        kind: "unbounded-query",
        severity: "high",
        title: "Unbounded find() on events collection",
        detail:
          "`Event.find({ type })` returns every matching document with no `.limit()` or pagination. The events collection has 4.6M documents and grows daily.",
        filePath: "lib/mongo.ts",
        line: 52,
        target: "events",
        recommendation: "Add `.limit()` with cursor-based pagination and project only required fields.",
        snippet: {
          startLine: 52,
          code: "  const events = await Event.find({ type }).sort({ createdAt: -1 })",
        },
      },
      {
        id: "dbf4",
        engine: "mongodb",
        kind: "missing-index",
        severity: "medium",
        title: "No compound index for events query pattern",
        detail:
          "Events are queried by `{ type, createdAt }` but only a single-field index on `type` exists, forcing an in-memory sort that can exceed the 32MB sort limit.",
        filePath: "lib/models/event.ts",
        line: 21,
        target: "events",
        recommendation: "Create a compound index `{ type: 1, createdAt: -1 }` matching the query and sort order.",
      },
      {
        id: "dbf5",
        engine: "mongodb",
        kind: "no-validation",
        severity: "medium",
        title: "Collection has no schema validation",
        detail:
          "The `events` collection accepts arbitrary shapes — there is no `$jsonSchema` validator and the mongoose schema uses `strict: false`, allowing malformed analytics rows.",
        filePath: "lib/models/event.ts",
        line: 8,
        target: "events",
        recommendation: "Enable strict mode in mongoose and attach a $jsonSchema validator to the collection.",
      },
      {
        id: "dbf6",
        engine: "postgres",
        kind: "injection",
        severity: "critical",
        title: "Raw SQL built from request input",
        detail:
          "`db.execute(sql.raw(...))` interpolates the `email` query param directly into the statement, allowing SQL injection.",
        filePath: "app/api/orders/route.ts",
        line: 31,
        target: "orders",
        recommendation: "Use parameterized template literals (`sql\`... ${email}\``) instead of `sql.raw` with string concatenation.",
        snippet: {
          startLine: 31,
          code: "  const email = req.nextUrl.searchParams.get('email')\n  await db.execute(sql.raw(`SELECT * FROM orders WHERE email = '${email}'`))",
        },
      },
      {
        id: "dbf7",
        engine: "mongodb",
        kind: "no-pooling",
        severity: "medium",
        title: "New Mongo connection per request",
        detail:
          "`mongoose.connect()` is called inside the request handler rather than once at module scope, opening a fresh connection on every invocation and exhausting the Atlas connection limit under load.",
        filePath: "lib/mongo.ts",
        line: 11,
        recommendation: "Cache the connection promise at module scope (global singleton) and reuse it across requests.",
      },
      {
        id: "dbf8",
        engine: "redis",
        kind: "missing-ttl",
        severity: "low",
        title: "Cache keys written without TTL",
        detail:
          "`redis.set(key, value)` is used without an expiry for product cache entries, so stale data accumulates and memory grows unbounded.",
        filePath: "lib/cache.ts",
        line: 24,
        target: "product:*",
        recommendation: "Set an explicit TTL: `redis.set(key, value, 'EX', 3600)`.",
      },
      {
        id: "dbf9",
        engine: "redis",
        kind: "no-ssl",
        severity: "medium",
        title: "Redis connection is not encrypted",
        detail:
          "REDIS_URL uses the plaintext `redis://` scheme. Cache traffic — including session tokens — crosses the network unencrypted.",
        filePath: "lib/cache.ts",
        line: 6,
        recommendation: "Use the `rediss://` TLS scheme and verify the server certificate.",
      },
    ],
    queries: [
      {
        id: "q1",
        engine: "postgres",
        operation: "SELECT",
        target: "orders",
        filePath: "lib/queries/orders.ts",
        line: 14,
        estMs: 1840,
        fullScan: true,
        note: "Sequential scan over orders filtered by email — add an index.",
      },
      {
        id: "q2",
        engine: "mongodb",
        operation: "find",
        target: "events",
        filePath: "lib/mongo.ts",
        line: 52,
        estMs: 2600,
        fullScan: true,
        note: "Unbounded find with in-memory sort; no compound index.",
      },
      {
        id: "q3",
        engine: "postgres",
        operation: "SELECT",
        target: "line_items",
        filePath: "app/dashboard/orders/page.tsx",
        line: 38,
        estMs: 920,
        fullScan: false,
        note: "Fired 51× per page render (N+1).",
      },
      {
        id: "q4",
        engine: "mongodb",
        operation: "aggregate",
        target: "events",
        filePath: "lib/analytics.ts",
        line: 73,
        estMs: 1450,
        fullScan: true,
        note: "$group stage spills to disk; allowDiskUse without index.",
      },
      {
        id: "q5",
        engine: "redis",
        operation: "GET",
        target: "product:*",
        filePath: "lib/cache.ts",
        line: 24,
        estMs: 3,
        fullScan: false,
        note: "Healthy — sub-millisecond cache reads.",
      },
    ],
    tables: [
      {
        name: "users",
        connectionId: "db1",
        kind: "table",
        rowCount: 2840,
        sizeKb: 450,
        filePath: "lib/schema/users.ts",
        columns: [
          { name: "id", type: "uuid", flags: ["pk"], references: undefined },
          { name: "email", type: "varchar(255)", flags: ["unique", "index"], references: undefined },
          { name: "name", type: "varchar(255)", flags: [], references: undefined },
          { name: "createdAt", type: "timestamp", flags: ["index"], references: undefined },
        ],
        indexes: [
          { name: "users_email_idx", columns: ["email"], unique: true },
          { name: "users_created_idx", columns: ["createdAt"], unique: false },
        ],
      },
      {
        name: "orders",
        connectionId: "db1",
        kind: "table",
        rowCount: 18927,
        sizeKb: 3200,
        filePath: "lib/schema/orders.ts",
        columns: [
          { name: "id", type: "uuid", flags: ["pk"], references: undefined },
          { name: "userId", type: "uuid", flags: ["fk", "index"], references: "users.id" },
          { name: "total", type: "decimal(10,2)", flags: [], references: undefined },
          { name: "status", type: "enum('pending','completed','failed')", flags: ["index"], references: undefined },
          { name: "createdAt", type: "timestamp", flags: ["index"], references: undefined },
        ],
        indexes: [
          { name: "orders_user_idx", columns: ["userId"], unique: false },
          { name: "orders_status_idx", columns: ["status"], unique: false },
          { name: "orders_created_idx", columns: ["createdAt"], unique: false },
        ],
      },
      {
        name: "line_items",
        connectionId: "db1",
        kind: "table",
        rowCount: 64210,
        sizeKb: 8900,
        filePath: "lib/schema/orders.ts",
        columns: [
          { name: "id", type: "uuid", flags: ["pk"], references: undefined },
          { name: "orderId", type: "uuid", flags: ["fk", "index"], references: "orders.id" },
          { name: "productId", type: "uuid", flags: ["fk", "index"], references: "products.id" },
          { name: "quantity", type: "integer", flags: ["default"], references: undefined },
          { name: "unitPrice", type: "decimal(10,2)", flags: [], references: undefined },
        ],
        indexes: [
          { name: "line_items_order_idx", columns: ["orderId"], unique: false },
          { name: "line_items_product_idx", columns: ["productId"], unique: false },
        ],
      },
      {
        name: "events",
        connectionId: "db2",
        kind: "collection",
        rowCount: 4600000,
        sizeKb: 185000,
        filePath: "lib/models/event.ts",
        columns: [
          { name: "_id", type: "ObjectId", flags: ["pk"], references: undefined },
          { name: "type", type: "string", flags: ["index"], references: undefined },
          { name: "userId", type: "string", flags: ["fk"], references: "users._id" },
          { name: "data", type: "object", flags: [], references: undefined },
          { name: "createdAt", type: "Date", flags: ["index"], references: undefined },
        ],
        indexes: [
          { name: "events_type_idx", columns: ["type"], unique: false },
          { name: "events_created_idx", columns: ["createdAt"], unique: false },
        ],
      },
      {
        name: "sessions",
        connectionId: "db2",
        kind: "collection",
        rowCount: 128400,
        sizeKb: 24300,
        filePath: "lib/models/session.ts",
        columns: [
          { name: "_id", type: "ObjectId", flags: ["pk"], references: undefined },
          { name: "userId", type: "string", flags: ["fk", "index"], references: "users._id" },
          { name: "device", type: "string", flags: [], references: undefined },
          { name: "expiresAt", type: "Date", flags: ["index"], references: undefined },
        ],
        indexes: [
          { name: "sessions_user_idx", columns: ["userId"], unique: false },
          { name: "sessions_expires_ttl", columns: ["expiresAt"], unique: false },
        ],
      },
    ],
  },

  auth: {
    present: true,
    provider: {
      id: "better-auth",
      name: "Better Auth",
      packageName: "better-auth",
      docsUrl: "https://www.better-auth.com/docs",
      deepSupport: true,
    },
    version: "1.2.8",
    integration: "Next.js",
    configPath: "lib/auth.ts",
    clientPath: "lib/auth-client.ts",
    databaseAdapter: { name: "Drizzle", detail: "drizzleAdapter()" },
    methods: [
      { id: "email-password", label: "Email & Password", kind: "credential", enabled: true, detail: "Enabled · no email verification" },
      {
        id: "social",
        label: "Social Login",
        kind: "social",
        enabled: true,
        detail: "2 providers",
        providers: ["github", "google"],
      },
    ],
    socialProviders: ["github", "google"],
    plugins: [
      {
        id: "twoFactor",
        name: "Two-Factor (2FA)",
        category: "two-factor",
        side: "both",
        detectedServer: true,
        detectedClient: false,
        needsClient: true,
        clientMissing: true,
        description: "TOTP and OTP-based two-factor authentication.",
        docsUrl: "https://www.better-auth.com/docs/plugins/2fa",
        addsTables: ["twoFactor"],
      },
      {
        id: "organization",
        name: "Organization",
        category: "authorization",
        side: "both",
        detectedServer: true,
        detectedClient: true,
        needsClient: true,
        clientMissing: false,
        description: "Multi-tenant organizations, members, invitations and roles.",
        docsUrl: "https://www.better-auth.com/docs/plugins/organization",
        addsTables: ["organization", "member", "invitation"],
      },
      {
        id: "admin",
        name: "Admin",
        category: "authorization",
        side: "both",
        detectedServer: true,
        detectedClient: true,
        needsClient: true,
        clientMissing: false,
        description: "Admin APIs: user management, banning, impersonation, role checks.",
        docsUrl: "https://www.better-auth.com/docs/plugins/admin",
      },
      {
        id: "magicLink",
        name: "Magic Link",
        category: "passwordless",
        side: "both",
        detectedServer: true,
        detectedClient: true,
        needsClient: true,
        clientMissing: false,
        description: "Passwordless email magic-link sign-in.",
        docsUrl: "https://www.better-auth.com/docs/plugins/magic-link",
      },
      {
        id: "nextCookies",
        name: "Next.js Cookies",
        category: "integration",
        side: "server",
        detectedServer: true,
        detectedClient: false,
        needsClient: false,
        clientMissing: false,
        description: "Handles cookie setting inside Next.js server actions.",
        docsUrl: "https://www.better-auth.com/docs/integrations/next",
      },
    ],
    config: [
      { key: "secret", label: "Secret", value: "From environment", status: "ok" },
      {
        key: "baseURL",
        label: "Base URL",
        value: "Set",
        status: "ok",
      },
      { key: "trustedOrigins", label: "Trusted Origins", value: "Configured", status: "ok" },
      {
        key: "session",
        label: "Session lifetime",
        value: "7d",
        status: "ok",
        detail: "Cookie cache enabled",
      },
      { key: "rateLimit", label: "Rate limiting", value: "Default (prod only)", status: "info" },
      { key: "cookies", label: "Secure cookies", value: "Auto (prod)", status: "ok" },
    ],
    session: { expiresIn: 604800, updateAge: 86400, cookieCache: true },
    findings: [
      {
        id: "auth-client-twoFactor",
        severity: "medium",
        title: "Two-Factor (2FA) is missing its client plugin",
        detail:
          "The Two-Factor server plugin is registered but no matching client plugin was found in lib/auth-client.ts. Its client actions won't be available.",
        recommendation: "Add twoFactorClient() to createAuthClient({ plugins: [...] }).",
        filePath: "lib/auth.ts",
        docsUrl: "https://www.better-auth.com/docs/plugins/2fa",
      },
      {
        id: "auth-email-verif",
        severity: "medium",
        title: "Email verification not required",
        detail:
          "Email & password sign-in is enabled but accounts can be created without verifying ownership of the email address.",
        recommendation:
          "Set emailAndPassword.requireEmailVerification = true and wire up emailVerification.sendVerificationEmail.",
        filePath: "lib/auth.ts",
        docsUrl: "https://www.better-auth.com/docs/authentication/email-password",
      },
      {
        id: "auth-migrations",
        severity: "info",
        title: "Plugins add database tables",
        detail:
          "Two-Factor (2FA), Organization extend the schema with new tables. Make sure migrations were generated and applied.",
        recommendation: "Run `npx @better-auth/cli generate` then your migration tool to sync the schema.",
        filePath: "lib/auth.ts",
        docsUrl: "https://www.better-auth.com/docs/concepts/database",
      },
    ],
    counts: { plugins: 5, methods: 2, providers: 2, findings: 3 },
  },

  api: {
    present: true,
    style: "Next.js App Router · Server Actions",
    endpoints: [
      {
        id: "api-1",
        method: "POST",
        path: "/api/checkout",
        kind: "next-app",
        filePath: "app/api/checkout/route.ts",
        line: 12,
        handler: "POST",
        dynamic: false,
        flags: { auth: false, validation: false, database: true, env: true, errorHandling: false, inputs: true },
        findings: [
          {
            id: "api-1-auth",
            severity: "high",
            kind: "no-auth",
            title: "Mutation without auth check",
            detail: "This POST handler changes state but no session/user lookup was detected.",
            recommendation: "Verify the caller's session before mutating data, or confirm the route is intentionally public.",
          },
          {
            id: "api-1-valid",
            severity: "medium",
            kind: "no-validation",
            title: "Request body not validated",
            detail: "The handler reads request input but no schema validation (zod/yup/valibot) was found.",
            recommendation: "Validate and parse the request body with a schema before using it.",
          },
        ],
      },
      {
        id: "api-2",
        method: "GET",
        path: "/api/products/[id]",
        kind: "next-app",
        filePath: "app/api/products/[id]/route.ts",
        line: 8,
        handler: "GET",
        dynamic: true,
        flags: { auth: false, validation: true, database: true, env: false, errorHandling: true, inputs: true },
        findings: [],
      },
      {
        id: "api-3",
        method: "DELETE",
        path: "/api/products/[id]",
        kind: "next-app",
        filePath: "app/api/products/[id]/route.ts",
        line: 31,
        handler: "DELETE",
        dynamic: true,
        flags: { auth: true, validation: false, database: true, env: false, errorHandling: true, inputs: true },
        findings: [],
      },
      {
        id: "api-4",
        method: "GET",
        path: "/api/users",
        kind: "next-app",
        filePath: "app/api/users/route.ts",
        line: 6,
        handler: "GET",
        dynamic: false,
        flags: { auth: true, validation: false, database: true, env: false, errorHandling: true, inputs: false },
        findings: [],
      },
      {
        id: "api-5",
        method: "POST",
        path: "/api/webhooks/stripe",
        kind: "next-app",
        filePath: "app/api/webhooks/stripe/route.ts",
        line: 14,
        handler: "POST",
        dynamic: false,
        flags: { auth: false, validation: false, database: true, env: true, errorHandling: true, inputs: true },
        findings: [
          {
            id: "api-5-valid",
            severity: "medium",
            kind: "no-validation",
            title: "Request body not validated",
            detail: "The handler reads request input but no schema validation was found. Verify the webhook signature.",
            recommendation: "Verify the Stripe signature header before trusting the payload.",
          },
        ],
      },
      {
        id: "api-6",
        method: "POST",
        path: "/updateProfile",
        kind: "next-action",
        filePath: "app/actions/profile.ts",
        line: 9,
        handler: "updateProfile",
        dynamic: false,
        flags: { auth: true, validation: true, database: true, env: false, errorHandling: true, inputs: true },
        findings: [],
      },
      {
        id: "api-7",
        method: "GET",
        path: "/api/health",
        kind: "next-app",
        filePath: "app/api/health/route.ts",
        line: 3,
        handler: "GET",
        dynamic: false,
        flags: { auth: false, validation: false, database: false, env: false, errorHandling: false, inputs: false },
        findings: [],
      },
    ],
    groups: [
      {
        segment: "api",
        endpoints: [],
      },
      {
        segment: "updateProfile",
        endpoints: [],
      },
    ],
    methodCounts: [
      { method: "GET", count: 3 },
      { method: "POST", count: 3 },
      { method: "DELETE", count: 1 },
    ],
    findings: [
      {
        id: "api-1-auth",
        severity: "high",
        kind: "no-auth",
        title: "Mutation without auth check",
        detail: "POST /api/checkout changes state but no session/user lookup was detected.",
        recommendation: "Verify the caller's session before mutating data, or confirm the route is intentionally public.",
      },
      {
        id: "api-1-valid",
        severity: "medium",
        kind: "no-validation",
        title: "Request body not validated",
        detail: "POST /api/checkout reads request input but no schema validation was found.",
        recommendation: "Validate and parse the request body with a schema before using it.",
      },
      {
        id: "api-5-valid",
        severity: "medium",
        kind: "no-validation",
        title: "Request body not validated",
        detail: "POST /api/webhooks/stripe reads input without validation. Verify the webhook signature.",
        recommendation: "Verify the Stripe signature header before trusting the payload.",
      },
    ],
    counts: { endpoints: 7, dynamic: 2, mutations: 4, protected: 3, validated: 2, findings: 3 },
  },

  accessibility: {
    score: 74,
    passes: 96,
    incomplete: 5,
    counts: { critical: 1, serious: 3, moderate: 2, minor: 2 },
    byPrinciple: [
      { principle: "Perceivable", count: 4 },
      { principle: "Operable", count: 2 },
      { principle: "Understandable", count: 1 },
      { principle: "Robust", count: 1 },
    ],
    violations: [
      {
        id: "a11y1",
        rule: "color-contrast",
        impact: "serious",
        principle: "Perceivable",
        wcag: ["1.4.3", "WCAG 2.1 AA"],
        description: "Elements must meet minimum color contrast ratio thresholds",
        help: "Text contrast of 3.8:1 is below the 4.5:1 minimum for normal text.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/color-contrast",
        filePath: "components/marketing/hero.tsx",
        line: 42,
        selector: ".hero-subtitle",
        nodes: 6,
        recommendation: "Darken the muted foreground token or increase font weight/size to reach 4.5:1.",
        snippet: {
          startLine: 42,
          code: '<p className="hero-subtitle text-muted-foreground/70">Ship better code, faster</p>',
        },
      },
      {
        id: "a11y2",
        rule: "image-alt",
        impact: "critical",
        principle: "Perceivable",
        wcag: ["1.1.1", "WCAG 2.0 A"],
        description: "Images must have alternate text",
        help: "3 <img> elements have no alt attribute, so screen readers announce only the file name.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/image-alt",
        filePath: "components/product/gallery.tsx",
        line: 28,
        selector: "img.thumb",
        nodes: 3,
        recommendation: "Add descriptive alt text, or alt=\"\" for purely decorative images.",
        snippet: {
          startLine: 28,
          code: "<img src={thumb.src} className=\"thumb\" />",
        },
      },
      {
        id: "a11y3",
        rule: "button-name",
        impact: "critical",
        principle: "Robust",
        wcag: ["4.1.2", "WCAG 2.0 A"],
        description: "Buttons must have discernible text",
        help: "Icon-only buttons have no accessible name for assistive technology.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/button-name",
        filePath: "components/dashboard/toolbar.tsx",
        line: 64,
        selector: "button.icon-btn",
        nodes: 4,
        recommendation: "Add aria-label or visually-hidden text describing the action.",
        snippet: {
          startLine: 64,
          code: '<button className="icon-btn"><Trash className="size-4" /></button>',
        },
      },
      {
        id: "a11y4",
        rule: "label",
        impact: "serious",
        principle: "Perceivable",
        wcag: ["1.3.1", "4.1.2", "WCAG 2.0 A"],
        description: "Form elements must have labels",
        help: "The search input has placeholder text but no associated <label>.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/label",
        filePath: "components/search/search-bar.tsx",
        line: 17,
        selector: "input[type=search]",
        nodes: 1,
        recommendation: "Associate a <label htmlFor> or add aria-label to the input.",
        snippet: {
          startLine: 17,
          code: '<input type="search" placeholder="Search…" />',
        },
      },
      {
        id: "a11y5",
        rule: "link-name",
        impact: "serious",
        principle: "Operable",
        wcag: ["2.4.4", "4.1.2", "WCAG 2.0 A"],
        description: "Links must have discernible text",
        help: '2 "Read more" links share identical text with no context, ambiguous out of order.',
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/link-name",
        filePath: "components/blog/post-card.tsx",
        line: 53,
        selector: "a.read-more",
        nodes: 2,
        recommendation: "Add an aria-label that includes the post title, e.g. \"Read more about …\".",
      },
      {
        id: "a11y6",
        rule: "heading-order",
        impact: "moderate",
        principle: "Perceivable",
        wcag: ["1.3.1"],
        description: "Heading levels should only increase by one",
        help: "The page jumps from <h2> to <h4>, skipping <h3> and breaking the outline.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/heading-order",
        filePath: "app/docs/page.tsx",
        line: 88,
        selector: "h4",
        nodes: 1,
        recommendation: "Use sequential heading levels so assistive tech can build a correct outline.",
      },
      {
        id: "a11y7",
        rule: "aria-required-attr",
        impact: "moderate",
        principle: "Robust",
        wcag: ["4.1.2"],
        description: "Required ARIA attributes must be provided",
        help: 'A role="switch" element is missing aria-checked.',
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/aria-required-attr",
        filePath: "components/settings/toggle.tsx",
        line: 12,
        selector: '[role=switch]',
        nodes: 1,
        recommendation: "Add aria-checked reflecting the current state, or use a native checkbox.",
      },
      {
        id: "a11y8",
        rule: "tabindex",
        impact: "minor",
        principle: "Operable",
        wcag: ["2.4.3"],
        description: "Avoid positive tabindex values",
        help: "tabindex={3} forces a non-DOM focus order that confuses keyboard users.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/tabindex",
        filePath: "components/checkout/form.tsx",
        line: 31,
        selector: "input[name=zip]",
        nodes: 1,
        recommendation: "Remove positive tabindex and rely on natural DOM order.",
      },
      {
        id: "a11y9",
        rule: "html-has-lang",
        impact: "minor",
        principle: "Understandable",
        wcag: ["3.1.1", "WCAG 2.0 A"],
        description: "The <html> element must have a lang attribute",
        help: "No lang attribute means screen readers can't pick the correct pronunciation.",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.8/html-has-lang",
        filePath: "app/layout.tsx",
        line: 22,
        selector: "html",
        nodes: 1,
        recommendation: 'Add lang="en" (or the appropriate locale) to the <html> tag.',
        snippet: { startLine: 22, code: "<html className=\"bg-background\">" },
      },
    ],
  },

  performance: {
    score: 68,
    totalBundleKb: 312,
    counts: { findings: 7 },
    vitals: [
      { id: "LCP", label: "Largest Contentful Paint", value: 3.4, unit: "s", rating: "needs-improvement", threshold: { good: 2.5, poor: 4.0 } },
      { id: "INP", label: "Interaction to Next Paint", value: 290, unit: "ms", rating: "needs-improvement", threshold: { good: 200, poor: 500 } },
      { id: "CLS", label: "Cumulative Layout Shift", value: 0.21, unit: "", rating: "poor", threshold: { good: 0.1, poor: 0.25 } },
      { id: "FCP", label: "First Contentful Paint", value: 1.6, unit: "s", rating: "good", threshold: { good: 1.8, poor: 3.0 } },
      { id: "TTFB", label: "Time to First Byte", value: 0.7, unit: "s", rating: "good", threshold: { good: 0.8, poor: 1.8 } },
    ],
    bundles: [
      { route: "/", sizeKb: 142, firstLoadKb: 312, rating: "poor" },
      { route: "/dashboard", sizeKb: 98, firstLoadKb: 268, rating: "needs-improvement" },
      { route: "/products/[id]", sizeKb: 64, firstLoadKb: 234, rating: "needs-improvement" },
      { route: "/blog/[slug]", sizeKb: 38, firstLoadKb: 208, rating: "good" },
      { route: "/login", sizeKb: 21, firstLoadKb: 191, rating: "good" },
    ],
    findings: [
      {
        id: "perf1",
        kind: "large-dependency",
        severity: "high",
        title: "moment.js adds 144 KB to the homepage bundle",
        detail: "moment is imported on the landing page for a single date format. It ships all locales and is not tree-shakeable.",
        filePath: "components/marketing/hero.tsx",
        line: 4,
        recommendation: "Replace moment with date-fns or the native Intl.DateTimeFormat to cut ~140 KB.",
        estimatedSavingKb: 140,
        snippet: { startLine: 4, code: "import moment from 'moment'" },
      },
      {
        id: "perf2",
        kind: "unoptimized-image",
        severity: "high",
        title: "Hero image served as unoptimized 1.8 MB PNG",
        detail: "A raw <img> loads a 1.8 MB PNG above the fold, dominating LCP. next/image with responsive sizing is not used.",
        filePath: "components/marketing/hero.tsx",
        line: 51,
        recommendation: "Use next/image with priority and a modern format (AVIF/WebP) plus width/height to reserve space.",
        estimatedSavingKb: 1600,
        snippet: { startLine: 51, code: '<img src="/hero.png" className="w-full" />' },
      },
      {
        id: "perf3",
        kind: "layout-shift",
        severity: "high",
        title: "Web font swap causes 0.21 CLS",
        detail: "A late-loading web font without size-adjust reflows the hero text, contributing most of the page's layout shift.",
        filePath: "app/layout.tsx",
        line: 8,
        recommendation: "Use next/font (self-hosted, with font-display: swap and metric overrides) to eliminate the shift.",
        estimatedSavingKb: 0,
      },
      {
        id: "perf4",
        kind: "no-code-split",
        severity: "medium",
        title: "Charts library loaded eagerly on every route",
        detail: "recharts (78 KB) is imported in a shared layout, so it ships even on routes that render no charts.",
        filePath: "components/layout/shell.tsx",
        line: 11,
        recommendation: "Lazy-load the chart components with next/dynamic and ssr: false.",
        estimatedSavingKb: 78,
        snippet: { startLine: 11, code: "import { AreaChart } from '@/components/charts'" },
      },
      {
        id: "perf5",
        kind: "render-blocking",
        severity: "medium",
        title: "Synchronous third-party analytics script",
        detail: "A blocking <script> for analytics sits in the document head and delays first paint by ~180 ms.",
        filePath: "app/layout.tsx",
        line: 30,
        recommendation: 'Load it with next/script using strategy="afterInteractive" or "lazyOnload".',
        estimatedSavingKb: 0,
        snippet: { startLine: 30, code: '<script src="https://cdn.analytics.example/a.js"></script>' },
      },
      {
        id: "perf6",
        kind: "no-memo",
        severity: "low",
        title: "Expensive list re-renders on every keystroke",
        detail: "The product grid re-sorts 800 items on each parent render because the computation isn't memoized.",
        filePath: "components/product/grid.tsx",
        line: 22,
        recommendation: "Wrap the sort in useMemo keyed on the input list and sort order.",
        estimatedSavingKb: 0,
        snippet: { startLine: 22, code: "const sorted = products.slice().sort(compare)" },
      },
      {
        id: "perf7",
        kind: "duplicate-dependency",
        severity: "low",
        title: "Two versions of date utilities bundled",
        detail: "Both moment and dayjs resolve into the client bundle through different dependencies, duplicating ~12 KB.",
        filePath: "package.json",
        line: 1,
        recommendation: "Standardize on a single date library and dedupe the lockfile.",
        estimatedSavingKb: 12,
      },
    ],
  },

  tests: {
    framework: "Vitest",
    coverage: { lines: 62, functions: 58, branches: 49, statements: 63 },
    counts: { total: 184, passed: 171, failed: 5, skipped: 8, suites: 24, durationMs: 14820 },
    suites: [
      {
        id: "ts1",
        name: "cart.test.ts",
        filePath: "lib/__tests__/cart.test.ts",
        total: 22,
        passed: 20,
        failed: 2,
        skipped: 0,
        durationMs: 1840,
        status: "failed",
        tests: [
          { name: "should add item to cart", fullName: "Cart › should add item to cart", status: "passed", durationMs: 45, line: 12, assertions: ["cart.items.length === 1", "cart.total > 0"] },
          { name: "should apply discount before tax", fullName: "Cart › should apply discount before tax", status: "failed", durationMs: 85, line: 48, error: "Expected 90.00 but received 100.00", expected: "90.00", actual: "100.00", assertions: ["cart.subtotal === 90.00"] },
          { name: "should calculate tax correctly", fullName: "Cart › should calculate tax correctly", status: "passed", durationMs: 32, line: 68, assertions: ["tax === 9.00", "total === 99.00"] },
          { name: "should remove item from cart", fullName: "Cart › should remove item from cart", status: "failed", durationMs: 28, line: 82, error: "Item not found in cart", assertions: ["cart.items.length === 0"] },
        ],
      },
      { id: "ts2", name: "checkout.test.tsx", filePath: "components/__tests__/checkout.test.tsx", total: 18, passed: 15, failed: 1, skipped: 2, durationMs: 3120, status: "failed" },
      {
        id: "ts3",
        name: "auth.test.ts",
        filePath: "lib/__tests__/auth.test.ts",
        total: 14,
        passed: 12,
        failed: 2,
        skipped: 0,
        durationMs: 990,
        status: "failed",
        tests: [
          { name: "should hash password", status: "passed", durationMs: 28, line: 15, assertions: ["hash !== password", "hash.length > 10"] },
          { name: "should verify valid session", status: "passed", durationMs: 32, line: 31, assertions: ["session.userId === '123'", "session.valid === true"] },
          { name: "should reject expired token", status: "failed", durationMs: 18, line: 71, error: "Expected session to be invalid but got valid", assertions: ["session.valid === false"] },
          { name: "should validate jwt signature", status: "failed", durationMs: 22, line: 85, error: "Invalid signature accepted", assertions: ["verifyToken().valid === false"] },
        ],
      },
      { id: "ts4", name: "money.test.ts", filePath: "lib/__tests__/money.test.ts", total: 31, passed: 31, failed: 0, skipped: 0, durationMs: 210, status: "passed" },
      { id: "ts5", name: "api.test.ts", filePath: "lib/__tests__/api.test.ts", total: 26, passed: 24, failed: 0, skipped: 2, durationMs: 2670, status: "passed" },
      { id: "ts6", name: "utils.test.ts", filePath: "lib/__tests__/utils.test.ts", total: 19, passed: 19, failed: 0, skipped: 0, durationMs: 140, status: "passed" },
      { id: "ts7", name: "orders.test.ts", filePath: "lib/__tests__/orders.test.ts", total: 16, passed: 14, failed: 0, skipped: 2, durationMs: 1520, status: "passed" },
      { id: "ts8", name: "search.test.tsx", filePath: "components/__tests__/search.test.tsx", total: 38, passed: 36, failed: 0, skipped: 2, durationMs: 4330, status: "passed" },
    ],
    findings: [
      {
        id: "test1",
        kind: "failing",
        severity: "high",
        title: "cart applies discount before tax incorrectly",
        detail: "Expected subtotal 90.00 after a 10% discount on 100.00, received 100.00. The discount is applied after tax instead of before.",
        filePath: "lib/__tests__/cart.test.ts",
        line: 48,
        recommendation: "Fix the order of operations in applyDiscount() so percentage discounts run on the pre-tax subtotal.",
        snippet: { startLine: 46, code: "  expect(cart.subtotal).toBe(90.0)\n  // Received: 100.0\n  const cart = applyDiscount(base, { kind: 'percent', amount: 10 })" },
      },
      {
        id: "test2",
        kind: "failing",
        severity: "high",
        title: "auth: expired token is treated as valid",
        detail: "verifySession() returns the user for a token whose exp is in the past, a security-relevant test failure.",
        filePath: "lib/__tests__/auth.test.ts",
        line: 71,
        recommendation: "Compare exp against Date.now() in seconds and reject expired tokens before returning the session.",
      },
      {
        id: "test3",
        kind: "flaky",
        severity: "medium",
        title: "checkout test fails intermittently (~18% of runs)",
        detail: "The Stripe redirect assertion depends on an un-awaited promise, so it passes or fails based on timing.",
        filePath: "components/__tests__/checkout.test.tsx",
        line: 102,
        recommendation: "Await the navigation and use findBy* queries instead of getBy* to wait for async UI.",
      },
      {
        id: "test4",
        kind: "slow",
        severity: "low",
        title: "search suite takes 4.3 s",
        detail: "search.test.tsx renders the full results page 38 times without mocking the network layer.",
        filePath: "components/__tests__/search.test.tsx",
        line: 1,
        recommendation: "Mock the fetch layer and share a render setup to cut suite time substantially.",
      },
      {
        id: "test5",
        kind: "uncovered",
        severity: "medium",
        title: "Payment webhook handler has 0% coverage",
        detail: "app/api/webhooks/stripe/route.ts contains signature verification and order fulfillment logic with no tests.",
        filePath: "app/api/webhooks/stripe/route.ts",
        line: 1,
        recommendation: "Add tests for valid/invalid signatures and idempotent fulfillment before relying on it in production.",
      },
      {
        id: "test6",
        kind: "no-tests",
        severity: "low",
        title: "Discount engine has no test file",
        detail: "lib/discount.ts implements stacking rules and edge cases but has no corresponding test suite.",
        filePath: "lib/discount.ts",
        line: 1,
        recommendation: "Create lib/__tests__/discount.test.ts covering stacking, caps, and expiry.",
      },
    ],
    files: [
      { filePath: "app/api/webhooks/stripe/route.ts", lines: 0, functions: 0, branches: 0, statements: 0, uncoveredLines: [1, 2, 3, 4, 5] },
      { filePath: "lib/discount.ts", lines: 0, functions: 0, branches: 0, statements: 0 },
      { filePath: "lib/orders.ts", lines: 34, functions: 40, branches: 22, statements: 36, uncoveredLines: [45, 46, 51, 62, 78] },
      { filePath: "components/checkout/form.tsx", lines: 41, functions: 50, branches: 30, statements: 44 },
      { filePath: "lib/cart.ts", lines: 58, functions: 62, branches: 44, statements: 60 },
      { filePath: "lib/auth.ts", lines: 67, functions: 70, branches: 55, statements: 68 },
      { filePath: "lib/api.ts", lines: 81, functions: 85, branches: 72, statements: 83 },
      { filePath: "lib/money.ts", lines: 98, functions: 100, branches: 94, statements: 98 },
    ],
  },
}
