#!/usr/bin/env node
import path from "node:path"
import { Command } from "commander"
import open from "open"
import { runAnalysis, runWorkspaceAnalysis, runSinglePackage } from "./run.js"
import { startServer, type ServerState } from "./server.js"
import { saveRun, readHistory, readState, clearData } from "./store.js"
import { aiEnabled } from "./ai/audit.js"
import { loadConfig } from "./config.js"
import { discoverWorkspace } from "./workspace/discover.js"
import type { DashboardState, RunEvent } from "./types.js"

const program = new Command()

program
  .name("projectlens")
  .description("Local lint, type-check & AI security dashboard for JS/TS projects")
  .version("0.1.0")
  .option("-p, --port <number>", "preferred dashboard port", "4321")
  .option("--no-ai", "skip the AI security audit")
  .option("--no-open", "do not auto-open the browser")
  .option("--ci", "run once, print summary, exit non-zero if issues are found")
  .option("--json", "print the full report as JSON and exit")
  .option("--min-score <number>", "fail in --ci mode if health score is below this", "0")
  .option("-d, --dir <path>", "project directory to analyze (default: cwd)")
  .option("--package <name>", "analyze only this workspace package (monorepo mode)")

program.parse()
const opts = program.opts()

const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd()

// Load `.projectlens.json` first: it hydrates process.env (AI Gateway key,
// GITHUB_TOKEN, …) and provides the model / file-budget chosen in the
// dashboard Settings page, so the CLI and dashboard stay in sync.
const config = loadConfig(cwd)

// AI runs only when: not disabled via --no-ai, enabled in config, and a key exists.
const ai = Boolean(opts.ai) && config.aiEnabled && aiEnabled()

if (Boolean(opts.ai) && config.aiEnabled && !aiEnabled()) {
  console.error(
    "\x1b[33m![Projectlens]\x1b[0m AI security audit is enabled but no gateway key was found.\n" +
      "  The default model is free, but requests still route through the Vercel AI Gateway,\n" +
      "  which needs an API key (the key is free — it does not require an OpenRouter account).\n" +
      "    1. Get a free key at \x1b[36mhttps://vercel.com/ai-gateway\x1b[0m\n" +
      "    2. Run \x1b[1mexport AI_GATEWAY_API_KEY=...\x1b[0m  (or set it in .projectlens.json / your shell)\n" +
      "  Alternatively set OPENAI_API_KEY, or pass \x1b[1m--no-ai\x1b[0m to silence this.\n" +
      "  Lint, type-check, and dependency audit still run without it.\n",
  )
}

async function main() {
  // Check if this is a monorepo
  const monorepo = await discoverWorkspace(cwd)

  // ---- Headless modes: --ci and --json ----
  if (opts.ci || opts.json) {
    const history = await readHistory(cwd)

    let report: import("./types.js").AnalysisReport
    let insights: import("./types.js").ProjectInsights
    let workspace: import("./types.js").WorkspaceReport | undefined

    if (opts.package && monorepo) {
      // Analyze a single package in the workspace
      const result = await runSinglePackage({ cwd, packageName: opts.package, ai })
      report = result.report
      insights = result.insights
      workspace = result.workspace
    } else if (monorepo && !opts.package) {
      // Full workspace analysis
      const result = await runWorkspaceAnalysis({ cwd, ai, history })
      report = result.report
      insights = result.insights
      workspace = result.workspace
    } else {
      // Single project mode (unchanged)
      const result = await runAnalysis({ cwd, ai, history })
      report = result.report
      insights = result.insights
    }

    if (opts.json) {
      const payload: DashboardState = { report, insights, history, workspace }
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n")
      return
    }

    printCiSummary(report)
    await saveRun(cwd, report, insights)

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
    // Hydrate from a previous run if one exists, so the dashboard isn't empty
    // while the fresh analysis is still in flight.
    current: await readState(cwd),
  }

  const onEvent = (event: RunEvent) => {
    server.broadcast(event)
    if (event.type === "state") {
      state.current = event.state
    }
  }

  // A single analysis pass: stream events, persist, and refresh live state.
  // `scope: "security"` runs a fast targeted rescan that recomputes only the AI
  // security pass and reuses the rest of the previous run.
  const analyze = async (scope: "all" | "security" = "all", packageName?: string) => {
    const priorHistory = await readHistory(cwd)

    let report: import("./types.js").AnalysisReport
    let insights: import("./types.js").ProjectInsights
    let workspace: import("./types.js").WorkspaceReport | undefined

    if (packageName && monorepo) {
      // Analyze a single package
      const result = await runSinglePackage({ cwd, packageName, ai })
      report = result.report
      insights = result.insights
      workspace = result.workspace
    } else if (monorepo && !packageName) {
      // Full workspace analysis
      const result = await runWorkspaceAnalysis({
        cwd,
        ai,
        history: priorHistory,
        onEvent,
        scope,
        prior: scope === "security" ? state.current : null,
      })
      report = result.report
      insights = result.insights
      workspace = result.workspace
    } else {
      // Single project mode (unchanged)
      const result = await runAnalysis({
        cwd,
        ai,
        history: priorHistory,
        onEvent,
        scope,
        prior: scope === "security" ? state.current : null,
      })
      report = result.report
      insights = result.insights
    }

    await saveRun(cwd, report, insights)
    const refreshed: DashboardState = { report, insights, history: await readHistory(cwd), workspace }
    state.current = refreshed
    server.broadcast({ type: "state", state: refreshed })
    return report
  }

  const server = await startServer({
    port: Number(opts.port) || 4321,
    state,
    onRunRequest: async (scope, packageName) => {
      await analyze(scope, packageName)
    },
    onClearData: (scope) => clearData(cwd, scope),
  })
  console.log(`\n  \x1b[36mProjectlens\x1b[0m dashboard → \x1b[1m${server.url}\x1b[0m\n`)

  if (monorepo) {
    console.log(
      `  \x1b[33mMonorepo detected:\x1b[0m ${monorepo.packages.length} packages (${monorepo.tool})\n`,
    )
  }

  if (opts.open) {
    open(server.url).catch(() => {
      console.log("  (could not auto-open browser; open the URL above manually)")
    })
  }

  const report = await analyze()

  if (monorepo && report.meta.workspace) {
    // Workspace mode: print aggregate summary
    const ws = state.current?.workspace
    if (ws) {
      console.log(
        `  Done. Workspace health \x1b[1m${ws.aggregate.score}\x1b[0m (${ws.aggregate.grade}) · ` +
          `${ws.aggregate.totalLintErrors} lint errors · ` +
          `${ws.aggregate.totalTypeErrors} type errors · ` +
          `${ws.aggregate.totalSecurityFindings} security findings.\n` +
          `  Packages: ${ws.aggregate.packageScores.map((p) => `${p.name}(${p.score})`).join(", ")}\n`,
      )
    }
  } else {
    console.log(
      `  Done. Health \x1b[1m${report.health.score}\x1b[0m (${report.health.grade}) · ` +
        `${report.lint.errorCount} lint errors · ` +
        `${report.types.diagnostics.length} type errors · ` +
        `${report.security.findings.length} security findings.\n`,
    )
  }
  console.log(`  Dashboard stays live. Press Ctrl+C to exit.\n`)

  process.on("SIGINT", async () => {
    await server.close()
    process.exit(0)
  })
}

function printCiSummary(report: import("./types.js").AnalysisReport) {
  const { health, lint, types, security } = report
  console.log(`\nProjectlens — ${report.meta.project.framework} project`)
  console.log(`  Health score : ${health.score} (${health.grade})`)
  console.log(`  Lint         : ${lint.errorCount} errors, ${lint.warningCount} warnings`)
  console.log(`  Types        : ${types.diagnostics.length} errors`)
  console.log(
    `  Security     : ${security.findings.length} findings` +
      (security.skipped ? " (AI skipped)" : ""),
  )
}

main().catch((err) => {
  console.error("\x1b[31m[Projectlens] fatal:\x1b[0m", err)
  process.exit(1)
})
