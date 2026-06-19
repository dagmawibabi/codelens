"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import {
  Cpu,
  KeyRound,
  ShieldCheck,
  FileJson,
  Save,
  Check,
  RotateCcw,
  Loader2,
  RefreshCw,
  MessageSquare,
  GitBranch,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { KeyInput } from "./key-input"
import { ModelPicker } from "./model-picker"
import {
  PROVIDERS,
  getProvider,
  loadSettings,
  saveSettings,
  toConfigFile,
  DEFAULT_SETTINGS,
  type CodeLensSettings,
  type ModelOption,
  type ProviderId,
} from "@/lib/settings"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function SectionCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ElementType
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border text-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <h2 className="font-mono text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function SettingsView() {
  const [settings, setSettings] = useState<CodeLensSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
    setHydrated(true)
  }, [])

  const provider = getProvider(settings.provider)
  const isGateway = settings.provider === "vercel"

  // Fetch live model catalog from the AI Gateway when that provider is active.
  const {
    data: gatewayData,
    isLoading: gatewayLoading,
    mutate: refreshGateway,
  } = useSWR<{ models?: ModelOption[]; error?: string }>(
    isGateway ? "/api/gateway-models" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  // Effective model list: live gateway list when available, else static catalog.
  const models: ModelOption[] =
    isGateway && gatewayData?.models?.length ? gatewayData.models : provider.models

  // Keep the model valid whenever the provider changes.
  function selectProvider(id: ProviderId) {
    const next = getProvider(id)
    const stillValid = next.models.some((m) => m.id === settings.model)
    setSettings((s) => ({ ...s, provider: id, model: stillValid ? s.model : next.models[0].id }))
    setSaved(false)
  }

  function patch(p: Partial<CodeLensSettings>) {
    setSettings((s) => ({ ...s, ...p }))
    setSaved(false)
  }

  function setKey(id: ProviderId, value: string) {
    setSettings((s) => ({ ...s, keys: { ...s.keys, [id]: value } }))
    setSaved(false)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setSettings(DEFAULT_SETTINGS)
    saveSettings(DEFAULT_SETTINGS)
    setSaved(false)
  }

  const configPreview = useMemo(() => JSON.stringify(toConfigFile(settings), null, 2), [settings])

  const activeKeyMissing = provider.needsKey && !settings.keys[settings.provider]?.trim()

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-sm border border-border bg-card/50" />
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Main column */}
      <div className="flex flex-1 flex-col gap-6">
        <SectionCard
          icon={ShieldCheck}
          title="AI security audit"
          desc="Choose whether to run the AI review and how it handles your source."
        >
          <div className="flex flex-col divide-y divide-border">
            <ToggleRow
              label="Enable AI security audit"
              hint="When off, CodeLens runs lint, types, and the dependency audit only."
              checked={settings.aiEnabled}
              onChange={(v) => patch({ aiEnabled: v })}
            />
            <ToggleRow
              label="Redact secrets before sending"
              hint="Strip obvious API keys and tokens from snippets before they reach the model."
              checked={settings.redactSecrets}
              onChange={(v) => patch({ redactSecrets: v })}
            />
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-mono text-sm text-foreground">Max files per run</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Caps how many source files are sent for review.
                </p>
              </div>
              <Select value={String(settings.maxFiles)} onValueChange={(v) => patch({ maxFiles: Number(v) })}>
                <SelectTrigger className="w-24 rounded-sm font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Cpu}
          title="Provider & model"
          desc="The provider and model used to perform the security review."
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Provider</Label>
                <Select value={settings.provider} onValueChange={(v) => selectProvider(v as ProviderId)}>
                  <SelectTrigger className="w-full rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Model</Label>
                  {isGateway && (
                    <button
                      type="button"
                      onClick={() => refreshGateway()}
                      className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {gatewayLoading ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )}
                      {gatewayLoading ? "loading" : `${models.length} live`}
                    </button>
                  )}
                </div>
                {/* Searchable, detailed catalog (models.dev) for any provider. */}
                <ModelPicker value={settings.model} onChange={(v) => patch({ model: v })} />
                {/* Quick-pick from the active provider's curated list. */}
                <Select value={settings.model} onValueChange={(v) => patch({ model: v })}>
                  <SelectTrigger className="w-full rounded-sm font-mono text-xs">
                    <SelectValue placeholder="Quick pick…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isGateway && (
              <p className="font-mono text-xs text-muted-foreground">
                {gatewayLoading
                  ? "Fetching the live model list from the AI Gateway…"
                  : gatewayData?.models?.length
                    ? "Live text models from the Vercel AI Gateway."
                    : "Showing built-in defaults — could not reach the gateway."}
              </p>
            )}
            {models.find((m) => m.id === settings.model)?.note && (
              <p className="font-mono text-xs text-muted-foreground">
                {models.find((m) => m.id === settings.model)?.note}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          icon={KeyRound}
          title="API key"
          desc="Stored locally in your browser and written to .codelens.json for the CLI. Never sent anywhere else."
        >
          {provider.needsKey ? (
            <KeyInput
              key={provider.id}
              provider={provider}
              value={settings.keys[provider.id] ?? ""}
              active
              onChange={(v) => setKey(provider.id, v)}
            />
          ) : (
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">
              {provider.name} runs locally and needs no API key. Make sure the Ollama server is running and reachable
              at <span className="text-foreground">{provider.envVar}</span>.
            </p>
          )}
        </SectionCard>

        <SectionCard
          icon={MessageSquare}
          title="AI chat assistant"
          desc="The in-dashboard assistant available from the sidebar and every issue's “Ask AI” button."
        >
          <div className="flex flex-col divide-y divide-border">
            <ToggleRow
              label="Enable AI chat assistant"
              hint="Adds the AI Chat tab and the Ask AI shortcut in issue detail sheets."
              checked={settings.chatEnabled}
              onChange={(v) => patch({ chatEnabled: v })}
            />
            <ToggleRow
              label="Persist chat history"
              hint="Save conversations to .codelens/chats.json so they survive restarts. When off, chats are kept in memory only."
              checked={settings.persistChats}
              onChange={(v) => patch({ persistChats: v })}
            />
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-mono text-sm text-foreground">Assistant model</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Shared with the audit — set under Provider &amp; model above.
                </p>
              </div>
              <span className="max-w-[12rem] truncate rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[11px] text-foreground">
                {settings.model}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={GitBranch}
          title="GitHub integration"
          desc="Powers the enriched Git overview and the Releases dashboard. All fields are optional."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Access token
              </Label>
              <input
                type="password"
                value={settings.githubToken}
                onChange={(e) => patch({ githubToken: e.target.value })}
                placeholder="ghp_… (optional)"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
              />
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                Raises the GitHub API rate limit from 60 to 5,000 requests/hour and enables private repositories.
                Written to <span className="text-foreground">GITHUB_TOKEN</span> for the CLI.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                Default repository
              </Label>
              <input
                type="text"
                value={settings.defaultRepo}
                onChange={(e) => patch({ defaultRepo: e.target.value })}
                placeholder="owner/repo (optional)"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30"
              />
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                Overrides the auto-detected remote in the Git &amp; Releases tabs.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Sticky side rail */}
      <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
        <div className="lg:sticky lg:top-6 flex flex-col gap-4">
          <div className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <FileJson className="size-4 text-muted-foreground" />
                <span className="font-mono text-xs font-semibold text-foreground">.codelens.json</span>
              </div>
              <span className="font-mono text-[10px] uppercase text-muted-foreground">preview</span>
            </div>
            <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground/80">
              <code>{configPreview}</code>
            </pre>
          </div>

          {activeKeyMissing && (
            <div className="rounded-sm border border-border bg-muted/40 px-4 py-3">
              <p className="font-mono text-xs text-foreground">No key for {provider.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Add a key above or the AI audit will be skipped at run time.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-sm px-4 py-2.5 font-mono text-sm font-medium transition-colors",
                saved
                  ? "bg-foreground/10 text-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {saved ? <Check className="size-4" /> : <Save className="size-4" />}
              {saved ? "Saved" : "Save settings"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset to defaults"
              className="inline-flex items-center justify-center gap-2 rounded-sm border border-border px-3 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-mono text-sm text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
