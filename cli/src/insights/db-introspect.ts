/**
 * Best-effort live database introspection.
 *
 * When a usable connection string is present on the developer's machine (in a
 * local env file or process.env) AND the matching driver is installed, we
 * connect and read the *real* schema: tables/collections, columns, indexes and
 * approximate row counts. Everything is wrapped in a hard timeout and
 * try/catch + dynamic import, so a missing driver, wrong credentials, or an
 * unreachable database silently degrades to the static schema parser instead
 * of failing the scan.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import type { ScanContext } from "./scan.js"
import type { DbColumn, DbColumnFlag, DbIndexInfo, DbTable } from "../types.js"
import { parseConnectionString, type ParsedConnection } from "./db-schema.js"

const ENV_FILES = [".env.local", ".env.development.local", ".env", ".env.development"]
const CONNECT_TIMEOUT_MS = 2500

export interface LiveConnection {
  envVar: string
  value: string
  parsed: ParsedConnection
}

export interface LiveResult {
  tables: DbTable[]
  /** Per-env-var collection/table counts discovered live. */
  counts: Record<string, number>
  /** Env vars we successfully introspected. */
  connected: string[]
}

/** Resolve connection-string env values from local env files + process.env. */
export async function readConnectionStrings(ctx: ScanContext): Promise<LiveConnection[]> {
  const values = new Map<string, string>()

  for (const file of ENV_FILES) {
    let text: string
    try {
      text = await fs.readFile(path.join(ctx.root, file), "utf8")
    } catch {
      continue
    }
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim()
      const val = trimmed.slice(eq + 1).trim()
      if (key && val && !values.has(key)) values.set(key, val)
    }
  }

  // process.env wins only when not already defined by a file.
  for (const [key, val] of Object.entries(process.env)) {
    if (val && !values.has(key) && /:\/\//.test(val)) values.set(key, val)
  }

  const out: LiveConnection[] = []
  const seenValues = new Set<string>()
  for (const [envVar, raw] of values) {
    const parsed = parseConnectionString(raw)
    if (!parsed) continue
    const cleaned = raw.replace(/^["']|["']$/g, "")
    if (seenValues.has(cleaned)) continue
    seenValues.add(cleaned)
    out.push({ envVar, value: cleaned, parsed })
  }
  return out
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("introspection timeout")), ms)),
  ])
}

/** Attempt live introspection across all resolved connections. */
export async function liveIntrospect(connections: LiveConnection[]): Promise<LiveResult> {
  const tables: DbTable[] = []
  const counts: Record<string, number> = {}
  const connected: string[] = []

  for (const conn of connections) {
    try {
      const result = await withTimeout(introspectOne(conn), CONNECT_TIMEOUT_MS + 1000)
      if (result && result.length) {
        tables.push(...result)
        counts[conn.envVar] = result.length
        connected.push(conn.envVar)
      }
    } catch {
      /* unreachable / no driver / bad creds — fall back to static schema */
    }
  }

  return { tables, counts, connected }
}

async function introspectOne(conn: LiveConnection): Promise<DbTable[] | null> {
  switch (conn.parsed.engine) {
    case "postgres":
      return introspectPostgres(conn)
    case "mysql":
      return introspectMysql(conn)
    case "mongodb":
      return introspectMongo(conn)
    default:
      return null
  }
}

/* ---------------------------- Postgres ---------------------------- */

async function introspectPostgres(conn: LiveConnection): Promise<DbTable[] | null> {
  let pg: any
  try {
    pg = await import("pg" as string)
  } catch {
    return null
  }
  const Client = pg.default?.Client ?? pg.Client
  const client = new Client({
    connectionString: conn.value,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    ssl: conn.parsed.ssl ? { rejectUnauthorized: false } : undefined,
  })

  await withTimeout(client.connect(), CONNECT_TIMEOUT_MS)
  try {
    const cols = await client.query(
      `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position`,
    )
    const keys = await client.query(
      `SELECT tc.constraint_type, kcu.table_name, kcu.column_name,
              ccu.table_name AS ref_table, ccu.column_name AS ref_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.table_schema = 'public'`,
    )
    const estimates = await client.query(
      `SELECT relname AS table_name, reltuples::bigint AS row_estimate
       FROM pg_class WHERE relkind = 'r'`,
    )
    const idxRows = await client.query(
      `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    )

    const pkSet = new Set<string>()
    const uniqueSet = new Set<string>()
    const fkMap = new Map<string, string>()
    for (const r of keys.rows) {
      const k = `${r.table_name}.${r.column_name}`
      if (r.constraint_type === "PRIMARY KEY") pkSet.add(k)
      else if (r.constraint_type === "UNIQUE") uniqueSet.add(k)
      else if (r.constraint_type === "FOREIGN KEY") fkMap.set(k, `${r.ref_table}.${r.ref_column}`)
    }
    const rowMap = new Map<string, number>()
    for (const r of estimates.rows) rowMap.set(r.table_name, Number(r.row_estimate) || 0)

    const idxMap = new Map<string, DbIndexInfo[]>()
    for (const r of idxRows.rows) {
      const colsMatch = r.indexdef.match(/\(([^)]+)\)/)
      const list = colsMatch ? colsMatch[1].split(",").map((c: string) => c.trim().replace(/"/g, "")) : []
      const arr = idxMap.get(r.tablename) ?? []
      arr.push({ name: r.indexname, columns: list, unique: /UNIQUE/i.test(r.indexdef) })
      idxMap.set(r.tablename, arr)
    }

    const tableMap = new Map<string, DbColumn[]>()
    for (const r of cols.rows) {
      const arr = tableMap.get(r.table_name) ?? []
      const key = `${r.table_name}.${r.column_name}`
      const flags: DbColumnFlag[] = []
      if (pkSet.has(key)) flags.push("pk")
      if (uniqueSet.has(key)) flags.push("unique")
      if (fkMap.has(key)) flags.push("fk")
      if (r.is_nullable === "YES") flags.push("nullable")
      if (r.column_default != null) flags.push("default")
      arr.push({ name: r.column_name, type: r.data_type, flags, references: fkMap.get(key) })
      tableMap.set(r.table_name, arr)
    }

    const tables: DbTable[] = []
    for (const [name, columns] of tableMap) {
      tables.push({
        name,
        connectionId: conn.envVar,
        kind: "table",
        columns,
        indexes: idxMap.get(name) ?? [],
        rowCount: rowMap.get(name) ?? 0,
        filePath: undefined,
      })
    }
    return tables
  } finally {
    await client.end().catch(() => {})
  }
}

/* ----------------------------- MySQL ------------------------------ */

async function introspectMysql(conn: LiveConnection): Promise<DbTable[] | null> {
  let mysql: any
  try {
    mysql = await import("mysql2/promise" as string)
  } catch {
    return null
  }
  const connection: any = await withTimeout(
    mysql.createConnection({ uri: conn.value, connectTimeout: CONNECT_TIMEOUT_MS }),
    CONNECT_TIMEOUT_MS,
  )
  try {
    const db = conn.parsed.name
    const [cols] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    )
    const [counts] = await connection.query(
      `SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [db],
    )
    const rowMap = new Map<string, number>()
    for (const r of counts as any[]) rowMap.set(r.TABLE_NAME, Number(r.TABLE_ROWS) || 0)

    const tableMap = new Map<string, DbColumn[]>()
    for (const r of cols as any[]) {
      const arr = tableMap.get(r.TABLE_NAME) ?? []
      const flags: DbColumnFlag[] = []
      if (r.COLUMN_KEY === "PRI") flags.push("pk")
      if (r.COLUMN_KEY === "UNI") flags.push("unique")
      if (r.COLUMN_KEY === "MUL") flags.push("index")
      if (r.IS_NULLABLE === "YES") flags.push("nullable")
      if (r.COLUMN_DEFAULT != null) flags.push("default")
      arr.push({ name: r.COLUMN_NAME, type: r.DATA_TYPE, flags })
      tableMap.set(r.TABLE_NAME, arr)
    }

    const tables: DbTable[] = []
    for (const [name, columns] of tableMap) {
      tables.push({
        name,
        connectionId: conn.envVar,
        kind: "table",
        columns,
        indexes: [],
        rowCount: rowMap.get(name) ?? 0,
      })
    }
    return tables
  } finally {
    await connection.end().catch(() => {})
  }
}

/* ---------------------------- MongoDB ----------------------------- */

async function introspectMongo(conn: LiveConnection): Promise<DbTable[] | null> {
  let mongodb: any
  try {
    mongodb = await import("mongodb" as string)
  } catch {
    return null
  }
  const MongoClient = mongodb.MongoClient
  const client = new MongoClient(conn.value, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
  })

  await withTimeout(client.connect(), CONNECT_TIMEOUT_MS)
  try {
    const dbName = conn.parsed.name && conn.parsed.name !== "admin" ? conn.parsed.name : undefined
    const db = client.db(dbName)
    const collections = await db.listCollections().toArray()

    const tables: DbTable[] = []
    for (const c of collections) {
      if (/^system\./.test(c.name)) continue
      const coll = db.collection(c.name)
      let rowCount = 0
      try {
        rowCount = await coll.estimatedDocumentCount()
      } catch {
        /* ignore */
      }

      // Infer fields from a small sample of documents.
      const fieldTypes = new Map<string, string>()
      try {
        const sample = await coll.find({}).limit(20).toArray()
        for (const doc of sample) {
          for (const [k, v] of Object.entries(doc)) {
            if (!fieldTypes.has(k)) fieldTypes.set(k, mongoType(v))
          }
        }
      } catch {
        /* ignore */
      }

      // Indexes.
      const indexes: DbIndexInfo[] = []
      const indexedFields = new Set<string>()
      try {
        const idx = await coll.indexes()
        for (const i of idx as any[]) {
          const columns = Object.keys(i.key ?? {})
          columns.forEach((f) => indexedFields.add(f))
          indexes.push({ name: i.name ?? columns.join("_"), columns, unique: !!i.unique })
        }
      } catch {
        /* ignore */
      }

      const columns: DbColumn[] = [...fieldTypes.entries()].map(([name, type]) => {
        const flags: DbColumnFlag[] = []
        if (name === "_id") flags.push("pk")
        if (indexedFields.has(name) && name !== "_id") flags.push("index")
        return { name, type, flags }
      })

      tables.push({
        name: c.name,
        connectionId: conn.envVar,
        kind: "collection",
        columns,
        indexes,
        rowCount,
      })
    }
    return tables
  } finally {
    await client.close().catch(() => {})
  }
}

function mongoType(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (Array.isArray(v)) return "Array"
  const t = typeof v
  if (t === "object") {
    const ctor = (v as object).constructor?.name
    if (ctor === "ObjectId") return "ObjectId"
    if (ctor === "Date") return "Date"
    return "object"
  }
  if (t === "number") return Number.isInteger(v) ? "Int" : "Double"
  if (t === "boolean") return "Boolean"
  return "String"
}
