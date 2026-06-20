"use client"

import { useState } from "react"
import { Download, FileText, Braces, ClipboardCheck, Clipboard, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildMarkdownReport, buildJsonReport, downloadFile } from "@/lib/report"
import type { AnalysisReport } from "@/lib/schema"
import type { ProjectInsights } from "@/lib/project-insights"

export function ReportExport({
  report,
  insights,
}: {
  report: AnalysisReport
  insights: ProjectInsights
}) {
  const [copied, setCopied] = useState(false)

  const slug =
    report.meta.project.root.split("/").filter(Boolean).pop()?.replace(/[^a-z0-9]+/gi, "-") || "project"
  const stamp = new Date().toISOString().slice(0, 10)

  function exportMarkdown() {
    downloadFile(`Projectlens-${slug}-${stamp}.md`, buildMarkdownReport(report, insights), "text/markdown")
  }

  function exportJson() {
    downloadFile(`Projectlens-${slug}-${stamp}.json`, buildJsonReport(report, insights), "application/json")
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(buildMarkdownReport(report, insights))
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard may be unavailable; fall back to a download.
      exportMarkdown()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
        <Download className="size-3.5" />
        Export report
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={exportMarkdown}>
          <FileText className="size-4" />
          <span>Markdown (.md)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJson}>
          <Braces className="size-4" />
          <span>JSON (.json)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem closeOnClick={false} onClick={copyMarkdown}>
          {copied ? <ClipboardCheck className="size-4 text-[color:var(--sev-ok)]" /> : <Clipboard className="size-4" />}
          <span>{copied ? "Copied to clipboard" : "Copy as Markdown"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
