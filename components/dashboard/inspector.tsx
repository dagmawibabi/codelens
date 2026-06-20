"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import {
  FileCode2,
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  BookOpen,
  Lightbulb,
  ListTree,
  SquareArrowOutUpRight,
  Package,
  ArrowRight,
  ShieldAlert,
  KeyRound,
  Globe,
  Accessibility,
  Sparkles,
  ClipboardCheck,
  ClipboardList,
  Plus,
} from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { severityStyle } from "@/lib/severity"
import { getFileContent } from "@/lib/file-contents"
import { EDITORS, absolutePath, issueDocs, type Issue } from "@/lib/issues"
import { addTaskFromIssue, addGroup, useGroups, useTrackedIssueKeys, issueKey } from "@/lib/tasks"
import type { ChatSeed } from "@/lib/chat-types"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface InspectorContextValue {
  projectRoot: string
  viewFile: (filePath: string, line?: number, column?: number) => void
  viewIssue: (issue: Issue) => void
  /** Whether an "Ask AI" handler is wired up (the chat tab is available). */
  canAskAI: boolean
  askAI: (seed: ChatSeed) => void
}

const InspectorContext = createContext<InspectorContextValue | null>(null)

export function useInspector() {
  const ctx = useContext(InspectorContext)
  if (!ctx) throw new Error("useInspector must be used within <InspectorProvider>")
  return ctx
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    })
  }, [])
  return { copied, copy }
}

/** Dropdown that opens an absolute path at a position in the user's editor. */
function OpenInIdeMenu({
  absPath,
  line,
  column,
}: {
  absPath: string
  line: number
  column: number
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
        <SquareArrowOutUpRight className="size-3.5" />
        Open in IDE
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider">
          Open at {line}:{column}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EDITORS.map((ed) => (
          <DropdownMenuItem
            key={ed.id}
            render={
              <a href={ed.url(absPath, line, column)}>
                <FileCode2 className="size-3.5" />
                {ed.label}
              </a>
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Full-file code renderer that auto-scrolls to and highlights a line. */
function FileBody({ code, highlight }: { code: string; highlight?: number }) {
  const lines = code.replace(/\n$/, "").split("\n")
  const scrollToRef = useRef<HTMLDivElement | null>(null)

  return (
    <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
      <code className="block">
        {lines.map((line, i) => {
          const lineNo = i + 1
          const isHit = lineNo === highlight
          return (
            <div
              key={lineNo}
              ref={
                isHit
                  ? (el) => {
                      scrollToRef.current = el
                      el?.scrollIntoView({ block: "center" })
                    }
                  : undefined
              }
              className={cn("flex", isHit && "bg-foreground/[0.08]")}
            >
              <span
                className={cn(
                  "sticky left-0 w-12 shrink-0 select-none bg-popover px-2 text-right tabular-nums",
                  isHit ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                {lineNo}
              </span>
              <span
                className={cn(
                  "flex-1 whitespace-pre pl-3 pr-4",
                  isHit
                    ? "border-l-2 border-foreground text-foreground"
                    : "border-l-2 border-transparent text-foreground/80",
                )}
              >
                {line || " "}
              </span>
            </div>
          )
        })}
      </code>
    </pre>
  )
}

function SnippetBlock({ startLine, code, highlight }: { startLine: number; code: string; highlight?: number }) {
  const lines = code.replace(/\n$/, "").split("\n")
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-background/60 py-2 font-mono text-xs leading-relaxed">
      <code className="block">
        {lines.map((line, i) => {
          const lineNo = startLine + i
          const isHit = lineNo === highlight
          return (
            <div key={lineNo} className={cn("flex", isHit && "bg-foreground/[0.08]")}>
              <span className={cn("w-10 shrink-0 select-none px-2 text-right tabular-nums", isHit ? "text-foreground" : "text-muted-foreground/50")}>
                {lineNo}
              </span>
              <span className={cn("flex-1 whitespace-pre pl-3 pr-4", isHit ? "border-l-2 border-foreground text-foreground" : "border-l-2 border-transparent text-foreground/80")}>
                {line || " "}
              </span>
            </div>
          )
        })}
      </code>
    </pre>
  )
}

function DiffBlock({ fix }: { fix: string }) {
  const lines = fix.replace(/\n$/, "").split("\n")
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-background/60 py-2 font-mono text-xs leading-relaxed">
      <code className="block">
        {lines.map((line, i) => {
          const isAdd = line.startsWith("+")
          const isDel = line.startsWith("-")
          return (
            <div
              key={i}
              className={cn(
                "flex whitespace-pre border-l-2 px-3",
                isAdd && "border-foreground bg-foreground/[0.07] text-foreground",
                isDel && "border-muted-foreground/40 text-muted-foreground line-through decoration-muted-foreground/40",
                !isAdd && !isDel && "border-transparent text-foreground/60",
              )}
            >
              {line || " "}
            </div>
          )
        })}
      </code>
    </pre>
  )
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
  <Icon className="size-3.5" />
  {children}
  </p>
  )
  }

function MetaCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", highlight ? "text-[color:var(--sev-ok)]" : "text-foreground")}>{value}</span>
    </div>
  )
}

/** Build a chat seed from an issue so the assistant has full context. */
function issueToSeed(issue: Issue): ChatSeed {
  const summary = [
    issue.description,
    issue.recommendation ? `Suggested direction: ${issue.recommendation}` : "",
    issue.ruleId ? `Rule: ${issue.ruleId}` : "",
    issue.code ? `Code: ${issue.code}` : "",
    issue.cves?.length ? `Advisories: ${issue.cves.join(", ")}` : "",
    issue.snippet ? `\nRelevant code:\n${issue.snippet.code}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  return {
    source: issue.source,
    title: issue.title,
    summary,
    filePath: issue.filePath,
    line: issue.line,
    severity: issue.severity,
  }
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

interface FileTarget {
  filePath: string
  line?: number
  column?: number
}

export function InspectorProvider({
  projectRoot,
  onAskAI,
  children,
}: {
  projectRoot: string
  /** When provided, issue sheets show an "Ask AI" button that opens a seeded chat. */
  onAskAI?: (seed: ChatSeed) => void
  children: React.ReactNode
}) {
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null)
  const [issue, setIssue] = useState<Issue | null>(null)
  const { copied, copy } = useCopy()

  const viewFile = useCallback((filePath: string, line?: number, column?: number) => {
    setFileTarget({ filePath, line, column })
  }, [])
  const viewIssue = useCallback((next: Issue) => setIssue(next), [])
  const askAI = useCallback(
    (seed: ChatSeed) => {
      onAskAI?.(seed)
      setIssue(null)
    },
    [onAskAI],
  )

  const value = useMemo(
    () => ({ projectRoot, viewFile, viewIssue, canAskAI: Boolean(onAskAI), askAI }),
    [projectRoot, viewFile, viewIssue, onAskAI, askAI],
  )

  const fileCode = fileTarget ? getFileContent(fileTarget.filePath) : null
  const docs = issue ? issueDocs(issue) : []
  const sev = issue ? severityStyle(issue.severity) : null

  return (
    <InspectorContext.Provider value={value}>
      {children}

      {/* File viewer */}
      <Sheet open={!!fileTarget} onOpenChange={(o) => !o && setFileTarget(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-3xl">
          {fileTarget && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="flex items-center gap-2 pr-8">
                  <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                  <SheetTitle className="truncate font-mono text-sm">{fileTarget.filePath}</SheetTitle>
                </div>
                <SheetDescription className="sr-only">Source file preview</SheetDescription>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {fileTarget.line != null && (
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      line {fileTarget.line}
                      {fileTarget.column != null ? `:${fileTarget.column}` : ""}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => copy(absolutePath(projectRoot, fileTarget.filePath))}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy path"}
                  </button>
                  <OpenInIdeMenu
                    absPath={absolutePath(projectRoot, fileTarget.filePath)}
                    line={fileTarget.line ?? 1}
                    column={fileTarget.column ?? 1}
                  />
                </div>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-auto">
                {fileCode ? (
                  <FileBody code={fileCode} highlight={fileTarget.line} />
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                    No preview available for this file in the demo fixture. The installed CLI reads the real file from
                    disk.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Issue detail */}
      <Sheet open={!!issue} onOpenChange={(o) => !o && setIssue(null)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-2xl">
          {issue && sev && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
                  <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                    {issue.source}
                  </span>
                  {issue.ruleId && (
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {issue.ruleId}
                    </span>
                  )}
                  {issue.code && (
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {issue.code}
                    </span>
                  )}
                  {issue.category && (
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {issue.category}
                    </span>
                  )}
                  {issue.confidence != null && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {Math.round(issue.confidence * 100)}% conf.
                    </span>
                  )}
                </div>
                <SheetTitle className="mt-2 text-pretty text-sm leading-relaxed">{issue.title}</SheetTitle>
                <SheetDescription className="sr-only">Issue detail</SheetDescription>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
                {/* Location + primary actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => viewFile(issue.filePath, issue.line, issue.column)}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
                  >
                    <FileCode2 className="size-3.5 text-muted-foreground" />
                    {issue.filePath}:{issue.line}
                  </button>
                  <OpenInIdeMenu
                    absPath={absolutePath(projectRoot, issue.filePath)}
                    line={issue.line}
                    column={issue.column ?? 1}
                  />
                  {onAskAI && (
                    <button
                      type="button"
                      onClick={() => askAI(issueToSeed(issue))}
                      className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-2.5 py-1.5 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <Sparkles className="size-3.5" />
                      Ask AI
                    </button>
                  )}
                  <TrackTaskButton issue={issue} />
                  {issue.fixable && (
                    <span className="rounded-sm bg-[color:var(--sev-ok)]/12 px-2 py-1 font-mono text-[11px] text-[color:var(--sev-ok)]">
                      auto-fixable
                    </span>
                  )}
                </div>

                {/* Dependency metadata */}
                {issue.dep && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Package}>Package</SectionLabel>
                    <div className="rounded-sm border border-border bg-card">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <span className="font-mono text-sm text-foreground">{issue.dep.name}</span>
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                          {issue.dep.type}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-px bg-border font-mono text-xs sm:grid-cols-4">
                        <MetaCell label="installed" value={issue.dep.current} />
                        {issue.dep.latest && <MetaCell label="latest" value={issue.dep.latest} />}
                        {issue.dep.fixedIn && <MetaCell label="fixed in" value={issue.dep.fixedIn} highlight />}
                        {issue.dep.license && <MetaCell label="license" value={issue.dep.license} />}
                      </dl>
                      {issue.dep.fixedIn && issue.dep.current !== "—" && (
                        <div className="flex items-center gap-2 border-t border-border px-3 py-2 font-mono text-xs">
                          <span className="text-muted-foreground">{issue.dep.current}</span>
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <span className="text-[color:var(--sev-ok)]">{issue.dep.fixedIn}</span>
                          <span className="ml-auto text-muted-foreground">recommended upgrade</span>
                        </div>
                      )}
                    </div>
                    {issue.dep.usedIn && issue.dep.usedIn.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">imported in:</span>
                        {issue.dep.usedIn.map((f) => (
                          <FileLink key={f} path={f} className="text-[11px]" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Environment variable metadata */}
                {issue.env && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={KeyRound}>Variable</SectionLabel>
                    <div className="rounded-sm border border-border bg-card">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <span className="font-mono text-sm text-foreground">{issue.env.key}</span>
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                          {issue.env.scope}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-px bg-border font-mono text-xs">
                        <MetaCell label="status" value={issue.env.status} highlight={issue.env.status === "exposed"} />
                        <MetaCell label="value" value={issue.env.sample ?? "—"} />
                      </dl>
                    </div>
                    {issue.env.definedIn.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">declared in:</span>
                        {issue.env.definedIn.map((f) => (
                          <FileLink key={f} path={f} className="text-[11px]" />
                        ))}
                      </div>
                    )}
                    {issue.env.usedIn.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] text-muted-foreground">referenced in:</span>
                        {issue.env.usedIn.map((f) => (
                          <FileLink key={f} path={f} className="text-[11px]" />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Network call metadata */}
                {issue.net && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Globe}>Request</SectionLabel>
                    <div className="rounded-sm border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-xs">
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 uppercase text-foreground">{issue.net.method}</span>
                        <span className="truncate text-foreground">{issue.net.url}</span>
                      </div>
                      <dl className="grid grid-cols-2 gap-px bg-border font-mono text-xs sm:grid-cols-4">
                        <MetaCell label="host" value={issue.net.host} />
                        <MetaCell label="client" value={issue.net.client} />
                        <MetaCell label="scheme" value={issue.net.secure ? "https" : "http"} highlight={!issue.net.secure} />
                        <MetaCell label="scope" value={issue.net.external ? "external" : "internal"} />
                      </dl>
                    </div>
                    {issue.net.issues.length > 0 && (
                      <ul className="flex flex-col gap-1.5">
                        {issue.net.issues.map((i, idx) => {
                          const s = severityStyle(i.severity)
                          return (
                            <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
                              <span>
                                <span className="font-mono text-[10px] uppercase text-foreground">{i.kind}</span> — {i.message}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Accessibility violation metadata */}
                {issue.a11y && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Accessibility}>WCAG details</SectionLabel>
                    <div className="rounded-sm border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border px-3 py-2 font-mono text-xs">
                        <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-foreground">{issue.a11y.rule}</span>
                        <span className="truncate text-muted-foreground">{issue.a11y.selector}</span>
                      </div>
                      <dl className="grid grid-cols-2 gap-px bg-border font-mono text-xs sm:grid-cols-4">
                        <MetaCell label="impact" value={issue.a11y.impact} highlight={issue.a11y.impact === "critical"} />
                        <MetaCell label="principle" value={issue.a11y.principle} />
                        <MetaCell label="nodes" value={String(issue.a11y.nodes)} />
                        <MetaCell label="criteria" value={issue.a11y.wcag.filter((w) => /^\d/.test(w))[0] ?? "—"} />
                      </dl>
                    </div>
                  </div>
                )}

                {/* CVE chips */}
                {issue.cves && issue.cves.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={ShieldAlert}>Known advisories</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {issue.cves.map((cve) => (
                        <a
                          key={cve}
                          href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary"
                        >
                          {cve}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <SectionLabel icon={BookOpen}>What&apos;s happening</SectionLabel>
                  <p className="text-pretty text-sm leading-relaxed text-foreground">{issue.description}</p>
                </div>

                {/* Snippet */}
                {issue.snippet && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <SectionLabel icon={FileCode2}>Code</SectionLabel>
                      <button
                        type="button"
                        onClick={() => viewFile(issue.filePath, issue.line, issue.column)}
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        view full file <ChevronRight className="size-3" />
                      </button>
                    </div>
                    <SnippetBlock startLine={issue.snippet.startLine} code={issue.snippet.code} highlight={issue.line} />
                  </div>
                )}

                {/* Diagnostic chain (types) */}
                {issue.related && issue.related.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={ListTree}>Diagnostic chain</SectionLabel>
                    <ol className="relative ml-2 border-l border-border">
                      {issue.related.map((step, i) => (
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

                {/* Recommendation */}
                {issue.recommendation && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Lightbulb}>How to fix</SectionLabel>
                    <div className="rounded-sm border border-border bg-card p-3">
                      <p className="text-pretty text-sm leading-relaxed text-foreground">{issue.recommendation}</p>
                    </div>
                  </div>
                )}

                {/* Suggested fix diff */}
                {issue.suggestedFix && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Lightbulb}>Suggested fix</SectionLabel>
                    <DiffBlock fix={issue.suggestedFix} />
                  </div>
                )}

                {/* Auto-fix command */}
                {issue.source === "lint" && issue.fixable && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={Lightbulb}>Auto-fix command</SectionLabel>
                    <code className="rounded-sm border border-border bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
                      eslint --fix {issue.filePath}
                    </code>
                  </div>
                )}

                {/* Resources */}
                {docs.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <SectionLabel icon={BookOpen}>Resources &amp; docs</SectionLabel>
                    <ul className="flex flex-col gap-1.5">
                      {docs.map((d) => (
                        <li key={d.href}>
                          <a
                            href={d.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-secondary"
                          >
                            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                              {d.kind}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-foreground">{d.label}</span>
                            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </InspectorContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* TrackTaskButton — captures an issue into the local task board       */
/* ------------------------------------------------------------------ */

function TrackTaskButton({ issue }: { issue: Issue }) {
  const groups = useGroups()
  const trackedKeys = useTrackedIssueKeys()
  const tracked = trackedKeys.has(issueKey(issue))
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState<"added" | "exists" | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  function resetMenu() {
    setCreating(false)
    setNewName("")
  }

  function track(groupId?: string) {
    const { created } = addTaskFromIssue(issue, groupId)
    setFlash(created ? "added" : "exists")
    window.setTimeout(() => setFlash(null), 1600)
    setOpen(false)
    resetMenu()
  }

  function createAndTrack() {
    const name = newName.trim()
    if (!name) return
    const group = addGroup(name)
    track(group.id)
  }

  // Button reflects tracked state at rest; flashes feedback right after a click.
  const label =
    flash === "added" ? "Tracked" : flash === "exists" ? "Already tracked" : tracked ? "Tracked" : "Track task"
  const Icon = flash || tracked ? ClipboardCheck : ClipboardList

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) resetMenu()
      }}
    >
      <DropdownMenuTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-xs transition-colors",
          tracked
            ? "border-foreground/40 bg-secondary text-foreground"
            : "border-border bg-card text-foreground hover:bg-secondary",
        )}
      >
        <Icon className={cn("size-3.5", tracked ? "text-foreground" : "text-muted-foreground")} />
        {label}
        <ChevronRight className="size-3 rotate-90 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <p className="px-1.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {tracked ? "Update task group" : "Add to task board"}
        </p>
        <DropdownMenuItem onClick={() => track(undefined)}>
          <ClipboardList className="size-3.5 text-muted-foreground" />
          Track (no group)
        </DropdownMenuItem>
        {groups.length > 0 && <DropdownMenuSeparator />}
        {groups.map((g) => (
          <DropdownMenuItem key={g.id} onClick={() => track(g.id)}>
            <span className="size-2 rounded-full border border-muted-foreground" aria-hidden />
            {g.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {creating ? (
          <div
            className="flex items-center gap-1.5 px-1.5 py-1"
            // Keep keystrokes from reaching the menu's typeahead handler.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  createAndTrack()
                }
              }}
              placeholder="New group name"
              className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={createAndTrack}
              disabled={!newName.trim()}
              className="rounded-sm bg-primary px-2 py-1 font-mono text-[11px] text-primary-foreground disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setCreating(true)}
          >
            <Plus className="size-3.5 text-muted-foreground" />
            New group…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------ */
/* TrackedBadge — marks an issue row that's already on the task board  */
/* ------------------------------------------------------------------ */

export function TrackedBadge({
  issue,
  variant = "badge",
  className,
}: {
  issue: Pick<Issue, "source" | "filePath" | "line" | "title">
  /** "badge" shows a labelled chip; "dot" shows a compact icon only. */
  variant?: "badge" | "dot"
  className?: string
}) {
  const keys = useTrackedIssueKeys()
  if (!keys.has(issueKey(issue))) return null
  if (variant === "dot") {
    return (
      <ClipboardCheck
        className={cn("size-3.5 shrink-0 text-foreground", className)}
        aria-label="Tracked in Task Manager"
      />
    )
  }
  return (
    <span
      title="Tracked in Task Manager"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-foreground/40 bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground",
        className,
      )}
    >
      <ClipboardCheck className="size-3" />
      tracked
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* FileLink — a clickable filename that opens the file viewer          */
/* ------------------------------------------------------------------ */

export function FileLink({
  path,
  line,
  column,
  className,
  children,
}: {
  path: string
  line?: number
  column?: number
  className?: string
  children?: React.ReactNode
}) {
  const { viewFile } = useInspector()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        viewFile(path, line, column)
      }}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs text-foreground/80 underline decoration-border underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground",
        className,
      )}
    >
      {children ?? (
        <>
          {path}
          {line != null ? `:${line}` : ""}
        </>
      )}
    </button>
  )
}
