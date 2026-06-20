import { type ScanContext } from "./scan.js"
import type { DocsResult, DocStandard, DocCheck, DocFile, DocBand } from "../types.js"

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function bandFor(score: number): DocBand {
  if (score >= 90) return "excellent"
  if (score >= 75) return "good"
  if (score >= 50) return "needs-improvement"
  return "poor"
}

function gradeFor(score: number): DocsResult["grade"] {
  if (score >= 97) return "A+"
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

const DOC_FILES = [
  { name: "README", paths: ["README.md", "readme.md", "README.mdx"] },
  { name: "CONTRIBUTING", paths: ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"] },
  { name: "LICENSE", paths: ["LICENSE", "LICENSE.md", "LICENSE.txt"] },
  { name: "CHANGELOG", paths: ["CHANGELOG.md"] },
  { name: "Code of Conduct", paths: ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"] },
  { name: "llms.txt", paths: ["llms.txt", "public/llms.txt"] },
  { name: "AGENTS.md", paths: ["AGENTS.md", ".github/AGENTS.md"] },
  { name: "Security Policy", paths: ["SECURITY.md", ".github/SECURITY.md"] },
]

export async function collectDocs(ctx: ScanContext): Promise<DocsResult> {
  // Gather present docs with content.
  const docContents = new Map<string, string>()
  const documents: DocFile[] = []

  for (const def of DOC_FILES) {
    const found = def.paths.find((p) => ctx.files.some((f) => f.rel === p))
    const body = found ? (await ctx.read(found)) ?? "" : ""
    const present = Boolean(found)
    if (found) docContents.set(def.name, body)
    const words = wordCount(body)
    documents.push({
      name: def.name,
      path: found ?? def.paths[0],
      present,
      words,
      score: present ? Math.min(100, 40 + Math.min(60, Math.floor(words / 20))) : 0,
      note: present ? `${words} words` : "Not found",
    })
  }

  const readme = docContents.get("README") ?? ""
  const hasReadme = readme.length > 0
  const readmeWords = wordCount(readme)

  // --- Standard 1: README / project docs quality -------------------------
  const qualityChecks: DocCheck[] = [
    check("readme-present", "README exists", hasReadme, 3, hasReadme ? "README.md found." : "No README found.", false, "Add a README.md describing the project."),
    check("readme-depth", "README is substantial", readmeWords >= 200, 2, `${readmeWords} words.`, false, "Expand the README to cover setup, usage, and architecture."),
    check("install", "Install instructions", /\b(install|npm i|pnpm|yarn|getting started)\b/i.test(readme), 2, "Looks for setup steps.", false, "Document how to install and run the project."),
    check("usage", "Usage / examples", /```|\bexample\b|\busage\b/i.test(readme), 2, "Looks for code blocks or usage.", false, "Add usage examples or code snippets."),
    check("license", "License declared", documents.find((d) => d.name === "LICENSE")!.present, 1, "LICENSE file presence.", false, "Add a LICENSE file."),
    check("contributing", "Contributing guide", documents.find((d) => d.name === "CONTRIBUTING")!.present, 1, "CONTRIBUTING file presence.", false, "Add a CONTRIBUTING.md."),
  ]

  // --- Standard 2: llms.txt (agent discovery) ----------------------------
  const llms = docContents.get("llms.txt") ?? ""
  const llmsChecks: DocCheck[] = [
    check("llms-present", "llms.txt present", llms.length > 0, 3, llms ? "Found llms.txt." : "No llms.txt.", true, "Add an llms.txt to guide AI agents (llmstxt.org)."),
    check("llms-links", "Contains structured links", /\[.+\]\(.+\)/.test(llms), 2, "Markdown links for agents to follow.", true, "List key docs as markdown links in llms.txt."),
    check("agents-md", "AGENTS.md present", (docContents.get("AGENTS.md") ?? "").length > 0, 2, "Agent contribution guide.", true, "Add an AGENTS.md describing build/test commands for agents."),
  ]

  // --- Standard 3: Vercel/framework readiness ----------------------------
  const hasMeta = ctx.files.some((f) => /metadata|head|sitemap|robots/.test(f.rel))
  const vercelChecks: DocCheck[] = [
    check("metadata", "SEO metadata", hasMeta, 2, "Looks for metadata/sitemap/robots.", true, "Export metadata and add sitemap.ts/robots.ts."),
    check("readme-deploy", "Deploy docs", /deploy|vercel|netlify|docker/i.test(readme), 1, "Deployment guidance in README.", false, "Document deployment steps."),
  ]

  // --- Standard 4: Inline code documentation -----------------------------
  // Reuse a quick comment-ratio probe on a sample of code files.
  let commentedExports = 0
  let totalExports = 0
  for (const f of ctx.codeFiles().slice(0, 200)) {
    const c = await ctx.read(f.rel)
    if (!c) continue
    const exportMatches = c.match(/^export\s+(async\s+)?(function|const|class|interface|type)\s/gm) ?? []
    totalExports += exportMatches.length
    commentedExports += (c.match(/\/\*\*[\s\S]*?\*\/\s*export\s/g) ?? []).length
  }
  const docCoverage = totalExports > 0 ? commentedExports / totalExports : 0
  const farmingChecks: DocCheck[] = [
    check("jsdoc", "Exports documented", docCoverage >= 0.2, 2, `${Math.round(docCoverage * 100)}% of exports have JSDoc.`, true, "Add JSDoc comments to exported APIs."),
    check("todos", "Few stray TODOs", true, 1, "Tracked separately in Setup.", false),
  ]

  const standards: DocStandard[] = [
    buildStandard("quality", "Documentation Quality", "Is the project understandable to humans?", "Projectlens", "#", 0.4, qualityChecks),
    buildStandard("llmstxt", "llms.txt", "Can AI agents discover your docs?", "llmstxt.org", "https://llmstxt.org", 0.25, llmsChecks),
    buildStandard("vercel", "Web & SEO Readiness", "Is the app discoverable and deployable?", "Vercel", "https://vercel.com", 0.2, vercelChecks),
    buildStandard("farming", "Inline API Docs", "Are exported APIs documented in code?", "Projectlens", "#", 0.15, farmingChecks),
  ]

  const score = Math.round(standards.reduce((sum, s) => sum + s.score * s.weight, 0))
  const agentStandards = standards.filter((s) => s.id === "llmstxt" || s.id === "vercel")
  const agentScore = Math.round(
    agentStandards.reduce((sum, s) => sum + s.score, 0) / (agentStandards.length || 1),
  )

  return {
    score,
    grade: gradeFor(score),
    band: bandFor(score),
    agentReady: agentScore >= 60,
    agentScore,
    liveUrl: null, // populated only in live-URL probe mode
    standards,
    documents,
  }
}

function check(
  id: string,
  label: string,
  passed: boolean,
  weight: number,
  detail: string,
  agent: boolean,
  fix?: string,
): DocCheck {
  return { id, label, status: passed ? "pass" : "fail", detail, weight, agent, fix: passed ? undefined : fix }
}

function buildStandard(
  id: DocStandard["id"],
  label: string,
  tagline: string,
  source: string,
  href: string,
  weight: number,
  checks: DocCheck[],
): DocStandard {
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1
  const earned = checks.reduce((s, c) => s + (c.status === "pass" ? c.weight : 0), 0)
  const score = Math.round((earned / totalWeight) * 100)
  return { id, label, tagline, source, href, score, weight, band: bandFor(score), checks }
}
