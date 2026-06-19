"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Play,
  Settings,
  SunMoon,
  FileText,
  ShieldAlert,
  Package,
  Database,
  KeyRound,
  Globe,
  GitBranch,
  Braces,
  Accessibility,
  Gauge,
  FlaskConical,
  CircleDot,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useInspector } from "./inspector"
import { severityStyle } from "@/lib/severity"
import {
  lintToIssue,
  typeToIssue,
  securityToIssue,
  depToIssue,
  envToIssue,
  networkToIssue,
  gitToIssue,
  dbToIssue,
  a11yToIssue,
  perfToIssue,
  testToIssue,
  type Issue,
} from "@/lib/issues"
import type { AnalysisReport } from "@/lib/schema"
import type { ProjectInsights } from "@/lib/project-insights"
import { cn } from "@/lib/utils"

export interface TabDef {
  value: string
  label: string
  icon: React.ElementType
}

interface SearchEntry {
  id: string
  issue: Issue
  group: string
  icon: React.ElementType
}

export function CommandPalette({
  open,
  onOpenChange,
  tabs,
  onSelectTab,
  onRunChecks,
  report,
  insights,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tabs: TabDef[]
  onSelectTab: (value: string) => void
  onRunChecks?: () => void
  report: AnalysisReport
  insights: ProjectInsights
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { viewIssue } = useInspector()

  const entries = useMemo<SearchEntry[]>(() => {
    const out: SearchEntry[] = []
    report.lint.messages.forEach((m, i) => out.push({ id: `lint-${i}`, issue: lintToIssue(m), group: "Lint", icon: FileText }))
    report.types.diagnostics.forEach((d, i) => out.push({ id: `type-${i}`, issue: typeToIssue(d), group: "Types", icon: Braces }))
    report.security.findings.forEach((f) => out.push({ id: `sec-${f.id}`, issue: securityToIssue(f), group: "Security", icon: ShieldAlert }))
    report.deps.findings.forEach((d) => out.push({ id: `dep-${d.id}`, issue: depToIssue(d), group: "Dependencies", icon: Package }))
    insights.database.findings.forEach((f) => out.push({ id: `db-${f.id}`, issue: dbToIssue(f), group: "Database", icon: Database }))
    insights.tests.findings.forEach((f) => out.push({ id: `test-${f.id}`, issue: testToIssue(f), group: "Tests", icon: FlaskConical }))
    insights.performance.findings.forEach((f) => out.push({ id: `perf-${f.id}`, issue: perfToIssue(f), group: "Performance", icon: Gauge }))
    insights.accessibility.violations.forEach((v) => out.push({ id: `a11y-${v.id}`, issue: a11yToIssue(v), group: "Accessibility", icon: Accessibility }))
    insights.env.variables.forEach((v) => out.push({ id: `env-${v.key}`, issue: envToIssue(v), group: "Environment", icon: KeyRound }))
    insights.network.calls.forEach((c) => out.push({ id: `net-${c.id}`, issue: networkToIssue(c), group: "Network", icon: Globe }))
    insights.git.issues.forEach((g) => out.push({ id: `git-${g.id}`, issue: gitToIssue(g), group: "Git", icon: GitBranch }))
    insights.git.workflows.forEach((w) => w.issues.forEach((g) => out.push({ id: `ci-${g.id}`, issue: gitToIssue(g), group: "CI/CD", icon: GitBranch })))
    return out
  }, [report, insights])

  function run(fn: () => void) {
    onOpenChange(false)
    // Defer so the dialog can close before the action (e.g. opening another sheet).
    setTimeout(fn, 0)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} className="sm:!max-w-xl">
      <Command>
        <CommandInput placeholder="Search issues, files, and actions…" />
        <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Go to tab">
          {tabs.map((t) => (
            <CommandItem
              key={t.value}
              value={`tab ${t.label}`}
              onSelect={() => run(() => onSelectTab(t.value))}
            >
              <t.icon />
              <span>{t.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem value="run checks analysis" onSelect={() => run(() => onRunChecks?.())}>
            <Play />
            <span>Run checks</span>
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
          <CommandItem value="open settings" onSelect={() => run(() => router.push("/settings"))}>
            <Settings />
            <span>Open settings</span>
            <CommandShortcut>,</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="toggle theme dark light"
            onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
          >
            <SunMoon />
            <span>Toggle theme</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Issues & findings">
          {entries.map((e) => {
            const sev = severityStyle(e.issue.severity)
            return (
              <CommandItem
                key={e.id}
                value={`${e.group} ${e.issue.title} ${e.issue.filePath} ${e.issue.ruleId ?? ""} ${e.issue.code ?? ""}`}
                onSelect={() => run(() => viewIssue(e.issue))}
              >
                <e.icon />
                <span className="min-w-0 flex-1 truncate">{e.issue.title}</span>
                <span className="ml-2 flex shrink-0 items-center gap-2">
                  <CircleDot className={cn("size-3", sev.text)} />
                  <span className="font-mono text-[10px] uppercase text-muted-foreground">{e.group}</span>
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
