"use client"

import { useMemo, useState } from "react"
import {
  ShieldCheck,
  KeyRound,
  Users,
  Puzzle,
  Mail,
  Globe,
  Lock,
  Database,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Server,
  Monitor,
  Fingerprint,
  Settings2,
  Boxes,
  TriangleAlert,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { InsightCard, ProportionBar } from "./insights"
import { FileLink } from "./inspector"
import { severityStyle, bySeverityDesc } from "@/lib/severity"
import type {
  AuthResult,
  AuthPlugin,
  AuthFinding,
  AuthMethod,
  AuthConfigItem,
  AuthPluginCategory,
  AuthStatus,
} from "@/lib/project-insights"
import { cn } from "@/lib/utils"

const CATEGORY_LABEL: Record<AuthPluginCategory, string> = {
  "two-factor": "Two-Factor",
  passwordless: "Passwordless",
  social: "Social",
  authorization: "Authorization",
  session: "Session",
  api: "API",
  enterprise: "Enterprise",
  integration: "Integration",
  utility: "Utility",
  other: "Other",
}

const STATUS_COLOR: Record<AuthStatus, string> = {
  ok: "var(--sev-ok)",
  warn: "var(--sev-medium)",
  fail: "var(--sev-critical)",
  info: "var(--muted-foreground)",
}

function methodIcon(kind: AuthMethod["kind"]) {
  if (kind === "credential") return KeyRound
  if (kind === "social") return Globe
  return Fingerprint
}

function MethodCard({ method }: { method: AuthMethod }) {
  const Icon = methodIcon(method.kind)
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-sm border",
            method.enabled ? "border-[color:var(--sev-ok)]/40 text-[color:var(--sev-ok)]" : "border-border text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{method.label}</p>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase",
                method.enabled
                  ? "bg-[color:var(--sev-ok)]/12 text-[color:var(--sev-ok)]"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {method.enabled ? "On" : "Off"}
            </span>
          </div>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{method.detail}</p>
          {method.providers && method.providers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {method.providers.map((p) => (
                <span
                  key={p}
                  className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] capitalize text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function PluginCard({ plugin, onOpen }: { plugin: AuthPlugin; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-sm border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/40"
    >
      <Puzzle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{plugin.name}</span>
          <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {CATEGORY_LABEL[plugin.category]}
          </span>
          {plugin.clientMissing && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--sev-medium)]/12 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[color:var(--sev-medium)]">
              <TriangleAlert className="size-3" />
              client missing
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">
          {plugin.description}
        </p>
        <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1", plugin.detectedServer ? "text-[color:var(--sev-ok)]" : "text-muted-foreground/50")}>
            <Server className="size-3" />
            server
          </span>
          {plugin.needsClient && (
            <span className={cn("inline-flex items-center gap-1", plugin.detectedClient ? "text-[color:var(--sev-ok)]" : "text-[color:var(--sev-medium)]")}>
              <Monitor className="size-3" />
              client
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ConfigRow({ item }: { item: AuthConfigItem }) {
  const color = STATUS_COLOR[item.status]
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border p-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          <span className="text-sm text-foreground">{item.label}</span>
        </div>
        {item.detail && <p className="mt-1 pl-4 text-xs text-muted-foreground">{item.detail}</p>}
        {item.recommendation && (
          <p className="mt-1 pl-4 text-pretty text-xs leading-relaxed text-muted-foreground">{item.recommendation}</p>
        )}
      </div>
      <span className="shrink-0 font-mono text-xs" style={{ color }}>
        {item.value}
      </span>
    </div>
  )
}

function FindingRow({ f, onOpen }: { f: AuthFinding; onOpen: () => void }) {
  const sev = severityStyle(f.severity)
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
      <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: `var(--sev-${f.severity})` }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>{sev.label}</Badge>
          <span className="text-sm font-medium text-foreground">{f.title}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-muted-foreground">{f.detail}</p>
        {f.filePath && (
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
            <FileLink path={f.filePath} line={f.line} />
          </div>
        )}
      </div>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

export function AuthPanel({ auth }: { auth: AuthResult }) {
  const [plugin, setPlugin] = useState<AuthPlugin | null>(null)
  const [finding, setFinding] = useState<AuthFinding | null>(null)

  const findings = useMemo(() => [...auth.findings].sort(bySeverityDesc), [auth.findings])

  const categorySegments = useMemo(() => {
    const map = new Map<AuthPluginCategory, number>()
    for (const p of auth.plugins) map.set(p.category, (map.get(p.category) ?? 0) + 1)
    return [...map.entries()].map(([key, value], i) => ({
      label: CATEGORY_LABEL[key],
      value,
      color: `var(--chart-${(i % 5) + 1})`,
    }))
  }, [auth.plugins])

  if (!auth.present) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">No auth provider detected</p>
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
            CodeLens looks for popular auth libraries — <span className="font-mono">better-auth</span>,{" "}
            <span className="font-mono">@clerk/nextjs</span>, <span className="font-mono">next-auth</span>,{" "}
            <span className="font-mono">@supabase/supabase-js</span>, <span className="font-mono">lucia</span>,{" "}
            <span className="font-mono">firebase</span> and more. Install one to see a breakdown here.
          </p>
        </div>
      </Card>
    )
  }

  const provider = auth.provider
  const deep = provider?.deepSupport ?? false

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <aside className="flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
        <InsightCard title={provider?.name ?? "Auth"}>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                <ShieldCheck className="size-4 text-[color:var(--sev-ok)]" />
                Detected
              </span>
              {auth.version && <span className="font-mono text-xs text-muted-foreground">v{auth.version}</span>}
            </div>
            {!deep && (
              <div className="rounded-sm border border-[color:var(--sev-medium)]/30 bg-[color:var(--sev-medium)]/10 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Provider-level analysis. Deep config introspection (methods, plugins, session) is available for Better Auth.
              </div>
            )}
            {auth.integration && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Integration</span>
                <span className="font-mono text-foreground">{auth.integration}</span>
              </div>
            )}
            {auth.databaseAdapter && (
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Database className="size-3" />
                  Adapter
                </span>
                <span className="font-mono text-foreground">{auth.databaseAdapter.name}</span>
              </div>
            )}
            {auth.configPath && (
              <div className="border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                <FileLink path={auth.configPath} />
              </div>
            )}
            {auth.clientPath && (
              <div className="font-mono text-[10px] text-muted-foreground">
                <FileLink path={auth.clientPath} />
              </div>
            )}
            {provider && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {provider.name} docs
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </InsightCard>

        <InsightCard title="At a glance">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Methods", value: auth.counts.methods, icon: KeyRound },
              { label: "Plugins", value: auth.counts.plugins, icon: Puzzle },
              { label: "Issues", value: auth.counts.findings, icon: AlertTriangle },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-0.5 rounded-sm bg-secondary/40 py-2">
                <s.icon className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{s.value}</span>
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </InsightCard>

        {categorySegments.length > 0 && (
          <InsightCard title="Plugins by category">
            <ProportionBar segments={categorySegments} />
          </InsightCard>
        )}

        {auth.socialProviders.length > 0 && (
          <InsightCard title="Social providers">
            <div className="flex flex-wrap gap-1.5">
              {auth.socialProviders.map((p) => (
                <span
                  key={p}
                  className="rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[11px] capitalize text-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </InsightCard>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {/* Sign-in methods */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Sign-in methods</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {auth.methods.length}
            </Badge>
          </div>
          {auth.methods.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <AlertTriangle className="size-5 text-[color:var(--sev-medium)]" />
              No sign-in methods detected in the config.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {auth.methods.map((m) => (
                <MethodCard key={m.id} method={m} />
              ))}
            </div>
          )}
        </section>

        {/* Plugins — only Better Auth exposes a plugin system we introspect */}
        {deep && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Puzzle className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Plugins</h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {auth.plugins.length}
              </Badge>
            </div>
            {auth.plugins.length === 0 ? (
              <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                <Boxes className="size-5 text-muted-foreground" />
                No {provider?.name ?? "auth"} plugins are registered.
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {auth.plugins.map((p) => (
                  <PluginCard key={p.id} plugin={p} onOpen={() => setPlugin(p)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Configuration */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
          </div>
          <Card className="gap-0 overflow-hidden py-0">
            {auth.config.map((c) => (
              <ConfigRow key={c.key} item={c} />
            ))}
          </Card>
        </section>

        {/* Findings */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Auth findings</h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {findings.length}
            </Badge>
          </div>
          {findings.length === 0 ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <ShieldCheck className="size-5 text-[color:var(--sev-ok)]" />
              No authentication issues detected.
            </Card>
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              {findings.map((f) => (
                <FindingRow key={f.id} f={f} onOpen={() => setFinding(f)} />
              ))}
            </Card>
          )}
        </section>
      </div>

      <PluginSheet plugin={plugin} onClose={() => setPlugin(null)} />
      <FindingSheet finding={finding} onClose={() => setFinding(null)} />
    </div>
  )
}

function PluginSheet({ plugin, onClose }: { plugin: AuthPlugin | null; onClose: () => void }) {
  return (
    <Sheet open={!!plugin} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-md">
        {plugin && (
          <>
            <SheetHeader className="border-b border-border">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {CATEGORY_LABEL[plugin.category]}
                </span>
                {plugin.clientMissing && (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[color:var(--sev-medium)]/12 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[color:var(--sev-medium)]">
                    <TriangleAlert className="size-3" />
                    client missing
                  </span>
                )}
              </div>
              <SheetTitle className="mt-2 text-pretty text-base">{plugin.name}</SheetTitle>
              <SheetDescription className="text-pretty leading-relaxed">{plugin.description}</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border">
                <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Server</span>
                  <span
                    className="font-mono text-sm"
                    style={{ color: plugin.detectedServer ? "var(--sev-ok)" : "var(--muted-foreground)" }}
                  >
                    {plugin.detectedServer ? "Registered" : "Not found"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Client</span>
                  <span
                    className="font-mono text-sm"
                    style={{
                      color: !plugin.needsClient
                        ? "var(--muted-foreground)"
                        : plugin.detectedClient
                          ? "var(--sev-ok)"
                          : "var(--sev-medium)",
                    }}
                  >
                    {!plugin.needsClient ? "Not required" : plugin.detectedClient ? "Registered" : "Missing"}
                  </span>
                </div>
              </div>

              {plugin.clientMissing && (
                <div className="flex flex-col gap-1.5 rounded-sm border border-[color:var(--sev-medium)]/30 bg-[color:var(--sev-medium)]/[0.06] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--sev-medium)]">
                    <TriangleAlert className="size-3.5" />
                    Client plugin missing
                  </p>
                  <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                    Add <span className="font-mono">{plugin.id}Client()</span> to your{" "}
                    <span className="font-mono">createAuthClient()</span> plugins so its actions work in the browser.
                  </p>
                </div>
              )}

              {plugin.addsTables && plugin.addsTables.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Database className="size-3.5" />
                    Database tables added
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plugin.addsTables.map((t) => (
                      <span
                        key={t}
                        className="rounded-sm border border-border bg-secondary px-2 py-1 font-mono text-[11px] text-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                    Generate and apply migrations after adding this plugin so these tables exist.
                  </p>
                </div>
              )}

              <a
                href={plugin.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 self-start rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Plugin docs
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function FindingSheet({ finding, onClose }: { finding: AuthFinding | null; onClose: () => void }) {
  const sev = finding ? severityStyle(finding.severity) : null
  return (
    <Sheet open={!!finding} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:!max-w-md">
        {finding && sev && (
          <>
            <SheetHeader className="border-b border-border">
              <Badge className={cn("w-fit border-0 font-mono text-[10px] uppercase", sev.bg, sev.text)}>
                {sev.label}
              </Badge>
              <SheetTitle className="mt-2 text-pretty text-base leading-relaxed">{finding.title}</SheetTitle>
              <SheetDescription className="sr-only">Authentication finding detail</SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="size-3.5" />
                  Issue
                </p>
                <p className="text-pretty text-sm leading-relaxed text-foreground">{finding.detail}</p>
                {finding.filePath && (
                  <div className="font-mono text-[11px] text-muted-foreground">
                    <FileLink path={finding.filePath} line={finding.line} />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Lock className="size-3.5" />
                  Recommendation
                </p>
                <p className="rounded-sm border border-border bg-secondary/30 px-3 py-2 text-pretty text-sm leading-relaxed text-foreground">
                  {finding.recommendation}
                </p>
              </div>

              {finding.docsUrl && (
                <a
                  href={finding.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 self-start rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Better Auth docs
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
