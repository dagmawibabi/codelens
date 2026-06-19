"use client"

import { useCallback, useEffect, useState } from "react"
import {
  LayoutDashboard,
  FileText,
  Braces,
  ShieldAlert,
  Package,
  Database,
  KeyRound,
  Globe,
  GitBranch,
  Settings2,
  BookOpen,
  Search,
  Accessibility,
  Gauge,
  FlaskConical,
  Terminal,
  Sparkles,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RunHeader } from "./run-header"
import { OverviewPanel } from "./overview-panel"
import { LintPanel } from "./lint-panel"
import { TypesPanel } from "./types-panel"
import { SecurityPanel } from "./security-panel"
import { DependenciesPanel } from "./dependencies-panel"
import { DatabasePanel } from "./database-panel"
import { EnvPanel } from "./env-panel"
import { NetworkPanel } from "./network-panel"
import { GitPanel } from "./git-panel"
import { SetupPanel } from "./setup-panel"
import { DocsPanel } from "./docs-panel"
import { AccessibilityPanel } from "./accessibility-panel"
import { PerformancePanel } from "./performance-panel"
import { TestsPanel } from "./tests-panel"
import { InspectorProvider } from "./inspector"
import { CommandPalette, type TabDef } from "./command-palette"
import { EmptyState } from "./empty-state"
import { RunDialog } from "@/components/run/run-dialog"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"
import type { ProjectInsights } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

interface NavGroup {
  label?: string
  items: TabDef[]
}

const NAV_GROUPS: NavGroup[] = [
  { items: [{ value: "overview", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Code Quality",
    items: [
      { value: "lint", label: "Lint", icon: FileText },
      { value: "types", label: "Types", icon: Braces },
      { value: "tests", label: "Tests", icon: FlaskConical },
    ],
  },
  {
    label: "Security",
    items: [
      { value: "security", label: "Security", icon: ShieldAlert },
      { value: "deps", label: "Dependencies", icon: Package },
      { value: "env", label: "Environment", icon: KeyRound },
      { value: "network", label: "Network", icon: Globe },
    ],
  },
  {
    label: "Experience",
    items: [
      { value: "performance", label: "Performance", icon: Gauge },
      { value: "accessibility", label: "Accessibility", icon: Accessibility },
    ],
  },
  {
    label: "Project",
    items: [
      { value: "setup", label: "Setup", icon: Settings2 },
      { value: "database", label: "Database", icon: Database },
      { value: "git", label: "Git & CI/CD", icon: GitBranch },
      { value: "docs", label: "Docs", icon: BookOpen },
    ],
  },
]

/** Flat list of all tabs, in nav order, for the palette and shortcuts. */
const TABS: TabDef[] = NAV_GROUPS.flatMap((g) => g.items)

export function Dashboard({
  report,
  history,
  insights,
  empty = false,
  demoActive = false,
  onToggleDemo,
}: {
  report: AnalysisReport
  history: TrendPoint[]
  insights: ProjectInsights
  /** True before any analysis has run — shows the empty state in the content area. */
  empty?: boolean
  /** Whether bundled demo data is currently shown. */
  demoActive?: boolean
  /** Toggle the bundled demo data on/off. */
  onToggleDemo?: (on: boolean) => void
}) {
  const { lint, types, security, deps } = report
  const [tab, setTab] = useState("overview")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [runOpen, setRunOpen] = useState(false)

  const counts: Record<string, number> = {
    lint: lint.errorCount + lint.warningCount,
    types: types.diagnostics.length,
    tests: insights.tests.findings.length,
    security: security.findings.length,
    deps: deps.findings.length,
    env: insights.env.counts.issues,
    network: insights.network.counts.issues,
    performance: insights.performance.findings.length,
    accessibility: insights.accessibility.violations.length,
    database: insights.database.findings.length,
    git: insights.git.issues.length + insights.git.workflows.reduce((s, w) => s + w.issues.length, 0),
    docs: insights.docs.standards
      .flatMap((s) => s.checks)
      .filter((c) => c.status === "fail" || c.status === "warn").length,
  }

  const selectTab = useCallback((value: string) => setTab(value), [])

  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[0]

  // Global keyboard shortcuts: Cmd/Ctrl+K opens search; number keys switch tabs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === "/") {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      // 1–9 then 0 map to the first ten tabs in nav order.
      const num = Number.parseInt(e.key, 10)
      if (!Number.isNaN(num)) {
        const idx = num === 0 ? 9 : num - 1
        if (TABS[idx]) {
          e.preventDefault()
          setTab(TABS[idx].value)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <main className="min-h-svh bg-background">
      <InspectorProvider projectRoot={report.meta.project.root}>
        <div className="flex">
          {/* Desktop sidebar — sticky, full viewport height */}
          <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
            {/* Brand */}
            <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
                <Terminal className="size-5" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-base font-semibold text-foreground">CodeLens</h1>
                {report.meta.aiEnabled && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
                    <Sparkles className="size-2.5" />
                    AI
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable nav */}
            <nav aria-label="Analysis sections" className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
              {NAV_GROUPS.map((group, i) => (
                <div key={group.label ?? `group-${i}`} className="flex flex-col gap-0.5">
                  {group.label && (
                    <p className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </p>
                  )}
                  {group.items.map((item) => {
                    const active = tab === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        onClick={() => setTab(item.value)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-secondary font-medium text-foreground"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate text-left">{item.label}</span>
                        {counts[item.value] > 0 && (
                          <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
                            {counts[item.value]}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>

            {/* Settings pinned to the bottom of the rail */}
            <div className="flex shrink-0 flex-col gap-1 border-t border-border p-3">
              <Link
                href="/settings"
                prefetch
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                <Settings className="size-4 shrink-0" />
                <span className="flex-1 text-left">Settings</span>
              </Link>
            </div>
          </aside>

          {/* Right column: sticky top bar + scrollable content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <RunHeader
              project={report.meta.project}
              aiEnabled={report.meta.aiEnabled}
              lastRunMs={empty ? null : report.meta.durationMs}
              lastRunLabel="just now"
              empty={empty}
              demoActive={demoActive}
              onToggleDemo={onToggleDemo}
              onOpenSearch={() => setPaletteOpen(true)}
              onRunChecks={() => setRunOpen(true)}
            />

            {empty ? (
              <EmptyState
                onRunChecks={() => setRunOpen(true)}
                onLoadDemo={() => onToggleDemo?.(true)}
              />
            ) : (
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4 px-4 py-6 sm:px-6">
              {/* Mobile / tablet navigation */}
              <div className="flex items-center gap-2 lg:hidden">
                <Select value={tab} onValueChange={(v) => v && setTab(v)}>
                  <SelectTrigger className="flex-1">
                    <span className="flex items-center gap-2">
                      <activeTab.icon className="size-4 text-muted-foreground" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {NAV_GROUPS.map((group, i) => (
                      <SelectGroup key={group.label ?? `group-${i}`}>
                        {group.label && <SelectLabel>{group.label}</SelectLabel>}
                        {group.items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            <span className="flex items-center gap-2">
                              <item.icon className="size-4 text-muted-foreground" />
                              {item.label}
                              {counts[item.value] > 0 && (
                                <span className="font-mono text-[10px] text-muted-foreground">{counts[item.value]}</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  aria-label="Search"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Search className="size-4" />
                </button>
              </div>

              {/* Content */}
              <div className="min-w-0">
                <TabsContent value="overview">
                  <OverviewPanel report={report} history={history} insights={insights} />
                </TabsContent>
                <TabsContent value="lint">
                  <LintPanel lint={lint} />
                </TabsContent>
                <TabsContent value="types">
                  <TypesPanel types={types} />
                </TabsContent>
                <TabsContent value="tests">
                  <TestsPanel tests={insights.tests} />
                </TabsContent>
                <TabsContent value="security">
                  <SecurityPanel security={security} />
                </TabsContent>
                <TabsContent value="deps">
                  <DependenciesPanel deps={deps} />
                </TabsContent>
                <TabsContent value="env">
                  <EnvPanel env={insights.env} />
                </TabsContent>
                <TabsContent value="network">
                  <NetworkPanel network={insights.network} />
                </TabsContent>
                <TabsContent value="performance">
                  <PerformancePanel performance={insights.performance} />
                </TabsContent>
                <TabsContent value="accessibility">
                  <AccessibilityPanel accessibility={insights.accessibility} />
                </TabsContent>
                <TabsContent value="database">
                  <DatabasePanel database={insights.database} />
                </TabsContent>
                <TabsContent value="git">
                  <GitPanel git={insights.git} />
                </TabsContent>
                <TabsContent value="setup">
                  <SetupPanel setup={insights.setup} />
                </TabsContent>
                <TabsContent value="docs">
                  <DocsPanel docs={insights.docs} />
                </TabsContent>
              </div>
            </Tabs>
            )}
          </div>
        </div>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          tabs={TABS}
          onSelectTab={selectTab}
          onRunChecks={() => setRunOpen(true)}
          report={report}
          insights={insights}
        />

        <RunDialog open={runOpen} onOpenChange={setRunOpen} report={report} />
      </InspectorProvider>
    </main>
  )
}
