/**
 * Client-side mirror of the JSON the CodeLens CLI emits (see cli/src/types.ts).
 * The dashboard renders against these types whether data comes from live
 * WebSocket events or the bundled mock fixture.
 */

export type Severity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info"
  | "error"
  | "warning"

export interface ProjectInfo {
  root: string
  framework: string
  packageManager: "npm" | "pnpm" | "yarn" | "bun"
  hasTypeScript: boolean
  hasLintScript: boolean
}

export interface LintMessage {
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
  severity: "error" | "warning"
  ruleId: string | null
  message: string
  fixable: boolean
  /** Optional source snippet for inline preview (lines around the issue). */
  snippet?: { startLine: number; code: string }
}

export interface LintResult {
  messages: LintMessage[]
  errorCount: number
  warningCount: number
  fixableCount: number
  unavailable?: boolean
  note?: string
}

export interface TypeDiagnostic {
  filePath: string
  line: number
  column: number
  code: string
  message: string
  related: { message: string; depth: number }[]
}

export interface TypeCheckResult {
  diagnostics: TypeDiagnostic[]
  unavailable?: boolean
  note?: string
}

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
  suggestedFix?: string
  confidence: number
  reference?: string
  snippet?: { startLine: number; code: string }
}

export interface DependencyVuln {
  name: string
  currentVersion: string
  dependencyType: "direct" | "transitive" | "dev"
  severity: "critical" | "high" | "medium" | "low" | "info"
  title: string
  cves: string[]
  fixedIn?: string
  impact?: string
}

export interface SecurityResult {
  findings: SecurityFinding[]
  dependencies: DependencyVuln[]
  skipped?: boolean
}

export interface HealthScore {
  score: number
  grade: "A+" | "A" | "B" | "C" | "D" | "F"
  breakdown: { lint: number; types: number; security: number }
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

export interface TrendPoint {
  runId: string
  timestamp: string
  score: number
  lintErrors: number
  lintWarnings: number
  typeErrors: number
  securityFindings: number
}

export type RunPhase = "detect" | "lint" | "types" | "deps" | "security"
export type PhaseStatus = "idle" | "running" | "done" | "skipped"
