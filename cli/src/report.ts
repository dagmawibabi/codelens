import { randomUUID } from "node:crypto"
import type {
  LintResult,
  TypeCheckResult,
  SecurityResult,
  AnalysisReport,
  RunMeta,
  HealthScore,
  Severity,
} from "./types.js"

/**
 * Weighted composite health score (0-100).
 * Errors hurt the most, then type errors, then security findings by severity.
 */
export function computeHealth(
  lint: LintResult,
  types: TypeCheckResult,
  security: SecurityResult,
): HealthScore {
  const lintErrors = lint.messages.filter((m) => m.severity === "error").length
  const lintWarnings = lint.messages.filter((m) => m.severity === "warning").length
  const typeErrors = types.diagnostics.length

  const sevWeight: Record<Severity, number> = {
    error: 0,
    warning: 0,
    critical: 14,
    high: 8,
    medium: 4,
    low: 1.5,
    info: 0.5,
  }

  const securityPenalty = security.findings.reduce(
    (sum, f) => sum + (sevWeight[f.severity] ?? 0),
    0,
  )

  // Each category contributes a deduction from 100.
  const lintPenalty = lintErrors * 4 + lintWarnings * 1
  const typePenalty = typeErrors * 5

  const raw = 100 - lintPenalty - typePenalty - securityPenalty
  const score = Math.max(0, Math.min(100, Math.round(raw)))

  let grade: HealthScore["grade"] = "F"
  if (score >= 95) grade = "A+"
  else if (score >= 90) grade = "A"
  else if (score >= 80) grade = "B"
  else if (score >= 70) grade = "C"
  else if (score >= 55) grade = "D"

  return {
    score,
    grade,
    breakdown: {
      lint: Math.max(0, 100 - lintPenalty),
      types: Math.max(0, 100 - typePenalty),
      security: Math.max(0, 100 - securityPenalty),
    },
  }
}

export function buildReport(args: {
  meta: Omit<RunMeta, "id" | "finishedAt" | "durationMs">
  startedAt: number
  lint: LintResult
  types: TypeCheckResult
  security: SecurityResult
}): AnalysisReport {
  const { meta, startedAt, lint, types, security } = args
  const finishedAt = Date.now()

  return {
    meta: {
      ...meta,
      id: randomUUID(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
    },
    health: computeHealth(lint, types, security),
    lint,
    types,
    security,
  }
}
