"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"
import { mockReport, mockHistory } from "@/lib/mock-data"
import { projectInsights, type ProjectInsights } from "@/lib/project-insights"
import { EMPTY_DATA } from "@/lib/empty-data"
import { seedDemoTasks } from "@/lib/tasks"

export interface DashboardData {
  report: AnalysisReport
  insights: ProjectInsights
  history: TrendPoint[]
}

/**
 * Where the rendered data came from:
 * - `live`   — a real CodeLens CLI backend (via /api/state + /ws)
 * - `demo`   — bundled sample data, loaded on demand from the Run-checks menu
 * - `empty`  — no run yet; everything is zero/empty (the default)
 * - `loading`— resolving the backend
 */
export type DataSource = "live" | "demo" | "empty" | "loading"

const MOCK: DashboardData = {
  report: mockReport,
  insights: projectInsights,
  history: mockHistory,
}

async function fetchState(url: string): Promise<DashboardData | null> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`state ${res.status}`)
  const json = (await res.json()) as DashboardData | null
  // The CLI returns null before its first run completes.
  if (!json || !json.report || !json.insights) return null
  return { ...json, history: json.history ?? [] }
}

/**
 * Resolves the dashboard's data. When served by the CodeLens CLI, this fetches
 * the real analysis from `/api/state` and live-updates over the `/ws` socket.
 * In the standalone preview (no CLI backend) it falls back to bundled mock data
 * so the UI is always populated.
 */
export interface UseDashboardData {
  data: DashboardData
  source: DataSource
  /** Whether bundled demo data is currently being shown. */
  demo: boolean
  /** Toggle the bundled demo data on/off (only meaningful with no live backend). */
  setDemo: (on: boolean) => void
}

export function useDashboardData(): UseDashboardData {
  const { data, error, isLoading, mutate } = useSWR<DashboardData | null>(
    "/api/state",
    fetchState,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  const [live, setLive] = useState<DashboardData | null>(null)
  const [demo, setDemoState] = useState(false)
  // Turning demo data on also seeds a sample Task Manager worklist (once),
  // so the board is populated when exploring the bundled demo.
  const setDemo = useCallback((on: boolean) => {
    if (on) seedDemoTasks()
    setDemoState(on)
  }, [])
  const hasBackend = !error && (data != null || live != null)
  const wsRef = useRef<WebSocket | null>(null)

  // Subscribe to live run updates only when a CLI backend is present.
  useEffect(() => {
    if (error) return
    if (data == null && live == null) return
    if (typeof window === "undefined") return

    const proto = window.location.protocol === "https:" ? "wss" : "ws"
    const url = `${proto}://${window.location.host}/ws`
    let closed = false

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string)
          if (msg?.type === "state" && msg.state?.report && msg.state?.insights) {
            setLive(msg.state as DashboardData)
            void mutate(msg.state as DashboardData, { revalidate: false })
          }
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onerror = () => {
        if (!closed) ws.close()
      }
      return () => {
        closed = true
        ws.close()
        wsRef.current = null
      }
    } catch {
      /* no socket available; static data only */
    }
  }, [error, data, live, mutate])

  const resolved = live ?? data ?? null

  // A real backend always wins over the local demo/empty state.
  if (resolved) return { data: resolved, source: "live", demo, setDemo }
  if (isLoading) return { data: EMPTY_DATA, source: "loading", demo, setDemo }
  // No backend (preview/standalone). Default to an empty state; the user can
  // opt into bundled sample data from the Run-checks menu.
  void hasBackend
  if (demo) return { data: MOCK, source: "demo", demo, setDemo }
  return { data: EMPTY_DATA, source: "empty", demo, setDemo }
}
