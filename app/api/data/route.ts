import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"

/**
 * Server-side artifacts CodeLens writes under `.codelens/` in the project root.
 * Deleting these clears persisted run history, the latest run snapshot, project
 * insights, and saved Ask-AI chats — the data that survives across dashboard
 * sessions on the machine running the CLI.
 */
const CODELENS_FILES = ["history.json", "latest.json", "insights.json", "chats.json"]

/**
 * DELETE /api/data — wipe persisted server-side data.
 *
 * Query: `?scope=runs` removes only run artifacts (history/latest/insights),
 * `?scope=chats` removes only chats, and the default (no scope / `all`) removes
 * everything. localStorage is cleared separately on the client.
 */
export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "all"

  const targets =
    scope === "runs"
      ? ["history.json", "latest.json", "insights.json"]
      : scope === "chats"
        ? ["chats.json"]
        : CODELENS_FILES

  const base = path.join(process.cwd(), ".codelens")
  const removed: string[] = []

  await Promise.all(
    targets.map(async (file) => {
      try {
        await fs.rm(path.join(base, file), { force: true })
        removed.push(file)
      } catch {
        // Missing files are fine — nothing to remove.
      }
    }),
  )

  return NextResponse.json({ ok: true, scope, removed })
}
