"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { RunPhase, PhaseStatus, AnalysisReport } from "@/lib/schema"

/**
 * Default model the CodeLens CLI audits with — kept in sync with the CLI's
 * `config.ts` DEFAULTS so the simulated run names the same model the real run
 * would stream to.
 */
const DEFAULT_AI_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

export type LogLevel = "command" | "info" | "success" | "warn" | "error"

export interface LogLine {
  id: number
  /** Seconds since the run started. */
  t: number
  phase: RunPhase
  level: LogLevel
  text: string
}

export interface PhaseMeta {
  id: RunPhase
  label: string
  command: string
}

export const RUN_PHASES: PhaseMeta[] = [
  { id: "detect", label: "Detect project", command: "codelens detect" },
  { id: "lint", label: "ESLint", command: "eslint . --format json" },
  { id: "types", label: "TypeScript", command: "tsc --noEmit --pretty false" },
  { id: "deps", label: "Dependency audit", command: "pnpm audit --json" },
  { id: "security", label: "AI security review", command: "codelens audit --ai" },
  { id: "insights", label: "Project insights", command: "codelens scan --insights" },
]

const PHASE_ORDER: RunPhase[] = RUN_PHASES.map((p) => p.id)

/**
 * Builds the simulated terminal output from the *actual* report being shown,
 * so a run in the standalone preview / demo mode reflects the same numbers and
 * model the real CodeLens CLI would produce instead of canned placeholders.
 */
function buildSimLogs(report: AnalysisReport, aiEnabled: boolean): Record<RunPhase, { level: LogLevel; text: string }[]> {
  const { lint, types, security } = report
  const { framework, packageManager, hasTypeScript } = report.meta.project
  const topFinding = [...security.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]
  const lintLevel: LogLevel = lint.errorCount > 0 ? "error" : lint.warningCount > 0 ? "warn" : "success"

  return {
    detect: [
      { level: "command", text: `$ ${packageManager} codelens detect` },
      { level: "info", text: "Scanning working directory…" },
      { level: "success", text: `Detected ${framework}` },
      { level: "info", text: `Package manager: ${packageManager}${hasTypeScript ? " · TypeScript" : ""}` },
    ],
    lint: [
      { level: "command", text: "$ eslint . --format json" },
      ...(lint.unavailable
        ? [{ level: "warn" as LogLevel, text: lint.note ?? "ESLint not configured — skipped" }]
        : [
            { level: "info" as LogLevel, text: "Running ESLint over the project…" },
            {
              level: lintLevel,
              text: `Lint complete — ${n(lint.errorCount, "error")}, ${n(lint.warningCount, "warning")} (${lint.fixableCount} fixable)`,
            },
          ]),
    ],
    types: [
      { level: "command", text: "$ tsc --noEmit --pretty false" },
      ...(types.unavailable
        ? [{ level: "warn" as LogLevel, text: types.note ?? "TypeScript not detected — skipped" }]
        : [
            { level: "info" as LogLevel, text: "Type-checking project…" },
            {
              level: types.diagnostics.length > 0 ? ("error" as LogLevel) : ("success" as LogLevel),
              text: `tsc finished — ${n(types.diagnostics.length, "type error")}`,
            },
          ]),
    ],
    deps: [
      { level: "command", text: `$ ${packageManager} audit --json` },
      { level: "info", text: "Resolving dependency advisories…" },
      {
        level: security.dependencies.length > 0 ? "warn" : "success",
        text: `Audit complete — ${n(security.dependencies.length, "advisory").replace("advisorys", "advisories")}`,
      },
    ],
    security: aiEnabled
      ? [
          { level: "command", text: "$ codelens audit --ai" },
          { level: "info", text: "Selecting security-relevant files…" },
          { level: "info", text: `Streaming to ${DEFAULT_AI_MODEL}…` },
          ...(topFinding
            ? [
                {
                  level: (topFinding.severity === "critical" ? "error" : "warn") as LogLevel,
                  text: `${topFinding.severity.toUpperCase()} — ${topFinding.title} (${topFinding.filePath}:${topFinding.line})`,
                },
              ]
            : []),
          {
            level: security.findings.length > 0 ? "warn" : "success",
            text: `Review complete — ${n(security.findings.length, "finding")}`,
          },
        ]
      : [{ level: "info", text: "AI security review skipped (--no-ai)" }],
    insights: [
      { level: "command", text: "$ codelens scan --insights" },
      { level: "info", text: "Scanning routes, env, network, git & dependency graph…" },
      { level: "success", text: "Project insights ready" },
    ],
  }
}

/** Severity ordering used to surface the most important finding first. */
function severityRank(sev: string): number {
  const order = ["info", "low", "warning", "medium", "high", "error", "critical"]
  return order.indexOf(sev)
}

/** Scripted log output per phase. Each entry becomes a streamed line. */
const PHASE_LOGS: Record<RunPhase, { level: LogLevel; text: string }[]> = {
  detect: [
    { level: "command", text: "$ codelens detect" },
    { level: "info", text: "Scanning working directory…" },
    { level: "success", text: "Detected Next.js 16 (App Router)" },
    { level: "info", text: "Package manager: pnpm · TypeScript 5.6" },
    { level: "success", text: "Resolved local eslint + tsc binaries" },
  ],
  lint: [
    { level: "command", text: "$ eslint . --format json" },
    { level: "info", text: "Linting 142 files across 3 configs…" },
    { level: "warn", text: "13 warnings (react-hooks/exhaustive-deps, no-unused-vars)" },
    { level: "error", text: "5 errors (no-explicit-any, no-floating-promises)" },
    { level: "success", text: "Lint complete — 18 problems in 9 files" },
  ],
  types: [
    { level: "command", text: "$ tsc --noEmit --pretty false" },
    { level: "info", text: "Type-checking 142 files…" },
    { level: "error", text: "app/api/orders/route.ts(31,18): error TS2345" },
    { level: "error", text: "lib/cart.ts(64,9): error TS2322" },
    { level: "success", text: "tsc finished — 4 type errors" },
  ],
  deps: [
    { level: "command", text: "$ pnpm audit --json" },
    { level: "info", text: "Resolving 312 dependencies…" },
    { level: "warn", text: "GHSA-rrrj: prototype pollution in lodash.set (high)" },
    { level: "warn", text: "2 moderate advisories found" },
    { level: "success", text: "Audit complete — 3 advisories" },
  ],
  security: [
    { level: "command", text: "$ codelens audit --ai" },
    { level: "info", text: "Selecting security-relevant files (12 of 142)…" },
    { level: "info", text: "Streaming to anthropic/claude-opus-4.6…" },
    { level: "error", text: "CRITICAL — SQL injection in app/api/orders/route.ts:31" },
    { level: "warn", text: "HIGH — missing authz check in app/actions/admin.ts" },
    { level: "success", text: "Review complete — 8 findings" },
  ],
  insights: [
    { level: "command", text: "$ codelens scan --insights" },
    { level: "info", text: "Scanning project for routes, env, network, git…" },
    { level: "info", text: "Building dependency graph (312 nodes)…" },
    { level: "success", text: "Insights ready — 9 collectors" },
  ],
}

export interface RunState {
  phases: Record<RunPhase, PhaseStatus>
  logs: LogLine[]
  running: boolean
  done: boolean
  activePhase: RunPhase | null
  elapsedMs: number
  start: () => void
  /**
   * How the current run is being driven:
   * - `live` — real events from a connected CodeLens CLI backend
   * - `sim`  — scripted fallback animation (no backend / standalone preview)
   * - `null` — not yet determined
   */
  mode: "live" | "sim" | null
}

const IDLE: Record<RunPhase, PhaseStatus> = {
  detect: "idle",
  lint: "idle",
  types: "idle",
  deps: "idle",
  security: "idle",
  insights: "idle",
}

/** Pluralizes a count: `n(3, "error")` -> "3 errors". */
function n(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/**
 * Translates a real CLI `RunEvent` into terminal log lines. This is what makes
 * the run view reflect the actual analysis instead of a canned script.
 */
function eventToLogs(event: RunEventLike): { level: LogLevel; text: string }[] {
  if (event.type === "phase") {
    const { phase, status } = event
    if (status === "running") {
      const meta = RUN_PHASES.find((p) => p.id === phase)
      return [
        { level: "command", text: `$ ${meta?.command ?? phase}` },
        { level: "info", text: `${meta?.label ?? phase}…` },
      ]
    }
    if (status === "skipped") {
      return [{ level: "info", text: `${phase} skipped` }]
    }
    // done — summarize using whatever payload the CLI attached.
    switch (phase) {
      case "detect": {
        const p = event.project
        return p
          ? [{ level: "success", text: `Detected ${p.framework} · ${p.packageManager}` }]
          : [{ level: "success", text: "Project detected" }]
      }
      case "lint": {
        const l = event.lint
        if (!l) return [{ level: "success", text: "Lint complete" }]
        if (l.unavailable) return [{ level: "warn", text: l.note ?? "ESLint unavailable" }]
        const level: LogLevel = l.errorCount > 0 ? "error" : l.warningCount > 0 ? "warn" : "success"
        return [
          {
            level,
            text: `Lint complete — ${n(l.errorCount, "error")}, ${n(l.warningCount, "warning")} (${l.fixableCount} fixable)`,
          },
        ]
      }
      case "types": {
        const t = event.types
        if (!t) return [{ level: "success", text: "Type-check complete" }]
        if (t.unavailable) return [{ level: "warn", text: t.note ?? "tsc unavailable" }]
        const count = t.diagnostics.length
        return [{ level: count > 0 ? "error" : "success", text: `tsc finished — ${n(count, "type error")}` }]
      }
      case "deps":
        return [{ level: "success", text: "Dependency audit complete" }]
      case "security": {
        const s = event.security
        if (!s || s.skipped) return [{ level: "info", text: "AI security review skipped" }]
        const count = s.findings.length
        return [
          {
            level: count > 0 ? "warn" : "success",
            text: `Review complete — ${n(count, "finding")}, ${n(s.dependencies.length, "advisory").replace("advisorys", "advisories")}`,
          },
        ]
      }
      case "insights":
        return [{ level: "success", text: "Project insights ready" }]
      default:
        return []
    }
  }
  if (event.type === "report") {
    const score = event.report?.health?.score
    return [{ level: "info", text: `Report compiled${score != null ? ` — health ${score}/100` : ""}` }]
  }
  if (event.type === "state") {
    return [{ level: "success", text: "Run complete — dashboard updated" }]
  }
  return []
}

/** Minimal structural mirror of the CLI `RunEvent` union used for logging. */
type RunEventLike =
  | {
      type: "phase"
      phase: RunPhase
      status: "running" | "done" | "skipped"
      project?: { framework: string; packageManager: string }
      lint?: { errorCount: number; warningCount: number; fixableCount: number; unavailable?: boolean; note?: string }
      types?: { diagnostics: unknown[]; unavailable?: boolean; note?: string }
      security?: { findings: unknown[]; dependencies: unknown[]; skipped?: boolean }
    }
  | { type: "report"; report: { health?: { score?: number } } }
  | { type: "state"; state: unknown }

/**
 * Drives the Run-checks view. Prefers a real, connected CodeLens CLI backend:
 * it POSTs `/api/run` and renders the actual phase + log stream arriving over
 * the `/ws` socket. When there's no backend (standalone preview) it falls back
 * to a scripted simulation so the UI is still demonstrable.
 */
export function useRunStream(aiEnabled = true, autoStart = false, report?: AnalysisReport): RunState {
  const [phases, setPhases] = useState<Record<RunPhase, PhaseStatus>>(IDLE)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [activePhase, setActivePhase] = useState<RunPhase | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [mode, setMode] = useState<"live" | "sim" | null>(null)

  const timers = useRef<number[]>([])
  const startedAt = useRef<number>(0)
  const logId = useRef(0)
  const ticker = useRef<number | null>(null)
  const socket = useRef<WebSocket | null>(null)
  // True once the live run has actually started (first phase event seen),
  // so we can ignore the server's initial hydration `state` frame on connect.
  const liveStarted = useRef(false)
  // Monotonic id for the active run. Async callbacks (fetch/socket) captured by
  // a previous run compare against this so a stale, unmounted run can't schedule
  // a second, overlapping simulation (which would duplicate the log stream).
  const runToken = useRef(0)

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    if (ticker.current != null) {
      window.clearInterval(ticker.current)
      ticker.current = null
    }
  }, [])

  const closeSocket = useCallback(() => {
    if (socket.current) {
      try {
        socket.current.close()
      } catch {
        /* noop */
      }
      socket.current = null
    }
  }, [])

  const pushLogs = useCallback((phase: RunPhase, lines: { level: LogLevel; text: string }[]) => {
    if (lines.length === 0) return
    const t = (performance.now() - startedAt.current) / 1000
    setLogs((prev) => [...prev, ...lines.map((l) => ({ id: logId.current++, t, phase, level: l.level, text: l.text }))])
  }, [])

  const finish = useCallback(() => {
    clearTimers()
    setRunning(false)
    setDone(true)
    setActivePhase(null)
    setElapsedMs(performance.now() - startedAt.current)
  }, [clearTimers])

  // Scripted fallback used only when no CLI backend answered the POST.
  const runSimulation = useCallback(() => {
    let delay = 250
    const order = PHASE_ORDER.filter((p) => (p === "security" ? aiEnabled : true))
    // Drive the scripted output from the real report when one is available, so
    // the simulated run mirrors the actual analysis numbers and model.
    const logsByPhase = report ? buildSimLogs(report, aiEnabled) : PHASE_LOGS

    order.forEach((phase) => {
      const lines = logsByPhase[phase]
      timers.current.push(
        window.setTimeout(() => {
          setActivePhase(phase)
          setPhases((prev) => ({ ...prev, [phase]: "running" }))
        }, delay) as unknown as number,
      )
      delay += 200
      lines.forEach((line) => {
        delay += 220 + Math.random() * 360
        timers.current.push(
          window.setTimeout(() => pushLogs(phase, [line]), delay) as unknown as number,
        )
      })
      delay += 250
      timers.current.push(
        window.setTimeout(() => {
          setPhases((prev) => ({ ...prev, [phase]: "done" }))
        }, delay) as unknown as number,
      )
    })

    if (!aiEnabled) {
      timers.current.push(
        window.setTimeout(() => setPhases((prev) => ({ ...prev, security: "skipped" })), delay) as unknown as number,
      )
    }

    delay += 400
    timers.current.push(window.setTimeout(finish, delay) as unknown as number)
  }, [aiEnabled, finish, pushLogs, report])

  // Applies a real event from the CLI to phase state + the terminal log.
  const applyEvent = useCallback(
    (event: RunEventLike) => {
      if (event.type === "phase") {
        liveStarted.current = true
        setActivePhase(event.status === "done" ? null : event.phase)
        setPhases((prev) => ({ ...prev, [event.phase]: event.status }))
        pushLogs(event.phase, eventToLogs(event))
        return
      }
      if (event.type === "report") {
        pushLogs(activePhase ?? "insights", eventToLogs(event))
        return
      }
      if (event.type === "state") {
        // Ignore the hydration frame the server sends on connect.
        if (!liveStarted.current) return
        pushLogs("insights", eventToLogs(event))
        finish()
      }
    },
    [activePhase, finish, pushLogs],
  )

  const start = useCallback(() => {
    clearTimers()
    closeSocket()
    setPhases(IDLE)
    setLogs([])
    setDone(false)
    setRunning(true)
    setActivePhase(null)
    setElapsedMs(0)
    setMode(null)
    startedAt.current = performance.now()
    logId.current = 0
    liveStarted.current = false
    const token = ++runToken.current

    ticker.current = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current)
    }, 100) as unknown as number

    if (typeof window === "undefined") return

    // Open a dedicated socket for this run's live events. The CLI broadcasts to
    // every connected client, so this receives the same stream as the dashboard.
    let decided = false
    try {
      const proto = window.location.protocol === "https:" ? "wss" : "ws"
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
      socket.current = ws
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as RunEventLike
          applyEvent(msg)
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onerror = () => {
        try {
          ws.close()
        } catch {
          /* noop */
        }
      }
    } catch {
      /* no socket available */
    }

    // Trigger the real run. A 2xx/409 means a CLI backend handled it (live).
    // Anything else (or a network error) means we're standalone → simulate.
    fetch("/api/run", { method: "POST" })
      .then((res) => {
        decided = true
        // Ignore the response if this run was superseded/unmounted.
        if (runToken.current !== token) return
        if (res.ok || res.status === 409) {
          setMode("live")
        } else {
          setMode("sim")
          closeSocket()
          runSimulation()
        }
      })
      .catch(() => {
        decided = true
        if (runToken.current !== token) return
        setMode("sim")
        closeSocket()
        runSimulation()
      })

    // Safety net: if the POST somehow never settles, fall back to simulation.
    timers.current.push(
      window.setTimeout(() => {
        if (!decided && runToken.current === token) {
          setMode("sim")
          closeSocket()
          runSimulation()
        }
      }, 4000) as unknown as number,
    )
  }, [applyEvent, clearTimers, closeSocket, runSimulation])

  useEffect(() => {
    if (autoStart) start()
    return () => {
      // Invalidate any in-flight run so its async callbacks become no-ops.
      runToken.current++
      clearTimers()
      closeSocket()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  return { phases, logs, running, done, activePhase, elapsedMs, start, mode }
}
