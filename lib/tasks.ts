"use client"

import { useCallback, useEffect, useState } from "react"
import type { Severity } from "./schema"
import type { Issue, IssueSource } from "./issues"

/** Workflow columns for the task board. */
export type TaskStatus = "todo" | "in-progress" | "done"
export type TaskPriority = "high" | "medium" | "low"

/**
 * A user-defined grouping (a.k.a. tag / list) tasks can be filed under, e.g.
 * "This sprint", "Tech debt", "Security review". Issues from any tab can be
 * added to a group from their detail sheet.
 */
export interface TaskGroup {
  id: string
  name: string
  createdAt: string
}

/** Default groups seeded on first use so the board isn't empty. */
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
  status: TaskStatus
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
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = "codelens.tasks.v1"
const GROUPS_KEY = "codelens.task-groups.v1"
const EVENT = "codelens:tasks-changed"

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "done"]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
}

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

function read(): Task[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
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
  const trimmed = name.trim()
  const group: TaskGroup = { id: uid(), name: trimmed, createdAt: new Date().toISOString() }
  writeGroups([...readGroups(), group])
  return group
}

export function renameGroup(id: string, name: string) {
  writeGroups(readGroups().map((g) => (g.id === id ? { ...g, name: name.trim() } : g)))
}

/** Delete a group; any tasks in it are moved back to "ungrouped". */
export function removeGroup(id: string) {
  writeGroups(readGroups().filter((g) => g.id !== id))
  const next = read().map((t) => (t.groupId === id ? { ...t, groupId: undefined } : t))
  write(next)
}

export function assignGroup(taskId: string, groupId: string | undefined) {
  updateTask(taskId, { groupId })
}

function uid(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** Create a free-form task. Returns the created task. */
export function addTask(input: Partial<Task> & { title: string }): Task {
  const now = new Date().toISOString()
  const task: Task = {
    id: uid(),
    title: input.title,
    status: input.status ?? "todo",
    priority: input.priority ?? "medium",
    source: input.source,
    severity: input.severity,
    filePath: input.filePath,
    line: input.line,
    groupId: input.groupId,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  }
  write([task, ...read()])
  return task
}

/**
 * Create a task from an inspector Issue. If a task already tracks the same
 * finding (matched on source + file + line + title) it is returned unchanged
 * so the board doesn't accumulate duplicates.
 */
export function addTaskFromIssue(issue: Issue, groupId?: string): { task: Task; created: boolean } {
  const existing = read().find(
    (t) =>
      t.source === issue.source &&
      t.filePath === issue.filePath &&
      t.line === issue.line &&
      t.title === issue.title,
  )
  if (existing) {
    // Already tracked — if a target group was specified, file it there.
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
  })
  return { task, created: true }
}

export function updateTask(id: string, patch: Partial<Task>) {
  const next = read().map((t) =>
    t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
  )
  write(next)
}

/** Advance a task to the next workflow column (wraps to the start). */
export function cycleStatus(id: string, direction: 1 | -1 = 1) {
  const t = read().find((x) => x.id === id)
  if (!t) return
  const idx = STATUS_ORDER.indexOf(t.status)
  const nextIdx = (idx + direction + STATUS_ORDER.length) % STATUS_ORDER.length
  updateTask(id, { status: STATUS_ORDER[nextIdx] })
}

export function removeTask(id: string) {
  write(read().filter((t) => t.id !== id))
}

export function clearDone() {
  write(read().filter((t) => t.status !== "done"))
}

/** React hook returning the live task list, synced across components + tabs. */
export function useTasks(): Task[] {
  const [tasks, setTasks] = useState<Task[]>([])

  const refresh = useCallback(() => setTasks(read()), [])

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

  return tasks
}

/** React hook returning the live group list, synced across components + tabs. */
export function useGroups(): TaskGroup[] {
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const refresh = useCallback(() => setGroups(readGroups()), [])

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

  return groups
}

/** Live count of not-done tasks, for the nav badge. */
export function useOpenTaskCount(): number {
  const tasks = useTasks()
  return tasks.filter((t) => t.status !== "done").length
}
