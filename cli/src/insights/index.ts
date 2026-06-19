import { ScanContext } from "./scan.js"
import { collectEnv } from "./env.js"
import { collectNetwork } from "./network.js"
import { collectGit } from "./git.js"
import { collectSetup } from "./setup.js"
import { collectDocs } from "./docs.js"
import { collectDatabase } from "./database.js"
import { collectAuth } from "./auth.js"
import { collectApi } from "./api.js"
import { collectAccessibility } from "./accessibility.js"
import { collectPerformance } from "./performance.js"
import { collectTests } from "./tests.js"
import { collectTypeDefinitions } from "./typedefs.js"
import type { ProjectInsights, TypeDefinition } from "../types.js"

export { ScanContext } from "./scan.js"
export { collectTypeDefinitions } from "./typedefs.js"

export interface InsightsBundle {
  insights: ProjectInsights
  /** Declared types, merged into report.types.definitions by the caller. */
  typeDefinitions: TypeDefinition[]
}

/**
 * Runs every project-intelligence collector against a single shared scan of
 * the project. Collectors are independent, so they run concurrently; a failure
 * in one collector is isolated and falls back to an empty result for that
 * surface rather than failing the whole run.
 *
 * The scan is created once by the caller and shared with the dependency-graph
 * builder so the filesystem is walked a single time per analysis.
 */
export async function collectInsights(
  scan: ScanContext,
  onProgress?: (label: string) => void,
): Promise<InsightsBundle> {
  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      const result = await fn()
      onProgress?.(label)
      return result
    } catch (err) {
      onProgress?.(`${label} (failed)`)
      if (process.env.CODELENS_DEBUG) {
        console.error(`[codelens] insight "${label}" failed:`, err)
      }
      return fallback
    }
  }

  const [env, network, git, setup, docs, database, auth, api, accessibility, performance, tests, typeDefinitions] =
    await Promise.all([
      safe("env", () => collectEnv(scan), emptyEnv()),
      safe("network", () => collectNetwork(scan), emptyNetwork()),
      safe("git", () => collectGit(scan), emptyGit()),
      safe("setup", () => collectSetup(scan), emptySetup()),
      safe("docs", () => collectDocs(scan), emptyDocs()),
      safe("database", () => collectDatabase(scan), emptyDb()),
      safe("auth", () => collectAuth(scan), emptyAuth()),
      safe("api", () => collectApi(scan), emptyApi()),
      safe("accessibility", () => collectAccessibility(scan), emptyA11y()),
      safe("performance", () => collectPerformance(scan), emptyPerf()),
      safe("tests", () => collectTests(scan), emptyTests()),
      safe("types", () => collectTypeDefinitions(scan), [] as TypeDefinition[]),
    ])

  return {
    insights: { env, network, git, setup, docs, database, auth, api, accessibility, performance, tests },
    typeDefinitions,
  }
}

/* ----------------------------- Empty fallbacks ---------------------------- */

function emptyEnv(): ProjectInsights["env"] {
  return { files: [], variables: [], counts: { total: 0, client: 0, server: 0, issues: 0 } }
}
function emptyNetwork(): ProjectInsights["network"] {
  return { calls: [], domains: [], counts: { total: 0, external: 0, insecure: 0, issues: 0 } }
}
function emptyGit(): ProjectInsights["git"] {
  return {
    state: {
      branch: "—",
      defaultBranch: "main",
      ahead: 0,
      behind: 0,
      remote: "",
      remoteInfo: undefined,
      lastCommit: { hash: "", message: "unavailable", author: "—", relative: "—" },
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
  }
}
function emptySetup(): ProjectInsights["setup"] {
  return {
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
  }
}
function emptyDocs(): ProjectInsights["docs"] {
  return {
    score: 0,
    grade: "F",
    band: "poor",
    agentReady: false,
    agentScore: 0,
    liveUrl: null,
    standards: [],
    documents: [],
  }
}
function emptyDb(): ProjectInsights["database"] {
  return { connections: [], findings: [], queries: [], counts: { connections: 0, collections: 0, findings: 0, slowQueries: 0 } }
}
function emptyAuth(): ProjectInsights["auth"] {
  return {
    present: false,
    methods: [],
    socialProviders: [],
    plugins: [],
    config: [],
    session: {},
    findings: [],
    counts: { plugins: 0, methods: 0, providers: 0, findings: 0 },
  }
}
function emptyApi(): ProjectInsights["api"] {
  return {
    present: false,
    endpoints: [],
    groups: [],
    methodCounts: [],
    findings: [],
    counts: { endpoints: 0, dynamic: 0, mutations: 0, protected: 0, validated: 0, findings: 0 },
  }
}
function emptyA11y(): ProjectInsights["accessibility"] {
  return {
    score: 100,
    violations: [],
    passes: 0,
    incomplete: 0,
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    byPrinciple: [],
  }
}
function emptyPerf(): ProjectInsights["performance"] {
  return { score: 100, vitals: [], bundles: [], findings: [], totalBundleKb: 0, counts: { findings: 0 } }
}
function emptyTests(): ProjectInsights["tests"] {
  return {
    framework: "none",
    coverage: { lines: 0, functions: 0, branches: 0, statements: 0 },
    suites: [],
    findings: [],
    files: [],
    counts: { total: 0, passed: 0, failed: 0, skipped: 0, suites: 0, durationMs: 0 },
  }
}
