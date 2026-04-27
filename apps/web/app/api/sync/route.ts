import { NextResponse } from "next/server"
import { runSync } from "@workspace/email/pipeline"
import { getSessionOrNull } from "@/lib/session"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST() {
  const session = await getSessionOrNull()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const stats = await runSync(session.user.id)
    return NextResponse.json(stats)
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
