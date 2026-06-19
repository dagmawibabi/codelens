import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Proxy + normalizer for the models.dev catalog. The upstream payload is a
 * nested `{ provider: { models: { id: {...} } } }` map; we flatten it into a
 * flat list of richly-described models the settings picker can search and
 * filter, and cache it for an hour to stay well under any rate limits.
 */

const UPSTREAM = "https://models.dev/api.json"

export interface CatalogModel {
  /** Fully-qualified id, e.g. "google/gemini-2.5-flash". */
  id: string
  /** Bare model id, e.g. "gemini-2.5-flash". */
  modelId: string
  name: string
  providerId: string
  providerName: string
  family?: string
  reasoning: boolean
  toolCall: boolean
  attachment: boolean
  openWeights: boolean
  inputModalities: string[]
  outputModalities: string[]
  contextLimit?: number
  outputLimit?: number
  knowledge?: string
  releaseDate?: string
  lastUpdated?: string
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
}

interface UpstreamModel {
  id?: string
  name?: string
  family?: string
  reasoning?: boolean
  tool_call?: boolean
  attachment?: boolean
  open_weights?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number; output?: number }
  cost?: { input?: number; output?: number; cache_read?: number; cache_write?: number }
}

interface UpstreamProvider {
  id?: string
  name?: string
  models?: Record<string, UpstreamModel>
}

function flatten(data: Record<string, UpstreamProvider>): CatalogModel[] {
  const out: CatalogModel[] = []
  for (const [providerId, provider] of Object.entries(data)) {
    const providerName = provider?.name ?? providerId
    const models = provider?.models ?? {}
    for (const [modelId, m] of Object.entries(models)) {
      out.push({
        id: `${providerId}/${modelId}`,
        modelId,
        name: m.name ?? modelId,
        providerId,
        providerName,
        family: m.family,
        reasoning: Boolean(m.reasoning),
        toolCall: Boolean(m.tool_call),
        attachment: Boolean(m.attachment),
        openWeights: Boolean(m.open_weights),
        inputModalities: m.modalities?.input ?? [],
        outputModalities: m.modalities?.output ?? [],
        contextLimit: m.limit?.context,
        outputLimit: m.limit?.output,
        knowledge: m.knowledge,
        releaseDate: m.release_date,
        lastUpdated: m.last_updated,
        cost: m.cost
          ? {
              input: m.cost.input,
              output: m.cost.output,
              cacheRead: m.cost.cache_read,
              cacheWrite: m.cost.cache_write,
            }
          : undefined,
      })
    }
  }
  // Newest first, then by name for stability.
  out.sort((a, b) => {
    const ad = a.releaseDate ?? ""
    const bd = b.releaseDate ?? ""
    if (ad !== bd) return bd.localeCompare(ad)
    return a.name.localeCompare(b.name)
  })
  return out
}

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `models.dev responded ${res.status}`, models: [] },
        { status: 502 },
      )
    }
    const data = (await res.json()) as Record<string, UpstreamProvider>
    const models = flatten(data)
    return NextResponse.json({ models, count: models.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load model catalog", models: [] },
      { status: 500 },
    )
  }
}
