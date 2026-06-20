"use client"

import { useState } from "react"
import {
  HelpCircle,
  Terminal,
  Download,
  KeyRound,
  Play,
  ListChecks,
  KanbanSquare,
  ShieldCheck,
  FileCode2,
  PackageSearch,
  Sparkles,
  GitBranch,
  Database,
  Boxes,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-border bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="font-mono text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="flex flex-col gap-2 border-l border-border pl-4">{children}</div>
    </section>
  )
}

const FLAGS: { flag: string; desc: string }[] = [
  { flag: "--ci", desc: "Run once, print a summary, and exit non-zero if thresholds are breached. No dashboard." },
  { flag: "--json", desc: "Write the full report as JSON to stdout for piping into other tools." },
  { flag: "--no-ai", desc: "Skip the AI security review (lint + types + dependency audit only)." },
  { flag: "--port <n>", desc: "Serve the dashboard on a specific port (default 4321)." },
  { flag: "--watch", desc: "Re-run affected checks automatically when files change." },
]

/* --------------------------------- Toolchain -------------------------------- */

type ToolKind = "live" | "static" | "library"

interface Tool {
  name: string
  kind: ToolKind
  /** What it does and which dashboard surface it powers. */
  desc: string
  /** Optional command or package detail. */
  detail?: string
}

interface ToolGroup {
  icon: React.ElementType
  title: string
  blurb: string
  tools: Tool[]
}

const KIND_LABEL: Record<ToolKind, string> = {
  live: "runs in your repo",
  static: "static scan",
  library: "library",
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    icon: ShieldCheck,
    title: "Core checks",
    blurb: "Your project's own toolchain, executed locally — the results match what you see in CI.",
    tools: [
      {
        name: "ESLint",
        kind: "live",
        desc: "Lint findings (errors, warnings, fixable) powering the Lint tab. Uses your project's ESLint and config.",
        detail: "eslint . --format json",
      },
      {
        name: "TypeScript (tsc)",
        kind: "live",
        desc: "Type diagnostics with the full assignability chain, shown in the Types tab. Uses your project's TypeScript.",
        detail: "tsc --noEmit --pretty false",
      },
      {
        name: "npm / pnpm / yarn audit",
        kind: "live",
        desc: "Ground-truth CVE advisories for the Dependencies view. The package manager is auto-detected from your lockfile.",
        detail: "<pm> audit --json",
      },
      {
        name: "AI security review",
        kind: "live",
        desc: "Reviews security-relevant source files for exploitable issues and ranks the real advisories. Powers the Security tab.",
        detail: "AI SDK → Vercel AI Gateway",
      },
    ],
  },
  {
    icon: FileCode2,
    title: "Project intelligence",
    blurb: "Built-in static analyzers that read your source once per run — no extra tools to install.",
    tools: [
      { name: "API surface", kind: "static", desc: "Detects route handlers, methods, dynamic segments, and protection gaps for the API tab." },
      { name: "Network calls", kind: "static", desc: "Finds outbound fetch/axios calls and flags insecure or external domains in the Network tab." },
      { name: "Accessibility", kind: "static", desc: "WCAG rule heuristics over your markup, grouped by principle, for the Accessibility tab." },
      { name: "Performance", kind: "static", desc: "Heavy-dependency, bundle, and Web-Vitals heuristics surfaced in the Performance tab." },
      { name: "Environment variables", kind: "static", desc: "Inventories .env files and client/server exposure for the Environment tab." },
      { name: "Documentation", kind: "static", desc: "Scores README, CHANGELOG, and agent-readiness for the Docs tab." },
    ],
  },
  {
    icon: GitBranch,
    title: "Repository & data",
    blurb: "Collectors that read your git history, test output, and live database schema.",
    tools: [
      {
        name: "Git CLI",
        kind: "live",
        desc: "Branch, status, commit log, and contributor data for the Git tab.",
        detail: "git rev-parse · status · log · shortlog",
      },
      {
        name: "GitHub REST API",
        kind: "live",
        desc: "Repo overview and releases. Optional GITHUB_TOKEN raises the rate limit and enables private repos.",
      },
      {
        name: "Test coverage",
        kind: "static",
        desc: "Reads coverage-summary.json from Vitest, Jest, or Playwright for the Tests tab.",
      },
      {
        name: "Database introspection",
        kind: "live",
        desc: "Optional: connects with your DB driver to read the live schema via information_schema.",
        detail: "pg · mysql2 (when present)",
      },
    ],
  },
  {
    icon: Boxes,
    title: "Engine libraries",
    blurb: "The packages the CodeLens CLI itself is built on.",
    tools: [
      { name: "commander", kind: "library", desc: "Parses CLI arguments and flags." },
      { name: "execa", kind: "library", desc: "Runs the lint, type, audit, and git processes." },
      { name: "ws", kind: "library", desc: "Streams live run progress to this dashboard over a WebSocket." },
      { name: "zod", kind: "library", desc: "Validates the AI output schema and your .codelens.json config." },
      { name: "ai (AI SDK 6)", kind: "library", desc: "Talks to models through the Vercel AI Gateway — no provider SDK needed." },
      { name: "open", kind: "library", desc: "Launches the dashboard in your browser after a run." },
    ],
  },
]

function KindBadge({ kind }: { kind: ToolKind }) {
  return (
    <span
      className={
        kind === "live"
          ? "shrink-0 rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-background"
          : "shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
      }
    >
      {KIND_LABEL[kind]}
    </span>
  )
}

function ToolGroupBlock({ group }: { group: ToolGroup }) {
  const Icon = group.icon
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <h3 className="font-mono text-sm font-semibold text-foreground">{group.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{group.blurb}</p>
        </div>
      </div>
      <ul className="flex flex-col gap-2 border-l border-border pl-4">
        {group.tools.map((t) => (
          <li key={t.name} className="flex flex-col gap-1 rounded-sm border border-border bg-card/50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-foreground">{t.name}</span>
              <KindBadge kind={t.kind} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
            {t.detail && (
              <code className="mt-0.5 w-fit rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                {t.detail}
              </code>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HelpDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="How to use CodeLens"
        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card px-3 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HelpCircle className="size-4" />
        <span className="hidden sm:inline">Guide</span>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="font-mono">Using the CodeLens CLI</DialogTitle>
          <DialogDescription>
            CodeLens runs your real ESLint, TypeScript, and dependency-audit toolchain locally, then streams the
            results into this dashboard.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="guide" className="py-5">
          <TabsList className="mb-2 w-full">
            <TabsTrigger value="guide" className="flex-1">
              <Play className="size-3.5" />
              Getting started
            </TabsTrigger>
            <TabsTrigger value="toolchain" className="flex-1">
              <PackageSearch className="size-3.5" />
              Toolchain
            </TabsTrigger>
          </TabsList>

          <TabsContent value="guide">
            <div className="flex flex-col gap-6">
              <Section icon={Download} title="1 · Install">
                <p className="text-sm text-muted-foreground">Try it instantly with no install:</p>
                <Cmd>npx codelens</Cmd>
                <p className="text-sm text-muted-foreground">
                  Or add it as a dev dependency to pin a version per project:
                </p>
                <Cmd>{`pnpm add -D codelens
# then add to package.json scripts: "lens": "codelens"`}</Cmd>
              </Section>

              <Section icon={KeyRound} title="2 · Configure the AI key">
                <p className="text-sm text-muted-foreground">
                  Lint and type checks need no key. The AI security audit reads an API key from your environment or a
                  local <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">.codelens.json</code>:
                </p>
                <Cmd>export AI_GATEWAY_API_KEY=your_key_here</Cmd>
              </Section>

              <Section icon={Play} title="3 · Run it in your project">
                <p className="text-sm text-muted-foreground">
                  From the root of any JS/TS project (Next.js, SvelteKit, Vue, …). CodeLens auto-detects the framework
                  and package manager, runs every check, and opens the dashboard at{" "}
                  <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">localhost:4321</code>:
                </p>
                <Cmd>cd my-app &amp;&amp; codelens</Cmd>
              </Section>

              <Section icon={ListChecks} title="Flags">
                <ul className="flex flex-col gap-2">
                  {FLAGS.map((f) => (
                    <li key={f.flag} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <code className="shrink-0 font-mono text-xs text-foreground sm:w-28">{f.flag}</code>
                      <span className="text-sm text-muted-foreground">{f.desc}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section icon={Terminal} title="In CI">
                <p className="text-sm text-muted-foreground">
                  The same engine drops into GitHub Actions. Fail the build when quality regresses:
                </p>
                <Cmd>{`- run: npx codelens --ci --no-ai
# exits non-zero past your configured thresholds`}</Cmd>
              </Section>

              <Section icon={KanbanSquare} title="Track & triage in the dashboard">
                <p className="text-sm text-muted-foreground">
                  Every finding has a <span className="font-mono text-foreground">Track task</span> action — in its
                  detail sheet and inline on each list row. Tracking a finding adds it to the{" "}
                  <span className="font-mono text-foreground">Task Manager</span> board and marks the row with a dot so
                  you can see at a glance what&apos;s already on your worklist.
                </p>
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <li>
                    <span className="text-foreground">Custom columns</span> — rename or delete the defaults (To do / In
                    progress / Done) and add your own. Drag cards between columns to update status.
                  </li>
                  <li>
                    <span className="text-foreground">Groups</span> — file tasks under tags like &ldquo;This
                    sprint&rdquo; or &ldquo;Tech debt&rdquo; and filter the board by them.
                  </li>
                  <li>
                    <span className="text-foreground">Detail</span> — click a tracked finding to reopen its full
                    analysis; click a free-form task to edit its column, priority, group, and notes.
                  </li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  The board lives only in your browser — it never leaves your machine or reaches the CLI. Manage or
                  reset it from <span className="font-mono text-foreground">Settings → Data &amp; storage</span>.
                </p>
              </Section>
            </div>
          </TabsContent>

          <TabsContent value="toolchain">
            <div className="flex flex-col gap-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Every scan is powered by a real tool — there are no black boxes. Checks marked{" "}
                <span className="font-mono text-foreground">runs in your repo</span> execute your project&apos;s own
                binaries; <span className="font-mono text-foreground">static scan</span> analyzers read your source
                directly; and the <span className="inline-flex items-center gap-1 font-mono text-foreground">
                  <Sparkles className="size-3" />AI review
                </span>{" "}
                uses the Vercel AI Gateway.
              </p>
              {TOOL_GROUPS.map((g) => (
                <ToolGroupBlock key={g.title} group={g} />
              ))}
              <div className="flex items-start gap-2 rounded-sm border border-border bg-muted/40 px-3 py-2.5">
                <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Nothing leaves your machine except the AI calls. Source snippets sent for the security review can be
                  scrubbed of secrets first — toggle{" "}
                  <span className="font-mono text-foreground">Redact secrets</span> under{" "}
                  <span className="font-mono text-foreground">Settings → AI security audit</span>.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
