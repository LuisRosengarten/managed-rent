import { NextResponse } from "next/server"
import { buildOutlookAuthUrl } from "@workspace/email/adapters/outlook"
import { getSessionOrNull } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionOrNull()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Microsoft OAuth env vars missing" },
      { status: 500 }
    )
  }

  const url = buildOutlookAuthUrl({
    clientId,
    redirectUri,
    state: session.user.id,
  })
  return NextResponse.redirect(url)
}
