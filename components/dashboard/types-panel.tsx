"use client"

import { useMemo, useState } from "react"
import { ChevronRight, FileCode2, CheckCircle2, ListTree, Braces, AlertCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { InsightCard, CountList } from "./insights"
import { FileLink, useInspector, TrackedBadge } from "./inspector"
import { TypeExplorer } from "./type-explorer"
import { typeToIssue } from "@/lib/issues"
import type { TypeCheckResult, TypeDiagnostic } from "@/lib/schema"
import { cn } from "@/lib/utils"

function DiagnosticItem({ diag }: { diag: TypeDiagnostic }) {
  const { viewIssue } = useInspector()
  const hasChain = diag.related.length > 0

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => viewIssue(typeToIssue(diag))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            viewIssue(typeToIssue(diag))
          }
        }}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <FileCode2 className="size-3.5 shrink-0" />
            <FileLink path={diag.filePath} line={diag.line} column={diag.column} />
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {hasChain && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <ListTree className="size-3.5" />
                  {diag.related.length}
                </span>
              )}
              <span className="rounded-sm bg-[color:var(--sev-high)]/12 px-1.5 py-0.5 text-[color:var(--sev-high)]">
                {diag.code}
              </span>
            </span>
          </div>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{diag.message}</p>
        </div>
        <TrackedBadge issue={typeToIssue(diag)} variant="dot" className="mt-0.5" />
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>
    </Card>
  )
}

export function TypesPanel({ types }: { types: TypeCheckResult }) {
  const definitions = types.definitions ?? []
  const [view, setView] = useState<"diagnostics" | "explorer">("diagnostics")

  if (types.unavailable) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        TypeScript was not detected in this project. {types.note}
      </Card>
    )
  }

  const subTabs: { key: "diagnostics" | "explorer"; label: string; icon: typeof Braces; count: number }[] = [
    { key: "diagnostics", label: "Diagnostics", icon: AlertCircle, count: types.diagnostics.length },
    { key: "explorer", label: "Type explorer", icon: Braces, count: definitions.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1 self-start rounded-sm border border-border bg-card p-1">
        {subTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            disabled={t.key === "explorer" && definitions.length === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
              view === t.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>

      {view === "explorer" && definitions.length > 0 ? (
        <TypeExplorer definitions={definitions} />
      ) : (
        <DiagnosticsView types={types} />
      )}
    </div>
  )
}

function DiagnosticsView({ types }: { types: TypeCheckResult }) {
  const fileRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of types.diagnostics) map.set(d.filePath, (map.get(d.filePath) ?? 0) + 1)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [types.diagnostics])

  const codeRows = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of types.diagnostics) map.set(d.code, (map.get(d.code) ?? 0) + 1)
    return [...map.entries()].map(([key, count]) => ({ key, label: key, count })).sort((a, b) => b.count - a.count)
  }, [types.diagnostics])

  if (types.diagnostics.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <CheckCircle2 className="size-8 text-[color:var(--sev-ok)]" />
        <div>
          <p className="text-sm font-medium text-foreground">No type errors</p>
          <p className="text-sm text-muted-foreground">{"tsc --noEmit passed cleanly."}</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title="Affected files">
          <CountList rows={fileRows} />
        </InsightCard>
        <InsightCard title="Error codes">
          <CountList rows={codeRows} />
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {types.diagnostics.length} type {types.diagnostics.length === 1 ? "error" : "errors"} — click to expand the
          diagnostic chain
        </p>
        {types.diagnostics.map((diag, i) => (
          <DiagnosticItem key={`${diag.filePath}-${diag.line}-${i}`} diag={diag} />
        ))}
      </div>
    </div>
  )
}
