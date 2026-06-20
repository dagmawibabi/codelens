/**
 * Shared models.dev catalog logic. Used by both the Next API route
 * (`/api/models-catalog`, for the standalone preview) and directly by the
 * client model picker. models.dev sends `Access-Control-Allow-Origin: *`, so
 * the browser can fetch it without a proxy — which is what lets the picker work
 * when the dashboard is served as a static bundle by the CodeLens CLI (where no
 * Next API routes exist).
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
  /** True if the model is available for free on OpenRouter. */
  freeOpenRouter?: boolean
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

/** Known free models on OpenRouter (input cost = $0). */
const FREE_OPENROUTER_MODELS = new Set([
  "openrouter/meta-llama/llama-3.2-90b",
  "openrouter/meta-llama/llama-3.2-1b",
  "openrouter/meta-llama/llama-3.1-405b-instruct",
  "openrouter/meta-llama/llama-3-8b-instruct",
  "openrouter/meta-llama/llama-2-13b",
  "openrouter/openchat/openchat-3.5",
  "openrouter/undi95/toppy-m-7b",
  "openrouter/gryphe/mythomax-l2-13b",
  "openrouter/cinematika/cinematika-7b",
])

export function flattenCatalog(data: Record<string, UpstreamProvider>): CatalogModel[] {
  const out: CatalogModel[] = []
  for (const [providerId, provider] of Object.entries(data)) {
    const providerName = provider?.name ?? providerId
    const models = provider?.models ?? {}
    for (const [modelId, m] of Object.entries(models)) {
      const fullId = `${providerId}/${modelId}`
      out.push({
        id: fullId,
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
        freeOpenRouter: FREE_OPENROUTER_MODELS.has(fullId) || (providerId === "openrouter" && m.cost?.input === 0),
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

/**
 * Fetch + flatten the models.dev catalog directly from the browser (or server).
 * Throws on failure so SWR can surface an error state. Retries should be
 * disabled by the caller to avoid hammering the upstream.
 */
export async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch(UPSTREAM, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`models.dev responded ${res.status}`)
  const data = (await res.json()) as Record<string, UpstreamProvider>
  return flattenCatalog(data)
}
