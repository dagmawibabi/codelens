"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Search,
  Check,
  Loader2,
  Brain,
  Wrench,
  Paperclip,
  Unlock,
  Sparkles,
  X,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { CatalogModel } from "@/app/api/models-catalog/route"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type CapabilityFilter = "all" | "reasoning" | "toolCall" | "attachment" | "openWeights"

const CAPABILITY_FILTERS: { id: CapabilityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reasoning", label: "Reasoning" },
  { id: "toolCall", label: "Tools" },
  { id: "attachment", label: "Multimodal" },
  { id: "openWeights", label: "Open weights" },
]

/** Format a context window (in tokens) compactly: 1048576 -> "1M". */
function formatTokens(n?: number): string | null {
  if (!n) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

/** Format a per-1M-token price. */
function formatCost(n?: number): string | null {
  if (n == null) return null
  if (n === 0) return "$0"
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(2).replace(/\.00$/, "")}`
}

function CapabilityBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  )
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: CatalogModel
  selected: boolean
  onSelect: () => void
}) {
  const ctx = formatTokens(model.contextLimit)
  const inCost = formatCost(model.cost?.input)
  const outCost = formatCost(model.cost?.output)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-2 rounded-sm border p-3 text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/[0.06]"
          : "border-border bg-card hover:border-foreground/20 hover:bg-secondary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{model.name}</span>
            {selected && <Check className="size-3.5 shrink-0 text-primary" />}
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{model.id}</p>
        </div>
        <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {model.providerName}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {model.reasoning && <CapabilityBadge icon={Brain} label="reasoning" />}
        {model.toolCall && <CapabilityBadge icon={Wrench} label="tools" />}
        {model.attachment && <CapabilityBadge icon={Paperclip} label="multimodal" />}
        {model.openWeights && <CapabilityBadge icon={Unlock} label="open" />}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
        {ctx && <span>{ctx} ctx</span>}
        {inCost && (
          <span>
            in {inCost}
            <span className="text-muted-foreground/60">/1M</span>
          </span>
        )}
        {outCost && (
          <span>
            out {outCost}
            <span className="text-muted-foreground/60">/1M</span>
          </span>
        )}
        {model.releaseDate && <span>{model.releaseDate}</span>}
      </div>
    </button>
  )
}

export function ModelPicker({
  value,
  onChange,
  /** Custom trigger content. When provided, replaces the default box trigger. */
  children,
  triggerClassName,
}: {
  value: string
  onChange: (id: string) => void
  children?: React.ReactNode
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<CapabilityFilter>("all")

  const { data, isLoading, error } = useSWR<{ models?: CatalogModel[]; error?: string }>(
    open ? "/api/models-catalog" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 600000 },
  )

  const models = useMemo(() => data?.models ?? [], [data])

  const selected = useMemo(() => models.find((m) => m.id === value), [models, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter((m) => {
      if (filter === "reasoning" && !m.reasoning) return false
      if (filter === "toolCall" && !m.toolCall) return false
      if (filter === "attachment" && !m.attachment) return false
      if (filter === "openWeights" && !m.openWeights) return false
      if (!q) return true
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.providerName.toLowerCase().includes(q) ||
        (m.family?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [models, query, filter])

  // Separate free models from paid ones
  const freeModels = useMemo(() => filtered.filter((m) => m.freeOpenRouter), [filtered])
  const paidModels = useMemo(() => filtered.filter((m) => !m.freeOpenRouter), [filtered])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children ? (
        <DialogTrigger className={triggerClassName}>{children}</DialogTrigger>
      ) : (
        <DialogTrigger className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2 text-left font-mono text-sm transition-colors hover:border-foreground/20">
          <span className="truncate text-foreground">{value || "Select a model"}</span>
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm">
            <Sparkles className="size-4" />
            Choose a model
          </DialogTitle>
          <DialogDescription className="text-xs">
            Live catalog from models.dev — search by name, provider, or capability.
          </DialogDescription>
        </DialogHeader>

        {/* Search + filters */}
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-full rounded-sm border border-border bg-background py-2 pl-9 pr-8 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {CAPABILITY_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors",
                  filter === f.id
                    ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 font-mono text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading catalog…
            </div>
          ) : error || data?.error ? (
            <div className="py-12 text-center font-mono text-sm text-muted-foreground">
              Could not load the model catalog. Try again shortly.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center font-mono text-sm text-muted-foreground">
              No models match "{query}".
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Free OpenRouter models section */}
              {freeModels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sev-ok)]">Free on OpenRouter</span>
                    <span className="rounded-sm bg-[color:var(--sev-ok)]/12 px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--sev-ok)]">
                      {freeModels.length}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {freeModels.map((m) => (
                      <ModelRow
                        key={m.id}
                        model={m}
                        selected={m.id === value}
                        onSelect={() => {
                          onChange(m.id)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Paid models section */}
              {paidModels.length > 0 && (
                <div className="flex flex-col gap-2">
                  {freeModels.length > 0 && <div className="border-t border-border/50" />}
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All models</span>
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {paidModels.length}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paidModels.map((m) => (
                      <ModelRow
                        key={m.id}
                        model={m}
                        selected={m.id === value}
                        onSelect={() => {
                          onChange(m.id)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span>{filtered.length} models {freeModels.length > 0 && `(${freeModels.length} free)`}</span>
          {selected && <span className="truncate text-foreground">{selected.name} selected</span>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
