import type {
  EmailAccountCredentials,
  ParsedMessage,
} from "@workspace/core/types"

export type PullResult = {
  messages: ParsedMessage[]
  nextCursor: string | null
}

export interface EmailAdapter {
  /**
   * Pull up to `limit` new messages since the cursor. Returns the new cursor
   * for persistence (unchanged if nothing new, null if untracked).
   * Caller persists `nextCursor` to emailAccount.syncCursor.
   *
   * May return updated credentials (e.g. refreshed OAuth tokens) — caller
   * must persist those too.
   */
  pull(args: {
    cursor: string | null
    limit: number
    /**
     * Optional cutoff — adapters should only return messages received on/after
     * this date. 0/undefined means no limit. Pipeline also post-filters.
     */
    since?: Date | null
  }): Promise<PullResult & { updatedCredentials?: EmailAccountCredentials }>
}
