export type ProviderId = "vercel" | "openrouter" | "anthropic" | "openai" | "xai" | "ollama"

export interface ModelOption {
  id: string
  label: string
  note?: string
}

export interface ProviderDef {
  id: ProviderId
  name: string
  /** Short description shown under the provider name. */
  blurb: string
  /** Environment variable the CLI reads this key from. */
  envVar: string
  /** Expected key prefix, used for a light client-side sanity hint. */
  keyPrefix?: string
  /** Whether this provider needs an API key at all (Ollama is local). */
  needsKey: boolean
  /** Where to get a key. */
  keyUrl?: string
  models: ModelOption[]
}

/**
 * Catalog of providers the CodeLens security auditor can use. The dashboard
 * persists the user's choice locally; the installed CLI reads the same shape
 * from `.codelens.json` (or the matching environment variable).
 */
export const PROVIDERS: ProviderDef[] = [
  {
    id: "vercel",
    name: "Vercel AI Gateway",
    blurb: "Zero-config routing to OpenAI, Anthropic, Google and more. Recommended default.",
    envVar: "AI_GATEWAY_API_KEY",
    keyPrefix: "vck_",
    needsKey: true,
    keyUrl: "https://vercel.com/docs/ai-gateway",
    models: [
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", note: "Deepest reasoning · best for security" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", note: "Balanced quality / speed" },
      { id: "openai/gpt-5", label: "GPT-5", note: "Strong general analysis" },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini", note: "Fast triage pass" },
      { id: "google/gemini-3-flash", label: "Gemini 3 Flash", note: "Very fast, large context" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    blurb: "Single key, hundreds of models across providers — including free tiers.",
    envVar: "OPENROUTER_API_KEY",
    keyPrefix: "sk-or-",
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", note: "Free · solid general text model" },
      { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)", note: "Free · strong reasoning" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)", note: "Free · fast, large context" },
      { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
      { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
      { id: "openai/gpt-5", label: "GPT-5" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1", note: "Open weights" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    blurb: "Claude models directly from Anthropic.",
    envVar: "ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-4-6", label: "Claude Opus 4.6", note: "Best for security review" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4", label: "Claude Haiku 4", note: "Fast triage" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    blurb: "GPT models directly from OpenAI.",
    envVar: "OPENAI_API_KEY",
    keyPrefix: "sk-",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 Mini", note: "Fast triage" },
      { id: "o4-mini", label: "o4-mini", note: "Reasoning, low cost" },
    ],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    blurb: "Grok models from xAI. Requires an AI Gateway key with xAI enabled.",
    envVar: "XAI_API_KEY",
    keyPrefix: "xai-",
    needsKey: true,
    keyUrl: "https://x.ai/api",
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-4-fast", label: "Grok 4 Fast", note: "Fast triage" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    blurb: "Run models fully offline on your machine. No code leaves your computer.",
    envVar: "OLLAMA_HOST",
    needsKey: false,
    keyUrl: "https://ollama.com",
    models: [
      { id: "qwen2.5-coder:14b", label: "Qwen2.5 Coder 14B", note: "Best local code model" },
      { id: "llama3.1:8b", label: "Llama 3.1 8B", note: "Lightweight" },
      { id: "deepseek-r1:14b", label: "DeepSeek R1 14B", note: "Reasoning" },
    ],
  },
]

export function getProvider(id: ProviderId): ProviderDef {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

/**
 * The out-of-the-box model: a text model that's free to run on OpenRouter.
 * When it's unavailable (no OpenRouter key, rate-limited, or errored) the CLI
 * transparently falls back to {@link FALLBACK_MODEL}.
 */
export const FREE_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free"
/** Zero-config fallback through the Vercel AI Gateway. */
export const FALLBACK_MODEL = "google/gemini-2.5-flash"

export interface CodeLensSettings {
  provider: ProviderId
  model: string
  /** Per-provider API keys, keyed by provider id. */
  keys: Partial<Record<ProviderId, string>>
  /** Run the AI security audit at all. */
  aiEnabled: boolean
  /** Strip obvious secrets from snippets before sending to the model. */
  redactSecrets: boolean
  /** Max source files sent to the model per run. */
  maxFiles: number
  /** Enable the in-dashboard AI chat assistant ("Ask AI"). */
  chatEnabled: boolean
  /** Persist chat history to .codelens/chats.json (vs. memory-only). */
  persistChats: boolean
  /** Optional GitHub token for higher API rate limits / private repos. */
  githubToken: string
  /** Optional default repo (owner/repo) for the Git & Releases tabs. */
  defaultRepo: string
}

export const DEFAULT_SETTINGS: CodeLensSettings = {
  provider: "openrouter",
  model: FREE_OPENROUTER_MODEL,
  keys: {},
  aiEnabled: true,
  redactSecrets: true,
  maxFiles: 25,
  chatEnabled: true,
  persistChats: true,
  githubToken: "",
  defaultRepo: "",
}

const STORAGE_KEY = "codelens.settings.v1"

export function loadSettings(): CodeLensSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<CodeLensSettings>
    return { ...DEFAULT_SETTINGS, ...parsed, keys: { ...DEFAULT_SETTINGS.keys, ...parsed.keys } }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: CodeLensSettings) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** Mask a key for display: keep first 4 and last 4 chars. */
export function maskKey(key: string): string {
  if (!key) return ""
  if (key.length <= 10) return "•".repeat(key.length)
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`
}

/**
 * Produce the `.codelens.json` the installed CLI consumes. The active
 * provider's key is written to its env var name; other keys are omitted.
 */
export function toConfigFile(settings: CodeLensSettings) {
  const provider = getProvider(settings.provider)
  const env: Record<string, string> = {}
  const key = settings.keys[settings.provider]
  if (provider.needsKey && key) env[provider.envVar] = key
  if (settings.githubToken.trim()) env.GITHUB_TOKEN = settings.githubToken.trim()

  return {
    ai: {
      enabled: settings.aiEnabled,
      provider: settings.provider,
      model: settings.model,
      fallbackModel: FALLBACK_MODEL,
      maxFiles: settings.maxFiles,
      redactSecrets: settings.redactSecrets,
    },
    chat: {
      enabled: settings.chatEnabled,
      persist: settings.persistChats,
      model: settings.model,
    },
    github: {
      ...(settings.defaultRepo.trim() ? { defaultRepo: settings.defaultRepo.trim() } : {}),
    },
    env,
  }
}
