/**
 * Machine- and human-readable description of every HTTP endpoint this app
 * exposes. Served from `GET /api/docs` and rendered by the API Reference
 * viewer. Keep this in sync when adding or changing routes.
 */

export interface ApiField {
  /** Field name (path segment, query key, or body property). */
  name: string
  /** A short type hint, e.g. "string", "number", "UIMessage[]". */
  type: string
  /** Whether the field must be provided. */
  required: boolean
  /** What the field does. */
  description: string
}

export interface ApiEndpoint {
  /** HTTP method. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Route path, using `:param` for dynamic segments. */
  path: string
  /** One-line summary. */
  summary: string
  /** Longer description of behaviour. */
  description: string
  /** Logical grouping for the viewer. */
  group: string
  /** Dynamic path parameters. */
  pathParams?: ApiField[]
  /** Query-string parameters. */
  query?: ApiField[]
  /** Request body fields (JSON), when applicable. */
  body?: ApiField[]
  /** Description of the response payload. */
  returns: string
  /** Example response shape (stringified JSON or note). */
  returnsExample?: string
}

export interface ApiSpec {
  name: string
  version: string
  description: string
  generatedAt: string
  endpoints: ApiEndpoint[]
}

const ENDPOINTS: ApiEndpoint[] = [
  /* ----------------------------- AI Chat ----------------------------- */
  {
    method: "POST",
    path: "/api/chat",
    summary: "Stream an AI assistant response",
    description:
      "Accepts the full UI message history and streams back the assistant reply using the AI SDK. On completion the conversation is persisted to .codelens/chats.json so it survives reloads. Uses google/gemini-2.5-flash by default.",
    group: "AI Chat",
    body: [
      { name: "id", type: "string", required: true, description: "Chat id to persist the conversation under." },
      { name: "messages", type: "UIMessage[]", required: true, description: "Full message history from useChat (role + parts)." },
      { name: "model", type: "string", required: false, description: "Gateway model id. Defaults to google/gemini-2.5-flash." },
      { name: "seed", type: "ChatSeed", required: false, description: "Optional issue context used to title a brand-new chat." },
    ],
    returns: "Server-sent UI message stream (text/event-stream) consumed by useChat.",
    returnsExample: "SSE stream of UIMessageChunk objects",
  },
  {
    method: "GET",
    path: "/api/chats",
    summary: "List saved chats",
    description: "Returns chat summaries (id, title, timestamps, message count) ordered by most recently updated.",
    group: "AI Chat",
    returns: "{ chats: ChatSummary[] }",
    returnsExample: '{ "chats": [{ "id": "c_1", "title": "Fix XSS in login", "updatedAt": 1718000000000, "messageCount": 4 }] }',
  },
  {
    method: "POST",
    path: "/api/chats",
    summary: "Create a new chat",
    description: "Creates an empty chat record, optionally seeded with a title derived from an issue.",
    group: "AI Chat",
    body: [
      { name: "title", type: "string", required: false, description: "Initial chat title." },
      { name: "seed", type: "ChatSeed", required: false, description: "Issue context to seed the first message." },
    ],
    returns: "{ chat: ChatRecord }",
  },
  {
    method: "GET",
    path: "/api/chats/:id",
    summary: "Fetch one chat",
    description: "Returns a single chat with its full message history.",
    group: "AI Chat",
    pathParams: [{ name: "id", type: "string", required: true, description: "The chat id." }],
    returns: "{ chat: ChatRecord } or 404 if not found.",
  },
  {
    method: "DELETE",
    path: "/api/chats/:id",
    summary: "Delete a chat",
    description: "Removes a chat and its history from .codelens/chats.json.",
    group: "AI Chat",
    pathParams: [{ name: "id", type: "string", required: true, description: "The chat id to delete." }],
    returns: "{ ok: true }",
  },

  /* ----------------------------- Models ------------------------------ */
  {
    method: "GET",
    path: "/api/gateway-models",
    summary: "List live AI Gateway models",
    description: "Proxies the Vercel AI Gateway model list, returning text-capable models for the model picker.",
    group: "Models",
    returns: "{ models: { id: string; label: string }[] }",
  },
  {
    method: "GET",
    path: "/api/models-catalog",
    summary: "Detailed model catalog (models.dev)",
    description:
      "Fetches and normalizes the models.dev catalog: context limits, pricing, modalities, reasoning support, and release dates. Cached server-side. Supports text search and provider filtering.",
    group: "Models",
    query: [
      { name: "q", type: "string", required: false, description: "Case-insensitive search across id, name, and provider." },
      { name: "provider", type: "string", required: false, description: "Filter to a single provider id (e.g. google)." },
    ],
    returns: "{ models: CatalogModel[]; providers: string[]; updatedAt: number }",
  },

  /* ----------------------------- GitHub ------------------------------ */
  {
    method: "GET",
    path: "/api/github/repo",
    summary: "Repository overview",
    description:
      "Aggregates public GitHub data for a repo: stars, forks, issues, languages, top contributors, and recent commit activity. Uses the unauthenticated public API (rate-limited) unless GITHUB_TOKEN is set.",
    group: "GitHub",
    query: [
      { name: "owner", type: "string", required: true, description: "Repository owner / org." },
      { name: "repo", type: "string", required: true, description: "Repository name." },
    ],
    returns: "{ repo: RepoOverview }",
  },
  {
    method: "GET",
    path: "/api/github/releases",
    summary: "Releases with reactions & contributors",
    description:
      "Returns up to 100 releases including assets, reactions, and the resolved author for each, used by the Releases dashboard, heatmap, leaderboard, and comparison views.",
    group: "GitHub",
    query: [
      { name: "owner", type: "string", required: true, description: "Repository owner / org." },
      { name: "repo", type: "string", required: true, description: "Repository name." },
      { name: "perPage", type: "number", required: false, description: "Releases per page (max 100, default 100)." },
    ],
    returns: "{ releases: GithubRelease[] }",
  },

  /* ------------------------------ System ----------------------------- */
  {
    method: "DELETE",
    path: "/api/data",
    summary: "Delete persisted server-side data",
    description:
      "Removes CodeLens artifacts written under .codelens/ (run history, latest run, insights, and saved chats). Used by Settings → Data & storage. Browser localStorage is cleared separately on the client.",
    group: "System",
    query: [
      {
        name: "scope",
        type: '"all" | "runs" | "chats"',
        required: false,
        description: "Which artifacts to remove. 'runs' clears history/latest/insights, 'chats' clears chats, default 'all'.",
      },
    ],
    returns: "{ ok: true; scope: string; removed: string[] }",
    returnsExample: '{ "ok": true, "scope": "all", "removed": ["history.json", "chats.json"] }',
  },

  /* ---------------------------- Reference ---------------------------- */
  {
    method: "GET",
    path: "/api/docs",
    summary: "This API reference",
    description: "Returns the full machine-readable specification of every endpoint in this application.",
    group: "Reference",
    returns: "ApiSpec",
  },
]

export function getApiSpec(): ApiSpec {
  return {
    name: "CodeLens API",
    version: "1.0.0",
    description:
      "Internal HTTP API powering the CodeLens dashboard: AI chat, model catalogs, GitHub insights, and this self-describing reference.",
    generatedAt: new Date().toISOString(),
    endpoints: ENDPOINTS,
  }
}
