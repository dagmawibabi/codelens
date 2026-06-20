import { NextResponse } from "next/server"
import { getApiSpec } from "@/lib/api-spec"

export const dynamic = "force-static"

/** Self-describing API reference. */
export function GET() {
  return NextResponse.json(getApiSpec())
}
