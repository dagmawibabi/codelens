/**
 * Engine-side types for the extended project intelligence the CLI collects
 * beyond lint/types/security/deps: environment variables, network calls,
 * git + CI/CD state, project setup, documentation, database, accessibility,
 * performance, and tests.
 *
 * These MUST stay in sync with the dashboard's `lib/project-insights.ts`,
 * which mirrors this shape on the client.
 */
import type { Severity } from "./types.js"

/* ------------------------------------------------------------------ */
/* Environment variables                                               */
/* ------------------------------------------------------------------ */

export type EnvScope = "client" | "server"

export type EnvStatus = "ok" | "missing" | "undocumented" | "unused" | "exposed" | "empty"

export interface EnvVariable {
  key: string
  scope: EnvScope
  status: EnvStatus
  severity: Severity
  usedIn: string[]
  definedIn: string[]
  note: string
  sample?: string
  /** Raw, unmasked value parsed from the local env file. Read only from the
   *  developer's own machine and revealed behind an explicit toggle. */
  value?: string
  /** Per-file values so the UI can compare .env.local vs .env.example, etc. */
  values?: { file: string; value: string | null }[]
}

export interface EnvResult {
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
  fullHash?: string
  email?: string
  date?: string
  body?: string
  files?: GitFileChange[]
  insertions?: number
  deletions?: number
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
  ahead?: number
  behind?: number
  tip?: string
  subject?: string
  author?: string
  merged?: boolean
}

export interface GitTag {
  name: string
  commit?: string
  relative?: string
  date?: string
  message?: string
  tagger?: string
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
  tagDetails?: GitTag[]
  /** Git-ignored files: total count plus a sample for display. */
  ignored: { count: number; samples: string[] }
  /** Number of stash entries. */
  stashes: number
  changes: GitFileChange[]
  staged: number
  contributors: number
  totalCommits: number
  firstCommitRelative?: string
  trackedFiles?: number
  topContributors?: { name: string; commits: number }[]
}

export type CiStatus = "passing" | "failing" | "no-runs" | "disabled"

export interface CiStep {
  name: string
  uses?: string
  run?: string
  condition?: string
  diagnostics?: string[]
}

export interface CiJob {
  name: string
  status: CiStatus
  durationMs?: number
  runsOn?: string
  needs?: string[]
  condition?: string
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
  concurrency?: string
  permissions?: string[]
  env?: string[]
  schedules?: string[]
  diagnosis?: {
    localCommand?: string
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
  summary: string
  highlights?: { label: string; value: string; good?: boolean }[]
  ruleCount?: number
}

export interface LanguageStat {
  language: string
  files: number
  loc: number
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
  commentRatio: number
  testRatio: number
  todoCount: number
}

export interface SetupResult {
  configs: ConfigEntry[]
  stats: WorkspaceStats
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
  detail: string
  weight: number
  group?: string
  agent: boolean
  fix?: string
}

export interface DocStandard {
  id: "vercel" | "llmstxt" | "farming" | "quality"
  label: string
  tagline: string
  source: string
  href: string
  score: number
  weight: number
  band: DocBand
  liveOnly?: boolean
  checks: DocCheck[]
}

export interface DocFile {
  name: string
  path: string
  present: boolean
  score: number
  words: number
  note: string
}

export interface DocsResult {
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  band: DocBand
  agentReady: boolean
  agentScore: number
  liveUrl: string | null
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

export type DbDetectionSource = "dependency" | "env" | "connection-string" | "schema-file" | "config"

export interface DbConnection {
  id: string
  engine: DbEngine
  name: string
  client: string
  host: string
  ssl: boolean
  pooled: boolean
  envVar: string
  collections: number
  filePath: string
  detectedVia?: DbDetectionSource
  scheme?: string
  schemaSource?: string
}

export type DbColumnFlag = "pk" | "fk" | "unique" | "index" | "nullable" | "default"

export interface DbColumn {
  name: string
  type: string
  flags: DbColumnFlag[]
  references?: string
  note?: string
}

export interface DbIndexInfo {
  name: string
  columns: string[]
  unique: boolean
}

export interface DbTable {
  name: string
  connectionId: string
  kind: "table" | "collection" | "view"
  columns: DbColumn[]
  indexes: DbIndexInfo[]
  rowCount: number
  sizeKb?: number
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
  snippet?: { startLine: number; code: string }
  target?: string
}

export interface DbQuery {
  id: string
  engine: DbEngine
  operation: string
  target: string
  filePath: string
  line: number
  estMs: number
  fullScan: boolean
  note: string
}

export interface DbResult {
  connections: DbConnection[]
  findings: DbFinding[]
  queries: DbQuery[]
  tables?: DbTable[]
  counts: { connections: number; collections: number; findings: number; slowQueries: number }
}

/* ------------------------------------------------------------------ */
/* Accessibility                                                       */
/* ------------------------------------------------------------------ */

export type A11yImpact = "critical" | "serious" | "moderate" | "minor"

export type WcagPrinciple = "Perceivable" | "Operable" | "Understandable" | "Robust"

export interface A11yViolation {
  id: string
  rule: string
  impact: A11yImpact
  principle: WcagPrinciple
  wcag: string[]
  description: string
  help: string
  helpUrl: string
  filePath: string
  line: number
  selector: string
  nodes: number
  recommendation: string
  snippet?: { startLine: number; code: string }
}

export interface A11yResult {
  score: number
  violations: A11yViolation[]
  passes: number
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
  threshold: { good: number; poor: number }
}

export interface BundleRoute {
  route: string
  sizeKb: number
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
  estimatedSavingKb?: number
  snippet?: { startLine: number; code: string }
}

export interface PerfResult {
  score: number
  vitals: WebVital[]
  bundles: BundleRoute[]
  findings: PerfFinding[]
  totalBundleKb: number
  counts: { findings: number }
}

/* ------------------------------------------------------------------ */
/* Tests & Coverage                                                    */
/* ------------------------------------------------------------------ */

export type TestStatus = "passed" | "failed" | "skipped"

export interface TestCase {
  name: string
  fullName?: string
  status: TestStatus
  durationMs?: number
  line?: number
  assertions?: string[]
  error?: string
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

/** A configured sign-in method (credentials, social, passwordless). */
export interface AuthMethod {
  id: string
  label: string
  kind: "credential" | "social" | "passwordless"
  enabled: boolean
  detail: string
  /** For social: the configured provider ids. */
  providers?: string[]
}

/** A detected Better Auth plugin, server and/or client side. */
export interface AuthPlugin {
  id: string
  name: string
  category: AuthPluginCategory
  /** Where this plugin is expected to live. */
  side: "server" | "client" | "both"
  detectedServer: boolean
  detectedClient: boolean
  /** Whether a matching client plugin is required for it to work. */
  needsClient: boolean
  /** True when the server plugin is present but its required client half isn't. */
  clientMissing: boolean
  description: string
  docsUrl: string
  /** Database tables/models this plugin adds (migration reminder). */
  addsTables?: string[]
}

/** A single resolved configuration value with an assessment. */
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
  /** Whether CodeLens can introspect this provider's config in depth. */
  deepSupport: boolean
}

export interface AuthResult {
  /** True when a supported auth library is a dependency. Gates the tab. */
  present: boolean
  /** Which auth library is in use. Undefined only when `present` is false. */
  provider?: AuthProviderInfo
  version?: string
  /** Framework integration in use (e.g. "Next.js"). */
  integration?: string
  /** Path to the server auth config, if found. */
  configPath?: string
  /** Path to the client auth setup, if found. */
  clientPath?: string
  /** Database adapter powering the auth library. */
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
  | "next-app"
  | "next-pages"
  | "next-action"
  | "express"
  | "hono"
  | "fastify"
  | "sveltekit"
  | "nuxt"
  | "other"

export interface ApiEndpointFlags {
  auth: boolean
  validation: boolean
  database: boolean
  env: boolean
  errorHandling: boolean
  inputs: boolean
}

export interface ApiEndpoint {
  id: string
  method: HttpMethod
  path: string
  kind: ApiRouteKind
  filePath: string
  line: number
  handler?: string
  flags: ApiEndpointFlags
  findings: ApiFinding[]
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
  segment: string
  endpoints: ApiEndpoint[]
}

export interface ApiResult {
  present: boolean
  style?: string
  endpoints: ApiEndpoint[]
  groups: ApiGroup[]
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
