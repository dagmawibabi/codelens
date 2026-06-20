"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Search, ChevronRight, Loader2, Code2, ArrowRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { InsightCard } from "./insights"
import type { ApiSpec, ApiEndpoint, ApiField } from "@/lib/api-spec"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Color per HTTP method for quick scanning. */
const METHOD_STYLE: Record<string, string> = {
  GET: "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]",
  POST: "bg-primary/15 text-primary",
  PUT: "bg-[color:var(--sev-warn)]/15 text-[color:var(--sev-warn)]",
  PATCH: "bg-[color:var(--sev-warn)]/15 text-[color:var(--sev-warn)]",
  DELETE: "bg-destructive/15 text-destructive",
}

export function ApiReference() {
  const { data, isLoading } = useSWR<ApiSpec>("/api/docs", fetcher)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<string | null>(null)

  const endpoints = data?.endpoints ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return endpoints
    return endpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q),
    )
  }, [endpoints, query])

  // Group endpoints by their logical group, preserving first-seen order.
  const groups = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>()
    for (const e of filtered) {
      const list = map.get(e.group) ?? []
      list.push(e)
      map.set(e.group, list)
    }
    return [...map.entries()]
  }, [filtered])

  const selected = useMemo(
    () => endpoints.find((e) => `${e.method} ${e.path}` === active) ?? null,
    [endpoints, active],
  )

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading API reference…
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-muted-foreground" />
            <h2 className="font-mono text-sm font-medium text-foreground">{data?.name}</h2>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{data?.version}
            </span>
          </div>
          <p className="text-pretty text-sm text-muted-foreground">{data?.description}</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search endpoints by path, method, or group…"
            className="w-full rounded-sm border border-border bg-card py-2 pl-9 pr-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30"
          />
        </div>

        {/* Endpoint list */}
        <div className="flex flex-col gap-5">
          {groups.map(([group, items]) => (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{group}</h3>
              <div className="flex flex-col gap-1.5">
                {items.map((e) => {
                  const id = `${e.method} ${e.path}`
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActive(id)}
                      className={cn(
                        "flex items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors",
                        active === id
                          ? "border-foreground/30 bg-foreground/[0.05]"
                          : "border-border bg-card hover:border-foreground/20",
                      )}
                    >
                      <span
                        className={cn(
                          "w-14 shrink-0 rounded-sm px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold",
                          METHOD_STYLE[e.method],
                        )}
                      >
                        {e.method}
                      </span>
                      <span className="flex-1 truncate font-mono text-xs text-foreground">{e.path}</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:block">{e.summary}</span>
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No endpoints match “{query}”.</Card>
          )}
        </div>
      </div>

      {/* Detail rail */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        {selected ? (
          <EndpointDetail endpoint={selected} />
        ) : (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <ArrowRight className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Select an endpoint to see its parameters, body, and response.</p>
          </Card>
        )}
      </aside>
    </div>
  )
}

function EndpointDetail({ endpoint }: { endpoint: ApiEndpoint }) {
  return (
    <div className="flex flex-col gap-4">
      <InsightCard title="Endpoint">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                METHOD_STYLE[endpoint.method],
              )}
            >
              {endpoint.method}
            </span>
            <code className="break-all font-mono text-xs text-foreground">{endpoint.path}</code>
          </div>
          <p className="text-pretty text-sm text-muted-foreground">{endpoint.description}</p>
        </div>
      </InsightCard>

      {endpoint.pathParams?.length ? <FieldTable title="Path parameters" fields={endpoint.pathParams} /> : null}
      {endpoint.query?.length ? <FieldTable title="Query parameters" fields={endpoint.query} /> : null}
      {endpoint.body?.length ? <FieldTable title="Request body" fields={endpoint.body} /> : null}

      <InsightCard title="Response">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground">{endpoint.returns}</p>
          {endpoint.returnsExample && (
            <pre className="overflow-x-auto rounded-sm bg-secondary/60 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {endpoint.returnsExample}
            </pre>
          )}
        </div>
      </InsightCard>
    </div>
  )
}

function FieldTable({ title, fields }: { title: string; fields: ApiField[] }) {
  return (
    <InsightCard title={title}>
      <div className="flex flex-col divide-y divide-border">
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs font-medium text-foreground">{f.name}</code>
              <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {f.type}
              </span>
              {f.required ? (
                <span className="font-mono text-[10px] text-destructive">required</span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">optional</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </InsightCard>
  )
}
