import type { NextRequest } from "next/server"
import { auth } from "@workspace/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  return toNextJsHandler(auth().handler).GET(req)
}

export async function POST(req: NextRequest) {
  return toNextJsHandler(auth().handler).POST(req)
}
