import type { AnalysisReport } from "./schema"
import type { ProjectInsights } from "./project-insights"
import type { DashboardData } from "./use-dashboard-data"

/**
 * A fully-shaped but empty analysis result. Used as the dashboard's default
 * state before any run has happened: every surface is present (so panels never
 * crash) but contains zero findings / empty collections. The UI treats this as
 * "awaiting analysis" rather than rendering a misleading perfect score.
 */
export const EMPTY_REPORT: AnalysisReport = {
  meta: {
    id: "",
    cwd: "",
    project: {
      root: "",
      framework: "—",
      packageManager: "npm",
      hasTypeScript: false,
      hasLintScript: false,
    },
    startedAt: "",
    finishedAt: "",
    durationMs: 0,
    aiEnabled: false,
  },
  health: { score: 0, grade: "F", breakdown: { lint: 0, types: 0, security: 0 } },
  lint: { messages: [], errorCount: 0, warningCount: 0, fixableCount: 0 },
  types: { diagnostics: [], definitions: [] },
  security: { findings: [], dependencies: [], skipped: false },
  deps: {
    counts: { total: 0, direct: 0, dev: 0, transitive: 0 },
    findings: [],
    manifestPath: "",
    graph: { root: "", nodes: [] },
  },
}

export const EMPTY_INSIGHTS: ProjectInsights = {
  env: { files: [], variables: [], counts: { total: 0, client: 0, server: 0, issues: 0 } },
  network: { calls: [], domains: [], counts: { total: 0, external: 0, insecure: 0, issues: 0 } },
  git: {
    state: {
      branch: "",
      defaultBranch: "",
      ahead: 0,
      behind: 0,
      remote: "",
      remoteInfo: undefined,
      lastCommit: { hash: "", message: "", author: "", relative: "" },
      recentCommits: [],
      branches: [],
      tags: [],
      ignored: { count: 0, samples: [] },
      stashes: 0,
      changes: [],
      staged: 0,
      contributors: 0,
      totalCommits: 0,
    },
    issues: [],
    workflows: [],
  },
  setup: {
    configs: [],
    stats: {
      totalFiles: 0,
      totalLoc: 0,
      codeLoc: 0,
      commentLoc: 0,
      blankLoc: 0,
      testFiles: 0,
      testLoc: 0,
      components: 0,
      routes: 0,
      largestFiles: [],
      languages: [],
      commentRatio: 0,
      testRatio: 0,
      todoCount: 0,
    },
    tooling: [],
  },
  docs: {
    score: 0,
    grade: "F",
    band: "poor",
    agentReady: false,
    agentScore: 0,
    liveUrl: null,
    standards: [],
    documents: [],
  },
  database: {
    connections: [],
    findings: [],
    queries: [],
    counts: { connections: 0, collections: 0, findings: 0, slowQueries: 0 },
  },
  auth: {
    present: false,
    methods: [],
    socialProviders: [],
    plugins: [],
    config: [],
    session: {},
    findings: [],
    counts: { plugins: 0, methods: 0, providers: 0, findings: 0 },
  },
  api: {
    present: false,
    endpoints: [],
    groups: [],
    methodCounts: [],
    findings: [],
    counts: { endpoints: 0, dynamic: 0, mutations: 0, protected: 0, validated: 0, findings: 0 },
  },
  accessibility: {
    score: 0,
    violations: [],
    passes: 0,
    incomplete: 0,
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    byPrinciple: [],
  },
  performance: {
    score: 0,
    vitals: [],
    bundles: [],
    findings: [],
    totalBundleKb: 0,
    counts: { findings: 0 },
  },
  tests: {
    framework: "",
    coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
    suites: [],
    findings: [],
    files: [],
    counts: { total: 0, passed: 0, failed: 0, skipped: 0, suites: 0, durationMs: 0 },
  },
}

export const EMPTY_DATA: DashboardData = {
  report: EMPTY_REPORT,
  insights: EMPTY_INSIGHTS,
  history: [],
}
