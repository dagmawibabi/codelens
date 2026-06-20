"use client"

import { useMemo, useState } from "react"
import { BookOpen, Bot, FileText, Check, AlertTriangle, X, Minus, ExternalLink, Wrench, ChevronRight, Scale } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { InsightCard } from "./insights"
import { FileLink } from "./inspector"
import type { DocsResult, DocCheck, DocCheckStatus, DocFile, DocStandard, DocBand } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

function checkVisual(status: DocCheckStatus) {
  switch (status) {
    case "pass":
      return { Icon: Check, color: "var(--sev-ok)", label: "Pass" }
    case "warn":
      return { Icon: AlertTriangle, color: "var(--sev-medium)", label: "Warn" }
    case "na":
      return { Icon: Minus, color: "var(--muted-foreground)", label: "N/A" }
    default:
      return { Icon: X, color: "var(--sev-critical)", label: "Fail" }
  }
}

const BAND_LABEL: Record<DocBand, string> = {
  excellent: "Excellent",
  good: "Good",
  "needs-improvement": "Needs improvement",
  poor: "Poor",
}

function scoreColor(score: number) {
  return score >= 80 ? "var(--sev-ok)" : score >= 60 ? "var(--sev-medium)" : score >= 40 ? "var(--sev-high)" : "var(--sev-critical)"
}

function ScoreDial({ score, label, sub }: { score: number; label: string; sub: string }) {
  const color = scoreColor(score)
  return (
    <div className="flex flex-col items-center gap-2 p-6">
      <div className="relative flex size-28 items-center justify-center">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 264} 264`}
          />
        </svg>
        <span className="absolute font-mono text-3xl font-semibold tabular-nums text-foreground">{score}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-center text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

function StandardCard({
  standard,
  active,
  onSelect,
}: {
  standard: DocStandard
  active: boolean
  onSelect: () => void
}) {
  const color = scoreColor(standard.score)
  const passing = standard.checks.filter((c) => c.status === "pass").length
  const applicable = standard.checks.filter((c) => c.status !== "na").length
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-card p-4 text-left transition-colors",
        active ? "border-ring ring-1 ring-ring" : "border-border hover:bg-secondary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">{standard.label}</span>
            {standard.liveOnly && (
              <span className="shrink-0 rounded-sm border border-border px-1 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                live
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-pretty text-[11px] leading-snug text-muted-foreground">
            {standard.tagline}
          </p>
        </div>
        <span className="shrink-0 font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
          {standard.score}
        </span>
      </div>
      <Progress value={standard.score} className="h-1.5" />
      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
        <span>{BAND_LABEL[standard.band]}</span>
        <span>
          {passing}/{applicable} pass · {Math.round(standard.weight * 100)}% wt
        </span>
      </div>
    </button>
  )
}

function CheckRow({ check, onOpen }: { check: DocCheck; onOpen: () => void }) {
  const vis = checkVisual(check.status)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className="flex w-full cursor-pointer items-start gap-3 border-t border-border p-4 text-left transition-colors first:border-t-0 hover:bg-secondary/40"
    >
      <vis.Icon className="mt-0.5 size-4 shrink-0" style={{ color: vis.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{check.label}</span>
          {check.agent && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              <Bot className="size-3" />
              agent
            </span>
          )}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {check.status === "na" ? "n/a" : `+${check.weight}`}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{check.detail}</p>
        {check.fix && (
          <p className="mt-1.5 inline-flex items-start gap-1.5 text-pretty text-xs leading-relaxed text-foreground">
            <Wrench className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span className="line-clamp-1">{check.fix}</span>
          </p>
        )}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function DocFileRow({ doc }: { doc: DocFile }) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0">
      <FileText className={cn("size-4 shrink-0", doc.present ? "text-foreground" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        {doc.present ? (
          <FileLink path={doc.path} className="text-xs" />
        ) : (
          <span className="font-mono text-xs text-muted-foreground line-through">{doc.path}</span>
        )}
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{doc.note}</p>
      </div>
      {doc.present ? (
        <span className="shrink-0 font-mono text-xs tabular-nums" style={{ color: scoreColor(doc.score) }}>
          {doc.score}
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[10px] uppercase text-[color:var(--sev-high)]">missing</span>
      )}
    </div>
  )
}

function StandardSection({
  standard,
  onOpenCheck,
}: {
  standard: DocStandard
  onOpenCheck: (check: DocCheck) => void
}) {
  // Group checks by their optional `group` label, preserving order.
  const groups = useMemo(() => {
    const map = new Map<string, DocCheck[]>()
    for (const c of standard.checks) {
      const key = c.group ?? ""
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return [...map.entries()]
  }, [standard.checks])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{standard.label}</h3>
        <span className="font-mono text-xs tabular-nums" style={{ color: scoreColor(standard.score) }}>
          {standard.score}
        </span>
        <a
          href={standard.href}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {standard.source}
          <ExternalLink className="size-3" />
        </a>
      </div>
      {groups.map(([group, checks]) => (
        <div key={group || standard.id} className="flex flex-col gap-2">
          {group && (
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{group}</span>
          )}
          <Card className="gap-0 overflow-hidden py-0">
            {checks.map((c) => (
              <CheckRow key={c.id} check={c} onOpen={() => onOpenCheck(c)} />
            ))}
          </Card>
        </div>
      ))}
    </section>
  )
}

export function DocsPanel({ docs }: { docs: DocsResult }) {
  const [selected, setSelected] = useState<string>("all")
  const [detail, setDetail] = useState<{ check: DocCheck; standard: DocStandard } | null>(null)

  const allChecks = useMemo(() => docs.standards.flatMap((s) => s.checks), [docs.standards])
  const agentChecks = useMemo(() => allChecks.filter((c) => c.agent), [allChecks])
  const passing = allChecks.filter((c) => c.status === "pass").length
  const applicable = allChecks.filter((c) => c.status !== "na").length
  const agentPassing = agentChecks.filter((c) => c.status === "pass").length
  const agentApplicable = agentChecks.filter((c) => c.status !== "na").length

  const visibleStandards = selected === "all" ? docs.standards : docs.standards.filter((s) => s.id === selected)

  const tabs = [{ id: "all", label: "All standards" }, ...docs.standards.map((s) => ({ id: s.id, label: s.label }))]

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <Card className="flex flex-col items-center gap-1 py-0">
          <ScoreDial
            score={docs.score}
            label={`Docs Benchmark · ${docs.grade}`}
            sub={`${BAND_LABEL[docs.band]} — ${passing}/${applicable} checks passing`}
          />
        </Card>

        <InsightCard
          title="AI / Agent readiness"
          action={
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase",
                docs.agentReady
                  ? "bg-[color:var(--sev-ok)]/15 text-[color:var(--sev-ok)]"
                  : "bg-[color:var(--sev-high)]/15 text-[color:var(--sev-high)]",
              )}
            >
              {docs.agentReady ? "Ready" : "Not ready"}
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Bot className="size-4" /> Agent score
              </span>
              <span className="font-mono tabular-nums text-foreground">{docs.agentScore}/100</span>
            </div>
            <Progress value={docs.agentScore} className="h-1.5" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {agentPassing}/{agentApplicable} agent-readiness checks pass across all standards. Adding AGENTS.md and
              llms.txt has the highest impact.
            </p>
            {!docs.liveUrl && (
              <p className="rounded-sm border border-border bg-secondary/30 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                No live docs URL set. Surface-level checks (robots, sitemap, .md mirrors, MCP) are marked N/A and
                excluded from scoring.
              </p>
            )}
          </div>
        </InsightCard>

        <InsightCard title="Documents">
          <div className="-mx-3 -mb-3">
            {docs.documents.map((d) => (
              <DocFileRow key={d.path} doc={d} />
            ))}
          </div>
        </InsightCard>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Benchmark composition</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {docs.standards.length} standards
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {docs.standards.map((s) => (
              <StandardCard
                key={s.id}
                standard={s}
                active={selected === s.id}
                onSelect={() => setSelected((p) => (p === s.id ? "all" : s.id))}
              />
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-1 rounded-sm border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm transition-colors",
                selected === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {visibleStandards.map((s) => (
          <StandardSection key={s.id} standard={s} onOpenCheck={(check) => setDetail({ check, standard: s })} />
        ))}
      </div>

      <CheckDetailSheet detail={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function CheckDetailSheet({
  detail,
  onClose,
}: {
  detail: { check: DocCheck; standard: DocStandard } | null
  onClose: () => void
}) {
  const check = detail?.check
  const standard = detail?.standard
  const vis = check ? checkVisual(check.status) : null

  return (
    <Sheet open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-md">
        {check && standard && vis && (
          <>
            <SheetHeader className="border-b border-border">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <span
                  className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase"
                  style={{ color: vis.color, background: `color-mix(in oklch, ${vis.color} 14%, transparent)` }}
                >
                  <vis.Icon className="size-3" />
                  {vis.label}
                </span>
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {standard.label}
                </span>
                {check.agent && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                    <Bot className="size-3" />
                    agent
                  </span>
                )}
                {check.group && (
                  <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {check.group}
                  </span>
                )}
              </div>
              <SheetTitle className="mt-2 text-pretty text-sm leading-relaxed">{check.label}</SheetTitle>
              <SheetDescription className="sr-only">Documentation check detail</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</span>
                  <span className="font-mono text-sm tabular-nums" style={{ color: vis.color }}>
                    {vis.label}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Weight</span>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {check.status === "na" ? "n/a" : `+${check.weight}`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <BookOpen className="size-3.5" />
                  What this checks
                </p>
                <p className="text-pretty text-sm leading-relaxed text-foreground">{check.detail}</p>
              </div>

              {check.fix && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Wrench className="size-3.5" />
                    How to fix
                  </p>
                  <p className="rounded-sm border border-border bg-secondary/30 px-3 py-2 text-pretty text-sm leading-relaxed text-foreground">
                    {check.fix}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Scale className="size-3.5" />
                  Standard
                </p>
                <div className="rounded-sm border border-border bg-card p-3">
                  <p className="text-sm font-medium text-foreground">{standard.label}</p>
                  <p className="mt-0.5 text-pretty text-xs leading-relaxed text-muted-foreground">{standard.tagline}</p>
                  <a
                    href={standard.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {standard.source}
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
