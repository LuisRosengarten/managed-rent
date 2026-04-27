import { NextResponse, type NextRequest } from "next/server"
import { exchangeOutlookCode } from "@workspace/email/adapters/outlook"
import { db, emailAccount } from "@workspace/db"
import * as appCrypto from "@workspace/core/crypto"
import { getSessionOrNull } from "@/lib/session"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const session = await getSessionOrNull()
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const code = req.nextUrl.searchParams.get("code")
  const err = req.nextUrl.searchParams.get("error")
  if (err) {
    return NextResponse.redirect(
      new URL(
        `/settings/email-accounts?error=${encodeURIComponent(err)}`,
        req.url
      )
    )
  }
  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/email-accounts?error=missing_code", req.url)
    )
  }

  try {
    const { credentials, email } = await exchangeOutlookCode({
      code,
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
    })

    const encrypted = await appCrypto.encryptJson({
      type: "oauth" as const,
      oauth: credentials,
    })

    await db()
      .insert(emailAccount)
      .values({
        userId: session.user.id,
        provider: "outlook",
        email,
        displayName: email,
        credentials: encrypted,
      })
      .onConflictDoUpdate({
        target: [emailAccount.userId, emailAccount.email],
        set: { credentials: encrypted, status: "active", updatedAt: new Date() },
      })

    return NextResponse.redirect(
      new URL("/settings/email-accounts?added=outlook", req.url)
    )
  } catch (e) {
    return NextResponse.redirect(
      new URL(
        `/settings/email-accounts?error=${encodeURIComponent((e as Error).message)}`,
        req.url
      )
    )
  }
}
