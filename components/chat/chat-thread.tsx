"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Square, Sparkles, FileCode2, AlertTriangle, Terminal } from "lucide-react"
import { Markdown } from "./markdown"
import { ModelPicker } from "@/components/settings/model-picker"
import { severityStyle } from "@/lib/severity"
import type { ChatSeed } from "@/lib/chat-types"
import { cn } from "@/lib/utils"

function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

const SUGGESTIONS = [
  "Explain this issue in plain language",
  "What's the smallest safe fix?",
  "Show me a corrected code example",
  "What are the security implications?",
]

export function ChatThread({
  chatId,
  initialMessages,
  model,
  onModelChange,
  seed,
  onActivity,
}: {
  chatId: string
  initialMessages: UIMessage[]
  model: string
  /** Lets the footer model label open the detailed picker. */
  onModelChange?: (id: string) => void
  seed?: ChatSeed | null
  /** Fired after messages change so the history list can refresh. */
  onActivity?: () => void
}) {
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { id, messages, model, seed },
      }),
    }),
    onFinish: () => onActivity?.(),
  })

  const busy = status === "streaming" || status === "submitted"

  // Keep the view pinned to the newest content while streaming.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  function submit(text: string) {
    const value = text.trim()
    if (!value || busy) return
    sendMessage({ text: value })
    setInput("")
    onActivity?.()
  }

  const empty = messages.length === 0
  const sev = seed?.severity ? severityStyle(seed.severity as never) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Seed context chip */}
      {seed && (
        <div className="shrink-0 border-b border-border bg-card/50 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {sev && (
                  <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase", sev.bg, sev.text)}>
                    {sev.label}
                  </span>
                )}
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {seed.source}
                </span>
                <span className="truncate font-mono text-xs text-foreground">{seed.title}</span>
              </div>
              {seed.filePath && (
                <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <FileCode2 className="size-3" />
                  {seed.filePath}
                  {seed.line ? `:${seed.line}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10 text-center">
            <div className="flex size-11 items-center justify-center rounded-sm border border-border text-foreground">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h2 className="font-mono text-sm font-semibold text-foreground">
                {seed ? "Ask about this issue" : "How can I help?"}
              </h2>
              <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
                {seed
                  ? "I have the issue details as context. Ask for an explanation, a fix, or the security impact."
                  : "Ask about any finding from your analysis — lint, types, security, dependencies and more."}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-sm border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
                    <Sparkles className="size-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    "min-w-0 max-w-[85%] rounded-sm px-3.5 py-2.5",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card",
                  )}
                >
                  {m.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{messageText(m)}</p>
                  ) : (
                    <Markdown>{messageText(m) || (busy ? "…" : "")}</Markdown>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground">
                    <Terminal className="size-3.5" />
                  </div>
                )}
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
                  <Sparkles className="size-3.5 animate-pulse" />
                </div>
                <div className="rounded-sm border border-border bg-card px-3.5 py-2.5">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer — extra bottom padding keeps the send button clear of the
          global demo-data banner pinned to the viewport bottom. */}
      <div className="shrink-0 border-t border-border bg-card/50 px-4 py-3 pb-14 sm:pb-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <div className="flex flex-1 items-end rounded-sm border border-border bg-background focus-within:border-foreground/30">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit(input)
                }
              }}
              rows={1}
              placeholder="Ask CodeLens Assistant…"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              aria-label="Stop generating"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-card text-foreground transition-colors hover:bg-secondary"
            >
              <Square className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </form>
        <p className="mx-auto mt-1.5 flex max-w-3xl items-center gap-1 font-mono text-[10px] text-muted-foreground">
          {onModelChange ? (
            <ModelPicker
              value={model}
              onChange={onModelChange}
              triggerClassName="rounded-sm px-1 text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:bg-secondary"
            >
              {model}
            </ModelPicker>
          ) : (
            <span className="text-foreground">{model}</span>
          )}
          <span>· responses can be inaccurate — verify important fixes</span>
        </p>
      </div>
    </div>
  )
}
