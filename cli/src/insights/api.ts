import type { ScanContext } from "./scan.js"
import type {
  ApiResult,
  ApiEndpoint,
  ApiFinding,
  ApiGroup,
  ApiEndpointFlags,
  ApiRouteKind,
  HttpMethod,
  Severity,
} from "../types.js"

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
const MUTATION_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"])

/* --------------------------------- helpers -------------------------------- */

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length
}

/** Signals that the handler reads the authenticated session/user. */
const AUTH_RE = /\b(getSession|auth\s*\(|getServerSession|getUser|currentUser|requireUser|requireAuth|getToken|verifyToken|clerkClient|getAuth|supabase\.auth|session\?\.|ctx\.session|withAuth)\b/
/** Input validation libraries / patterns. */
const VALIDATION_RE = /\b(z\.(object|string|number|array|enum|coerce)|\.safeParse\b|\.parse\b|yup\.|valibot|v\.(object|string)|joi\.|superstruct|@hapi\/joi|zfd\.)\b/
/** Database / ORM access. */
const DB_RE = /\b(prisma\.|db\.|drizzle|sql`|\.query\(|mongoose|supabase\.from|createClient|knex|kysely|pool\.query|collection\(|findMany|findUnique|insertInto|getDb)\b/
/** Reading request inputs. */
const INPUT_RE = /\b(req\.body|request\.json|await\s+req\.json|\.formData\(|searchParams|req\.query|req\.params|params\.|getRequestBody|c\.req)\b/
/** Explicit error handling. */
const ERROR_RE = /\b(try\s*\{|\.catch\s*\(|catch\s*\()/

function buildFlags(body: string): ApiEndpointFlags {
  return {
    auth: AUTH_RE.test(body),
    validation: VALIDATION_RE.test(body),
    database: DB_RE.test(body),
    env: /process\.env\./.test(body),
    errorHandling: ERROR_RE.test(body),
    inputs: INPUT_RE.test(body),
  }
}

/**
 * Derive per-endpoint findings from its method + behaviour flags. Mutating,
 * unauthenticated, unvalidated handlers are the highest-signal smells.
 */
function endpointFindings(method: HttpMethod, flags: ApiEndpointFlags, body: string, idBase: string): ApiFinding[] {
  const out: ApiFinding[] = []
  const isMutation = MUTATION_METHODS.has(method) || method === "ALL"

  if (isMutation && !flags.auth) {
    out.push({
      id: `${idBase}-auth`,
      severity: "high",
      kind: "no-auth",
      title: "Mutation without auth check",
      detail: `This ${method} handler changes state but no session/user lookup was detected.`,
      recommendation: "Verify the caller's session before mutating data, or confirm the route is intentionally public.",
    })
  }
  if (isMutation && flags.inputs && !flags.validation) {
    out.push({
      id: `${idBase}-valid`,
      severity: "medium",
      kind: "no-validation",
      title: "Request body not validated",
      detail: "The handler reads request input but no schema validation (zod/yup/valibot) was found.",
      recommendation: "Validate and parse the request body with a schema before using it.",
    })
  }
  if ((flags.database || flags.inputs) && !flags.errorHandling) {
    out.push({
      id: `${idBase}-err`,
      severity: "low",
      kind: "no-error-handling",
      title: "No error handling",
      detail: "No try/catch or .catch() guards this handler's I/O, so failures may surface as unhandled 500s.",
      recommendation: "Wrap I/O in try/catch and return a structured error response.",
    })
  }
  if (method === "ALL") {
    out.push({
      id: `${idBase}-wild`,
      severity: "low",
      kind: "wildcard-method",
      title: "Handles all HTTP methods",
      detail: "A catch-all handler responds to every method, which widens the attack surface.",
      recommendation: "Constrain the handler to the methods it actually supports.",
    })
  }
  if (/(secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i.test(body)) {
    out.push({
      id: `${idBase}-secret`,
      severity: "critical",
      kind: "hardcoded-secret",
      title: "Possible hardcoded secret",
      detail: "A long literal assigned to a secret/key was found in this handler.",
      recommendation: "Move secrets to environment variables and rotate any committed value.",
    })
  }
  return out
}

/* ----------------------------- path utilities ----------------------------- */

/** Convert a Next.js app-router file path into a public route path. */
function nextAppPath(rel: string): string {
  // Strip leading (src/)?app/ and trailing /route.ts
  let p = rel.replace(/^.*?(^|\/)app\//, "/").replace(/\/route\.(t|j)sx?$/, "")
  // Remove route groups (group) and parallel/intercept segments.
  p = p.replace(/\/\([^/]+\)/g, "").replace(/\/@[^/]+/g, "")
  if (p === "" || p === "/app") p = "/"
  return normalizePath(p)
}

function nextPagesApiPath(rel: string): string {
  let p = rel.replace(/^.*?(^|\/)pages\//, "/").replace(/\.(t|j)sx?$/, "")
  p = p.replace(/\/index$/, "") || "/"
  return normalizePath(p)
}

function svelteKitPath(rel: string): string {
  let p = rel.replace(/^.*?(^|\/)routes\//, "/").replace(/\/\+server\.(t|j)s$/, "")
  if (p === "") p = "/"
  return normalizePath(p)
}

function nuxtApiPath(rel: string): string {
  let p = rel.replace(/^.*?(^|\/)server\//, "/").replace(/\.(t|j)s$/, "")
  // Nuxt encodes method as suffix: users.post.ts
  p = p.replace(/\.(get|post|put|patch|delete|head|options)$/i, "")
  return normalizePath(p)
}

function normalizePath(p: string): string {
  if (!p.startsWith("/")) p = "/" + p
  p = p.replace(/\/+/g, "/")
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
  return p || "/"
}

function isDynamic(path: string): boolean {
  return /\[.+?\]|:\w+|\.\.\./.test(path)
}

function topSegment(path: string): string {
  const seg = path.split("/").filter(Boolean)[0]
  return seg ? seg.replace(/[[\]:.]/g, "") || "root" : "root"
}

/* ------------------------------- collectors ------------------------------- */

let counter = 0
function nextId(): string {
  counter += 1
  return `api-${counter}`
}

function makeEndpoint(
  method: HttpMethod,
  path: string,
  kind: ApiRouteKind,
  filePath: string,
  line: number,
  body: string,
  handler?: string,
): ApiEndpoint {
  const flags = buildFlags(body)
  const id = nextId()
  return {
    id,
    method,
    path,
    kind,
    filePath,
    line,
    handler,
    flags,
    dynamic: isDynamic(path),
    findings: endpointFindings(method, flags, body, id),
  }
}

/** Slice the source around an index to use as the handler "body" for flags. */
function windowAround(src: string, index: number, after = 1600): string {
  return src.slice(index, Math.min(src.length, index + after))
}

export async function collectApi(ctx: ScanContext): Promise<ApiResult> {
  counter = 0
  const endpoints: ApiEndpoint[] = []
  const styles = new Set<string>()

  for (const file of ctx.codeFiles()) {
    const rel = file.rel
    const isAppRoute = /(^|\/)app\/.*\/route\.(t|j)sx?$/.test(rel)
    const isPagesApi = /(^|\/)pages\/api\/.*\.(t|j)sx?$/.test(rel)
    const isSvelte = /(^|\/)routes\/.*\/\+server\.(t|j)s$/.test(rel)
    const isNuxtApi = /(^|\/)server\/(api|routes)\/.*\.(t|j)s$/.test(rel)
    const looksServer = /(^|\/)(app|pages|server|src)\//.test(rel) || /\b(express|router|hono|fastify)\b/i.test(rel)

    // Cheap content prefilter for framework instance routes (express/hono).
    const content = await ctx.read(rel)
    if (!content) continue

    if (isAppRoute) {
      styles.add("Next.js App Router")
      const path = nextAppPath(rel)
      for (const method of METHODS) {
        const re = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`)
        const m = re.exec(content)
        if (m) endpoints.push(makeEndpoint(method, path, "next-app", rel, lineOf(content, m.index), windowAround(content, m.index), method))
      }
      continue
    }

    if (isPagesApi) {
      styles.add("Next.js Pages API")
      const path = nextPagesApiPath(rel)
      // Pages API uses a default handler that branches on req.method.
      const methodsUsed = METHODS.filter((mm) => new RegExp(`req\\.method\\s*===?\\s*["'\`]${mm}["'\`]`).test(content))
      if (methodsUsed.length > 0) {
        for (const method of methodsUsed) {
          const idx = content.search(new RegExp(`req\\.method\\s*===?\\s*["'\`]${method}["'\`]`))
          endpoints.push(makeEndpoint(method, path, "next-pages", rel, idx >= 0 ? lineOf(content, idx) : 1, content, "handler"))
        }
      } else {
        const idx = content.search(/export\s+default/)
        endpoints.push(makeEndpoint("ALL", path, "next-pages", rel, idx >= 0 ? lineOf(content, idx) : 1, content, "handler"))
      }
      continue
    }

    if (isSvelte) {
      styles.add("SvelteKit")
      const path = svelteKitPath(rel)
      for (const method of METHODS) {
        const re = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`)
        const m = re.exec(content)
        if (m) endpoints.push(makeEndpoint(method, path, "sveltekit", rel, lineOf(content, m.index), windowAround(content, m.index), method))
      }
      continue
    }

    if (isNuxtApi) {
      styles.add("Nuxt")
      const path = nuxtApiPath(rel)
      const suffix = rel.match(/\.(get|post|put|patch|delete|head|options)\.(t|j)s$/i)
      const method = (suffix ? suffix[1].toUpperCase() : "ALL") as HttpMethod
      const idx = content.search(/defineEventHandler|eventHandler/)
      endpoints.push(makeEndpoint(method, path, "nuxt", rel, idx >= 0 ? lineOf(content, idx) : 1, content))
      continue
    }

    // Express / Hono / Fastify instance method calls.
    if (looksServer || /\.(get|post|put|patch|delete)\s*\(\s*["'`]/.test(content)) {
      const callRe = /\b([a-zA-Z_$][\w$]*)\.(get|post|put|patch|delete|all|options|head)\s*\(\s*["'`]([^"'`]+)["'`]/g
      let m: RegExpExecArray | null
      let matched = false
      while ((m = callRe.exec(content)) !== null) {
        const objName = m[1]
        // Skip obvious non-router objects to cut false positives.
        if (/^(axios|fetch|http|https|ky|client|supabase|res|response|console)$/i.test(objName)) continue
        const verb = m[2].toUpperCase()
        const method = (verb === "ALL" ? "ALL" : verb) as HttpMethod
        const kind: ApiRouteKind = ctx.hasDep("hono") && !ctx.hasDep("express") ? "hono" : ctx.hasDep("fastify") && !ctx.hasDep("express") ? "fastify" : "express"
        styles.add(kind === "hono" ? "Hono" : kind === "fastify" ? "Fastify" : "Express")
        endpoints.push(makeEndpoint(method, normalizePath(m[3]), kind, rel, lineOf(content, m.index), windowAround(content, m.index), objName))
        matched = true
      }
      if (matched) continue
    }

    // Next.js server actions ("use server").
    if (/^["']use server["']/m.test(content) || /\n\s*["']use server["']/.test(content)) {
      styles.add("Server Actions")
      const actionRe = /export\s+(async\s+)?function\s+([a-zA-Z_$][\w$]*)/g
      let m: RegExpExecArray | null
      while ((m = actionRe.exec(content)) !== null) {
        endpoints.push(makeEndpoint("POST", `/${m[2]}`, "next-action", rel, lineOf(content, m.index), windowAround(content, m.index), m[2]))
      }
    }
  }

  // De-duplicate (method + path + file) in case of overlapping matches.
  const seen = new Set<string>()
  const deduped = endpoints.filter((e) => {
    const key = `${e.method} ${e.path} ${e.filePath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // --- Group by top segment ----------------------------------------------
  const groupMap = new Map<string, ApiEndpoint[]>()
  for (const e of deduped) {
    const seg = topSegment(e.path)
    const arr = groupMap.get(seg) ?? []
    arr.push(e)
    groupMap.set(seg, arr)
  }
  const groups: ApiGroup[] = [...groupMap.entries()]
    .map(([segment, eps]) => ({ segment, endpoints: eps.sort(sortEndpoints) }))
    .sort((a, b) => b.endpoints.length - a.endpoints.length || a.segment.localeCompare(b.segment))

  // --- Method distribution -------------------------------------------------
  const methodMap = new Map<HttpMethod, number>()
  for (const e of deduped) methodMap.set(e.method, (methodMap.get(e.method) ?? 0) + 1)
  const methodCounts = [...methodMap.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count)

  const findings = deduped.flatMap((e) => e.findings).sort((a, b) => sevRank(b.severity) - sevRank(a.severity))

  return {
    present: deduped.length > 0,
    style: dominantStyle(styles),
    endpoints: deduped.sort(sortEndpoints),
    groups,
    methodCounts,
    findings,
    counts: {
      endpoints: deduped.length,
      dynamic: deduped.filter((e) => e.dynamic).length,
      mutations: deduped.filter((e) => MUTATION_METHODS.has(e.method) || e.method === "ALL").length,
      protected: deduped.filter((e) => e.flags.auth).length,
      validated: deduped.filter((e) => e.flags.validation).length,
      findings: findings.length,
    },
  }
}

function sortEndpoints(a: ApiEndpoint, b: ApiEndpoint): number {
  const byFindings = maxSev(b.findings) - maxSev(a.findings)
  if (byFindings !== 0) return byFindings
  return a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
}

function dominantStyle(styles: Set<string>): string | undefined {
  if (styles.size === 0) return undefined
  return [...styles].join(" · ")
}

function maxSev(findings: ApiFinding[]): number {
  return findings.reduce((acc, f) => Math.max(acc, sevRank(f.severity)), 0)
}

function sevRank(s: Severity): number {
  const order: Record<string, number> = { critical: 6, high: 5, error: 5, medium: 4, warning: 3, low: 2, info: 1 }
  return order[s] ?? 0
}
