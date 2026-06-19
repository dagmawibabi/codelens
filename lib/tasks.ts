"use client"

import { useCallback, useEffect, useState } from "react"
import type { Severity } from "./schema"
import type { Issue, IssueSource } from "./issues"

export type TaskPriority = "high" | "medium" | "low"

/**
 * A board column (workflow status). Columns are user-customizable — the three
 * defaults (To do / In progress / Done) can be renamed or removed and new ones
 * added. The column flagged `done` counts its tasks as completed.
 */
export interface TaskColumn {
  id: string
  name: string
  /** Tasks in a `done` column are treated as completed (drop from open count). */
  done?: boolean
}

/** Default columns seeded on first use. */
const DEFAULT_COLUMNS: TaskColumn[] = [
  { id: "todo", name: "To do" },
  { id: "in-progress", name: "In progress" },
  { id: "done", name: "Done", done: true },
]

/**
 * A user-defined grouping (a.k.a. tag / list) tasks can be filed under, e.g.
 * "This sprint", "Tech debt". Issues from any tab can be added to a group.
 */
export interface TaskGroup {
  id: string
  name: string
  createdAt: string
}

/** Default groups seeded on first use. */
const DEFAULT_GROUPS: TaskGroup[] = [
  { id: "g_backlog", name: "Backlog", createdAt: "1970-01-01T00:00:00.000Z" },
  { id: "g_sprint", name: "This sprint", createdAt: "1970-01-01T00:00:00.000Z" },
]

/**
 * A tracked remediation task. Tasks are created from findings across any tab
 * (lint, security, deps, a11y, …) and persisted locally so they survive
 * reloads. The installed CLI never sees these — they're a developer-side
 * worklist layered on top of the analysis.
 */
export interface Task {
  id: string
  title: string
  /** Which board column the task currently sits in. */
  columnId: string
  priority: TaskPriority
  /** Which analysis surface this came from, when created from a finding. */
  source?: IssueSource
  severity?: Severity
  filePath?: string
  line?: number
  /** The group/tag this task is filed under, if any. */
  groupId?: string
  /** Free-form note the user can edit. */
  note?: string
  /** Full snapshot of the originating finding, powering the detail sheet. */
  issue?: Issue
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = "codelens.tasks.v2"
const LEGACY_KEY = "codelens.tasks.v1"
const COLUMNS_KEY = "codelens.task-columns.v1"
const GROUPS_KEY = "codelens.task-groups.v1"
const EVENT = "codelens:tasks-changed"

/** Map a finding severity to a sensible default task priority. */
function severityToPriority(sev?: Severity): TaskPriority {
  switch (sev) {
    case "critical":
    case "high":
    case "error":
      return "high"
    case "medium":
    case "warning":
      return "medium"
    default:
      return "low"
  }
}

function uid(prefix = "t"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

function readColumns(): TaskColumn[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY)
    if (!raw) return DEFAULT_COLUMNS
    const parsed = JSON.parse(raw) as TaskColumn[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_COLUMNS
  } catch {
    return DEFAULT_COLUMNS
  }
}

function writeColumns(columns: TaskColumn[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns))
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Append a new column. Returns the created column. */
export function addColumn(name: string): TaskColumn {
  const col: TaskColumn = { id: uid("col"), name: name.trim() }
  const cols = readColumns()
  // Insert before a trailing "done" column so Done stays last.
  const lastDoneIdx = cols.findIndex((c) => c.done)
  if (lastDoneIdx >= 0) {
    const next = [...cols]
    next.splice(lastDoneIdx, 0, col)
    writeColumns(next)
  } else {
    writeColumns([...cols, col])
  }
  return col
}

export function renameColumn(id: string, name: string) {
  writeColumns(readColumns().map((c) => (c.id === id ? { ...c, name: name.trim() } : c)))
}

/** Delete a column; its tasks move to the first remaining column. */
export function removeColumn(id: string) {
  const cols = readColumns()
  if (cols.length <= 1) return // never leave the board column-less
  const remaining = cols.filter((c) => c.id !== id)
  writeColumns(remaining)
  const fallback = remaining[0].id
  write(read().map((t) => (t.columnId === id ? { ...t, columnId: fallback } : t)))
}

/** React hook returning the live column list, synced across components + tabs. */
export function useColumns(): TaskColumn[] {
  const [columns, setColumns] = useState<TaskColumn[]>([])
  const refresh = useCallback(() => setColumns(readColumns()), [])
  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [refresh])
  return columns
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

interface LegacyTask {
  id: string
  title: string
  status: "todo" | "in-progress" | "done"
  priority: TaskPriority
  source?: IssueSource
  severity?: Severity
  filePath?: string
  line?: number
  groupId?: string
  note?: string
  createdAt: string
  updatedAt: string
}

function migrateLegacy(): Task[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const legacy = JSON.parse(raw) as LegacyTask[]
    if (!Array.isArray(legacy)) return null
    const migrated: Task[] = legacy.map(({ status, ...rest }) => ({ ...rest, columnId: status }))
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    window.localStorage.removeItem(LEGACY_KEY)
    return migrated
  } catch {
    return null
  }
}

function read(): Task[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return migrateLegacy() ?? []
    const parsed = JSON.parse(raw) as Task[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function write(tasks: Task[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  // Notify all hook instances in this tab (storage event only fires cross-tab).
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Create a free-form task. Returns the created task. */
export function addTask(input: Partial<Task> & { title: string }): Task {
  const now = new Date().toISOString()
  const task: Task = {
    id: uid(),
    title: input.title,
    columnId: input.columnId ?? readColumns()[0]?.id ?? "todo",
    priority: input.priority ?? "medium",
    source: input.source,
    severity: input.severity,
    filePath: input.filePath,
    line: input.line,
    groupId: input.groupId,
    note: input.note,
    issue: input.issue,
    createdAt: now,
    updatedAt: now,
  }
  write([task, ...read()])
  return task
}

/** Stable key identifying the finding behind a task/issue (dedupe + indicator). */
export function issueKey(issue: Pick<Issue, "source" | "filePath" | "line" | "title">): string {
  return `${issue.source}::${issue.filePath}::${issue.line}::${issue.title}`
}

function taskKey(t: Task): string | null {
  if (!t.source) return null
  return `${t.source}::${t.filePath}::${t.line}::${t.title}`
}

/**
 * Create a task from an inspector Issue. If a task already tracks the same
 * finding it is returned unchanged so the board doesn't accumulate duplicates.
 */
export function addTaskFromIssue(issue: Issue, groupId?: string): { task: Task; created: boolean } {
  const key = issueKey(issue)
  const existing = read().find((t) => taskKey(t) === key)
  if (existing) {
    if (groupId && existing.groupId !== groupId) updateTask(existing.id, { groupId })
    return { task: existing, created: false }
  }
  const task = addTask({
    title: issue.title,
    source: issue.source,
    severity: issue.severity,
    filePath: issue.filePath,
    line: issue.line,
    groupId,
    priority: severityToPriority(issue.severity),
    note: issue.recommendation,
    issue,
  })
  return { task, created: true }
}

export function updateTask(id: string, patch: Partial<Task>) {
  const next = read().map((t) =>
    t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
  )
  write(next)
}

/**
 * Move a task into `columnId`, optionally inserting it before `beforeTaskId`
 * (for drag-and-drop reordering). When `beforeTaskId` is omitted the task is
 * appended after the last task currently in the target column.
 */
export function moveTask(taskId: string, columnId: string, beforeTaskId?: string) {
  const tasks = read()
  const moving = tasks.find((t) => t.id === taskId)
  if (!moving) return
  const updated: Task = { ...moving, columnId, updatedAt: new Date().toISOString() }
  const without = tasks.filter((t) => t.id !== taskId)

  let insertAt: number
  if (beforeTaskId && beforeTaskId !== taskId) {
    const idx = without.findIndex((t) => t.id === beforeTaskId)
    insertAt = idx === -1 ? without.length : idx
  } else {
    // Append after the last task already in this column.
    let lastIdx = -1
    without.forEach((t, i) => {
      if (t.columnId === columnId) lastIdx = i
    })
    insertAt = lastIdx === -1 ? without.length : lastIdx + 1
  }
  without.splice(insertAt, 0, updated)
  write(without)
}

export function assignGroup(taskId: string, groupId: string | undefined) {
  updateTask(taskId, { groupId })
}

export function removeTask(id: string) {
  write(read().filter((t) => t.id !== id))
}

/** Clear every task in a `done` column. */
export function clearDone() {
  const doneIds = new Set(readColumns().filter((c) => c.done).map((c) => c.id))
  write(read().filter((t) => !doneIds.has(t.columnId)))
}

/** Delete every task on the board (columns and groups are preserved). */
export function clearAllTasks() {
  write([])
}

/**
 * Seed a small, realistic worklist that mirrors findings in the bundled demo
 * report. Issue-backed entries use the same `source/filePath/line/title` key as
 * the real findings, so the "tracked" indicators light up across the issue
 * tabs. No-ops if the board already has tasks (never clobbers real work).
 */
export function seedDemoTasks() {
  if (typeof window === "undefined") return
  if (read().length > 0) return

  const now = Date.now()
  const stamp = (offsetMin: number) => new Date(now - offsetMin * 60_000).toISOString()

  const mkIssue = (
    source: IssueSource,
    severity: Severity,
    title: string,
    filePath: string,
    line: number,
    recommendation: string,
  ): Issue => ({ source, severity, title, filePath, line, description: title, recommendation })

  const seeded: Task[] = [
    {
      id: uid(),
      title: "SQL injection via unparameterized query",
      columnId: "in-progress",
      priority: "high",
      source: "security",
      severity: "critical",
      filePath: "app/api/orders/route.ts",
      line: 31,
      groupId: "g_sprint",
      note: "Switch to a parameterized query before the next release cut.",
      issue: mkIssue(
        "security",
        "critical",
        "SQL injection via unparameterized query",
        "app/api/orders/route.ts",
        31,
        "User input is concatenated directly into a SQL string. Use parameterized queries or a query builder to safely bind values.",
      ),
      createdAt: stamp(180),
      updatedAt: stamp(20),
    },
    {
      id: uid(),
      title: "Service role key exposed to the client bundle",
      columnId: "todo",
      priority: "high",
      source: "security",
      severity: "critical",
      filePath: "lib/supabase.ts",
      line: 4,
      groupId: "g_sprint",
      issue: mkIssue(
        "security",
        "critical",
        "Service role key exposed to the client bundle",
        "lib/supabase.ts",
        4,
        "The Supabase service role key is referenced in client code. Move privileged calls to the server and use the anon key on the client.",
      ),
      createdAt: stamp(170),
      updatedAt: stamp(170),
    },
    {
      id: uid(),
      title: "Missing authorization check on order lookup",
      columnId: "todo",
      priority: "medium",
      source: "security",
      severity: "high",
      filePath: "app/api/orders/route.ts",
      line: 22,
      groupId: "g_backlog",
      issue: mkIssue(
        "security",
        "high",
        "Missing authorization check on order lookup",
        "app/api/orders/route.ts",
        22,
        "Any authenticated user can read any order by id. Scope the query to the session user before returning records.",
      ),
      createdAt: stamp(160),
      updatedAt: stamp(160),
    },
    {
      id: uid(),
      title: "Write integration tests for the checkout flow",
      columnId: "todo",
      priority: "low",
      groupId: "g_backlog",
      note: "No coverage on the highest-revenue path. Add happy-path + failure cases.",
      createdAt: stamp(90),
      updatedAt: stamp(90),
    },
    {
      id: uid(),
      title: "Behind on security patches (4.17.20 → 4.17.21)",
      columnId: "done",
      priority: "medium",
      source: "deps",
      severity: "medium",
      filePath: "package.json",
      line: 1,
      groupId: "g_backlog",
      issue: mkIssue(
        "deps",
        "medium",
        "Behind on security patches (4.17.20 → 4.17.21)",
        "package.json",
        1,
        "A transitive dependency has a known prototype-pollution advisory fixed in a patch release. Bump and re-lock.",
      ),
      createdAt: stamp(300),
      updatedAt: stamp(240),
    },
  ]

  write(seeded)
}

/**
 * Reset the entire board to its factory state: default columns, default
 * groups, and no tasks. Used by the Settings → Task board controls.
 */
export function resetBoard() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]))
  window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(DEFAULT_COLUMNS))
  window.localStorage.setItem(GROUPS_KEY, JSON.stringify(DEFAULT_GROUPS))
  window.localStorage.removeItem(LEGACY_KEY)
  window.dispatchEvent(new CustomEvent(EVENT))
}

/* ------------------------------------------------------------------ */
/* Groups                                                              */
/* ------------------------------------------------------------------ */

function readGroups(): TaskGroup[] {
  if (typeof window === "undefined") return DEFAULT_GROUPS
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY)
    if (!raw) return DEFAULT_GROUPS
    const parsed = JSON.parse(raw) as TaskGroup[]
    return Array.isArray(parsed) ? parsed : DEFAULT_GROUPS
  } catch {
    return DEFAULT_GROUPS
  }
}

function writeGroups(groups: TaskGroup[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Create a new group/tag. Returns the created group. */
export function addGroup(name: string): TaskGroup {
  const group: TaskGroup = { id: uid("g"), name: name.trim(), createdAt: new Date().toISOString() }
  writeGroups([...readGroups(), group])
  return group
}

export function renameGroup(id: string, name: string) {
  writeGroups(readGroups().map((g) => (g.id === id ? { ...g, name: name.trim() } : g)))
}

/** Delete a group; any tasks in it become ungrouped. */
export function removeGroup(id: string) {
  writeGroups(readGroups().filter((g) => g.id !== id))
  write(read().map((t) => (t.groupId === id ? { ...t, groupId: undefined } : t)))
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

function useSyncedStore<T>(getter: () => T): T {
  const [value, setValue] = useState<T>(getter)
  const refresh = useCallback(() => setValue(getter()), [getter])
  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return value
}

/** React hook returning the live task list, synced across components + tabs. */
export function useTasks(): Task[] {
  return useSyncedStore(read)
}

/** React hook returning the live group list, synced across components + tabs. */
export function useGroups(): TaskGroup[] {
  return useSyncedStore(readGroups)
}

/** Live count of open (non-done-column) tasks, for the nav badge. */
export function useOpenTaskCount(): number {
  const tasks = useTasks()
  const columns = useColumns()
  const doneIds = new Set(columns.filter((c) => c.done).map((c) => c.id))
  return tasks.filter((t) => !doneIds.has(t.columnId)).length
}

/** Live set of issue keys that are currently tracked as tasks (for indicators). */
export function useTrackedIssueKeys(): Set<string> {
  const tasks = useTasks()
  const keys = new Set<string>()
  for (const t of tasks) {
    const k = taskKey(t)
    if (k) keys.add(k)
  }
  return keys
}
