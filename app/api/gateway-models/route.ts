import { NextResponse } from "next/server"

export const revalidate = 3600 // cache the model list for an hour

interface GatewayModel {
  id: string
  name?: string
  description?: string
  type?: string
  owned_by?: string
  context_window?: number
  tags?: string[]
}

/**
 * Fetches the live model catalog from the Vercel AI Gateway and returns only
 * text/language models, shaped for the settings model picker. The dashboard
 * calls this when the selected provider is "vercel" so the list always
 * reflects what the gateway currently supports.
 */
export async function GET() {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Gateway responded ${res.status}` }, { status: 502 })
    }

    const json = (await res.json()) as { data?: GatewayModel[] }
    const models = (json.data ?? [])
      // Text models only — drop embeddings, image, audio, etc.
      .filter((m) => m.type === "language")
      .map((m) => {
        const ctx = m.context_window ? `${Math.round(m.context_window / 1000)}k ctx` : undefined
        const note = [m.owned_by, ctx].filter(Boolean).join(" · ") || undefined
        return { id: m.id, label: m.name?.trim() || m.id, note }
      })
      .sort((a, b) => a.label.localeCompare(b.label))

    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ error: "Failed to reach the AI Gateway" }, { status: 502 })
  }
}
