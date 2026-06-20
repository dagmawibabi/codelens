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

export type TypeKind = "interface" | "type" | "enum" | "class" | "function"

/** A property/member of a declared type. */
export interface TypeMember {
  name: string
  type: string
  optional?: boolean
  readonly?: boolean
  /** Doc comment, if any. */
  doc?: string
}

/** A type/interface/enum declared in the project source. */
export interface TypeDefinition {
  id: string
  name: string
  kind: TypeKind
  filePath: string
  line: number
  /** Whether the symbol is exported. */
  exported: boolean
  /** Number of places this type is referenced across the codebase. */
  references: number
  /** Generic parameters, e.g. ["T", "K extends string"]. */
  generics?: string[]
  /** Types this one extends / implements / unions. */
  extendsFrom?: string[]
  members: TypeMember[]
  /** Raw declaration source for the detail view. */
  source: string
  /** Doc comment for the type itself. */
  doc?: string
}

export interface TypeCheckResult {
  diagnostics: TypeDiagnostic[]
  unavailable?: boolean
  note?: string
  /** Declared types discovered in the project, for the explorer. */
  definitions?: TypeDefinition[]
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

export type DependencyKind = "direct" | "dev" | "peer" | "transitive"

export type DependencyIssueKind =
  | "vulnerability"
  | "outdated"
  | "deprecated"
  | "unused"
  | "missing"
  | "license"

export interface DependencyFinding {
  id: string
  /** Package name. */
  name: string
  /** Installed version. */
  current: string
  /** Latest published version, when known. */
  latest?: string
  /** Where the dependency sits in the tree. */
  type: DependencyKind
  kind: DependencyIssueKind
  severity: Severity
  /** One-line summary of the issue. */
  title: string
  /** Expanded explanation of the problem and its impact. */
  detail: string
  /** What the developer should do about it. */
  recommendation?: string
  /** Version that resolves the issue (for vulns / outdated). */
  fixedIn?: string
  /** Associated CVE identifiers. */
  cves?: string[]
  /** SPDX license id, for license findings. */
  license?: string
  /** Files where the package is imported (for unused / missing). */
  usedIn?: string[]
  /** External reference (advisory, npm page, docs). */
  reference?: string
}

/** A node in the resolved dependency graph. */
export interface DependencyNode {
  /** Package name, unique per node. */
  id: string
  version: string
  type: DependencyKind
  /** Distance from the project root (0 = direct dependency). */
  depth: number
  /** Install size in KB, when known. */
  sizeKb?: number
  /** Names of packages this node directly depends on. */
  dependencies: string[]
  /** Whether this node has an associated finding. */
  flagged?: boolean
  /** Severity of the worst associated finding. */
  severity?: Severity
}

export interface DependencyGraph {
  /** Root project name. */
  root: string
  nodes: DependencyNode[]
}

export interface DependencyResult {
  counts: { total: number; direct: number; dev: number; transitive: number }
  findings: DependencyFinding[]
  /** The manifest file these findings were derived from. */
  manifestPath: string
  /** Resolved module graph for visualization. */
  graph?: DependencyGraph
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
  deps: DependencyResult
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

export type RunPhase = "detect" | "lint" | "types" | "deps" | "security" | "insights"
export type PhaseStatus = "idle" | "running" | "done" | "skipped"

/**
 * Streaming events emitted by the CodeLens CLI over the `/ws` socket. Mirrors
 * the `RunEvent` union in the CLI package (`cli/src/types.ts`). The dashboard
 * consumes these to drive the live run view and refresh its data.
 */
export type RunEvent =
  | {
      type: "phase"
      phase: RunPhase
      status: "running" | "done" | "skipped"
      project?: AnalysisReport["meta"]["project"]
      lint?: LintResult
      types?: TypeCheckResult
      security?: SecurityResult
    }
  | { type: "report"; report: AnalysisReport }
  | { type: "state"; state: { report: AnalysisReport; insights: unknown; history: TrendPoint[] } }
