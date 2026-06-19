"use client"

import { useMemo, useState } from "react"
import { X, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { InsightCard, ProportionBar, CountList } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { severityStyle } from "@/lib/severity"
import { lintToIssue } from "@/lib/issues"
import type { LintResult, LintMessage } from "@/lib/schema"

type Filter = "all" | "error" | "warning" | "fixable"
type GroupBy = "file" | "rule"

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
      className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

function MessageRow({ msg, showFile }: { msg: LintMessage; showFile?: boolean }) {
  const { viewIssue } = useInspector()
  const sev = severityStyle(msg.severity)

  return (
    <div className="border-t border-border first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => viewIssue(lintToIssue(msg))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            viewIssue(lintToIssue(msg))
          }
        }}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <span className={`mt-1 size-2 shrink-0 rounded-full ${sev.dot}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-sm text-foreground">{msg.message}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            {showFile && <FileLink path={msg.filePath} line={msg.line} column={msg.column} />}
            {!showFile && (
              <span>
                {msg.line}:{msg.column}
              </span>
            )}
            {!showFile && msg.ruleId && (
              <span className={`rounded-sm px-1.5 py-0.5 ${sev.bg} ${sev.text}`}>{msg.ruleId}</span>
            )}
            {msg.fixable && (
              <span className="rounded-sm bg-[color:var(--sev-ok)]/12 px-1.5 py-0.5 text-[color:var(--sev-ok)]">
                auto-fixable
              </span>
            )}
          </span>
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  )
}

export function LintPanel({ lint }: { lint: LintResult }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [groupBy, setGroupBy] = useState<GroupBy>("file")
  const [ruleFilter, setRuleFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return lint.messages.filter((m) => {
      if (ruleFilter && m.ruleId !== ruleFilter) return false
      if (filter === "all") return true
      if (filter === "fixable") return m.fixable
      return m.severity === filter
    })
  }, [lint.messages, filter, ruleFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, LintMessage[]>()
    for (const m of filtered) {
      const key = groupBy === "file" ? m.filePath : (m.ruleId ?? "(no rule)")
      const arr = map.get(key) ?? []
      arr.push(m)
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered, groupBy])

  // Rule frequency across ALL messages — stable side-rail navigation.
  const ruleRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of lint.messages) {
      const k = m.ruleId ?? "(no rule)"
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count)
  }, [lint.messages])

  if (lint.unavailable) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">ESLint could not run. {lint.note}</Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      {/* Insights rail */}
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Breakdown">
          <ProportionBar
            segments={[
              { label: "Errors", value: lint.errorCount, color: "var(--sev-critical)" },
              { label: "Warnings", value: lint.warningCount, color: "var(--sev-medium)" },
            ]}
          />
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{lint.fixableCount}</span> of{" "}
            <span className="font-mono text-foreground">{lint.messages.length}</span> auto-fixable
          </p>
        </InsightCard>

        <InsightCard
          title="Rules"
          action={
            ruleFilter ? (
              <button
                type="button"
                onClick={() => setRuleFilter(null)}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                clear <X className="size-3" />
              </button>
            ) : undefined
          }
        >
          <CountList rows={ruleRows} activeKey={ruleFilter} onSelect={(k) => setRuleFilter((p) => (p === k ? null : k))} />
        </InsightCard>
      </aside>

      {/* Main list */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
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

          {/* Group-by toggle */}
          <div className="flex items-center gap-1 rounded-sm border border-border bg-card p-1">
            <span className="px-2 font-mono text-[10px] uppercase text-muted-foreground">Group</span>
            <button
              type="button"
              onClick={() => setGroupBy("file")}
              className={`rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
                groupBy === "file" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => setGroupBy("rule")}
              className={`rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
                groupBy === "rule" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Rule
            </button>
          </div>
        </div>

        {ruleFilter && (
          <div className="flex items-center gap-2 rounded-sm border border-border bg-secondary/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Filtered by rule</span>
            <span className="font-mono text-foreground">{ruleFilter}</span>
            <button
              type="button"
              onClick={() => setRuleFilter(null)}
              className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              clear <X className="size-3" />
            </button>
          </div>
        )}

        {grouped.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">No matching issues.</Card>
        ) : (
          grouped.map(([key, msgs]) => {
            const headSev = groupBy === "rule" ? severityStyle(msgs[0].severity) : null
            return (
              <Card key={key} className="gap-0 overflow-hidden py-0">
                <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {headSev && <span className={`size-2 shrink-0 rounded-full ${headSev.dot}`} aria-hidden />}
                    {groupBy === "file" ? (
                      <FileLink path={key} className="truncate text-sm" />
                    ) : (
                      <span className="truncate font-mono text-sm text-foreground">{key}</span>
                    )}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {msgs.length}
                  </Badge>
                </div>
                <div>
                  {msgs.map((m, i) => (
                    <MessageRow key={`${m.filePath}-${m.line}-${m.column}-${i}`} msg={m} showFile={groupBy === "rule"} />
                  ))}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
