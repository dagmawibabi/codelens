import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { getChat, saveChatMessages, upsertChat, getChatConfig } from "@/lib/chat-store.server"
import { deriveTitle, type ChatSeed, type StoredChat } from "@/lib/chat-types"

// AI SDK must not run on the edge runtime.
export const maxDuration = 60

/** Default chat model — the Vercel AI Gateway resolves this with zero config. */
const DEFAULT_MODEL = "google/gemini-2.5-flash"

const BASE_SYSTEM = `You are CodeLens Assistant, an expert software engineer embedded in a local
code-analysis dashboard. You help developers understand and fix issues surfaced by the
dashboard: lint errors, type errors, security findings, dependency advisories, environment
and network problems, accessibility violations, performance and database issues, auth
configuration, and git/CI concerns.

Guidelines:
- Be concise and concrete. Lead with the answer, then the reasoning.
- Prefer minimal, correct code. Use fenced code blocks with a language tag.
- When given a specific issue as context, ground your answer in that issue: explain the
  root cause, the real-world risk, and the smallest safe fix.
- Call out tradeoffs and follow-ups. Never invent file contents you weren't given.
- Use Markdown: short paragraphs, bullet lists, and code blocks.`

function seedToSystem(seed: ChatSeed | null | undefined): string {
  if (!seed) return ""
  const lines = [
    `\n\nThe user opened this chat from a "${seed.source}" issue in the dashboard.`,
    `Issue: ${seed.title}`,
    seed.severity ? `Severity: ${seed.severity}` : "",
    seed.filePath ? `Location: ${seed.filePath}${seed.line ? `:${seed.line}` : ""}` : "",
    seed.summary ? `Details:\n${seed.summary}` : "",
  ].filter(Boolean)
  return lines.join("\n")
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id: string
    messages: UIMessage[]
    model?: string
    seed?: ChatSeed | null
  }

  const { id, messages } = body

  // Honor the dashboard Settings: disabling the assistant blocks the API too.
  const chatConfig = await getChatConfig()
  if (!chatConfig.enabled) {
    return new Response("The AI chat assistant is disabled in settings.", { status: 403 })
  }

  // Model precedence: explicit request → configured default → built-in default.
  const model = body.model?.trim() || chatConfig.model?.trim() || DEFAULT_MODEL

  // Ensure a chat record exists so persistence on finish has something to update.
  let chat = id ? await getChat(id) : null
  if (!chat && id) {
    const firstUserText =
      messages
        .find((m) => m.role === "user")
        ?.parts.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ") ?? ""
    const now = new Date().toISOString()
    chat = {
      id,
      title: body.seed?.title ? `${body.seed.title}` : deriveTitle(firstUserText),
      model,
      createdAt: now,
      updatedAt: now,
      seed: body.seed ?? null,
      messages: [],
    } satisfies StoredChat
    await upsertChat(chat)
  }

  const system = BASE_SYSTEM + seedToSystem(chat?.seed ?? body.seed)

  const result = streamText({
    model,
    system,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      if (id) await saveChatMessages(id, finalMessages)
    },
  })
}
