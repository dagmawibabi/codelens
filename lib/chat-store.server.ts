import "server-only"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { StoredChat } from "./chat-types"

/**
 * Server-side persistence for Ask-AI chats. Mirrors the CLI's `.codelens`
 * convention (history.json / latest.json / insights.json) by writing chats to
 * `.codelens/chats.json` in the project root. This keeps conversation history
 * in the same place runs are stored, so it persists across dashboard sessions.
 */

const DIR = ".codelens"
const FILE = "chats.json"
const CONFIG = ".codelens.json"

function chatsPath() {
  return path.join(process.cwd(), DIR, FILE)
}

/**
 * Whether chats should be written to disk. Controlled by `chat.persist` in
 * `.codelens.json` (written by the dashboard Settings page). Defaults to true.
 * When false, chats live only in `memoryStore` for the server's lifetime.
 */
async function readConfig(): Promise<{ chat?: { persist?: boolean; enabled?: boolean; model?: string } }> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), CONFIG), "utf8")
    return JSON.parse(raw) as { chat?: { persist?: boolean; enabled?: boolean; model?: string } }
  } catch {
    return {}
  }
}

async function persistEnabled(): Promise<boolean> {
  return (await readConfig()).chat?.persist !== false
}

/** Chat-assistant config from `.codelens.json` (enabled flag + default model). */
export async function getChatConfig(): Promise<{ enabled: boolean; model?: string }> {
  const cfg = (await readConfig()).chat
  return { enabled: cfg?.enabled !== false, model: cfg?.model }
}

// In-memory fallback used when persistence is disabled.
let memoryStore: StoredChat[] = []

async function readAll(): Promise<StoredChat[]> {
  if (!(await persistEnabled())) return memoryStore
  try {
    const raw = await fs.readFile(chatsPath(), "utf8")
    const parsed = JSON.parse(raw) as StoredChat[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(chats: StoredChat[]): Promise<void> {
  if (!(await persistEnabled())) {
    memoryStore = chats
    return
  }
  const base = path.join(process.cwd(), DIR)
  await fs.mkdir(base, { recursive: true })
  await fs.writeFile(chatsPath(), JSON.stringify(chats, null, 2), "utf8")
}

/** All chats, most-recently-updated first. */
export async function listChats(): Promise<StoredChat[]> {
  const chats = await readAll()
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getChat(id: string): Promise<StoredChat | null> {
  const chats = await readAll()
  return chats.find((c) => c.id === id) ?? null
}

/** Insert or replace a chat, then persist the whole collection. */
export async function upsertChat(chat: StoredChat): Promise<StoredChat> {
  const chats = await readAll()
  const idx = chats.findIndex((c) => c.id === chat.id)
  if (idx === -1) chats.push(chat)
  else chats[idx] = chat
  await writeAll(chats)
  return chat
}

/** Replace just the message list + bump updatedAt for an existing chat. */
export async function saveChatMessages(
  id: string,
  messages: StoredChat["messages"],
): Promise<void> {
  const chats = await readAll()
  const idx = chats.findIndex((c) => c.id === id)
  if (idx === -1) return
  chats[idx] = { ...chats[idx], messages, updatedAt: new Date().toISOString() }
  await writeAll(chats)
}

export async function deleteChat(id: string): Promise<void> {
  const chats = await readAll()
  await writeAll(chats.filter((c) => c.id !== id))
}

export async function renameChat(id: string, title: string): Promise<void> {
  const chats = await readAll()
  const idx = chats.findIndex((c) => c.id === id)
  if (idx === -1) return
  chats[idx] = { ...chats[idx], title, updatedAt: new Date().toISOString() }
  await writeAll(chats)
}
