/**
 * Static datastore detection + schema introspection.
 *
 * This module reads connection strings out of env files and parses ORM /
 * schema definitions (Prisma, Drizzle, Mongoose, raw SQL migrations) straight
 * from the source tree. It needs no live database connection, so it works on
 * any checkout — and it is what makes the dashboard's Schema tab and accurate
 * engine detection (including MongoDB) possible.
 */
import type { ScanContext } from "./scan.js"
import type { DbColumn, DbColumnFlag, DbEngine, DbIndexInfo, DbTable } from "../types.js"

/* ------------------------------------------------------------------ */
/* Connection-string parsing                                           */
/* ------------------------------------------------------------------ */

export interface ParsedConnection {
  engine: DbEngine
  scheme: string
  host: string
  /** Database / logical name parsed from the URL path. */
  name: string
  ssl: boolean
  pooled: boolean
}

const SCHEME_ENGINE: { re: RegExp; engine: DbEngine; scheme: string }[] = [
  { re: /^mongodb(\+srv)?:\/\//i, engine: "mongodb", scheme: "mongodb" },
  { re: /^postgres(ql)?:\/\//i, engine: "postgres", scheme: "postgres" },
  { re: /^mysql:\/\//i, engine: "mysql", scheme: "mysql" },
  { re: /^rediss?:\/\//i, engine: "redis", scheme: "redis" },
  { re: /^libsql:\/\//i, engine: "sqlite", scheme: "libsql" },
  { re: /^(file:|sqlite:)/i, engine: "sqlite", scheme: "sqlite" },
]

/**
 * Parse a raw connection string into engine + metadata. Uses tolerant regex
 * rather than the URL constructor because schemes like `mongodb+srv://` and
 * `file:./dev.db` are not always WHATWG-parseable.
 */
export function parseConnectionString(raw: string): ParsedConnection | null {
  const value = raw.trim().replace(/^["']|["']$/g, "")
  if (!value) return null

  const match = SCHEME_ENGINE.find((s) => s.re.test(value))
  if (!match) return null

  const { engine, scheme } = match

  // SQLite / file URLs: the "host" is really a file path.
  if (engine === "sqlite") {
    const filePart = value.replace(/^(file:|sqlite:|libsql:\/\/)/i, "")
    const name = filePart.split(/[?#]/)[0] || "sqlite"
    return {
      engine,
      scheme,
      host: scheme === "libsql" ? filePart.split(/[?#]/)[0] : "local file",
      name: name.split("/").pop() || "sqlite",
      ssl: /libsql/.test(scheme) || /authToken=/.test(value),
      pooled: scheme === "libsql",
    }
  }

  // Strip scheme, then credentials, to isolate host + path.
  const afterScheme = value.replace(/^[a-z+]+:\/\//i, "")
  const afterAuth = afterScheme.includes("@") ? afterScheme.slice(afterScheme.indexOf("@") + 1) : afterScheme
  const [hostPort, ...rest] = afterAuth.split(/[/?]/)
  const host = (hostPort || "").split(",")[0] || "unknown"

  // Database name = first path segment.
  const pathAndQuery = afterAuth.slice(hostPort.length)
  const pathSeg = pathAndQuery.replace(/^\//, "").split(/[?#]/)[0]
  const name = pathSeg || defaultDbName(engine)

  const isSrv = /\+srv/i.test(value.slice(0, value.indexOf("://")))
  const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : ""
  const ssl =
    scheme === "redis"
      ? /^rediss/i.test(value)
      : isSrv ||
        /sslmode=(require|verify-full|verify-ca)/i.test(query) ||
        /[?&](ssl|tls)=true/i.test(query) ||
        /\.neon\.tech|\.supabase\.|\.mongodb\.net|\.planetscale\.|\.turso\./i.test(host)
  const pooled =
    /pgbouncer=true/i.test(query) ||
    /[-.]pooler\./i.test(host) ||
    /-pooler/i.test(host) ||
    /pool_timeout=/i.test(query)

  return { engine, scheme: isSrv ? `${scheme}+srv` : scheme, host, name, ssl, pooled }
}

function defaultDbName(engine: DbEngine): string {
  switch (engine) {
    case "mongodb":
      return "admin"
    case "redis":
      return "db0"
    default:
      return engine
  }
}

/* ------------------------------------------------------------------ */
/* Schema parsing                                                      */
/* ------------------------------------------------------------------ */

export interface ParsedSchema {
  tables: DbTable[]
  /** Human-readable description of where the schema came from, per engine. */
  sources: { engine: DbEngine; source: string; file: string }[]
}

const PRISMA_TYPE_ENGINE: Record<string, DbEngine> = {
  postgresql: "postgres",
  postgres: "postgres",
  mysql: "mysql",
  sqlite: "sqlite",
  mongodb: "mongodb",
  sqlserver: "other",
  cockroachdb: "postgres",
}

/** Walk the project and collect tables/collections from every schema flavor. */
export async function parseStaticSchema(ctx: ScanContext): Promise<ParsedSchema> {
  const tables: DbTable[] = []
  const sources: ParsedSchema["sources"] = []
  const seen = new Set<string>()

  const add = (table: DbTable) => {
    const key = `${table.connectionId}:${table.name}`
    if (seen.has(key)) return
    seen.add(key)
    tables.push(table)
  }

  for (const file of ctx.files) {
    const rel = file.rel
    const base = rel.split("/").pop() ?? rel

    if (base === "schema.prisma") {
      const content = await ctx.read(rel)
      if (content) {
        const { tables: t, engine } = parsePrisma(content, rel)
        t.forEach(add)
        if (t.length) sources.push({ engine, source: "Prisma schema", file: rel })
      }
      continue
    }

    if (!file.isCode && file.ext !== ".sql") continue

    const content = await ctx.read(rel)
    if (!content) continue

    // Drizzle: pgTable / mysqlTable / sqliteTable.
    if (/\b(pgTable|mysqlTable|sqliteTable)\s*\(/.test(content)) {
      const { tables: t, engine } = parseDrizzle(content, rel)
      if (t.length) {
        t.forEach(add)
        sources.push({ engine, source: "Drizzle ORM schema", file: rel })
      }
    }

    // Mongoose: new Schema({...}) / model("Name", schema).
    if (/new\s+(mongoose\.)?Schema\s*\(/.test(content) || /\bmodel\s*\(\s*["'`]/.test(content)) {
      const t = parseMongoose(content, rel)
      if (t.length) {
        t.forEach(add)
        sources.push({ engine: "mongodb", source: "Mongoose models", file: rel })
      }
    }

    // Raw SQL migrations.
    if (file.ext === ".sql" && /create\s+table/i.test(content)) {
      const t = parseSqlMigration(content, rel)
      if (t.length) {
        t.forEach(add)
        sources.push({ engine: "postgres", source: "SQL migration", file: rel })
      }
    }
  }

  return { tables, sources }
}

/* ---------------------------- Prisma ------------------------------ */

function parsePrisma(content: string, file: string): { tables: DbTable[]; engine: DbEngine } {
  let engine: DbEngine = "postgres"
  const providerMatch = content.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*["'](\w+)["']/)
  if (providerMatch) engine = PRISMA_TYPE_ENGINE[providerMatch[1].toLowerCase()] ?? "postgres"

  const modelNames = new Set<string>()
  for (const m of content.matchAll(/model\s+(\w+)\s*\{/g)) modelNames.add(m[1])

  const tables: DbTable[] = []
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
  for (const m of content.matchAll(modelRe)) {
    const name = m[1]
    const body = m[2]
    const columns: DbColumn[] = []
    const indexes: DbIndexInfo[] = []

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("//")) continue

      // Block attributes: @@index, @@unique, @@id.
      if (line.startsWith("@@")) {
        const idx = line.match(/@@(index|unique|id)\s*\(\s*\[([^\]]+)\]/)
        if (idx) {
          const cols = idx[2].split(",").map((c) => c.trim())
          indexes.push({ name: `${name}_${cols.join("_")}_idx`, columns: cols, unique: idx[1] !== "index" })
        }
        continue
      }

      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/)
      if (!fieldMatch) continue
      const [, fname, ftypeRaw, isArray, optional, attrs] = fieldMatch

      // A field whose type is another model is a relation, not a column.
      const isRelation = modelNames.has(ftypeRaw)
      if (isRelation && (isArray || /@relation/.test(attrs))) {
        if (isArray) continue // virtual back-relation, no column
      }

      const flags: DbColumnFlag[] = []
      if (/@id\b/.test(attrs)) flags.push("pk")
      if (/@unique\b/.test(attrs)) flags.push("unique")
      if (/@relation/.test(attrs) || isRelation) flags.push("fk")
      if (optional) flags.push("nullable")
      if (/@default\(/.test(attrs)) flags.push("default")

      const refMatch = attrs.match(/@relation\([^)]*references:\s*\[(\w+)\]/)
      columns.push({
        name: fname,
        type: ftypeRaw + (isArray ? "[]" : ""),
        flags,
        references: refMatch ? `${ftypeRaw}.${refMatch[1]}` : undefined,
      })
    }

    tables.push({
      name,
      connectionId: engine === "mongodb" ? "live-mongodb" : "live-sql",
      kind: engine === "mongodb" ? "collection" : "table",
      columns,
      indexes,
      rowCount: 0,
      filePath: file,
    })
  }

  return { tables, engine }
}

/* ---------------------------- Drizzle ----------------------------- */

function parseDrizzle(content: string, file: string): { tables: DbTable[]; engine: DbEngine } {
  let engine: DbEngine = "postgres"
  if (/mysqlTable\s*\(/.test(content)) engine = "mysql"
  else if (/sqliteTable\s*\(/.test(content)) engine = "sqlite"

  const tables: DbTable[] = []
  // export const users = pgTable("users", { ... })  — match the table call and its object literal.
  const tableRe = /(?:pg|mysql|sqlite)Table\s*\(\s*["'`](\w+)["'`]\s*,\s*\{/g
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(content))) {
    const tableName = m[1]
    const objStart = tableRe.lastIndex - 1
    const objBody = extractBalanced(content, objStart)
    if (!objBody) continue

    const columns: DbColumn[] = []
    // Each property: key: builder("col", ...).chain()
    const colRe = /(\w+)\s*:\s*(\w+)\s*\(([^)]*)\)([^,\n]*)/g
    let c: RegExpExecArray | null
    while ((c = colRe.exec(objBody))) {
      const [, key, builder, , chain] = c
      const flags: DbColumnFlag[] = []
      if (/\.primaryKey\(/.test(chain)) flags.push("pk")
      if (/\.unique\(/.test(chain)) flags.push("unique")
      if (/\.references\(/.test(chain)) flags.push("fk")
      if (!/\.notNull\(/.test(chain) && !/\.primaryKey\(/.test(chain)) flags.push("nullable")
      if (/\.default|\.\$default/.test(chain)) flags.push("default")
      const refMatch = chain.match(/\.references\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/)
      columns.push({
        name: key,
        type: builder,
        flags,
        references: refMatch ? `${refMatch[1]}.${refMatch[2]}` : undefined,
      })
    }

    if (columns.length) {
      tables.push({
        name: tableName,
        connectionId: "live-sql",
        kind: "table",
        columns,
        indexes: [],
        rowCount: 0,
        filePath: file,
      })
    }
  }

  return { tables, engine }
}

/* --------------------------- Mongoose ----------------------------- */

function parseMongoose(content: string, file: string): DbTable[] {
  const tables: DbTable[] = []

  // Map of variable name -> model name from mongoose.model("Name", schemaVar).
  const modelNames: string[] = []
  for (const m of content.matchAll(/model\s*(?:<[^>]*>)?\s*\(\s*["'`](\w+)["'`]/g)) {
    modelNames.push(m[1])
  }

  const schemaRe = /new\s+(?:mongoose\.)?Schema\s*(?:<[^>]*>)?\s*\(\s*\{/g
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = schemaRe.exec(content))) {
    const objStart = schemaRe.lastIndex - 1
    const objBody = extractBalanced(content, objStart)
    if (!objBody) continue

    const columns: DbColumn[] = parseMongooseFields(objBody)
    if (!columns.length) continue

    // Always provide an _id.
    if (!columns.some((c) => c.name === "_id")) {
      columns.unshift({ name: "_id", type: "ObjectId", flags: ["pk"] })
    }

    const name = modelNames[idx] ?? `collection${idx + 1}`
    idx++
    tables.push({
      name,
      connectionId: "live-mongodb",
      kind: "collection",
      columns,
      indexes: [],
      rowCount: 0,
      filePath: file,
    })
  }

  return tables
}

function parseMongooseFields(body: string): DbColumn[] {
  const columns: DbColumn[] = []
  // Only scan the top level of the object to avoid nested noise.
  let depth = 0
  let buf = ""
  const entries: string[] = []
  for (const ch of body) {
    if (ch === "{" || ch === "[" || ch === "(") depth++
    else if (ch === "}" || ch === "]" || ch === ")") depth--
    if (ch === "," && depth === 0) {
      entries.push(buf)
      buf = ""
    } else {
      buf += ch
    }
  }
  if (buf.trim()) entries.push(buf)

  for (const entry of entries) {
    const keyMatch = entry.match(/^\s*["'`]?(\w+)["'`]?\s*:/)
    if (!keyMatch) continue
    const name = keyMatch[1]
    const valuePart = entry.slice(entry.indexOf(":") + 1).trim()

    const flags: DbColumnFlag[] = []
    let type = "Mixed"
    let references: string | undefined

    // Inline type: `name: String` or array `tags: [String]`.
    const simple = valuePart.match(/^\[?\s*(String|Number|Boolean|Date|Buffer|ObjectId|Mixed|Map|Array)\b/)
    if (simple) {
      type = simple[1] + (valuePart.startsWith("[") ? "[]" : "")
    } else if (valuePart.startsWith("{")) {
      const tMatch = valuePart.match(/type\s*:\s*\[?\s*(?:mongoose\.)?(?:Schema\.Types\.)?(\w+)/)
      if (tMatch) type = tMatch[1]
      if (/unique\s*:\s*true/.test(valuePart)) flags.push("unique")
      if (/index\s*:\s*true/.test(valuePart)) flags.push("index")
      if (/required\s*:\s*true/.test(valuePart) === false) flags.push("nullable")
      const refMatch = valuePart.match(/ref\s*:\s*["'`](\w+)["'`]/)
      if (refMatch) {
        flags.push("fk")
        references = `${refMatch[1]}._id`
      }
    } else if (/ObjectId/.test(valuePart)) {
      type = "ObjectId"
    }

    columns.push({ name, type, flags, references })
  }

  return columns
}

/* ---------------------------- Raw SQL ----------------------------- */

function parseSqlMigration(content: string, file: string): DbTable[] {
  const tables: DbTable[] = []
  const tableRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(content))) {
    const name = m[1]
    const body = extractBalanced(content, tableRe.lastIndex - 1)
    if (!body) continue

    const columns: DbColumn[] = []
    for (const rawDef of splitTopLevel(body)) {
      const def = rawDef.trim()
      if (!def) continue
      // Skip table-level constraints.
      if (/^(primary\s+key|foreign\s+key|constraint|unique|index|key|check)\b/i.test(def)) continue
      const colMatch = def.match(/^["'`]?(\w+)["'`]?\s+([a-z0-9_]+(?:\s*\([^)]*\))?)/i)
      if (!colMatch) continue
      const flags: DbColumnFlag[] = []
      if (/primary\s+key/i.test(def)) flags.push("pk")
      if (/\bunique\b/i.test(def)) flags.push("unique")
      if (/\breferences\b/i.test(def)) flags.push("fk")
      if (!/not\s+null/i.test(def) && !/primary\s+key/i.test(def)) flags.push("nullable")
      if (/\bdefault\b/i.test(def)) flags.push("default")
      const refMatch = def.match(/references\s+["'`]?(\w+)["'`]?\s*\(\s*["'`]?(\w+)["'`]?/i)
      columns.push({
        name: colMatch[1],
        type: colMatch[2].replace(/\s+/g, ""),
        flags,
        references: refMatch ? `${refMatch[1]}.${refMatch[2]}` : undefined,
      })
    }

    if (columns.length) {
      tables.push({ name, connectionId: "live-sql", kind: "table", columns, indexes: [], rowCount: 0, filePath: file })
    }
  }
  return tables
}

/* ---------------------------- Helpers ----------------------------- */

/**
 * Given an index pointing at an opening bracket ({ [ or ( ), return the inner
 * text up to the matching close bracket. Returns null if unbalanced.
 */
function extractBalanced(content: string, openIdx: number): string | null {
  const open = content[openIdx]
  const close = open === "{" ? "}" : open === "[" ? "]" : ")"
  let depth = 0
  let inStr: string | null = null
  for (let i = openIdx; i < content.length; i++) {
    const ch = content[i]
    if (inStr) {
      if (ch === inStr && content[i - 1] !== "\\") inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") inStr = ch
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return content.slice(openIdx + 1, i)
    }
  }
  return null
}

/** Split a SQL column list on top-level commas (ignoring those in parens). */
function splitTopLevel(body: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ""
  for (const ch of body) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(buf)
      buf = ""
    } else {
      buf += ch
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}
