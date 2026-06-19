"use client"

import { useMemo, useRef, useState } from "react"
import {
  ClipboardList,
  Plus,
  Trash2,
  X,
  GripVertical,
  MoreVertical,
  Pencil,
  Check,
  ExternalLink,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  useTasks,
  useGroups,
  useColumns,
  addTask,
  addGroup,
  removeGroup,
  assignGroup,
  addColumn,
  renameColumn,
  removeColumn,
  moveTask,
  removeTask,
  clearDone,
  updateTask,
  type Task,
  type TaskColumn,
  type TaskGroup,
  type TaskPriority,
} from "@/lib/tasks"
import { FileLink, useInspector } from "./inspector"
import { issueDocs, type Issue } from "@/lib/issues"

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
}

export function TasksPanel() {
  const tasks = useTasks()
  const groups = useGroups()
  const columns = useColumns()
  const { viewIssue } = useInspector()

  const [draft, setDraft] = useState("")
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all")
  // Group filter: "all" | "none" (ungrouped) | a group id.
  const [groupFilter, setGroupFilter] = useState<string>("all")
  const [newGroup, setNewGroup] = useState("")
  const [newColumn, setNewColumn] = useState("")
  const [addingColumn, setAddingColumn] = useState(false)
  // Free-form (non-issue) task opened in the detail dialog.
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  // Drag-and-drop state.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [overTask, setOverTask] = useState<string | null>(null)

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

  const byColumn = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const c of columns) map[c.id] = []
    for (const t of filtered) {
      if (!map[t.columnId]) map[t.columnId] = []
      map[t.columnId].push(t)
    }
    return map
  }, [filtered, columns])

  const doneColumnIds = useMemo(() => new Set(columns.filter((c) => c.done).map((c) => c.id)), [columns])
  const doneCount = tasks.filter((t) => doneColumnIds.has(t.columnId)).length

  function submitDraft(e: React.FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    const groupId = groupFilter !== "all" && groupFilter !== "none" ? groupFilter : undefined
    addTask({ title, groupId, columnId: columns[0]?.id })
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

  function submitColumn(e: React.FormEvent) {
    e.preventDefault()
    const name = newColumn.trim()
    if (!name) return
    addColumn(name)
    setNewColumn("")
    setAddingColumn(false)
  }

  function openTask(task: Task) {
    // Issue-backed tasks reopen the rich finding sheet; free-form open the dialog.
    if (task.issue) viewIssue(task.issue)
    else setDetailTask(task)
  }

  function endDrag() {
    setDragId(null)
    setOverCol(null)
    setOverTask(null)
  }

  function dropOnColumn(colId: string) {
    if (dragId) moveTask(dragId, colId)
    endDrag()
  }

  function dropOnTask(colId: string, beforeTaskId: string) {
    if (dragId && dragId !== beforeTaskId) moveTask(dragId, colId, beforeTaskId)
    endDrag()
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
              <span className="font-mono text-foreground">Track task</span> to capture it here. Drag cards
              between columns, and use the column menu to rename or remove columns.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={byColumn[col.id] ?? []}
              groups={groups}
              isDropTarget={overCol === col.id}
              overTask={overTask}
              dragId={dragId}
              showClear={Boolean(col.done) && doneCount > 0}
              canDelete={columns.length > 1}
              onClear={clearDone}
              onRename={(name) => renameColumn(col.id, name)}
              onDelete={() => removeColumn(col.id)}
              onOpenTask={openTask}
              onDragStartTask={(id) => setDragId(id)}
              onDragEndTask={endDrag}
              onColumnDragOver={() => {
                setOverCol(col.id)
                setOverTask(null)
              }}
              onColumnDrop={() => dropOnColumn(col.id)}
              onTaskDragOver={(id) => {
                setOverTask(id)
                setOverCol(col.id)
              }}
              onTaskDrop={(id) => dropOnTask(col.id, id)}
            />
          ))}

          {/* Add column */}
          <div className="w-72 shrink-0">
            {addingColumn ? (
              <form onSubmit={submitColumn} className="flex items-center gap-1 rounded-sm border border-border bg-card p-2">
                <input
                  autoFocus
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  onBlur={() => !newColumn.trim() && setAddingColumn(false)}
                  placeholder="Column name…"
                  aria-label="New column name"
                  className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!newColumn.trim()}
                  aria-label="Confirm new column"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground disabled:opacity-40"
                >
                  <Check className="size-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingColumn(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-border bg-card/40 py-2.5 font-mono text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="size-3.5" />
                Add column
              </button>
            )}
          </div>
        </div>
      )}

      <TaskDetailDialog
        task={detailTask}
        columns={columns}
        groups={groups}
        onClose={() => setDetailTask(null)}
        onViewIssue={(issue) => {
          setDetailTask(null)
          viewIssue(issue)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Board column                                                        */
/* ------------------------------------------------------------------ */

function BoardColumn({
  column,
  tasks,
  groups,
  isDropTarget,
  overTask,
  dragId,
  showClear,
  canDelete,
  onClear,
  onRename,
  onDelete,
  onOpenTask,
  onDragStartTask,
  onDragEndTask,
  onColumnDragOver,
  onColumnDrop,
  onTaskDragOver,
  onTaskDrop,
}: {
  column: TaskColumn
  tasks: Task[]
  groups: TaskGroup[]
  isDropTarget: boolean
  overTask: string | null
  dragId: string | null
  showClear: boolean
  canDelete: boolean
  onClear: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onOpenTask: (task: Task) => void
  onDragStartTask: (id: string) => void
  onDragEndTask: () => void
  onColumnDragOver: () => void
  onColumnDrop: () => void
  onTaskDragOver: (id: string) => void
  onTaskDrop: (id: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)
  const inputRef = useRef<HTMLInputElement>(null)

  function commitRename() {
    const next = name.trim()
    if (next && next !== column.name) onRename(next)
    else setName(column.name)
    setRenaming(false)
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className={cn("size-2 shrink-0 rounded-full", column.done ? "bg-foreground" : "bg-muted-foreground")} aria-hidden />
        {renaming ? (
          <input
            ref={inputRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename()
              if (e.key === "Escape") {
                setName(column.name)
                setRenaming(false)
              }
            }}
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Column name"
          />
        ) : (
          <h3 className="truncate font-mono text-xs font-semibold uppercase tracking-wide text-foreground">
            {column.name}
          </h3>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">{tasks.length}</span>

        <div className="ml-auto flex items-center gap-1">
          {showClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-muted-foreground transition-colors hover:text-foreground"
            >
              <Trash2 className="size-3" />
              clear
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Column options"
              className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                onClick={() => {
                  setName(column.name)
                  setRenaming(true)
                }}
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                Rename column
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDelete}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          onColumnDragOver()
        }}
        onDrop={(e) => {
          e.preventDefault()
          onColumnDrop()
        }}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-sm border border-dashed p-2 transition-colors",
          isDropTarget ? "border-foreground/40 bg-secondary/40" : "border-border",
        )}
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-4 text-center font-mono text-[11px] text-muted-foreground/60">
            {dragId ? "drop here" : "empty"}
          </p>
        ) : (
          tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              groups={groups}
              isDragging={dragId === t.id}
              showInsertLine={overTask === t.id && dragId !== null && dragId !== t.id}
              onOpen={() => onOpenTask(t)}
              onDragStart={() => onDragStartTask(t.id)}
              onDragEnd={onDragEndTask}
              onDragOver={() => onTaskDragOver(t.id)}
              onDrop={() => onTaskDrop(t.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Task card                                                           */
/* ------------------------------------------------------------------ */

function TaskItem({
  task,
  groups,
  isDragging,
  showInsertLine,
  onOpen,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  task: Task
  groups: TaskGroup[]
  isDragging: boolean
  showInsertLine: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
}) {
  const group = groups.find((g) => g.id === task.groupId)

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", task.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onDrop()
      }}
      className={cn(
        "rounded-sm transition-opacity",
        showInsertLine && "border-t-2 border-foreground/50 pt-0.5",
        isDragging && "opacity-40",
      )}
    >
      <Card className="group gap-0 p-2.5">
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground/40" aria-hidden />
          <PriorityDot priority={task.priority} />
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-pretty text-left text-sm leading-snug text-foreground transition-colors hover:text-foreground"
          >
            {task.title}
          </button>
          {task.issue && <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" aria-hidden />}
          <button
            type="button"
            onClick={() => removeTask(task.id)}
            aria-label="Delete task"
            className="shrink-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {(task.source || task.filePath || group) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
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
            {task.filePath && <FileLink path={task.filePath} line={task.line} className="text-[10px]" />}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Detail dialog (free-form tasks)                                     */
/* ------------------------------------------------------------------ */

function TaskDetailDialog({
  task,
  columns,
  groups,
  onClose,
  onViewIssue,
}: {
  task: Task | null
  columns: TaskColumn[]
  groups: TaskGroup[]
  onClose: () => void
  onViewIssue: (issue: Issue) => void
}) {
  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="text-pretty pr-6">{task.title}</DialogTitle>
              <DialogDescription>
                Created {new Date(task.createdAt).toLocaleString()} · Updated{" "}
                {new Date(task.updatedAt).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                  Column
                  <select
                    value={task.columnId}
                    onChange={(e) => updateTask(task.id, { columnId: e.target.value })}
                    className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                  Priority
                  <select
                    value={task.priority}
                    onChange={(e) => updateTask(task.id, { priority: e.target.value as TaskPriority })}
                    className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(["high", "medium", "low"] as const).map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                Group
                <select
                  value={task.groupId ?? ""}
                  onChange={(e) => assignGroup(task.id, e.target.value || undefined)}
                  className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 font-mono text-[10px] uppercase text-muted-foreground">
                Notes
                <textarea
                  value={task.note ?? ""}
                  onChange={(e) => updateTask(task.id, { note: e.target.value })}
                  rows={4}
                  placeholder="Add details, links, or a remediation plan…"
                  className="resize-y rounded-sm border border-border bg-background px-2 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </label>

              {/* Origin finding — full context for issue-backed tasks. */}
              {task.source && (
                <div className="flex flex-col gap-2 rounded-sm border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {task.source}
                    </span>
                    {task.severity && (
                      <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
                        {task.severity}
                      </span>
                    )}
                  </div>
                  {task.issue?.recommendation && (
                    <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                      {task.issue.recommendation}
                    </p>
                  )}
                  {task.filePath && (
                    <div className="font-mono text-[11px] text-muted-foreground">
                      <FileLink path={task.filePath} line={task.line} />
                    </div>
                  )}
                  {task.issue && issueDocs(task.issue).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {issueDocs(task.issue).map((d) => (
                        <a
                          key={d.href}
                          href={d.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          {d.label}
                        </a>
                      ))}
                    </div>
                  )}
                  {task.issue && (
                    <button
                      type="button"
                      onClick={() => onViewIssue(task.issue as Issue)}
                      className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-secondary"
                    >
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                      View full analysis
                    </button>
                  )}
                </div>
              )}

              {!task.source && task.filePath && (
                <div className="font-mono text-[11px] text-muted-foreground">
                  <FileLink path={task.filePath} line={task.line} />
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  removeTask(task.id)
                  onClose()
                }}
                className="inline-flex items-center justify-center gap-1.5 self-start rounded-sm border border-destructive/40 px-2.5 py-1.5 font-mono text-xs text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
                Delete task
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Bits                                                                */
/* ------------------------------------------------------------------ */

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
