import { execa } from "execa"
import type { DependencyVuln, ProjectInfo } from "../types.js"

type NpmSeverity = "critical" | "high" | "moderate" | "low" | "info"

function mapSeverity(s: NpmSeverity): DependencyVuln["severity"] {
  return s === "moderate" ? "medium" : s
}

/** npm audit --json (v7+) vulnerabilities map shape, trimmed to what we use. */
interface NpmAuditJson {
  vulnerabilities?: Record<
    string,
    {
      name: string
      severity: NpmSeverity
      isDirect: boolean
      via: (string | { title?: string; url?: string; cwe?: string[]; source?: number })[]
      range: string
      fixAvailable?: boolean | { name: string; version: string }
    }
  >
}

/**
 * Runs the project's package manager audit in JSON mode and normalizes the
 * advisories. This is the ground-truth CVE source; the AI layer only ranks and
 * explains these — it never invents vulnerabilities.
 */
export async function runAudit(
  root: string,
  project: ProjectInfo,
): Promise<DependencyVuln[]> {
  const pm = project.packageManager
  const args =
    pm === "yarn"
      ? ["audit", "--json"]
      : ["audit", "--json"] // npm & pnpm share this flag

  let stdout = ""
  try {
    const res = await execa(pm, args, { cwd: root, reject: false, timeout: 120_000 })
    stdout = res.stdout
  } catch {
    return []
  }

  let parsed: NpmAuditJson
  try {
    parsed = JSON.parse(stdout) as NpmAuditJson
  } catch {
    return []
  }

  const vulns: DependencyVuln[] = []
  for (const [name, v] of Object.entries(parsed.vulnerabilities ?? {})) {
    const titles = v.via.filter((x): x is Exclude<typeof x, string> => typeof x === "object")
    const cves = titles.flatMap((t) => t.cwe ?? [])
    const fixedIn =
      typeof v.fixAvailable === "object" ? v.fixAvailable.version : undefined

    vulns.push({
      name: v.name ?? name,
      currentVersion: v.range,
      dependencyType: v.isDirect ? "direct" : "transitive",
      severity: mapSeverity(v.severity),
      title: titles[0]?.title ?? `${name} advisory`,
      cves,
      fixedIn,
    })
  }

  return vulns
}
