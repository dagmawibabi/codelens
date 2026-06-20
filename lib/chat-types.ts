import type { UIMessage } from "ai"

/**
 * A persisted Ask-AI conversation. Stored as plain JSON in `.codelens/chats.json`,
 * the same folder the CLI writes run history/insights to, so chat history lives
 * alongside analysis runs and survives across sessions.
 */
export interface StoredChat {
  id: string
  title: string
  /** Model id used for this conversation (e.g. "google/gemini-2.5-flash"). */
  model: string
  createdAt: string
  updatedAt: string
  /** Optional issue/context this chat was seeded from (the "Ask AI" entry point). */
  seed?: ChatSeed | null
  messages: UIMessage[]
}

/** Lightweight chat descriptor for the history list (no message bodies). */
export interface ChatSummary {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messageCount: number
  seedSource?: string | null
}

/**
 * Structured context captured when a chat is started from an issue detail sheet.
 * Rendered as a context chip in the chat and folded into the system prompt.
 */
export interface ChatSeed {
  /** Where the chat was launched from, e.g. "security", "git", "deps". */
  source: string
  title: string
  /** Human-readable summary lines shown as the context chip + sent to the model. */
  summary: string
  filePath?: string
  line?: number
  severity?: string
}

export function chatToSummary(c: StoredChat): ChatSummary {
  return {
    id: c.id,
    title: c.title,
    model: c.model,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    seedSource: c.seed?.source ?? null,
  }
}

/** Derive a short chat title from the first user message text. */
export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return "New chat"
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean
}
