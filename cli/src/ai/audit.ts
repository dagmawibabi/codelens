import { generateText, Output } from 'ai'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promises as fsp } from 'node:fs'
import type {
  DependencyVuln,
  LintResult,
  ProjectInfo,
  SecurityFinding,
  SecurityResult,
  TypeCheckResult,
} from '../types.js'
import { loadConfig } from '../config.js'

/**
 * AI security pass. Runs entirely from the CLI (Node), never a browser.
 * Uses the Vercel AI Gateway: just pass a model string, no provider import.
 *
 * Two responsibilities:
 *  1. Review a batch of source files for vulnerability patterns.
 *  2. Prioritize/explain the real CVEs that `npm audit` already found.
 */

/**
 * Run `generateText` with the configured model, transparently retrying once
 * with the fallback model if the primary model errors (e.g. the free
 * OpenRouter tier is rate-limited or no OpenRouter key is set). The fallback —
 * Gemini 2.5 Flash via the AI Gateway — is zero-config, so the audit keeps
 * working even when the preferred free model can't be reached.
 */
async function withModelFallback<T>(call: (model: string) => Promise<T>): Promise<T> {
  const { model: primary, fallbackModel } = loadConfig()
  try {
    return await call(primary)
  } catch (err) {
    if (!fallbackModel || fallbackModel === primary) throw err
    if (process.env.CODELENS_DEBUG) {
      console.error(`[codelens] model "${primary}" failed, falling back to "${fallbackModel}":`, err)
    }
    return await call(fallbackModel)
  }
}

const findingSchema = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      category: z.enum([
        'injection',
        'secrets',
        'auth',
        'xss',
        'ssrf',
        'crypto',
        'config',
        'data-exposure',
        'other',
      ]),
      filePath: z.string(),
      line: z.number(),
      endLine: z.number().nullable(),
      description: z.string(),
      recommendation: z.string(),
      suggestedFix: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      reference: z.string().nullable(),
    }),
  ),
})

const SYSTEM = `You are a senior application security engineer reviewing a {{framework}} project.
Report only concrete, exploitable issues — no style nitpicks, no false positives.
For each finding give: a short title, severity, category, the file + line, a clear
description of the risk, a precise recommendation, and where possible a unified-diff
"suggestedFix". Calibrate "confidence" honestly. Framework-specific pitfalls matter
(e.g. secrets leaking into client bundles, unverified webhooks, Server Action exposure).`

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY)
}

/** Reviews source files for vulnerabilities. Returns [] when AI is off. */
export async function auditCode(
  project: ProjectInfo,
  files: string[],
): Promise<SecurityFinding[]> {
  if (!aiEnabled() || files.length === 0) return []

  const redact = loadConfig().redactSecrets

  // Build a compact, line-numbered bundle the model can cite precisely.
  const bundle = files
    .map((rel) => {
      let content = ''
      try {
        content = readFileSync(join(project.root, rel), 'utf8')
      } catch {
        return ''
      }
      if (redact) content = redactSecrets(content)
      const numbered = content
        .split('\n')
        .map((l, i) => `${i + 1}: ${l}`)
        .join('\n')
      return `=== FILE: ${rel} ===\n${numbered}`
    })
    .filter(Boolean)
    .join('\n\n')

  const { experimental_output } = await withModelFallback((m) =>
    generateText({
      model: m,
      system: SYSTEM.replace('{{framework}}', project.framework),
      prompt: `Review the following files and report security findings.\n\n${bundle}`,
      experimental_output: Output.object({ schema: findingSchema }),
    }),
  )

  return experimental_output.findings.map((f, i) => ({
    id: `s${i}`,
    ...f,
    endLine: f.endLine ?? undefined,
    suggestedFix: f.suggestedFix ?? undefined,
    reference: f.reference ?? undefined,
  }))
}

const prioritizeSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      impact: z.string(),
    }),
  ),
})

/**
 * Layers AI explanations onto the real advisories from `npm audit`.
 * The CVE data is ground truth; the AI only ranks and explains real impact.
 */
export async function prioritizeDependencies(
  project: ProjectInfo,
  vulns: DependencyVuln[],
): Promise<DependencyVuln[]> {
  if (!aiEnabled() || vulns.length === 0) return vulns

  const list = vulns
    .map(
      (v) =>
        `- ${v.name}@${v.currentVersion} (${v.dependencyType}) ${v.severity}: ${v.title} [${v.cves.join(', ')}]`,
    )
    .join('\n')

  const { experimental_output } = await withModelFallback((m) =>
    generateText({
      model: m,
      system: `You are a security engineer triaging dependency advisories for a ${project.framework} app.
For each advisory, explain in one or two sentences the realistic real-world impact for
THIS kind of project, and whether the vulnerable code path is likely reachable. Be honest
about low real-world risk for transitive/build-only packages.`,
      prompt: `Advisories from the package audit:\n${list}`,
      experimental_output: Output.object({ schema: prioritizeSchema }),
    }),
  )

  const byName = new Map(experimental_output.items.map((i) => [i.name, i]))
  return vulns.map((v) => {
    const ai = byName.get(v.name)
    return ai ? { ...v, impact: ai.impact, severity: ai.severity } : v
  })
}

/* ------------------------------- Redaction -------------------------------- */

/**
 * Mask obvious secret-looking values before sending code to the model. This is
 * best-effort — it preserves structure (so findings still make sense) while
 * blanking long tokens, assigned secrets, and common provider key formats.
 */
function redactSecrets(content: string): string {
  return (
    content
      // key = "value" / KEY: 'value' where the name hints at a secret
      .replace(
        /\b([A-Za-z0-9_]*(?:secret|token|key|password|passwd|api[_-]?key|auth|credential)[A-Za-z0-9_]*)\b(\s*[:=]\s*)(['"`])[^'"`]+\3/gi,
        (_m, name, sep, q) => `${name}${sep}${q}[REDACTED]${q}`,
      )
      // Common provider key prefixes (sk-, ghp_, AKIA…, AIza…)
      .replace(/\b(sk|pk|ghp|gho|ghs|rk)_[A-Za-z0-9]{16,}\b/g, '$1_[REDACTED]')
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]')
      .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, 'AIza[REDACTED]')
      // Long bearer-ish tokens in headers
      .replace(/\b(Bearer\s+)[A-Za-z0-9\-._~+/]{20,}=*/g, '$1[REDACTED]')
  )
}

/* ----------------------------- File selection ----------------------------- */

const SECURITY_RELEVANT = [
  /\/api\//,
  /\/(server|actions)\//,
  /\.server\./,
  /route\.(t|j)sx?$/,
  /middleware\.(t|j)s$/,
  /\/(auth|lib|utils|db|database)\//,
  /\+page\.server\./, // SvelteKit
  /\+server\./, // SvelteKit
]

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.svelte-kit',
  'coverage',
  '.codelens',
])

const MAX_FILE_BYTES = 24_000

/** Walk the project and pick the most security-relevant source files. */
async function selectFiles(root: string): Promise<string[]> {
  const maxFiles = loadConfig().maxFiles
  const picked: string[] = []

  async function walk(dir: string) {
    if (picked.length >= maxFiles) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (picked.length >= maxFiles) return
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(join(dir, entry.name))
      } else if (/\.(t|j)sx?$|\.vue$|\.svelte$/.test(entry.name)) {
        const full = join(dir, entry.name)
        const rel = full.slice(root.length + 1)
        if (SECURITY_RELEVANT.some((re) => re.test('/' + rel))) {
          picked.push(rel)
        }
      }
    }
  }

  await walk(root)
  return picked
}

/* ----------------------------- Orchestration ----------------------------- */

/**
 * Top-level security pass used by the run pipeline. Selects relevant source
 * files, runs the AI code review, and layers AI prioritization onto the real
 * dependency advisories. Returns a complete SecurityResult.
 */
export async function runSecurityAudit(args: {
  cwd: string
  project: ProjectInfo
  advisories: DependencyVuln[]
  lint: LintResult
  types: TypeCheckResult
}): Promise<SecurityResult> {
  const { project, advisories } = args

  if (!aiEnabled()) {
    return { findings: [], dependencies: advisories, skipped: true }
  }

  const files = await selectFiles(project.root)

  const [findings, dependencies] = await Promise.all([
    auditCode(project, files),
    prioritizeDependencies(project, advisories),
  ])

  return { findings, dependencies, skipped: false }
}

// Silence unused-import warnings for fields reserved for future heuristics.
void MAX_FILE_BYTES
