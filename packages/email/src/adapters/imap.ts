import { ImapFlow } from "imapflow"
import type { ImapCredentials, ParsedMessage } from "@workspace/core/types"
import { parseRaw } from "../parser.ts"
import type { EmailAdapter } from "./types.ts"

// Cursor format: "v2:{uid}" — the v2 prefix distinguishes cursors set by the
// fixed ascending-sort logic from old cursors that jumped to max UID.
function parseCursor(cursor: string | null): number {
  if (!cursor) return 0
  const raw = cursor.startsWith("v2:") ? cursor.slice(3) : cursor
  return Number.parseInt(raw, 10) || 0
}

function formatCursor(uid: number): string {
  return `v2:${uid}`
}

export function createImapAdapter(credentials: ImapCredentials): EmailAdapter {
  return {
    async pull({ cursor, limit, since }) {
      const client = new ImapFlow({
        host: credentials.host,
        port: credentials.port,
        secure: credentials.secure,
        auth: { user: credentials.user, pass: credentials.password },
        logger: false,
      })

      const messages: ParsedMessage[] = []
      let maxUidSeen = parseCursor(cursor)

      try {
        await client.connect()
        const mbox = await client.mailboxOpen("INBOX")

        // Empty mailbox → nothing to pull.
        if (!mbox.exists || mbox.exists === 0) {
          await client.logout()
          return { messages, nextCursor: cursor }
        }

        const lastUid = parseCursor(cursor)

        // Build search criteria. IMPORTANT: pass `{ uid: true }` so the result
        // array contains UIDs (default would be sequence numbers).
        let candidateUids: number[] = []
        if (lastUid > 0) {
          // Incremental: every UID > lastUid, optionally narrowed by `since`.
          const query: Parameters<typeof client.search>[0] = {
            uid: `${lastUid + 1}:*`,
          }
          if (since) query.since = since
          const found = await client.search(query, { uid: true })
          if (Array.isArray(found)) candidateUids = found
        } else if (since) {
          // Initial sync with cutoff.
          const found = await client.search({ since }, { uid: true })
          if (Array.isArray(found)) candidateUids = found
        } else {
          // Initial sync, no cutoff — take all UIDs (imapflow accepts `all`).
          const found = await client.search({ all: true }, { uid: true })
          if (Array.isArray(found)) candidateUids = found
        }

        // Filter out anything ≤ lastUid defensively.
        if (lastUid > 0) {
          candidateUids = candidateUids.filter((u) => u > lastUid)
        }

        // Oldest first so cursor advances sequentially — prevents skipping
        // messages between old cursor and newest UID.
        candidateUids.sort((a, b) => a - b)
        const pickUids = candidateUids.slice(0, limit)
        if (pickUids.length === 0) {
          await client.logout()
          return { messages, nextCursor: cursor }
        }

        let fetched = 0
        for await (const msg of client.fetch(
          pickUids,
          { uid: true, source: true, envelope: true, internalDate: true },
          { uid: true }
        )) {
          if (fetched >= limit) break
          if (!msg.source) continue
          if (lastUid && msg.uid <= lastUid) continue

          const parsed = await parseRaw(msg.source, {
            providerMessageId: `uid:${msg.uid}`,
            threadId: msg.envelope?.inReplyTo ?? null,
          })
          messages.push(parsed)
          if (msg.uid > maxUidSeen) {
            maxUidSeen = msg.uid
          }
          fetched++
        }

        // If nothing parsed but we had candidates, still advance cursor to the
        // max candidate so we don't refetch the same UIDs next run.
        if (messages.length === 0 && pickUids.length > 0) {
          const maxCandidate = Math.max(...pickUids)
          if (maxCandidate > maxUidSeen) {
            maxUidSeen = maxCandidate
          }
        }

        // Ensure newest-first ordering of returned messages.
        messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())

        await client.logout()
      } catch (e) {
        try {
          await client.logout()
        } catch {
          // ignore
        }
        throw e
      }

      const nextCursor =
        maxUidSeen > 0 ? formatCursor(maxUidSeen) : cursor
      return { messages, nextCursor }
    },
  }
}
