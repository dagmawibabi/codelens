import Link from "next/link"
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react"
import { ThemeToggle } from "@/components/dashboard/theme-toggle"
import { SettingsView } from "@/components/settings/settings-view"

export default function SettingsPage() {
  return (
    <main className="min-h-svh bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            prefetch
            aria-label="Back to dashboard"
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-4 text-muted-foreground" />
            <h1 className="font-mono text-lg font-semibold text-foreground">Settings</h1>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <SettingsView />
      </div>
    </main>
  )
}
