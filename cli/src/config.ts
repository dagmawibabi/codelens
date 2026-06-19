import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Shape of the `.codelens.json` file the dashboard's Settings page generates.
 * Every field is optional so older / partial files still load cleanly.
 */
export interface CodeLensFileConfig {
  ai?: {
    enabled?: boolean
    provider?: string
    model?: string
    fallbackModel?: string
    maxFiles?: number
    redactSecrets?: boolean
  }
  chat?: {
    enabled?: boolean
    persist?: boolean
    model?: string
  }
  github?: {
    defaultRepo?: string
  }
  /** Extra environment variables (e.g. AI_GATEWAY_API_KEY, GITHUB_TOKEN). */
  env?: Record<string, string>
}

export interface ResolvedConfig {
  aiEnabled: boolean
  model: string
  /** Model used when the primary model errors or is unavailable. */
  fallbackModel: string
  maxFiles: number
  redactSecrets: boolean
  chatEnabled: boolean
  persistChats: boolean
  defaultRepo: string | null
}

const DEFAULTS: ResolvedConfig = {
  aiEnabled: true,
  // A text model that's free to run on OpenRouter; the audit falls back to
  // FALLBACK_MODEL (Gemini 2.5 Flash via the AI Gateway) if it's unavailable.
  model: "meta-llama/llama-3.3-70b-instruct:free",
  fallbackModel: "google/gemini-2.5-flash",
  maxFiles: 25,
  redactSecrets: true,
  chatEnabled: true,
  persistChats: true,
  defaultRepo: null,
}

let cached: ResolvedConfig | null = null

/** Read and parse `.codelens.json` from the project root, if present. */
function readFileConfig(cwd: string): CodeLensFileConfig {
  try {
    const raw = readFileSync(join(cwd, ".codelens.json"), "utf8")
    const parsed = JSON.parse(raw) as CodeLensFileConfig
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Load the effective CLI configuration. Merges, in priority order:
 *   1. process.env  (highest — explicit overrides / CI secrets)
 *   2. .codelens.json
 *   3. built-in defaults
 *
 * As a side effect, any `env` entries in the file that are not already set in
 * the real environment are applied to process.env, so the AI Gateway key and
 * GITHUB_TOKEN written by the dashboard "just work" for the CLI.
 */
export function loadConfig(cwd: string = process.cwd()): ResolvedConfig {
  if (cached) return cached

  const file = readFileConfig(cwd)

  // Hydrate process.env from the file without clobbering real env vars.
  if (file.env) {
    for (const [key, value] of Object.entries(file.env)) {
      if (value && !process.env[key]) process.env[key] = value
    }
  }

  const model =
    process.env.CODELENS_MODEL ?? file.ai?.model ?? DEFAULTS.model
  const fallbackModel =
    process.env.CODELENS_FALLBACK_MODEL ?? file.ai?.fallbackModel ?? DEFAULTS.fallbackModel

  cached = {
    aiEnabled: file.ai?.enabled ?? DEFAULTS.aiEnabled,
    model,
    fallbackModel,
    maxFiles: Number(process.env.CODELENS_MAX_FILES) || file.ai?.maxFiles || DEFAULTS.maxFiles,
    redactSecrets: file.ai?.redactSecrets ?? DEFAULTS.redactSecrets,
    chatEnabled: file.chat?.enabled ?? DEFAULTS.chatEnabled,
    persistChats: file.chat?.persist ?? DEFAULTS.persistChats,
    defaultRepo: file.github?.defaultRepo?.trim() || process.env.CODELENS_REPO?.trim() || DEFAULTS.defaultRepo,
  }
  return cached
}

/** Reset the memoized config (used by tests). */
export function resetConfigCache() {
  cached = null
}
