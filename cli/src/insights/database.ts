import { snippetAround, type ScanContext } from "./scan.js"
import type { DbResult, DbConnection, DbFinding, DbQuery, DbEngine, DbTable, Severity } from "../types.js"
import { parseConnectionString, parseStaticSchema, type ParsedConnection } from "./db-schema.js"
import { readConnectionStrings, liveIntrospect } from "./db-introspect.js"

interface ClientDef {
  dep: string
  engine: DbEngine
  client: string
  pooled?: boolean
}

/** ORM / driver dependencies, mapped to engine + a friendly client label. */
const CLIENTS: ClientDef[] = [
  { dep: "@neondatabase/serverless", engine: "postgres", client: "Neon serverless", pooled: true },
  { dep: "pg", engine: "postgres", client: "node-postgres (pg)" },
  { dep: "postgres", engine: "postgres", client: "postgres.js" },
  { dep: "@vercel/postgres", engine: "postgres", client: "Vercel Postgres", pooled: true },
  { dep: "drizzle-orm", engine: "postgres", client: "Drizzle ORM" },
  { dep: "@prisma/client", engine: "postgres", client: "Prisma", pooled: true },
  { dep: "prisma", engine: "postgres", client: "Prisma" },
  { dep: "kysely", engine: "postgres", client: "Kysely" },
  { dep: "mysql2", engine: "mysql", client: "mysql2" },
  { dep: "mysql", engine: "mysql", client: "mysql" },
  { dep: "@planetscale/database", engine: "mysql", client: "PlanetScale", pooled: true },
  { dep: "mongodb", engine: "mongodb", client: "MongoDB driver" },
  { dep: "mongoose", engine: "mongodb", client: "Mongoose" },
  { dep: "better-sqlite3", engine: "sqlite", client: "better-sqlite3" },
  { dep: "@libsql/client", engine: "sqlite", client: "libSQL / Turso", pooled: true },
  { dep: "ioredis", engine: "redis", client: "ioredis" },
  { dep: "redis", engine: "redis", client: "node-redis" },
  { dep: "@upstash/redis", engine: "redis", client: "Upstash Redis", pooled: true },
]

const DB_ENV_HINT = /(DATABASE_URL|DATABASE_URI|POSTGRES_URL|POSTGRES_PRISMA_URL|PG_|MYSQL_URL|MONGO_URL|MONGODB_URI|MONGODB_URL|REDIS_URL|KV_URL|TURSO_|LIBSQL_|DB_URL|_DATABASE_URL|CONNECTION_STRING)/i

const ENGINE_LABEL: Record<DbEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  sqlite: "SQLite",
  redis: "Redis",
  other: "Database",
}

interface DetectedString {
  envVar: string
  parsed: ParsedConnection
}

export async function collectDatabase(ctx: ScanContext): Promise<DbResult> {
  const findings: DbFinding[] = []
  const queries: DbQuery[] = []

  // --- 1. Detect datastores from connection strings (scheme is authoritative) ---
  const detectedStrings = await detectConnectionStrings(ctx)

  // --- 2. Detect ORM / driver dependencies -------------------------------
  const detectedClients = CLIENTS.filter((c) => ctx.hasDep(c.dep))

  // --- 3. Parse static schema (Prisma / Drizzle / Mongoose / SQL) --------
  const staticSchema = await parseStaticSchema(ctx)

  // --- 4. Best-effort live introspection ---------------------------------
  const liveConns = await readConnectionStrings(ctx)
  const live = await liveIntrospect(liveConns)

  // --- 5. Build the connection list --------------------------------------
  const connections = buildConnections(detectedStrings, detectedClients, staticSchema.sources)

  // --- 6. Resolve the schema (live preferred over static) ----------------
  const tables = resolveTables(live.tables, staticSchema.tables, connections)

  // Attach per-connection collection counts.
  for (const conn of connections) {
    conn.collections = tables.filter((t) => t.connectionId === conn.id).length
  }

  // --- 7. Scan code for query smells / findings --------------------------
  const enginesPresent = new Set<DbEngine>([
    ...detectedStrings.map((d) => d.parsed.engine),
    ...detectedClients.map((c) => c.engine),
  ])
  const sqlEngine: DbEngine = enginesPresent.has("mysql") && !enginesPresent.has("postgres") ? "mysql" : "postgres"
  const hasMongo = enginesPresent.has("mongodb")
  let queryId = 0

  for (const file of ctx.codeFiles()) {
    const content = await ctx.read(file.rel)
    if (!content) continue
    if (!/(query|sql|prisma|db\.|collection|find\(|aggregate|execute|\$queryRaw)/i.test(content)) continue
    const lines = content.split("\n")

    lines.forEach((line, idx) => {
      const lineNo = idx + 1

      if (
        /(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}/i.test(line) &&
        /`[^`]*\$\{|["'][^"']*"\s*\+|\+\s*(req|request|params|query|body)/.test(line)
      ) {
        findings.push(
          finding(`db-inj-${++queryId}`, sqlEngine, "injection", "critical", "Possible SQL injection", "Query appears to interpolate user input directly into SQL. Use parameterized queries.", file.rel, lineNo, "Use parameterized queries / prepared statements instead of string concatenation.", snippetAround(content, lineNo)),
        )
      }

      if (/queryRawUnsafe|executeRawUnsafe|\.raw\(/.test(line)) {
        findings.push(
          finding(`db-raw-${++queryId}`, sqlEngine, "unparameterized", "high", "Unsafe raw query", "Raw/unsafe query execution bypasses parameterization.", file.rel, lineNo, "Prefer the safe tagged-template or parameterized variant.", snippetAround(content, lineNo)),
        )
      }

      if (/SELECT\s+\*/i.test(line) && !/\blimit\b/i.test(line)) {
        findings.push(
          finding(`db-unb-${++queryId}`, sqlEngine, "unbounded-query", "medium", "Unbounded SELECT *", "Selecting all columns/rows without a LIMIT can load excessive data.", file.rel, lineNo, "Select only needed columns and add a LIMIT / pagination.", snippetAround(content, lineNo)),
        )
        queries.push({ id: `q-${queryId}`, engine: sqlEngine, operation: "SELECT", target: "(table)", filePath: file.rel, line: lineNo, estMs: 120, fullScan: true, note: "SELECT * without LIMIT" })
      }

      // Unbounded Mongo find() with no limit.
      if (hasMongo && /\.find\(\s*\{?[^)]*\}?\s*\)\s*$/.test(line) && !/limit\(/.test(lines.slice(idx, idx + 2).join(" "))) {
        if (/\.find\(/.test(line) && !/findOne|findById|findUnique/.test(line)) {
          findings.push(
            finding(`db-mfind-${++queryId}`, "mongodb", "unbounded-query", "medium", "Unbounded find() query", "A Mongo find() with no .limit() can return an unbounded result set.", file.rel, lineNo, "Add .limit() and cursor-based pagination; project only needed fields.", snippetAround(content, lineNo)),
          )
        }
      }

      if (
        /\.(find|findOne|findUnique|aggregate)\s*\(/.test(line) &&
        /(\.map\(|for\s*\(|forEach)/.test(lines.slice(Math.max(0, idx - 3), idx).join("\n"))
      ) {
        findings.push(
          finding(`db-nplus-${++queryId}`, hasMongo ? "mongodb" : sqlEngine, "n+1", "high", "Potential N+1 query", "A query inside a loop can trigger many round-trips.", file.rel, lineNo, "Batch with a single query, JOIN, or use an IN clause / dataloader.", snippetAround(content, lineNo)),
        )
      }
    })
  }

  // --- 8. Config-level findings ------------------------------------------
  if (enginesPresent.has("postgres") && !detectedClients.some((d) => d.pooled) && !detectedStrings.some((d) => d.parsed.pooled)) {
    findings.push(finding("db-pool", "postgres", "no-pooling", "medium", "No connection pooling detected", "Direct Postgres connections without pooling can exhaust connections under load on serverless.", "package.json", undefined, "Use a pooled driver (Neon serverless, @vercel/postgres) or a pooler like PgBouncer."))
  }
  for (const conn of connections) {
    if (!conn.ssl && (conn.engine === "postgres" || conn.engine === "mysql" || conn.engine === "mongodb")) {
      findings.push(finding(`db-ssl-${conn.id}`, conn.engine, "no-ssl", "high", `${ENGINE_LABEL[conn.engine]} connection without TLS`, `The connection on ${conn.envVar || conn.name} does not enforce SSL/TLS. Traffic to ${conn.host} may be sent in clear text.`, conn.filePath, undefined, "Append sslmode=require (Postgres/MySQL) or use a TLS connection string."))
    }
  }
  if (enginesPresent.has("mongodb") && !staticSchema.sources.some((s) => s.engine === "mongodb") && !live.connected.length) {
    findings.push(finding("db-mongo-novalidation", "mongodb", "no-validation", "low", "No Mongoose schema or JSON Schema validator found", "MongoDB is in use but no Mongoose models or collection validators were detected, so document shapes are unconstrained.", "package.json", undefined, "Define Mongoose schemas (or $jsonSchema validators) to enforce document structure."))
  }

  const collections = connections.reduce((s, c) => s + c.collections, 0)
  const slowQueries = queries.filter((q) => q.fullScan || q.estMs > 100).length

  return {
    connections,
    findings: findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)),
    queries,
    tables: tables.length ? tables : undefined,
    counts: { connections: connections.length, collections, findings: findings.length, slowQueries },
  }
}

/* ------------------------------------------------------------------ */
/* Detection helpers                                                   */
/* ------------------------------------------------------------------ */

/** Read connection strings (keys + values) from every env file for detection. */
async function detectConnectionStrings(ctx: ScanContext): Promise<DetectedString[]> {
  const files = [".env.local", ".env", ".env.development.local", ".env.development", ".env.example", ".env.sample"]
  const byScheme = new Map<string, DetectedString>()

  for (const file of files) {
    const text = await ctx.read(file)
    if (!text) continue
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!key || !val) continue
      const parsed = parseConnectionString(val)
      if (!parsed) continue
      // Dedupe by engine+host so .env + .env.example don't double-count.
      const dedupeKey = `${parsed.engine}:${parsed.host}:${parsed.name}`
      if (!byScheme.has(dedupeKey)) byScheme.set(dedupeKey, { envVar: key, parsed })
    }
  }

  // Also surface env var names that look like DB urls but weren't parseable.
  return [...byScheme.values()]
}

/** Combine connection-string + dependency detection into DbConnection rows. */
function buildConnections(
  strings: DetectedString[],
  clients: ClientDef[],
  schemaSources: { engine: DbEngine; source: string; file: string }[],
): DbConnection[] {
  const connections: DbConnection[] = []
  const usedClients = new Set<ClientDef>()
  let idN = 0

  const clientFor = (engine: DbEngine): ClientDef | undefined => {
    const c = clients.find((cl) => cl.engine === engine && !usedClients.has(cl))
    if (c) usedClients.add(c)
    return c
  }
  const schemaFor = (engine: DbEngine): string | undefined =>
    schemaSources.find((s) => s.engine === engine)?.source

  // Connections discovered via real connection strings (most accurate).
  for (const s of strings) {
    const client = clientFor(s.parsed.engine)
    connections.push({
      id: `db-${++idN}`,
      engine: s.parsed.engine,
      name: s.parsed.name,
      client: client?.client ?? ENGINE_LABEL[s.parsed.engine],
      host: s.parsed.host,
      ssl: s.parsed.ssl,
      pooled: s.parsed.pooled || client?.pooled === true,
      envVar: s.envVar,
      collections: 0,
      filePath: ".env",
      detectedVia: "connection-string",
      scheme: s.parsed.scheme,
      schemaSource: schemaFor(s.parsed.engine),
    })
  }

  // Remaining drivers with no matching connection string → dependency-detected.
  for (const c of clients) {
    if (usedClients.has(c)) continue
    // Skip if we already have a connection of this engine from a string.
    if (connections.some((conn) => conn.engine === c.engine && conn.detectedVia === "connection-string")) continue
    usedClients.add(c)
    connections.push({
      id: `db-${++idN}`,
      engine: c.engine,
      name: ENGINE_LABEL[c.engine],
      client: c.client,
      host: "unknown",
      ssl: c.pooled === true || c.engine === "postgres" || c.engine === "mysql",
      pooled: c.pooled ?? false,
      envVar: "",
      collections: 0,
      filePath: "package.json",
      detectedVia: schemaFor(c.engine) ? "schema-file" : "dependency",
      schemaSource: schemaFor(c.engine),
    })
  }

  return connections
}

/** Merge live + static tables, remapping placeholder connection ids. */
function resolveTables(liveTables: DbTable[], staticTables: DbTable[], connections: DbConnection[]): DbTable[] {
  const firstSql = connections.find((c) => c.engine === "postgres" || c.engine === "mysql" || c.engine === "sqlite")
  const firstMongo = connections.find((c) => c.engine === "mongodb")

  const remap = (t: DbTable): DbTable => {
    let connectionId = t.connectionId
    if (connectionId === "live-sql") connectionId = firstSql?.id ?? connections[0]?.id ?? "db-1"
    else if (connectionId === "live-mongodb") connectionId = firstMongo?.id ?? connections[0]?.id ?? "db-1"
    else {
      // Live tables use the env var as connectionId — map to the matching conn.
      const match = connections.find((c) => c.envVar === connectionId)
      if (match) connectionId = match.id
    }
    return { ...t, connectionId }
  }

  // Prefer live tables; only add static tables whose name isn't already live.
  const result: DbTable[] = liveTables.map(remap)
  const liveNames = new Set(result.map((t) => `${t.connectionId}:${t.name}`))
  for (const t of staticTables) {
    const mapped = remap(t)
    const key = `${mapped.connectionId}:${mapped.name}`
    if (!liveNames.has(key) && !result.some((r) => r.name === mapped.name && r.connectionId === mapped.connectionId)) {
      result.push(mapped)
    }
  }
  return result
}

function finding(
  id: string,
  engine: DbEngine,
  kind: DbFinding["kind"],
  severity: Severity,
  title: string,
  detail: string,
  filePath: string,
  line: number | undefined,
  recommendation: string,
  snippet?: { startLine: number; code: string },
): DbFinding {
  return { id, engine, kind, severity, title, detail, filePath, line, recommendation, snippet }
}

function sevRank(s: Severity): number {
  const order: Record<string, number> = { critical: 6, high: 5, error: 5, medium: 4, warning: 3, low: 2, info: 1 }
  return order[s] ?? 0
}
