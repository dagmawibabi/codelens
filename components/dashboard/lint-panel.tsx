"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CodeBlock } from "./code-block"
import { severityStyle } from "@/lib/severity"
import type { LintResult, LintMessage } from "@/lib/schema"

type Filter = "all" | "error" | "warning" | "fixable"

function FilterTab({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

function MessageRow({ msg }: { msg: LintMessage }) {
  const [open, setOpen] = useState(false)
  const sev = severityStyle(msg.severity)
  const hasSnippet = Boolean(msg.snippet)

  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => hasSnippet && setOpen((o) => !o)}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${hasSnippet ? "hover:bg-secondary/40" : "cursor-default"}`}
      >
        <span className={`mt-1 size-2 shrink-0 rounded-full ${sev.dot}`} aria-hidden />
        <span className="flex-1">
          <span className="text-sm text-foreground">{msg.message}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>
              {msg.line}:{msg.column}
            </span>
            {msg.ruleId && (
              <span className={`rounded px-1.5 py-0.5 ${sev.bg} ${sev.text}`}>{msg.ruleId}</span>
            )}
            {msg.fixable && (
              <span className="rounded bg-[color:var(--sev-ok)]/12 px-1.5 py-0.5 text-[color:var(--sev-ok)]">
                auto-fixable
              </span>
            )}
          </span>
        </span>
      </button>
      {open && msg.snippet && (
        <div className="px-4 pb-3">
          <CodeBlock startLine={msg.snippet.startLine} code={msg.snippet.code} highlightLine={msg.line} />
          {msg.fixable && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Fix with:{" "}
              <span className="text-foreground">eslint --fix {msg.filePath}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function LintPanel({ lint }: { lint: LintResult }) {
  const [filter, setFilter] = useState<Filter>("all")

  const filtered = useMemo(() => {
    return lint.messages.filter((m) => {
      if (filter === "all") return true
      if (filter === "fixable") return m.fixable
      return m.severity === filter
    })
  }, [lint.messages, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, LintMessage[]>()
    for (const m of filtered) {
      const arr = map.get(m.filePath) ?? []
      arr.push(m)
      map.set(m.filePath, arr)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  if (lint.unavailable) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        ESLint could not run. {lint.note}
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")} count={lint.messages.length}>
          All
        </FilterTab>
        <FilterTab active={filter === "error"} onClick={() => setFilter("error")} count={lint.errorCount}>
          Errors
        </FilterTab>
        <FilterTab active={filter === "warning"} onClick={() => setFilter("warning")} count={lint.warningCount}>
          Warnings
        </FilterTab>
        <FilterTab active={filter === "fixable"} onClick={() => setFilter("fixable")} count={lint.fixableCount}>
          Auto-fixable
        </FilterTab>
      </div>

      {grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No matching issues.</Card>
      ) : (
        grouped.map(([file, msgs]) => (
          <Card key={file} className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
              <span className="font-mono text-sm text-foreground">{file}</span>
              <Badge variant="secondary" className="font-mono text-xs">
                {msgs.length}
              </Badge>
            </div>
            <div>
              {msgs.map((m, i) => (
                <MessageRow key={`${m.line}-${m.column}-${i}`} msg={m} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
