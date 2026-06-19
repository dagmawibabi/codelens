import { NextResponse } from "next/server"
import { fetchReleases, GitHubError } from "@/lib/github.server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const owner = searchParams.get("owner")?.trim()
  const repo = searchParams.get("repo")?.trim()
  if (!owner || !repo) {
    return NextResponse.json({ error: "owner and repo are required" }, { status: 400 })
  }
  try {
    const releases = await fetchReleases(owner, repo)
    return NextResponse.json({ releases, count: releases.length })
  } catch (err) {
    const status = err instanceof GitHubError ? err.status : 500
    const message = err instanceof Error ? err.message : "Failed to load releases"
    return NextResponse.json({ error: message }, { status })
  }
}
