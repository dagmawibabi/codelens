/**
 * Shared AI Gateway model-list logic. The gateway sends permissive CORS
 * headers, so the browser can fetch it directly — letting the settings picker
 * show the live gateway catalog even when the dashboard is served as a static
 * bundle by the CodeLens CLI (no Next API routes available).
 */

import type { ModelOption } from "@/lib/settings"

const UPSTREAM = "https://ai-gateway.vercel.sh/v1/models"

interface GatewayModel {
  id: string
  name?: string
  type?: string
  owned_by?: string
  context_window?: number
}

/**
 * Fetch the live text-model catalog from the Vercel AI Gateway, shaped for the
 * settings picker. Throws on failure so SWR can surface an error state.
 */
export async function fetchGatewayModels(): Promise<ModelOption[]> {
  const res = await fetch(UPSTREAM, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`Gateway responded ${res.status}`)
  const json = (await res.json()) as { data?: GatewayModel[] }
  return (json.data ?? [])
    // Text models only — drop embeddings, image, audio, etc.
    .filter((m) => m.type === "language")
    .map((m) => {
      const ctx = m.context_window ? `${Math.round(m.context_window / 1000)}k ctx` : undefined
      const note = [m.owned_by, ctx].filter(Boolean).join(" · ") || undefined
      return { id: m.id, label: m.name?.trim() || m.id, note }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}
