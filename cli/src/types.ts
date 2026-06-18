/**
 * Shared types for the CodeLens CLI engine.
 * The JSON shape produced here is what the dashboard consumes (see
 * `lib/schema.ts` in the dashboard package for the mirrored client types).
 */

export type Severity =
  | "error"
  | "warning"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

export interface ProjectInfo {
  /** Absolute project root. */
  root: string
  /** Detected framework label, e.g. "Next.js", "SvelteKit", "Vue", "Node". */
  framework: string
  packageManager: PackageManager
  hasTypeScript: boolean
  /** Whether package.json defines a `lint` script. */
  hasLintScript: boolean
}

/* ---------------------------------- Lint ---------------------------------- */

export interface LintMessage {
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  severity: "error" | "warning"
  ruleId: string | null
  message: string
  /** True when ESLint can auto-fix this with `--fix`. */
  fixable: boolean
}

export interface LintResult {
  messages: LintMessage[]
  errorCount: number
  warningCount: number
  fixableCount: number
  /** True when the runner could not execute (e.g. no ESLint installed). */
  unavailable?: boolean
  note?: string
}

/* ------------------------------- Type-check ------------------------------- */

export interface TypeDiagnostic {
  filePath: string
  line: number
  column: number
  code: string
  message: string
  /** Nested "related information" chain (the assignability tree). */
  related: { message: string; depth: number }[]
}

export interface TypeCheckResult {
  diagnostics: TypeDiagnostic[]
  unavailable?: boolean
  note?: string
}

/* -------------------------------- Security -------------------------------- */

export type SecurityCategory =
  | "injection"
  | "secrets"
  | "auth"
  | "xss"
  | "ssrf"
  | "crypto"
  | "config"
  | "data-exposure"
  | "other"

export interface SecurityFinding {
  id: string
  title: string
  severity: "critical" | "high" | "medium" | "low" | "info"
  category: SecurityCategory
  filePath: string
  line: number
  endLine?: number
  description: string
  recommendation: string
  /** Unified-diff style fix when the model can produce one. */
  suggestedFix?: string
  confidence: number
  reference?: string
}

export interface DependencyVuln {
  name: string
  currentVersion: string
  dependencyType: "direct" | "transitive" | "dev"
  severity: "critical" | "high" | "medium" | "low" | "info"
  title: string
  cves: string[]
  /** Recommended version/range to upgrade to, when known. */
  fixedIn?: string
  /** AI-written real-world impact summary (added by the prioritization pass). */
  impact?: string
}

export interface SecurityResult {
  findings: SecurityFinding[]
  dependencies: DependencyVuln[]
  /** True when the AI pass was skipped (no key / --no-ai). */
  skipped?: boolean
}

/* --------------------------------- Report --------------------------------- */

export interface HealthScore {
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  breakdown: {
    lint: number
    types: number
    security: number
  }
}

export interface RunMeta {
  id: string
  cwd: string
  project: ProjectInfo
  startedAt: string
  finishedAt: string
  durationMs: number
  aiEnabled: boolean
}

export interface AnalysisReport {
  meta: RunMeta
  health: HealthScore
  lint: LintResult
  types: TypeCheckResult
  security: SecurityResult
}

/* --------------------------------- Trends --------------------------------- */

export interface TrendPoint {
  runId: string
  timestamp: string
  score: number
  lintErrors: number
  lintWarnings: number
  typeErrors: number
  securityFindings: number
}

/* ---------------------------- Streaming events ---------------------------- */

export type RunPhase = "detect" | "lint" | "types" | "deps" | "security"

export type RunEvent =
  | {
      type: "phase"
      phase: RunPhase
      status: "running" | "done" | "skipped"
      project?: ProjectInfo
      lint?: LintResult
      types?: TypeCheckResult
      security?: SecurityResult
    }
  | { type: "report"; report: AnalysisReport }
