"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import type { UIMessage } from "ai"
import { Plus, MessageSquare, Trash2, Sparkles, Loader2, ShieldAlert } from "lucide-react"
import { ChatThread } from "./chat-thread"
import { loadSettings } from "@/lib/settings"
import type { ChatSeed, ChatSummary } from "@/lib/chat-types"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function ChatView({
  pendingSeed,
  seedNonce,
}: {
  /** Seed handed off from an "Ask AI" button in a detail sheet. */
  pendingSeed?: ChatSeed | null
  /** Increments each time a new "Ask AI" request is made, to trigger a new chat. */
  seedNonce?: number
}) {
  const [model, setModel] = useState("google/gemini-2.5-flash")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeMessages, setActiveMessages] = useState<UIMessage[]>([])
  const [activeSeed, setActiveSeed] = useState<ChatSeed | null>(null)
  const [loadingChat, setLoadingChat] = useState(false)
  const lastSeedNonce = useRef<number | undefined>(undefined)

  const { data, mutate, isLoading } = useSWR<{ chats: ChatSummary[] }>("/api/chats", fetcher, {
    revalidateOnFocus: false,
  })
  const chats = data?.chats ?? []

  useEffect(() => {
    setModel(loadSettings().model)
  }, [])

  const startNewChat = useCallback((seed: ChatSeed | null = null) => {
    setActiveId(crypto.randomUUID())
    setActiveMessages([])
    setActiveSeed(seed)
  }, [])

  // Respond to "Ask AI" deep-links from detail sheets.
  useEffect(() => {
    if (seedNonce === undefined || seedNonce === lastSeedNonce.current) return
    lastSeedNonce.current = seedNonce
    startNewChat(pendingSeed ?? null)
  }, [seedNonce, pendingSeed, startNewChat])

  // Default to a fresh chat on first mount when nothing is selected.
  useEffect(() => {
    if (activeId === null && seedNonce === undefined) startNewChat(null)
  }, [activeId, seedNonce, startNewChat])

  async function openChat(id: string) {
    if (id === activeId) return
    setLoadingChat(true)
    try {
      const res = await fetch(`/api/chats/${id}`)
      const json = (await res.json()) as { chat?: { messages: UIMessage[]; seed?: ChatSeed | null; model?: string } }
      setActiveId(id)
      setActiveMessages(json.chat?.messages ?? [])
      setActiveSeed(json.chat?.seed ?? null)
      if (json.chat?.model) setModel(json.chat.model)
    } finally {
      setLoadingChat(false)
    }
  }

  async function removeChat(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/chats/${id}`, { method: "DELETE" })
    if (id === activeId) startNewChat(null)
    mutate()
  }

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 overflow-hidden rounded-sm border border-border bg-card">
      {/* History rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <div className="shrink-0 p-3">
          <button
            type="button"
            onClick={() => startNewChat(null)}
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-3 py-2 font-mono text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <p className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            History
          </p>
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 font-mono text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> loading…
            </div>
          ) : chats.length === 0 ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              No conversations yet. Saved chats appear here and persist in{" "}
              <span className="font-mono">.codelens/chats.json</span>.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {chats.map((c) => {
                const active = c.id === activeId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      className={cn(
                        "group flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors",
                        active ? "bg-secondary" : "hover:bg-secondary/50",
                      )}
                    >
                      {c.seedSource ? (
                        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground">{c.title}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                          {relativeTime(c.updatedAt)} · {c.messageCount} msg
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Delete chat"
                        onClick={(e) => removeChat(c.id, e)}
                        className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-3 py-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <Sparkles className="size-3" />
            Model set in Settings
          </p>
        </div>
      </aside>

      {/* Active conversation */}
      <div className="min-w-0 flex-1">
        {loadingChat ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeId ? (
          <ChatThread
            key={activeId}
            chatId={activeId}
            initialMessages={activeMessages}
            model={model}
            seed={activeSeed}
            onActivity={() => mutate()}
          />
        ) : null}
      </div>
    </div>
  )
}
