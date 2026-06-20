import { NextResponse } from "next/server"
import { deleteChat, getChat, renameChat } from "@/lib/chat-store.server"

/** GET /api/chats/:id — full chat (with messages) for hydration. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chat = await getChat(id)
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ chat })
}

/** PATCH /api/chats/:id — rename. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { title?: string }
  if (typeof body.title === "string") await renameChat(id, body.title)
  const chat = await getChat(id)
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ chat })
}

/** DELETE /api/chats/:id — remove a conversation from history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deleteChat(id)
  return NextResponse.json({ ok: true })
}
