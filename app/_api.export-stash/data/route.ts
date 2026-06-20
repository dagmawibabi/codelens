import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"

/**
 * Server-side artifacts Projectlens writes under `.projectlens/` in the project root.
 * Deleting these clears persisted run history, the latest run snapshot, project
 * insights, and saved Ask-AI chats — the data that survives across dashboard
 * sessions on the machine running the CLI.
 */
const PROJECTLENS_FILES = ["history.json", "latest.json", "insights.json", "chats.json"]

// Served live by the CLI server at runtime; excluded from the static export.
export const dynamic = "force-dynamic"

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
        : PROJECTLENS_FILES

  const base = path.join(process.cwd(), ".projectlens")
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
