import { ConfidentialClientApplication } from "@azure/msal-node"
import { Client } from "@microsoft/microsoft-graph-client"
import type {
  EmailAccountCredentials,
  OAuthCredentials,
  ParsedMessage,
} from "@workspace/core/types"
import { parseRaw } from "../parser.ts"
import type { EmailAdapter, PullResult } from "./types.ts"

export const OUTLOOK_SCOPES = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
]

export function createOutlookAdapter(args: {
  credentials: OAuthCredentials
  clientId: string
  clientSecret: string
  redirectUri: string
}): EmailAdapter {
  let latestCreds: OAuthCredentials = { ...args.credentials }

  async function getToken(): Promise<string> {
    if (latestCreds.expiresAt - Date.now() > 5 * 60 * 1000) {
      return latestCreds.accessToken
    }
    const msal = new ConfidentialClientApplication({
      auth: {
        clientId: args.clientId,
        clientSecret: args.clientSecret,
        authority: "https://login.microsoftonline.com/common",
      },
    })
    const res = await msal.acquireTokenByRefreshToken({
      refreshToken: latestCreds.refreshToken,
      scopes: OUTLOOK_SCOPES.filter((s) => s !== "offline_access"),
    })
    if (!res) throw new Error("Failed to refresh Outlook token")
    latestCreds = {
      accessToken: res.accessToken,
      refreshToken: latestCreds.refreshToken, // MSAL keeps refresh in cache; reuse existing
      expiresAt: res.expiresOn?.getTime() ?? Date.now() + 3600_000,
      scope: res.scopes?.join(" "),
      tokenType: "Bearer",
    }
    return latestCreds.accessToken
  }

  function client() {
    return Client.init({
      authProvider: async (done) => {
        try {
          const token = await getToken()
          done(null, token)
        } catch (e) {
          done(e as Error, null)
        }
      },
    })
  }

  return {
    async pull({ cursor, limit, since }) {
      const c = client()
      const result: PullResult = { messages: [], nextCursor: cursor }

      if (!cursor || cursor.startsWith("/me/mailFolders")) {
        // ── Initial sync: use messages.list with proper $filter ──
        // Delta queries do NOT support $filter on receivedDateTime,
        // so we use the standard messages endpoint for the initial pull.
        const filterParts: string[] = []
        if (since) {
          filterParts.push(`receivedDateTime ge ${since.toISOString()}`)
        }
        const filterQs = filterParts.length
          ? `&$filter=${encodeURIComponent(filterParts.join(" and "))}`
          : ""
        const listPath =
          cursor ??
          `/me/mailFolders/inbox/messages?$select=id,conversationId,receivedDateTime&$orderby=receivedDateTime asc${filterQs}`

        const res = await c.api(listPath).top(limit).get()
        const items: Array<{
          id: string
          conversationId?: string
          receivedDateTime?: string
        }> = res.value ?? []

        for (const item of items) {
          try {
            const mime: Buffer = await c
              .api(`/me/messages/${item.id}/$value`)
              .getStream()
              .then(streamToBuffer)
            const parsed = await parseRaw(mime, {
              providerMessageId: item.id,
              threadId: item.conversationId ?? null,
            })
            result.messages.push(parsed)
          } catch {
            // skip individual fetch failures
          }
        }

        if (res["@odata.nextLink"]) {
          // More pages in the initial list — keep paginating.
          result.nextCursor = res["@odata.nextLink"]
        } else {
          // Initial sync complete — seed delta cursor for incremental syncs.
          try {
            const deltaRes = await c
              .api(
                `/me/mailFolders/inbox/messages/delta?$select=id`
              )
              .top(1)
              .get()
            // Drain the delta to get a deltaLink.
            let link =
              deltaRes["@odata.deltaLink"] ?? deltaRes["@odata.nextLink"]
            while (link && !link.includes("deltatoken")) {
              const page = await c.api(link).get()
              link = page["@odata.deltaLink"] ?? page["@odata.nextLink"]
            }
            result.nextCursor = link ?? cursor
          } catch {
            // If delta seeding fails, keep current cursor — next sync retries.
            result.nextCursor = cursor
          }
        }
      } else {
        // ── Incremental sync via delta ──
        try {
          const res = await c.api(cursor).top(limit).get()
          const items: Array<{
            id: string
            conversationId?: string
            receivedDateTime?: string
          }> = (res.value ?? []).filter(
            (v: Record<string, unknown>) => !v["@removed"]
          )

          for (const item of items) {
            try {
              const mime: Buffer = await c
                .api(`/me/messages/${item.id}/$value`)
                .getStream()
                .then(streamToBuffer)
              const parsed = await parseRaw(mime, {
                providerMessageId: item.id,
                threadId: item.conversationId ?? null,
              })
              result.messages.push(parsed)
            } catch {
              // skip individual fetch failures
            }
          }

          result.nextCursor =
            res["@odata.deltaLink"] ?? res["@odata.nextLink"] ?? cursor
        } catch {
          // Delta token expired or invalid — reset to null so next sync
          // re-bootstraps via messages.list.
          result.nextCursor = null
        }
      }

      const updated =
        latestCreds.accessToken !== args.credentials.accessToken
          ? ({ type: "oauth", oauth: latestCreds } satisfies EmailAccountCredentials)
          : undefined
      return { ...result, updatedCredentials: updated }
    },
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export function buildOutlookAuthUrl(args: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: "code",
    redirect_uri: args.redirectUri,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state: args.state,
    prompt: "consent",
  })
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeOutlookCode(args: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<{ credentials: OAuthCredentials; email: string }> {
  const msal = new ConfidentialClientApplication({
    auth: {
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      authority: "https://login.microsoftonline.com/common",
    },
  })
  const res = await msal.acquireTokenByCode({
    code: args.code,
    redirectUri: args.redirectUri,
    scopes: OUTLOOK_SCOPES.filter((s) => s !== "offline_access"),
  })
  if (!res) throw new Error("Failed to exchange Outlook code")
  // MSAL caches refresh token internally; we need to extract it from the cache.
  // Workaround: use raw token endpoint since MSAL v2 hides refresh tokens.
  const tokenRes = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: args.clientId,
        client_secret: args.clientSecret,
        code: args.code,
        grant_type: "authorization_code",
        redirect_uri: args.redirectUri,
        scope: OUTLOOK_SCOPES.join(" "),
      }),
    }
  )
  const raw = (await tokenRes.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
    error?: string
    error_description?: string
  }
  if (raw.error) {
    throw new Error(`${raw.error}: ${raw.error_description}`)
  }

  const credentials: OAuthCredentials = {
    accessToken: raw.access_token ?? res.accessToken,
    refreshToken: raw.refresh_token ?? "",
    expiresAt: Date.now() + (raw.expires_in ?? 3600) * 1000,
    scope: raw.scope,
    tokenType: raw.token_type ?? "Bearer",
  }

  return {
    credentials,
    email: res.account?.username ?? "",
  }
}
