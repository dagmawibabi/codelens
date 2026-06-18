#!/usr/bin/env node
import { Command } from "commander"
import open from "open"
import { runAnalysis } from "./run.js"
import { startServer, type ServerState } from "./server.js"
import { saveRun, readHistory } from "./store.js"
import { aiEnabled } from "./ai/audit.js"
import type { RunEvent } from "./types.js"

const program = new Command()

program
  .name("codelens")
  .description("Local lint, type-check & AI security dashboard for JS/TS projects")
  .version("0.1.0")
  .option("-p, --port <number>", "preferred dashboard port", "4321")
  .option("--no-ai", "skip the AI security audit")
  .option("--no-open", "do not auto-open the browser")
  .option("--ci", "run once, print summary, exit non-zero if issues are found")
  .option("--json", "print the full report as JSON and exit")
  .option("--min-score <number>", "fail in --ci mode if health score is below this", "0")

program.parse()
const opts = program.opts()

const cwd = process.cwd()
const ai = Boolean(opts.ai) && aiEnabled()

if (Boolean(opts.ai) && !aiEnabled()) {
  console.error(
    "\x1b[33m![codelens]\x1b[0m AI security audit is enabled but no model key was found.\n" +
      "  Set AI_GATEWAY_API_KEY (or OPENAI_API_KEY) to enable it, or pass --no-ai to silence this.\n" +
      "  Lint and type-check will still run.\n",
  )
}

async function main() {
  // ---- Headless modes: --ci and --json ----
  if (opts.ci || opts.json) {
    const report = await runAnalysis({ cwd, ai })

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n")
      return
    }

    printCiSummary(report)
    await saveRun(cwd, report)

    const minScore = Number(opts.minScore) || 0
    const hasBlockingIssues =
      report.lint.errorCount > 0 ||
      report.types.diagnostics.length > 0 ||
      report.security.findings.some((f) => f.severity === "critical" || f.severity === "high")

    if (report.health.score < minScore || hasBlockingIssues) {
      process.exitCode = 1
    }
    return
  }

  // ---- Interactive dashboard mode ----
  const state: ServerState = {
    latest: null,
    history: await readHistory(cwd),
  }

  const server = await startServer({ port: Number(opts.port) || 4321, state })
  console.log(`\n  \x1b[36mCodeLens\x1b[0m dashboard → \x1b[1m${server.url}\x1b[0m\n`)

  if (opts.open) {
    open(server.url).catch(() => {
      console.log("  (could not auto-open browser; open the URL above manually)")
    })
  }

  const onEvent = (event: RunEvent) => {
    server.broadcast(event)
    if (event.type === "report") {
      state.latest = event.report
    }
  }

  const report = await runAnalysis({ cwd, ai, onEvent })
  state.latest = report
  await saveRun(cwd, report)
  state.history = await readHistory(cwd)

  console.log(
    `  Done. Health \x1b[1m${report.health.score}\x1b[0m (${report.health.grade}) · ` +
      `${report.lint.errorCount} lint errors · ` +
      `${report.types.diagnostics.length} type errors · ` +
      `${report.security.findings.length} security findings.\n` +
      `  Dashboard stays live. Press Ctrl+C to exit.\n`,
  )

  process.on("SIGINT", async () => {
    await server.close()
    process.exit(0)
  })
}

function printCiSummary(report: import("./types.js").AnalysisReport) {
  const { health, lint, types, security } = report
  console.log(`\nCodeLens — ${report.meta.project.framework} project`)
  console.log(`  Health score : ${health.score} (${health.grade})`)
  console.log(`  Lint         : ${lint.errorCount} errors, ${lint.warningCount} warnings`)
  console.log(`  Types        : ${types.diagnostics.length} errors`)
  console.log(
    `  Security     : ${security.findings.length} findings` +
      (security.skipped ? " (AI skipped)" : ""),
  )
}

main().catch((err) => {
  console.error("\x1b[31m[codelens] fatal:\x1b[0m", err)
  process.exit(1)
})
