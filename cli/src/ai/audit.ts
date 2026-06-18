import { generateText, Output } from 'ai'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DependencyVuln,
  ProjectInfo,
  SecurityFinding,
} from '../types.js'

/**
 * AI security pass. Runs entirely from the CLI (Node), never a browser.
 * Uses the Vercel AI Gateway: just pass a model string, no provider import.
 *
 * Two responsibilities:
 *  1. Review a batch of source files for vulnerability patterns.
 *  2. Prioritize/explain the real CVEs that `npm audit` already found.
 */

const MODEL = process.env.CODELENS_MODEL ?? 'anthropic/claude-opus-4.6'

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

  // Build a compact, line-numbered bundle the model can cite precisely.
  const bundle = files
    .map((rel) => {
      let content = ''
      try {
        content = readFileSync(join(project.root, rel), 'utf8')
      } catch {
        return ''
      }
      const numbered = content
        .split('\n')
        .map((l, i) => `${i + 1}: ${l}`)
        .join('\n')
      return `=== FILE: ${rel} ===\n${numbered}`
    })
    .filter(Boolean)
    .join('\n\n')

  const { experimental_output } = await generateText({
    model: MODEL,
    system: SYSTEM.replace('{{framework}}', project.framework),
    prompt: `Review the following files and report security findings.\n\n${bundle}`,
    experimental_output: Output.object({ schema: findingSchema }),
  })

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

  const { experimental_output } = await generateText({
    model: MODEL,
    system: `You are a security engineer triaging dependency advisories for a ${project.framework} app.
For each advisory, explain in one or two sentences the realistic real-world impact for
THIS kind of project, and whether the vulnerable code path is likely reachable. Be honest
about low real-world risk for transitive/build-only packages.`,
    prompt: `Advisories from the package audit:\n${list}`,
    experimental_output: Output.object({ schema: prioritizeSchema }),
  })

  const byName = new Map(experimental_output.items.map((i) => [i.name, i]))
  return vulns.map((v) => {
    const ai = byName.get(v.name)
    return ai ? { ...v, impact: ai.impact, severity: ai.severity } : v
  })
}
