import { google, gmail_v1 } from "googleapis"
import type {
  EmailAccountCredentials,
  OAuthCredentials,
  ParsedMessage,
} from "@workspace/core/types"
import { parseRaw } from "../parser.ts"
import type { EmailAdapter, PullResult } from "./types.ts"

export function createGmailAdapter(args: {
  credentials: OAuthCredentials
  clientId: string
  clientSecret: string
  redirectUri: string
}): EmailAdapter {
  const oauth2 = new google.auth.OAuth2(
    args.clientId,
    args.clientSecret,
    args.redirectUri
  )
  oauth2.setCredentials({
    access_token: args.credentials.accessToken,
    refresh_token: args.credentials.refreshToken,
    expiry_date: args.credentials.expiresAt,
    scope: args.credentials.scope,
    token_type: args.credentials.tokenType ?? "Bearer",
  })

  let latestCreds: OAuthCredentials = { ...args.credentials }

  oauth2.on("tokens", (tokens) => {
    latestCreds = {
      accessToken: tokens.access_token ?? latestCreds.accessToken,
      refreshToken: tokens.refresh_token ?? latestCreds.refreshToken,
      expiresAt: tokens.expiry_date ?? latestCreds.expiresAt,
      scope: tokens.scope ?? latestCreds.scope,
      tokenType: tokens.token_type ?? latestCreds.tokenType,
    }
  })

  const gmail = google.gmail({ version: "v1", auth: oauth2 })

  return {
    async pull({ cursor, limit, since }) {
      const result: PullResult = { messages: [], nextCursor: cursor }

      // Cursor prefixed with "list:" means we're paginating the initial sync.
      const isListPage = cursor?.startsWith("list:")

      if (!cursor || isListPage) {
        // ── Initial / paginated sync via messages.list ──
        const days = sinceToDays(since)
        const q = days ? `newer_than:${days}d in:inbox` : "in:inbox"
        const pageToken = isListPage ? cursor!.slice(5) : undefined
        const list = await gmail.users.messages.list({
          userId: "me",
          maxResults: limit,
          q,
          pageToken,
        })
        const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean)
        for (const id of ids) {
          const msg = await fetchMessageRaw(gmail, id)
          if (msg) result.messages.push(msg)
        }

        if (list.data.nextPageToken) {
          // More pages — keep paginating before switching to incremental.
          result.nextCursor = `list:${list.data.nextPageToken}`
        } else {
          // All pages fetched — seed historyId for incremental syncs.
          const profile = await gmail.users.getProfile({ userId: "me" })
          result.nextCursor = profile.data.historyId ?? null
        }
      } else {
        // ── Incremental via history.list ──
        try {
          const history = await gmail.users.history.list({
            userId: "me",
            startHistoryId: cursor,
            historyTypes: ["messageAdded"],
            maxResults: limit,
          })
          const items = history.data.history ?? []
          const addedIds = new Set<string>()
          for (const h of items) {
            for (const m of h.messagesAdded ?? []) {
              if (m.message?.id) addedIds.add(m.message.id)
              if (addedIds.size >= limit) break
            }
            if (addedIds.size >= limit) break
          }
          for (const id of addedIds) {
            const msg = await fetchMessageRaw(gmail, id)
            if (msg) result.messages.push(msg)
          }
          result.nextCursor =
            history.data.historyId ?? (await profileHistoryId(gmail, cursor))
        } catch {
          // History expired (>7d) — re-bootstrap via messages.list so missed
          // messages during the gap are picked up. Setting cursor to null
          // triggers a full re-sync on next pull.
          result.nextCursor = null
        }
      }

      return {
        ...result,
        updatedCredentials:
          latestCreds.accessToken !== args.credentials.accessToken
            ? { type: "oauth", oauth: latestCreds }
            : undefined,
      }
    },
  }
}

function sinceToDays(since: Date | null | undefined): number | null {
  if (!since) return null
  const ms = Date.now() - since.getTime()
  if (ms <= 0) return 1
  return Math.max(1, Math.ceil(ms / 86_400_000))
}

async function fetchMessageRaw(
  gmail: gmail_v1.Gmail,
  id: string
): Promise<ParsedMessage | null> {
  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "raw",
    })
    const raw = res.data.raw
    if (!raw) return null
    const buffer = Buffer.from(raw, "base64url")
    return parseRaw(buffer, {
      providerMessageId: id,
      threadId: res.data.threadId ?? null,
    })
  } catch {
    return null
  }
}

async function profileHistoryId(
  gmail: gmail_v1.Gmail,
  fallback: string
): Promise<string> {
  try {
    const profile = await gmail.users.getProfile({ userId: "me" })
    return profile.data.historyId ?? fallback
  } catch {
    return fallback
  }
}

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
]

export function buildGmailAuthUrl(args: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const oauth2 = new google.auth.OAuth2(args.clientId, "", args.redirectUri)
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state: args.state,
  })
}

export async function exchangeGmailCode(args: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<{ credentials: OAuthCredentials; email: string }> {
  const oauth2 = new google.auth.OAuth2(
    args.clientId,
    args.clientSecret,
    args.redirectUri
  )
  const { tokens } = await oauth2.getToken(args.code)
  oauth2.setCredentials(tokens)
  const me = await google
    .oauth2({ version: "v2", auth: oauth2 })
    .userinfo.get()
  const credentials: OAuthCredentials = {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? "",
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
    scope: tokens.scope,
    tokenType: tokens.token_type ?? "Bearer",
  }
  return { credentials, email: me.data.email ?? "" }
}

// Helper for typed narrowing where caller already has an OAuthCredentials-typed union.
export function ensureOauth(cred: EmailAccountCredentials): OAuthCredentials {
  if (cred.type !== "oauth") throw new Error("Expected oauth credentials")
  return cred.oauth
}
