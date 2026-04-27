import { NextResponse } from "next/server"
import { buildGmailAuthUrl } from "@workspace/email/adapters/gmail"
import { getSessionOrNull } from "@/lib/session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionOrNull()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Google OAuth env vars missing" },
      { status: 500 }
    )
  }

  // State = userId for demo; in production sign/encrypt or use CSRF token cookie.
  const url = buildGmailAuthUrl({
    clientId,
    redirectUri,
    state: session.user.id,
  })
  return NextResponse.redirect(url)
}
