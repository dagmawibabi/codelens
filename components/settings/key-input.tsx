"use client"

import { useState } from "react"
import { Eye, EyeOff, Check, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { ProviderDef } from "@/lib/settings"

interface KeyInputProps {
  provider: ProviderDef
  value: string
  active: boolean
  onChange: (value: string) => void
}

export function KeyInput({ provider, value, active, onChange }: KeyInputProps) {
  const [show, setShow] = useState(false)

  const hasValue = value.trim().length > 0
  const prefixOk = !provider.keyPrefix || !hasValue || value.startsWith(provider.keyPrefix)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-l-2 py-3 pl-4 transition-colors",
        active ? "border-foreground" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={`key-${provider.id}`} className="font-mono text-sm font-medium text-foreground">
            {provider.name}
          </Label>
          {active && (
            <span className="rounded-sm border border-foreground/30 bg-foreground/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-foreground">
              Active
            </span>
          )}
          {hasValue && prefixOk && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Check className="size-3" /> set
            </span>
          )}
        </div>
        <code className="font-mono text-[11px] text-muted-foreground">{provider.envVar}</code>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{provider.blurb}</p>

      {provider.needsKey ? (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              id={`key-${provider.id}`}
              type={show ? "text" : "password"}
              value={value}
              spellCheck={false}
              autoComplete="off"
              placeholder={provider.keyPrefix ? `${provider.keyPrefix}…` : "Enter API key"}
              onChange={(e) => onChange(e.target.value)}
              className={cn(
                "rounded-sm pr-9 font-mono text-sm",
                !prefixOk && "border-destructive/60",
              )}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide key" : "Show key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
      ) : (
        <Input
          id={`key-${provider.id}`}
          value={value}
          spellCheck={false}
          placeholder="http://localhost:11434"
          onChange={(e) => onChange(e.target.value)}
          className="rounded-sm font-mono text-sm"
        />
      )}

      <div className="flex items-center justify-between">
        {!prefixOk ? (
          <span className="font-mono text-[11px] text-destructive">
            Expected a key starting with {provider.keyPrefix}
          </span>
        ) : (
          <span />
        )}
        {provider.keyUrl && (
          <a
            href={provider.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Get key <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
