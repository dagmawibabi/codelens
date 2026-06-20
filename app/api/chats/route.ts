import { NextResponse } from "next/server"
import { listChats, upsertChat } from "@/lib/chat-store.server"
import { chatToSummary, type ChatSeed, type StoredChat } from "@/lib/chat-types"

/** GET /api/chats — history list (summaries, most recent first). */
export async function GET() {
  const chats = await listChats()
  return NextResponse.json({ chats: chats.map(chatToSummary) })
}

/** POST /api/chats — create an empty chat (optionally seeded from an issue). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    model?: string
    seed?: ChatSeed | null
  }
  const now = new Date().toISOString()
  const chat: StoredChat = {
    id: crypto.randomUUID(),
    title: body.title?.trim() || body.seed?.title || "New chat",
    model: body.model?.trim() || "google/gemini-2.5-flash",
    createdAt: now,
    updatedAt: now,
    seed: body.seed ?? null,
    messages: [],
  }
  await upsertChat(chat)
  return NextResponse.json({ chat })
}
