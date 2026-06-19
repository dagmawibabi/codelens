"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileLink } from "./inspector"
import { severityStyle } from "@/lib/severity"
import type { DependencyGraph, DependencyNode } from "@/lib/schema"
import { cn } from "@/lib/utils"
import { Package, Boxes, Wrench, AlertTriangle, Layers } from "lucide-react"

/* ------------------------------------------------------------------ */
/* Layout: layered by depth (columns), nodes stacked vertically.      */
/* Deterministic so the SVG is stable across renders.                 */
/* ------------------------------------------------------------------ */

const COL_WIDTH = 240
const ROW_HEIGHT = 46
const NODE_W = 176
const NODE_H = 30
const PAD_X = 24
const PAD_Y = 24

interface Positioned extends DependencyNode {
  x: number
  y: number
}

function typeColor(node: DependencyNode): string {
  if (node.flagged && node.severity) return `var(--chart-${severityIndex(node.severity)})`
  switch (node.type) {
    case "direct":
      return "var(--chart-1)"
    case "dev":
      return "var(--chart-4)"
    default:
      return "var(--muted-foreground)"
  }
}

function severityIndex(s: string): number {
  return { critical: 1, high: 2, medium: 3, low: 4, info: 5 }[s as "high"] ?? 5
}

export function DependencyGraph({ graph }: { graph: DependencyGraph }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [depthFilter, setDepthFilter] = useState<number | null>(null)

  const maxDepth = useMemo(() => Math.max(...graph.nodes.map((n) => n.depth)), [graph.nodes])

  // Position nodes into columns by depth.
  const { positioned, byId, width, height } = useMemo(() => {
    const cols = new Map<number, DependencyNode[]>()
    for (const n of graph.nodes) {
      const arr = cols.get(n.depth) ?? []
      arr.push(n)
      cols.set(n.depth, arr)
    }
    // Sort each column: flagged first, then by size desc for stable visual weight.
    const pos: Positioned[] = []
    let maxRows = 0
    for (let d = 0; d <= maxDepth; d++) {
      const arr = (cols.get(d) ?? []).sort((a, b) => {
        if (!!b.flagged !== !!a.flagged) return b.flagged ? 1 : -1
        return (b.sizeKb ?? 0) - (a.sizeKb ?? 0)
      })
      maxRows = Math.max(maxRows, arr.length)
      arr.forEach((n, i) => {
        pos.push({ ...n, x: PAD_X + d * COL_WIDTH, y: PAD_Y + i * ROW_HEIGHT })
      })
    }
    const map = new Map(pos.map((p) => [p.id, p]))
    return {
      positioned: pos,
      byId: map,
      width: PAD_X * 2 + maxDepth * COL_WIDTH + NODE_W,
      height: PAD_Y * 2 + maxRows * ROW_HEIGHT,
    }
  }, [graph.nodes, maxDepth])

  // Edges from each node to its dependencies (only edges where both ends exist).
  const edges = useMemo(() => {
    const list: { from: Positioned; to: Positioned }[] = []
    for (const n of positioned) {
      for (const dep of n.dependencies) {
        const to = byId.get(dep)
        if (to) list.push({ from: n, to })
      }
    }
    return list
  }, [positioned, byId])

  // Active node = selected or hovered. Compute its connected set for highlighting.
  const active = selected ?? hovered
  const connected = useMemo(() => {
    if (!active) return null
    const node = byId.get(active)
    if (!node) return null
    const deps = new Set(node.dependencies.filter((d) => byId.has(d)))
    const dependents = new Set(positioned.filter((p) => p.dependencies.includes(active)).map((p) => p.id))
    return { deps, dependents }
  }, [active, byId, positioned])

  function nodeState(id: string): "active" | "linked" | "dim" | "normal" {
    if (!active) return "normal"
    if (id === active) return "active"
    if (connected?.deps.has(id) || connected?.dependents.has(id)) return "linked"
    return "dim"
  }

  function edgeActive(e: { from: Positioned; to: Positioned }): boolean {
    if (!active) return false
    return e.from.id === active || e.to.id === active
  }

  const selectedNode = selected ? byId.get(selected) : null
  const dependentsOfSelected = selected
    ? positioned.filter((p) => p.dependencies.includes(selected))
    : []

  const directCount = graph.nodes.filter((n) => n.type === "direct").length
  const devCount = graph.nodes.filter((n) => n.type === "dev").length
  const flaggedCount = graph.nodes.filter((n) => n.flagged).length
  const totalSize = graph.nodes.reduce((s, n) => s + (n.sizeKb ?? 0), 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Graph canvas */}
      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Module graph</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1 rounded-sm border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setDepthFilter(null)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs transition-colors",
                depthFilter === null ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              All depths
            </button>
            {Array.from({ length: maxDepth + 1 }).map((_, d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDepthFilter((p) => (p === d ? null : d))}
                className={cn(
                  "rounded-sm px-2.5 py-1 font-mono text-xs transition-colors",
                  depthFilter === d ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                L{d}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          <LegendDot color="var(--chart-1)" label="direct" />
          <LegendDot color="var(--chart-4)" label="dev" />
          <LegendDot color="var(--muted-foreground)" label="transitive" />
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3 text-[color:var(--sev-high)]" /> flagged
          </span>
          <span className="ml-auto hidden sm:inline">Click a node to inspect its edges</span>
        </div>

        {/* SVG */}
        <div className="overflow-auto bg-[image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-full"
            role="img"
            aria-label="Dependency graph"
          >
            {/* Edges */}
            <g>
              {edges.map((e, i) => {
                const dimmed = depthFilter !== null && e.from.depth !== depthFilter && e.to.depth !== depthFilter
                const x1 = e.from.x + NODE_W
                const y1 = e.from.y + NODE_H / 2
                const x2 = e.to.x
                const y2 = e.to.y + NODE_H / 2
                const mx = (x1 + x2) / 2
                const isActive = edgeActive(e)
                return (
                  <path
                    key={i}
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={isActive ? "var(--chart-1)" : "var(--border)"}
                    strokeWidth={isActive ? 1.6 : 1}
                    opacity={dimmed ? 0.15 : active && !isActive ? 0.25 : 0.7}
                  />
                )
              })}
            </g>

            {/* Nodes */}
            <g>
              {positioned.map((n) => {
                const state = nodeState(n.id)
                const dimmedByDepth = depthFilter !== null && n.depth !== depthFilter
                const color = typeColor(n)
                const opacity = dimmedByDepth ? 0.2 : state === "dim" ? 0.3 : 1
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    opacity={opacity}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected((p) => (p === n.id ? null : n.id))}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={4}
                      fill="var(--card)"
                      stroke={state === "active" ? color : "var(--border)"}
                      strokeWidth={state === "active" ? 2 : 1}
                    />
                    <rect width={4} height={NODE_H} rx={2} fill={color} />
                    <text
                      x={14}
                      y={NODE_H / 2}
                      dominantBaseline="central"
                      className="fill-foreground font-mono"
                      fontSize={11}
                    >
                      {n.id.length > 18 ? n.id.slice(0, 17) + "…" : n.id}
                    </text>
                    {n.flagged && (
                      <circle cx={NODE_W - 12} cy={NODE_H / 2} r={3} fill={`var(--chart-${severityIndex(n.severity ?? "info")})`} />
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </Card>

      {/* Detail rail */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="gap-0 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Graph stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Package} value={graph.nodes.length} label="modules" />
            <Stat icon={Boxes} value={directCount} label="direct" />
            <Stat icon={Wrench} value={devCount} label="dev" />
            <Stat icon={AlertTriangle} value={flaggedCount} label="flagged" />
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            install size ≈ <span className="font-mono text-foreground">{(totalSize / 1024).toFixed(1)} MB</span> ·{" "}
            {maxDepth + 1} levels deep
          </p>
        </Card>

        {selectedNode ? (
          <Card className="gap-0 p-4">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: typeColor(selectedNode) }}
                aria-hidden
              />
              <span className="truncate font-mono text-sm text-foreground">{selectedNode.id}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="rounded-sm bg-secondary px-1.5 py-0.5">{selectedNode.version}</span>
              <span className="rounded-sm bg-secondary px-1.5 py-0.5">{selectedNode.type}</span>
              <span className="rounded-sm bg-secondary px-1.5 py-0.5">depth {selectedNode.depth}</span>
              {selectedNode.sizeKb != null && (
                <span className="rounded-sm bg-secondary px-1.5 py-0.5">
                  {selectedNode.sizeKb >= 1024 ? `${(selectedNode.sizeKb / 1024).toFixed(1)} MB` : `${selectedNode.sizeKb} KB`}
                </span>
              )}
            </div>

            {selectedNode.flagged && selectedNode.severity && (
              <div className="mt-3">
                <Badge
                  className={cn(
                    "border-0 font-mono text-[10px] uppercase",
                    severityStyle(selectedNode.severity).bg,
                    severityStyle(selectedNode.severity).text,
                  )}
                >
                  has {severityStyle(selectedNode.severity).label} finding
                </Badge>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Depends on ({selectedNode.dependencies.length})
              </span>
              {selectedNode.dependencies.length === 0 ? (
                <span className="text-xs text-muted-foreground">No further dependencies (leaf).</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {selectedNode.dependencies.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => byId.has(d) && setSelected(d)}
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 font-mono text-[10px]",
                        byId.has(d)
                          ? "bg-secondary text-foreground hover:bg-secondary/70"
                          : "bg-secondary/40 text-muted-foreground",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Required by ({dependentsOfSelected.length})
              </span>
              {dependentsOfSelected.length === 0 ? (
                <span className="text-xs text-muted-foreground">Root-level / not required by another module.</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {dependentsOfSelected.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelected(d.id)}
                      className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:bg-secondary/70"
                    >
                      {d.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
            <Package className="size-5 text-muted-foreground" />
            <p className="text-pretty">
              Select a module in the graph to trace what it depends on and which packages require it.
            </p>
          </Card>
        )}
      </aside>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Package; value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{value}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
