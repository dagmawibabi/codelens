"use client"

import { useCallback, useEffect, useState } from "react"
import {
  LayoutDashboard,
  FileText,
  Braces,
  ShieldAlert,
  Package,
  KeyRound,
  Globe,
  GitBranch,
  Settings2,
  BookOpen,
  Search,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { RunHeader } from "./run-header"
import { OverviewPanel } from "./overview-panel"
import { LintPanel } from "./lint-panel"
import { TypesPanel } from "./types-panel"
import { SecurityPanel } from "./security-panel"
import { DependenciesPanel } from "./dependencies-panel"
import { EnvPanel } from "./env-panel"
import { NetworkPanel } from "./network-panel"
import { GitPanel } from "./git-panel"
import { SetupPanel } from "./setup-panel"
import { DocsPanel } from "./docs-panel"
import { InspectorProvider } from "./inspector"
import { CommandPalette, type TabDef } from "./command-palette"
import type { AnalysisReport, TrendPoint } from "@/lib/schema"
import type { ProjectInsights } from "@/lib/project-insights"

const TABS: TabDef[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "lint", label: "Lint", icon: FileText },
  { value: "types", label: "Types", icon: Braces },
  { value: "security", label: "Security", icon: ShieldAlert },
  { value: "deps", label: "Dependencies", icon: Package },
  { value: "env", label: "Environment", icon: KeyRound },
  { value: "network", label: "Network", icon: Globe },
  { value: "git", label: "Git & CI/CD", icon: GitBranch },
  { value: "setup", label: "Setup", icon: Settings2 },
  { value: "docs", label: "Docs", icon: BookOpen },
]

export function Dashboard({
  report,
  history,
  insights,
}: {
  report: AnalysisReport
  history: TrendPoint[]
  insights: ProjectInsights
}) {
  const { lint, types, security, deps } = report
  const [tab, setTab] = useState("overview")
  const [paletteOpen, setPaletteOpen] = useState(false)

  const counts: Record<string, number> = {
    lint: lint.errorCount + lint.warningCount,
    types: types.diagnostics.length,
    security: security.findings.length,
    deps: deps.findings.length,
    env: insights.env.counts.issues,
    network: insights.network.counts.issues,
    git: insights.git.issues.length + insights.git.workflows.reduce((s, w) => s + w.issues.length, 0),
    docs: insights.docs.checks.filter((c) => c.status !== "pass").length,
  }

  const selectTab = useCallback((value: string) => setTab(value), [])

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
      // 1–9 then 0 map to the ten tabs in order.
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
      <RunHeader
        project={report.meta.project}
        aiEnabled={report.meta.aiEnabled}
        lastRunMs={report.meta.durationMs}
        lastRunLabel="just now"
        onOpenSearch={() => setPaletteOpen(true)}
      />

      <InspectorProvider projectRoot={report.meta.project.root}>
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <TabsList className="max-w-full flex-1 overflow-x-auto">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                    {t.label}
                    {counts[t.value] > 0 && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {counts[t.value]}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="hidden shrink-0 items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                <Search className="size-3.5" />
                Search
                <kbd className="rounded-[3px] border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
              </button>
            </div>

            <TabsContent value="overview">
              <OverviewPanel report={report} history={history} />
            </TabsContent>
            <TabsContent value="lint">
              <LintPanel lint={lint} />
            </TabsContent>
            <TabsContent value="types">
              <TypesPanel types={types} />
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
            <TabsContent value="git">
              <GitPanel git={insights.git} />
            </TabsContent>
            <TabsContent value="setup">
              <SetupPanel setup={insights.setup} />
            </TabsContent>
            <TabsContent value="docs">
              <DocsPanel docs={insights.docs} />
            </TabsContent>
          </Tabs>

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            tabs={TABS}
            onSelectTab={selectTab}
            report={report}
            insights={insights}
          />
        </div>
      </InspectorProvider>
    </main>
  )
}
