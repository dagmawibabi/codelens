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
  ClipboardList,
  Trash2,
  Eraser,
  HardDrive,
  History,
  Loader2 as Spinner,
  Palette,
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
  applyColorAccents,
  DEFAULT_SETTINGS,
  type CodeLensSettings,
  type ModelOption,
  type ProviderId,
} from "@/lib/settings"
import {
  useTasks,
  useColumns,
  useGroups,
  clearDone,
  clearAllTasks,
  resetBoard,
} from "@/lib/tasks"
import { clearServerData, deleteEverything } from "@/lib/reset-data"
import { fetchGatewayModels } from "@/lib/gateway-models"
import { cn } from "@/lib/utils"

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

  // Fetch the live model catalog straight from the AI Gateway when that
  // provider is active. Fetching the CORS-enabled endpoint directly (rather
  // than via a Next API route) keeps this working when the dashboard is served
  // as a static bundle by the CLI. Retries are disabled so a transient failure
  // can't become a request storm.
  const {
    data: gatewayModels,
    isLoading: gatewayLoading,
    mutate: refreshGateway,
  } = useSWR<ModelOption[]>(
    isGateway ? "gateway/models" : null,
    fetchGatewayModels,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  // Effective model list: live gateway list when available, else static catalog.
  const models: ModelOption[] =
    isGateway && gatewayModels?.length ? gatewayModels : provider.models

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
    applyColorAccents(DEFAULT_SETTINGS.colorAccents)
    setSaved(false)
  }

  // Appearance is a display preference: apply and persist it immediately so it
  // takes effect (and survives reloads) without needing the Save button.
  function toggleAccents(on: boolean) {
    applyColorAccents(on)
    const next = { ...settings, colorAccents: on }
    setSettings(next)
    saveSettings(next)
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
                <Select value={settings.model ?? undefined} onValueChange={(v) => patch({ model: v ?? "" })}>
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
                  : gatewayModels?.length
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

        <SectionCard
          icon={Palette}
          title="Appearance"
          desc="Tune how the dashboard looks. These preferences are display-only and never affect the CLI config."
        >
          <div className="flex flex-col divide-y divide-border">
            <ToggleRow
              label="Color accents"
              hint="Layer subtle semantic colors over the monochrome theme — severity tags, charts, hovers, and focus rings. Takes effect immediately."
              checked={settings.colorAccents}
              onChange={toggleAccents}
            />
            <AccentPreview enabled={settings.colorAccents} />
          </div>
        </SectionCard>

        <SectionCard
          icon={ClipboardList}
          title="Task board"
          desc="Your remediation worklist is stored locally in this browser — it never leaves your machine or reaches the CLI."
        >
          <TaskBoardSection />
        </SectionCard>

        <SectionCard
          icon={HardDrive}
          title="Data & storage"
          desc="Reset preferences or permanently delete stored data — runs, chats, the task board, and cached settings."
        >
          <DataStorageSection onResetSettings={handleReset} />
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

function TaskBoardSection() {
  const tasks = useTasks()
  const columns = useColumns()
  const groups = useGroups()
  // Two-step confirmation for the destructive reset.
  const [confirming, setConfirming] = useState<"clear" | "reset" | null>(null)

  const doneIds = new Set(columns.filter((c) => c.done).map((c) => c.id))
  const doneCount = tasks.filter((t) => doneIds.has(t.columnId)).length

  const stats = [
    { label: "Tasks", value: tasks.length },
    { label: "Completed", value: doneCount },
    { label: "Columns", value: columns.length },
    { label: "Groups", value: groups.length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-sm border border-border bg-background px-3 py-2.5">
            <p className="font-mono text-lg tabular-nums text-foreground">{s.value}</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col divide-y divide-border">
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-mono text-sm text-foreground">Clear completed tasks</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Remove every task in a column marked as done.
            </p>
          </div>
          <button
            type="button"
            onClick={clearDone}
            disabled={doneCount === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Eraser className="size-3.5" />
            Clear {doneCount > 0 ? doneCount : ""}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-mono text-sm text-foreground">Delete all tasks</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Empty the board. Your columns and groups are kept.
            </p>
          </div>
          {confirming === "clear" ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  clearAllTasks()
                  setConfirming(null)
                }}
                className="rounded-sm bg-destructive px-2.5 py-1.5 font-mono text-xs text-destructive-foreground"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("clear")}
              disabled={tasks.length === 0}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="size-3.5" />
              Delete all
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="font-mono text-sm text-foreground">Reset board to defaults</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Restore the default columns and groups and remove all tasks.
            </p>
          </div>
          {confirming === "reset" ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  resetBoard()
                  setConfirming(null)
                }}
                className="rounded-sm bg-destructive px-2.5 py-1.5 font-mono text-xs text-destructive-foreground"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming("reset")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-destructive/40 px-2.5 py-1.5 font-mono text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Live swatch preview for the color-accent toggle. Reads the same `--sev-*`,
 * `--primary` and `--chart-*` tokens the rest of the app uses, so it reflects
 * the active mode instantly when the `accents` class flips on <html>.
 */
function AccentPreview({ enabled }: { enabled: boolean }) {
  const severities: { key: string; label: string }[] = [
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
    { key: "info", label: "Info" },
    { key: "ok", label: "Passed" },
  ]
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">Preview</p>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {enabled ? "Color accents on" : "Monochrome"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {severities.map((s) => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[11px]"
            style={{
              backgroundColor: `color-mix(in oklab, var(--sev-${s.key}) 14%, transparent)`,
              color: `var(--sev-${s.key})`,
            }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: `var(--sev-${s.key})` }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-sm bg-primary px-2.5 py-1 font-mono text-[11px] text-primary-foreground">
          Primary
        </span>
        <span className="rounded-sm bg-accent px-2.5 py-1 font-mono text-[11px] text-accent-foreground">Hover</span>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="size-3 rounded-full" style={{ backgroundColor: `var(--chart-${n})` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A single destructive/reset action with inline two-step confirmation and a
 * busy state. Keeps the Data & storage rows consistent and prevents accidental
 * one-click data loss.
 */
function DangerRow({
  icon: Icon,
  title,
  desc,
  actionLabel,
  busyLabel,
  onConfirm,
  tone = "muted",
}: {
  icon: React.ElementType
  title: string
  desc: string
  actionLabel: string
  busyLabel: string
  onConfirm: () => void | Promise<void>
  tone?: "muted" | "destructive"
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="font-mono text-sm text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      {busy ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          <Spinner className="size-3.5 animate-spin" />
          {busyLabel}
        </span>
      ) : confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={run}
            className="rounded-sm bg-destructive px-2.5 py-1.5 font-mono text-xs text-destructive-foreground"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-xs transition-colors",
            tone === "destructive"
              ? "border-destructive/40 text-destructive hover:bg-destructive/10"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}

/**
 * Data lifecycle controls. Lets the user reset preferences to defaults or
 * permanently delete stored data. Server-side artifacts (runs, insights, chats)
 * live in the CLI's `.codelens/` folder; preferences and the task board live in
 * this browser's localStorage. A full wipe clears both and reloads.
 */
function DataStorageSection({ onResetSettings }: { onResetSettings: () => void }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      <DangerRow
        icon={RotateCcw}
        title="Reset settings to defaults"
        desc="Restore the provider, model, AI, GitHub, and chat preferences to their defaults. Stored data is kept."
        actionLabel="Reset"
        busyLabel="Resetting"
        onConfirm={onResetSettings}
      />

      <DangerRow
        icon={History}
        title="Delete run history"
        desc="Remove all saved runs, the latest snapshot, and project insights from .codelens/ on this machine."
        actionLabel="Delete runs"
        busyLabel="Deleting"
        tone="destructive"
        onConfirm={async () => {
          await clearServerData("runs")
          window.location.reload()
        }}
      />

      <DangerRow
        icon={MessageSquare}
        title="Delete chat history"
        desc="Erase every saved Ask-AI conversation from .codelens/chats.json."
        actionLabel="Delete chats"
        busyLabel="Deleting"
        tone="destructive"
        onConfirm={async () => {
          await clearServerData("chats")
          window.location.reload()
        }}
      />

      <DangerRow
        icon={Trash2}
        title="Delete everything"
        desc="Wipe all runs, chats, the task board, and cached settings — server data and this browser's storage. This cannot be undone."
        actionLabel="Delete all data"
        busyLabel="Wiping"
        tone="destructive"
        onConfirm={async () => {
          await deleteEverything()
          window.location.reload()
        }}
      />
    </div>
  )
}
