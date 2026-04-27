import { and, desc, eq } from "drizzle-orm"
import { db, userCorrection } from "@workspace/db"
import type { UserCorrectionKind } from "@workspace/core/status"

interface CorrectionRow {
  kind: string
  beforeValue: Record<string, unknown>
  afterValue: Record<string, unknown>
  context: Record<string, unknown>
  createdAt: Date
}

export async function getRecentCorrections(
  userId: string,
  kinds: UserCorrectionKind[],
  limit = 5
): Promise<CorrectionRow[]> {
  if (kinds.length === 0) return []
  const rows = await db()
    .select({
      kind: userCorrection.kind,
      beforeValue: userCorrection.beforeValue,
      afterValue: userCorrection.afterValue,
      context: userCorrection.context,
      createdAt: userCorrection.createdAt,
    })
    .from(userCorrection)
    .where(eq(userCorrection.userId, userId))
    .orderBy(desc(userCorrection.createdAt))
    .limit(limit * kinds.length)
  // Filter client-side since Drizzle doesn't have `in` for enums easily
  return rows
    .filter((r) => kinds.includes(r.kind as UserCorrectionKind))
    .slice(0, limit)
}

export function formatFieldCorrectionsForPrompt(
  corrections: CorrectionRow[]
): string {
  if (corrections.length === 0) return ""
  const lines = corrections
    .filter((c) => c.kind === "listing_field_edit")
    .map((c) => {
      const changes = Object.entries(c.afterValue)
        .map(([field, newVal]) => {
          const oldVal = c.beforeValue[field]
          return `  ${field}: "${oldVal ?? "(leer)"}" → "${newVal ?? "(leer)"}"`
        })
        .join("\n")
      return changes
    })
    .filter(Boolean)

  if (lines.length === 0) return ""

  return `\n\nDer Nutzer hat folgende Extraktionen zuvor manuell korrigiert. Berücksichtige diese Präferenzen bei der Extraktion:\n${lines.join("\n")}`
}

export function formatAssignmentCorrectionsForPrompt(
  corrections: CorrectionRow[]
): string {
  if (corrections.length === 0) return ""
  const lines = corrections
    .filter(
      (c) => c.kind === "manual_assignment" || c.kind === "reassignment"
    )
    .map((c) => {
      const ctx = c.context
      return `  Mail von "${ctx.messageFrom}" (Betreff: "${ctx.messageSubject}") → Objekt "${ctx.listingTitle}"`
    })
    .filter(Boolean)

  if (lines.length === 0) return ""

  return `\n\nDer Nutzer hat folgende Mails zuvor manuell Objekten zugeordnet. Berücksichtige diese Muster:\n${lines.join("\n")}`
}
