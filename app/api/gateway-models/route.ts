import { NextResponse } from "next/server"
import { fetchGatewayModels } from "@/lib/gateway-models"

export const dynamic = "force-dynamic"

/**
 * Standalone-preview proxy for the AI Gateway model list. The CLI build serves
 * the dashboard as a static bundle and the picker fetches the gateway directly
 * (it's CORS-enabled), so this route only matters for the Next.js preview.
 * Logic lives in `@/lib/gateway-models` so both paths stay in sync.
 */
export async function GET() {
  try {
    const models = await fetchGatewayModels()
    return NextResponse.json({ models })
  } catch {
    return NextResponse.json({ error: "Failed to reach the AI Gateway", models: [] }, { status: 502 })
  }
}
