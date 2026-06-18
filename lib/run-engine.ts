"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { RunPhase, PhaseStatus } from "@/lib/schema"

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
]

const PHASE_ORDER: RunPhase[] = RUN_PHASES.map((p) => p.id)

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
}

export interface RunState {
  phases: Record<RunPhase, PhaseStatus>
  logs: LogLine[]
  running: boolean
  done: boolean
  activePhase: RunPhase | null
  elapsedMs: number
  start: () => void
}

const IDLE: Record<RunPhase, PhaseStatus> = {
  detect: "idle",
  lint: "idle",
  types: "idle",
  deps: "idle",
  security: "idle",
}

/**
 * Simulates a streaming CodeLens run. Phases transition sequentially and log
 * lines arrive with small delays. In the installed CLI these transitions are
 * driven by real WebSocket events from the local server.
 */
export function useRunEngine(aiEnabled = true, autoStart = false): RunState {
  const [phases, setPhases] = useState<Record<RunPhase, PhaseStatus>>(IDLE)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [activePhase, setActivePhase] = useState<RunPhase | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const timers = useRef<number[]>([])
  const startedAt = useRef<number>(0)
  const logId = useRef(0)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const start = useCallback(() => {
    clearTimers()
    setPhases(IDLE)
    setLogs([])
    setDone(false)
    setRunning(true)
    setActivePhase(null)
    setElapsedMs(0)
    startedAt.current = performance.now()
    logId.current = 0

    // Live elapsed timer.
    const ticker = window.setInterval(() => {
      setElapsedMs(performance.now() - startedAt.current)
    }, 100)
    timers.current.push(ticker as unknown as number)

    let delay = 250
    const order = PHASE_ORDER.filter((p) => (p === "security" ? aiEnabled : true))

    order.forEach((phase) => {
      const lines = PHASE_LOGS[phase]

      // Mark phase running.
      timers.current.push(
        window.setTimeout(() => {
          setActivePhase(phase)
          setPhases((prev) => ({ ...prev, [phase]: "running" }))
        }, delay) as unknown as number,
      )
      delay += 200

      // Stream each log line.
      lines.forEach((line) => {
        const step = 220 + Math.random() * 360
        delay += step
        timers.current.push(
          window.setTimeout(() => {
            const t = (performance.now() - startedAt.current) / 1000
            setLogs((prev) => [
              ...prev,
              { id: logId.current++, t, phase, level: line.level, text: line.text },
            ])
          }, delay) as unknown as number,
        )
      })

      // Mark phase done.
      delay += 250
      timers.current.push(
        window.setTimeout(() => {
          setPhases((prev) => ({ ...prev, [phase]: "done" }))
        }, delay) as unknown as number,
      )
    })

    // If AI is disabled, mark security skipped.
    if (!aiEnabled) {
      timers.current.push(
        window.setTimeout(() => {
          setPhases((prev) => ({ ...prev, security: "skipped" }))
        }, delay) as unknown as number,
      )
    }

    // Finish.
    delay += 400
    timers.current.push(
      window.setTimeout(() => {
        setRunning(false)
        setDone(true)
        setActivePhase(null)
        window.clearInterval(ticker)
        setElapsedMs(performance.now() - startedAt.current)
      }, delay) as unknown as number,
    )
  }, [aiEnabled])

  useEffect(() => {
    if (autoStart) start()
    return clearTimers
  }, [autoStart, start])

  return { phases, logs, running, done, activePhase, elapsedMs, start }
}
