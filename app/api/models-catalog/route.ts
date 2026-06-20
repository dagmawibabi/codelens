import { NextResponse } from "next/server"
import { fetchCatalog } from "@/lib/models-catalog"

export const dynamic = "force-dynamic"

/**
 * Standalone-preview proxy for the models.dev catalog. The CLI build serves the
 * dashboard as a static bundle and the picker fetches models.dev directly
 * (it's CORS-enabled), so this route only matters for the Next.js preview.
 * Logic lives in `@/lib/models-catalog` so both paths stay in sync.
 */
export async function GET() {
  try {
    const models = await fetchCatalog()
    return NextResponse.json({ models, count: models.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load model catalog", models: [] },
      { status: 502 },
    )
  }
}
