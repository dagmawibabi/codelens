import type { EnvResult, EnvScope, EnvStatus, EnvVariable, Severity } from "../types.js"
import type { ScanContext } from "./scan.js"

/** Env files we look for, in conventional precedence order. */
const ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
  ".env.test",
  ".env.example",
]

const PUBLIC_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "NUXT_PUBLIC_", "REACT_APP_", "GATSBY_", "EXPO_PUBLIC_"]
const SECRET_HINT = /(SECRET|TOKEN|KEY|PASSWORD|PASS|PRIVATE|DSN|CREDENTIAL|AUTH|API)/i

function scopeOf(key: string): EnvScope {
  return PUBLIC_PREFIXES.some((p) => key.startsWith(p)) ? "client" : "server"
}

function looksSecret(key: string): boolean {
  return SECRET_HINT.test(key) && scopeOf(key) === "server"
}

function mask(value: string): string {
  if (value === "") return "(empty)"
  if (/^https?:\/\//.test(value)) {
    try {
      const u = new URL(value)
      return `${u.protocol}//••••@${u.host}`.replace("//••••@", "//")
    } catch {
      return "••••"
    }
  }
  if (value.length <= 6) return "••••"
  return `${value.slice(0, 4)}••••`
}

/** Parse simple KEY=VALUE lines from an env file body. */
function parseEnv(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of body.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "")
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out.set(key, val)
  }
  return out
}

const REF_RE = /(?:process\.env|import\.meta\.env)\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])/g

/**
 * Environment intelligence: cross-references declared env vars against actual
 * `process.env` / `import.meta.env` usage to surface missing, unused,
 * undocumented, empty, and client-exposed-secret variables.
 */
export async function collectEnv(ctx: ScanContext): Promise<EnvResult> {
  // 1. Parse declarations from each env file.
  const declaredIn = new Map<string, string[]>() // key -> files
  const values = new Map<string, string>() // key -> last non-empty value seen
  const emptyKeys = new Set<string>()
  const fileSummaries: { path: string; present: boolean; vars: number }[] = []

  for (const path of ENV_FILES) {
    const body = await ctx.read(path)
    if (body == null) {
      fileSummaries.push({ path, present: false, vars: 0 })
      continue
    }
    const parsed = parseEnv(body)
    fileSummaries.push({ path, present: true, vars: parsed.size })
    for (const [k, v] of parsed) {
      if (!declaredIn.has(k)) declaredIn.set(k, [])
      declaredIn.get(k)!.push(path)
      if (v === "") emptyKeys.add(k)
      else values.set(k, v)
    }
  }

  // 2. Find references in code.
  const usedIn = new Map<string, Set<string>>()
  const clientUse = new Map<string, Set<string>>() // refs in "use client" files
  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel)
    if (!content) continue
    const isClient = /^\s*['"]use client['"]/m.test(content) || /\.(client|tsx|jsx|vue|svelte)$/.test(file.rel)
    REF_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = REF_RE.exec(content))) {
      const key = m[1] ?? m[2]
      if (!key) continue
      if (!usedIn.has(key)) usedIn.set(key, new Set())
      usedIn.get(key)!.add(file.rel)
      if (isClient) {
        if (!clientUse.has(key)) clientUse.set(key, new Set())
        clientUse.get(key)!.add(file.rel)
      }
    }
  }

  const exampleFile = ".env.example"
  const exampleKeys = new Set([...declaredIn].filter(([, f]) => f.includes(exampleFile)).map(([k]) => k))

  const allKeys = new Set<string>([...declaredIn.keys(), ...usedIn.keys()])
  const variables: EnvVariable[] = []

  for (const key of allKeys) {
    const defs = (declaredIn.get(key) ?? []).filter((f) => f !== exampleFile)
    const definedIn = declaredIn.get(key) ?? []
    const uses = [...(usedIn.get(key) ?? [])]
    const scope = scopeOf(key)
    const inExample = exampleKeys.has(key)

    let status: EnvStatus = "ok"
    let severity: Severity = "info"
    let note = ""

    if (defs.length === 0 && uses.length > 0) {
      status = "missing"
      severity = looksSecret(key) ? "high" : "medium"
      note = `Referenced in ${uses.length} file(s) but not defined in any env file. It will be undefined at runtime.`
    } else if (defs.length > 0 && uses.length === 0) {
      status = "unused"
      severity = "low"
      note = "Defined in an env file but never referenced in the codebase. Safe to remove."
    } else if (emptyKeys.has(key) && uses.length > 0) {
      status = "empty"
      severity = "medium"
      note = "Declared with an empty value; code that depends on it may fail silently."
    } else if (looksSecret(key) && clientUse.has(key)) {
      status = "exposed"
      severity = "critical"
      note = `Secret-looking variable is referenced from a client component (${[...clientUse.get(key)!][0]}). It will be inlined into the browser bundle.`
    } else if (defs.length > 0 && !inExample && uses.length > 0) {
      status = "undocumented"
      severity = "low"
      note = "Used and defined locally but absent from .env.example, so collaborators won't know to set it."
    } else {
      status = "ok"
      severity = "info"
      note = scope === "client" ? "Public client variable." : "Server-only variable."
    }

    const sampleVal = values.get(key)
    variables.push({
      key,
      scope,
      status,
      severity,
      usedIn: uses.slice(0, 10),
      definedIn,
      note,
      sample: emptyKeys.has(key) ? "(empty)" : sampleVal != null ? mask(sampleVal) : undefined,
      // Raw value for the (locally-rendered) Values tab. Empty string when the
      // key is declared with no value; undefined when it isn't declared at all.
      value: emptyKeys.has(key) ? "" : sampleVal,
    })
  }

  variables.sort((a, b) => Number(b.status !== "ok") - Number(a.status !== "ok") || a.key.localeCompare(b.key))

  const client = variables.filter((v) => v.scope === "client").length
  const issues = variables.filter((v) => v.status !== "ok").length

  return {
    files: fileSummaries,
    variables,
    counts: { total: variables.length, client, server: variables.length - client, issues },
  }
}
