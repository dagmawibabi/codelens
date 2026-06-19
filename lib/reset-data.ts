/**
 * Client-side data management helpers used by Settings → Data & storage.
 *
 * CodeLens keeps state in two places:
 *  - the browser's localStorage (settings, task board, columns, groups), all
 *    namespaced under the `codelens.` prefix; and
 *  - the CLI's `.codelens/` folder on disk (run history, latest run, insights,
 *    saved chats), cleared via `DELETE /api/data`.
 *
 * These helpers wipe each surface so the dashboard can offer a real "delete
 * everything" rather than a cosmetic reset.
 */

const PREFIX = "codelens."

/** Number of `codelens.*` keys currently held in localStorage. */
export function countLocalKeys(): number {
  if (typeof window === "undefined") return 0
  let count = 0
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key?.startsWith(PREFIX)) count++
  }
  return count
}

/**
 * Remove every `codelens.*` key from localStorage (settings, tasks, columns,
 * groups, and any legacy keys). Returns the keys that were removed.
 */
export function clearLocalData(): string[] {
  if (typeof window === "undefined") return []
  const keys: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key?.startsWith(PREFIX)) keys.push(key)
  }
  for (const key of keys) window.localStorage.removeItem(key)
  return keys
}

export type ServerScope = "all" | "runs" | "chats"

/** Delete persisted server-side data (run history, insights, chats). */
export async function clearServerData(scope: ServerScope = "all"): Promise<boolean> {
  try {
    const res = await fetch(`/api/data?scope=${scope}`, { method: "DELETE" })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Full wipe: clear server-side artifacts, then every local key. The caller is
 * expected to reload so all in-memory React state and SWR caches reset too.
 */
export async function deleteEverything(): Promise<void> {
  await clearServerData("all")
  clearLocalData()
}
