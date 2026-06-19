"use client"

import { useMemo, useState } from "react"
import {
  ClipboardList,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  CircleDot,
  X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  useTasks,
  useGroups,
  addTask,
  addGroup,
  removeGroup,
  assignGroup,
  cycleStatus,
  removeTask,
  clearDone,
  updateTask,
  TASK_STATUS_LABEL,
  type Task,
  type TaskGroup,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/tasks"
import { FileLink } from "./inspector"

const COLUMNS: { key: TaskStatus; icon: typeof Circle }[] = [
  { key: "todo", icon: Circle },
  { key: "in-progress", icon: CircleDot },
  { key: "done", icon: CheckCircle2 },
]

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
}

export function TasksPanel() {
  const tasks = useTasks()
  const groups = useGroups()
  const [draft, setDraft] = useState("")
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all")
  // Group filter: "all" | "none" (ungrouped) | a group id.
  const [groupFilter, setGroupFilter] = useState<string>("all")
  const [newGroup, setNewGroup] = useState("")

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterPriority !== "all" && t.priority !== filterPriority) return false
      if (groupFilter === "all") return true
      if (groupFilter === "none") return !t.groupId
      return t.groupId === groupFilter
    })
  }, [tasks, filterPriority, groupFilter])

  const groupCount = useMemo(() => {
    const map = new Map<string, number>()
    let ungrouped = 0
    for (const t of tasks) {
      if (t.groupId) map.set(t.groupId, (map.get(t.groupId) ?? 0) + 1)
      else ungrouped++
    }
    return { map, ungrouped }
  }, [tasks])

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], "in-progress": [], done: [] }
    for (const t of filtered) map[t.status].push(t)
    return map
  }, [filtered])

  const doneCount = tasks.filter((t) => t.status === "done").length

  function submitDraft(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    // If a specific group is selected as the filter, file the new task there.
    const groupId = groupFilter !== "all" && groupFilter !== "none" ? groupFilter : undefined
    addTask({ title, groupId })
    setDraft("")
  }

  function submitGroup(e: React.FormEvent) {
    e.preventDefault()
    const name = newGroup.trim()
    if (!name) return
    const group = addGroup(name)
    setNewGroup("")
    setGroupFilter(group.id)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={submitDraft} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Plus className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a task…"
              className="w-full rounded-sm border border-border bg-card py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              aria-label="New task title"
            />
          </div>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-sm bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            Add
          </button>
        </form>

        <div className="flex items-center gap-1 rounded-sm border border-border bg-card p-1">
          {(["all", "high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFilterPriority(p)}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs capitalize transition-colors",
                filterPriority === p ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Group / tag bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <GroupChip
          label="All"
          count={tasks.length}
          active={groupFilter === "all"}
          onClick={() => setGroupFilter("all")}
        />
        {groupCount.ungrouped > 0 && (
          <GroupChip
            label="Ungrouped"
            count={groupCount.ungrouped}
            active={groupFilter === "none"}
            onClick={() => setGroupFilter("none")}
          />
        )}
        {groups.map((g) => (
          <GroupChip
            key={g.id}
            label={g.name}
            count={groupCount.map.get(g.id) ?? 0}
            active={groupFilter === g.id}
            onClick={() => setGroupFilter(g.id)}
            onRemove={() => {
              removeGroup(g.id)
              if (groupFilter === g.id) setGroupFilter("all")
            }}
          />
        ))}
        <form onSubmit={submitGroup} className="ml-auto flex items-center gap-1">
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="New group…"
            aria-label="New group name"
            className="w-32 rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!newGroup.trim()}
            aria-label="Create group"
            className="inline-flex size-7 items-center justify-center rounded-sm border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </form>
      </div>

      {tasks.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <ClipboardList className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No tasks yet</p>
            <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
              Add a task above, or open any finding across the dashboard and click{" "}
              <span className="font-mono text-foreground">Track task</span> to capture it here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {COLUMNS.map(({ key, icon: Icon }) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <Icon className="size-4 text-muted-foreground" />
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground">
                  {TASK_STATUS_LABEL[key]}
                </h3>
                <span className="font-mono text-[11px] text-muted-foreground">{byStatus[key].length}</span>
                {key === "done" && doneCount > 0 && (
                  <button
                    type="button"
                    onClick={clearDone}
                    className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Trash2 className="size-3" />
                    clear
                  </button>
                )}
              </div>
              <div className="flex min-h-24 flex-col gap-2 rounded-sm border border-dashed border-border p-2">
                {byStatus[key].length === 0 ? (
                  <p className="px-1 py-4 text-center font-mono text-[11px] text-muted-foreground/60">empty</p>
                ) : (
                  byStatus[key].map((t) => <TaskItem key={t.id} task={t} groups={groups} />)
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskItem({ task, groups }: { task: Task; groups: TaskGroup[] }) {
  const canPrev = task.status !== "todo"
  const canNext = task.status !== "done"
  const group = groups.find((g) => g.id === task.groupId)

  return (
    <Card className="group gap-0 p-2.5">
      <div className="flex items-start gap-2">
        <PriorityDot priority={task.priority} />
        <p
          className={cn(
            "min-w-0 flex-1 text-pretty text-sm leading-snug",
            task.status === "done" ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.title}
        </p>
        <button
          type="button"
          onClick={() => removeTask(task.id)}
          aria-label="Delete task"
          className="shrink-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Source provenance + group */}
      {(task.source || task.filePath || group) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {group && (
            <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-foreground">
              <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
              {group.name}
            </span>
          )}
          {task.source && (
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
              {task.source}
            </span>
          )}
          {task.filePath && (
            <FileLink path={task.filePath} line={task.line} className="text-[10px]" />
          )}
        </div>
      )}

      {/* Controls */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <select
            value={task.priority}
            onChange={(e) => updateTask(task.id, { priority: e.target.value as TaskPriority })}
            className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Task priority"
          >
            {(["high", "medium", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <select
            value={task.groupId ?? ""}
            onChange={(e) => assignGroup(task.id, e.target.value || undefined)}
            className="max-w-24 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Task group"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => cycleStatus(task.id, -1)}
            disabled={!canPrev}
            aria-label="Move back"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => cycleStatus(task.id, 1)}
            disabled={!canNext}
            aria-label="Move forward"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function GroupChip({
  label,
  count,
  active,
  onClick,
  onRemove,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  onRemove?: () => void
}) {
  return (
    <span
      className={cn(
        "group/chip inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground/40 bg-secondary text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5">
        {label}
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete group ${label}`}
          className="text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

function PriorityDot({ priority }: { priority: TaskPriority }) {
  // Monochrome: high = filled/dark, medium = mid, low = outline.
  const cls =
    priority === "high"
      ? "bg-foreground"
      : priority === "medium"
        ? "bg-muted-foreground"
        : "border border-muted-foreground bg-transparent"
  return <span className={cn("mt-1 size-2 shrink-0 rounded-full", cls)} aria-hidden title={`${priority} priority`} />
}
