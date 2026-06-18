"use client"

import { useMemo } from "react"
import { ChevronRight, FileCode2, CheckCircle2, ListTree } from "lucide-react"
import { Card } from "@/components/ui/card"
import { InsightCard, CountList } from "./insights"
import { FileLink, useInspector } from "./inspector"
import { typeToIssue } from "@/lib/issues"
import type { TypeCheckResult, TypeDiagnostic } from "@/lib/schema"
import { cn } from "@/lib/utils"

function DiagnosticItem({ diag }: { diag: TypeDiagnostic }) {
  const [open, setOpen] = useState(false)
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
        <ChevronRight
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
            !hasChain && "opacity-0",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <FileCode2 className="size-3.5 shrink-0" />
            <span className="truncate text-foreground">{diag.filePath}</span>
            <span className="text-[color:var(--sev-high)]">
              {diag.line}:{diag.column}
            </span>
            <span className="ml-auto shrink-0 rounded-sm bg-[color:var(--sev-high)]/12 px-1.5 py-0.5 text-[color:var(--sev-high)]">
              {diag.code}
            </span>
          </div>
          <p className="mt-1.5 text-pretty text-sm leading-relaxed text-foreground">{diag.message}</p>
        </div>
      </button>

      {open && hasChain && (
        <div className="border-t border-border bg-secondary/20 px-4 py-3">
          <ol className="relative ml-2 border-l border-border">
            {diag.related.map((step, i) => (
              <li
                key={i}
                className="relative py-1.5 text-sm leading-relaxed text-muted-foreground"
                style={{ paddingLeft: `${step.depth * 12 + 20}px` }}
              >
                <span
                  className="absolute top-3 size-1.5 rounded-full bg-muted-foreground/40"
                  style={{ left: `${step.depth * 12 + 4}px` }}
                  aria-hidden
                />
                {step.message}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}

export function TypesPanel({ types }: { types: TypeCheckResult }) {
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

  if (types.unavailable) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        TypeScript was not detected in this project. {types.note}
      </Card>
    )
  }

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
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
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
