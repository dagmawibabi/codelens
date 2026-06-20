"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Key, Link2, Table2, Network } from "lucide-react"
import { FileLink } from "./inspector"
import type { DbTable, DbConnection, DbEngine } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* ER diagram built from foreign-key references on table columns.      */
/* references look like "orders.id" / "users._id".                     */
/* ------------------------------------------------------------------ */

const NODE_W = 210
const HEADER_H = 34
const ROW_H = 22
const MAX_ROWS = 7 // cap columns shown per node so tall tables stay readable
const CELL_PAD_X = 70
const CELL_PAD_Y = 48
const PAD = 28

const ENGINE_LABEL: Record<DbEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  redis: "Redis",
  other: "Other",
}

interface Positioned {
  table: DbTable
  /** Columns shown in the node (capped). */
  rows: DbTable["columns"]
  x: number
  y: number
  w: number
  h: number
}

interface Edge {
  id: string
  from: string // table name
  to: string // table name
  fromColumn: string
  toColumn: string
}

/** Resolve "table.column" reference targets to a table name we actually have. */
function parseRef(ref: string): { table: string; column: string } | null {
  const dot = ref.lastIndexOf(".")
  if (dot <= 0) return null
  return { table: ref.slice(0, dot), column: ref.slice(dot + 1) }
}

export function DbRelationshipGraph({
  tables,
  connections,
}: {
  tables: DbTable[]
  connections: DbConnection[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const engineByTable = useMemo(() => {
    const map = new Map<string, DbEngine>()
    for (const t of tables) {
      const conn = connections.find((c) => c.id === t.connectionId)
      map.set(t.name, conn?.engine ?? "other")
    }
    return map
  }, [tables, connections])

  // Build edges from FK references that point at a table we know about.
  const edges = useMemo<Edge[]>(() => {
    const names = new Set(tables.map((t) => t.name))
    const list: Edge[] = []
    for (const t of tables) {
      for (const col of t.columns) {
        if (!col.references) continue
        const target = parseRef(col.references)
        if (!target || !names.has(target.table) || target.table === t.name) continue
        list.push({
          id: `${t.name}.${col.name}->${target.table}`,
          from: t.name,
          to: target.table,
          fromColumn: col.name,
          toColumn: target.column,
        })
      }
    }
    return list
  }, [tables])

  // Order tables so that ones participating in relationships cluster first,
  // then lay them out on a deterministic grid sized to the tallest node.
  const { positioned, byName, width, height } = useMemo(() => {
    const referenced = new Set<string>()
    for (const e of edges) {
      referenced.add(e.from)
      referenced.add(e.to)
    }
    const ordered = [...tables].sort((a, b) => {
      const ar = referenced.has(a.name) ? 0 : 1
      const br = referenced.has(b.name) ? 0 : 1
      if (ar !== br) return ar - br
      return b.columns.length - a.columns.length
    })

    const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))
    const cellW = NODE_W + CELL_PAD_X
    // Tallest node determines row height for a tidy grid.
    const nodeH = (t: DbTable) => HEADER_H + Math.min(t.columns.length, MAX_ROWS) * ROW_H
    const maxNodeH = Math.max(HEADER_H + ROW_H, ...ordered.map(nodeH))
    const cellH = maxNodeH + CELL_PAD_Y

    const pos: Positioned[] = ordered.map((t, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      const rows = t.columns.slice(0, MAX_ROWS)
      return {
        table: t,
        rows,
        x: PAD + c * cellW,
        y: PAD + r * cellH,
        w: NODE_W,
        h: nodeH(t),
      }
    })
    const map = new Map(pos.map((p) => [p.table.name, p]))
    const rowsUsed = Math.ceil(ordered.length / cols)
    return {
      positioned: pos,
      byName: map,
      width: PAD * 2 + cols * cellW - CELL_PAD_X,
      height: PAD * 2 + rowsUsed * cellH - CELL_PAD_Y,
    }
  }, [tables, edges])

  const active = selected ?? hovered
  const connectedTables = useMemo(() => {
    if (!active) return null
    const set = new Set<string>([active])
    for (const e of edges) {
      if (e.from === active) set.add(e.to)
      if (e.to === active) set.add(e.from)
    }
    return set
  }, [active, edges])

  function nodeDim(name: string): boolean {
    return Boolean(active && connectedTables && !connectedTables.has(name))
  }

  // Compute an edge path between two node boxes (anchor on facing sides).
  function edgePath(e: Edge): { d: string; activeEdge: boolean } | null {
    const from = byName.get(e.from)
    const to = byName.get(e.to)
    if (!from || !to) return null
    const fromCenterX = from.x + from.w / 2
    const toCenterX = to.x + to.w / 2
    // Anchor the FK side at the row of its column when visible.
    const colIdx = from.rows.findIndex((c) => c.name === e.fromColumn)
    const fromY =
      colIdx >= 0 ? from.y + HEADER_H + colIdx * ROW_H + ROW_H / 2 : from.y + from.h / 2
    const toY = to.y + HEADER_H / 2
    const fromRight = toCenterX >= fromCenterX
    const x1 = fromRight ? from.x + from.w : from.x
    const x2 = toCenterX >= fromCenterX ? to.x : to.x + to.w
    const dx = Math.abs(x2 - x1) * 0.5 || 30
    const c1x = fromRight ? x1 + dx : x1 - dx
    const c2x = fromRight ? x2 - dx : x2 + dx
    const activeEdge = active === e.from || active === e.to
    return { d: `M ${x1} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${x2} ${toY}`, activeEdge }
  }

  const selectedTable = selected ? byName.get(selected)?.table : null
  const selectedOutgoing = selected ? edges.filter((e) => e.from === selected) : []
  const selectedIncoming = selected ? edges.filter((e) => e.to === selected) : []

  if (tables.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
        <Network className="size-5" />
        No schema discovered, so there are no relationships to map yet.
      </Card>
    )
  }

  if (edges.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
        <Network className="size-5" />
        <p className="text-pretty">
          {tables.length} {tables.length === 1 ? "table was" : "tables were"} found, but no foreign-key relationships
          were detected between them. Add explicit references in your schema (e.g. Drizzle{" "}
          <span className="font-mono">references()</span> or Prisma <span className="font-mono">@relation</span>) to see
          an ER map here.
        </p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Key className="size-3 text-[color:var(--sev-ok)]" /> primary key
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="size-3 text-[color:var(--chart-1)]" /> foreign key
          </span>
          <span className="ml-auto hidden sm:inline">Click a table to trace its relationships</span>
        </div>

        <div className="overflow-auto bg-[image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-full"
            role="img"
            aria-label="Database relationship diagram"
          >
            {/* Edges */}
            <g>
              {edges.map((e) => {
                const path = edgePath(e)
                if (!path) return null
                const dim = active && !path.activeEdge
                return (
                  <path
                    key={e.id}
                    d={path.d}
                    fill="none"
                    stroke={path.activeEdge ? "var(--chart-1)" : "var(--muted-foreground)"}
                    strokeWidth={path.activeEdge ? 1.8 : 1}
                    opacity={dim ? 0.15 : 0.55}
                    markerEnd={path.activeEdge ? "url(#er-arrow-active)" : "url(#er-arrow)"}
                  />
                )
              })}
            </g>

            <defs>
              <marker id="er-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--muted-foreground)" />
              </marker>
              <marker id="er-arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--chart-1)" />
              </marker>
            </defs>

            {/* Nodes */}
            <g>
              {positioned.map((p) => {
                const dim = nodeDim(p.table.name)
                const isActive = active === p.table.name
                const engine = engineByTable.get(p.table.name) ?? "other"
                const hiddenCount = p.table.columns.length - p.rows.length
                return (
                  <g
                    key={p.table.name}
                    transform={`translate(${p.x}, ${p.y})`}
                    opacity={dim ? 0.3 : 1}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(p.table.name)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected((s) => (s === p.table.name ? null : p.table.name))}
                  >
                    {/* Card */}
                    <rect
                      width={p.w}
                      height={p.h}
                      rx={6}
                      fill="var(--card)"
                      stroke={isActive ? "var(--chart-1)" : "var(--border)"}
                      strokeWidth={isActive ? 2 : 1}
                    />
                    {/* Header */}
                    <rect width={p.w} height={HEADER_H} rx={6} fill="var(--secondary)" />
                    <rect y={HEADER_H - 6} width={p.w} height={6} fill="var(--secondary)" />
                    <text
                      x={12}
                      y={HEADER_H / 2}
                      dominantBaseline="central"
                      className="fill-foreground font-mono"
                      fontSize={12}
                      fontWeight={600}
                    >
                      {p.table.name.length > 22 ? p.table.name.slice(0, 21) + "…" : p.table.name}
                    </text>
                    <text
                      x={p.w - 10}
                      y={HEADER_H / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      className="fill-muted-foreground font-mono"
                      fontSize={8}
                    >
                      {ENGINE_LABEL[engine].toUpperCase()}
                    </text>

                    {/* Column rows */}
                    {p.rows.map((col, i) => {
                      const y = HEADER_H + i * ROW_H
                      const isPk = col.flags.includes("pk")
                      const isFk = col.flags.includes("fk") || Boolean(col.references)
                      return (
                        <g key={col.name} transform={`translate(0, ${y})`}>
                          {i > 0 && <line x1={0} y1={0} x2={p.w} y2={0} stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />}
                          {isPk && <circle cx={12} cy={ROW_H / 2} r={3} fill="var(--sev-ok)" />}
                          {!isPk && isFk && <circle cx={12} cy={ROW_H / 2} r={3} fill="var(--chart-1)" />}
                          {!isPk && !isFk && <circle cx={12} cy={ROW_H / 2} r={2} fill="var(--muted-foreground)" opacity={0.4} />}
                          <text
                            x={24}
                            y={ROW_H / 2}
                            dominantBaseline="central"
                            className="fill-foreground font-mono"
                            fontSize={10}
                          >
                            {col.name.length > 16 ? col.name.slice(0, 15) + "…" : col.name}
                          </text>
                          <text
                            x={p.w - 10}
                            y={ROW_H / 2}
                            textAnchor="end"
                            dominantBaseline="central"
                            className="fill-muted-foreground font-mono"
                            fontSize={9}
                          >
                            {col.type.length > 12 ? col.type.slice(0, 11) + "…" : col.type}
                          </text>
                        </g>
                      )
                    })}
                    {hiddenCount > 0 && (
                      <text
                        x={24}
                        y={HEADER_H + p.rows.length * ROW_H - ROW_H / 2 + ROW_H}
                        dominantBaseline="central"
                        className="fill-muted-foreground font-mono"
                        fontSize={9}
                      >
                        {`+${hiddenCount} more`}
                      </text>
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
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schema map</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <span className="inline-flex items-center gap-1.5">
                <Table2 className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{tables.length}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">tables</span>
            </div>
            <div className="flex flex-col">
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-xl font-semibold tabular-nums text-foreground">{edges.length}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">relationships</span>
            </div>
          </div>
        </Card>

        {selectedTable ? (
          <Card className="gap-0 p-4">
            <div className="flex items-center gap-2">
              <Table2 className="size-4 text-muted-foreground" />
              <span className="truncate font-mono text-sm text-foreground">{selectedTable.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="rounded-sm bg-secondary px-1.5 py-0.5">{selectedTable.kind}</span>
              <span className="rounded-sm bg-secondary px-1.5 py-0.5">{selectedTable.columns.length} cols</span>
              {selectedTable.rowCount > 0 && (
                <span className="rounded-sm bg-secondary px-1.5 py-0.5">{selectedTable.rowCount.toLocaleString()} rows</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                References ({selectedOutgoing.length})
              </span>
              {selectedOutgoing.length === 0 ? (
                <span className="text-xs text-muted-foreground">This table has no outgoing foreign keys.</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {selectedOutgoing.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e.to)}
                      className="flex items-center gap-1.5 rounded-sm bg-secondary/60 px-2 py-1 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-secondary"
                    >
                      <span className="text-muted-foreground">{e.fromColumn}</span>
                      <Link2 className="size-3 text-[color:var(--chart-1)]" />
                      <span>{e.to}</span>
                      <span className="text-muted-foreground/70">.{e.toColumn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Referenced by ({selectedIncoming.length})
              </span>
              {selectedIncoming.length === 0 ? (
                <span className="text-xs text-muted-foreground">No other table references this one.</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {selectedIncoming.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e.from)}
                      className="flex items-center gap-1.5 rounded-sm bg-secondary/60 px-2 py-1 text-left font-mono text-[11px] text-foreground transition-colors hover:bg-secondary"
                    >
                      <span>{e.from}</span>
                      <span className="text-muted-foreground/70">.{e.fromColumn}</span>
                      <Link2 className="size-3 text-[color:var(--chart-1)]" />
                      <span className="text-muted-foreground">{e.toColumn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedTable.filePath && (
              <div className="mt-3 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
                <FileLink path={selectedTable.filePath} />
              </div>
            )}
          </Card>
        ) : (
          <Card className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
            <Network className="size-5 text-muted-foreground" />
            <p className="text-pretty">
              Select a table in the diagram to trace what it references and which tables point back to it.
            </p>
          </Card>
        )}
      </aside>
    </div>
  )
}
