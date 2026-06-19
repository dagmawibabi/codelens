"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"
import { mockReport, mockHistory } from "@/lib/mock-data"
import { projectInsights, type ProjectInsights } from "@/lib/project-insights"

export interface DashboardData {
  report: AnalysisReport
  insights: ProjectInsights
  history: TrendPoint[]
}

export type DataSource = "live" | "mock" | "loading"

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
export function useDashboardData(): { data: DashboardData; source: DataSource } {
  const { data, error, isLoading, mutate } = useSWR<DashboardData | null>(
    "/api/state",
    fetchState,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  )

  const [live, setLive] = useState<DashboardData | null>(null)
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

  if (resolved) return { data: resolved, source: "live" }
  if (isLoading) return { data: MOCK, source: "loading" }
  // No backend (preview/standalone) — use bundled mock data.
  void hasBackend
  return { data: MOCK, source: "mock" }
}
