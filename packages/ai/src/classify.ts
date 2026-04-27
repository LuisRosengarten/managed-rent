import { z } from "zod"
import {
  MESSAGE_CATEGORIES,
  MESSAGE_IGNORE_REASONS,
  type MessageCategory,
} from "@workspace/core/status"
import type { ClassificationResultV2 } from "@workspace/core/types"
import type { AiProviderAdapter } from "./providers/types.ts"

const ClassificationSchema = z.object({
  isRentalRelevant: z.boolean(),
  startsWorkflow: z.boolean(),
  confidence: z.number(),
  category: z.enum(MESSAGE_CATEGORIES),
  ignoreReason: z.enum(MESSAGE_IGNORE_REASONS).optional(),
  reasoning: z.string(),
})

export type ClassificationResult = z.infer<typeof ClassificationSchema> &
  ClassificationResultV2

const SYSTEM_PROMPT = `Du bist ein Klassifikator für Emails auf Wohnungssuche-relevanz.
Kategorien:
- portal_contact_progress: Portal-Mail, die eine gesendete Kontaktanfrage bestätigt, weitergeleitet meldet, auf einen laufenden Kontakt verweist oder eine konkrete Antwort im bestehenden Kontaktprozess enthält.
- landlord_direct: Direktnachricht eines Vermieters / Maklers / einer Verwaltung an den Nutzer (Antwort auf Anfrage, Terminvorschlag, Absage, Dokumenten-Anfrage).
- portal_notification: Benachrichtigung/Newsletter vom Portal ohne konkrete Wohnung (Tipps, Suchalarm-Zusammenfassung, Marketing).
- irrelevant: Keinerlei Wohnungs-Bezug (Shopping, Social, Banking, Spam).

Wichtige Fachregeln:
- Reine Portal-Mails über neue Objekte, Suchalarme, neue passende Angebote oder Sammelbenachrichtigungen VOR einer bestätigten Kontaktanfrage gelten als irrelevant mit ignoreReason=pre_contact_portal_listing.
- Portal-Mails starten den Workflow NUR dann, wenn sie eine Kontaktanfrage bestätigen / weiterleiten / auf einen bereits laufenden Kontaktprozess verweisen.
- WICHTIG: Viele Portal-Mails enthalten neben dem Hauptinhalt auch Sektionen wie "Ähnliche Angebote", "Weitere Objekte für dich", "Das könnte dich auch interessieren" etc. Diese Sektionen sind IRRELEVANT für die Klassifikation. Bewerte die Mail NUR anhand des Hauptinhalts (Kontaktanfrage-Bestätigung, Vermieter-Antwort, Terminvereinbarung etc.).

isRentalRelevant = true NUR bei portal_contact_progress oder landlord_direct.
startsWorkflow = true NUR bei portal_contact_progress oder landlord_direct.
ignoreReason:
- pre_contact_portal_listing: neue Portal-Objekte vor bestätigtem Kontakt
- marketing_or_digest: allgemeiner Newsletter / Digest / Marketing
- non_housing: kein Wohnungsbezug

confidence: 0.0 bis 1.0.
reasoning: kurze Begründung auf Deutsch (max. 2 Sätze).`

export async function classifyMessage(
  adapter: AiProviderAdapter,
  input: {
    fromAddr: string
    fromName: string | null
    subject: string
    analysisText: string
  }
): Promise<{
  result: ClassificationResult
  model: string
  raw: unknown
}> {
  const truncatedBody = input.analysisText.slice(0, 8000)
  const user = `Absender: ${input.fromName ?? ""} <${input.fromAddr}>
Betreff: ${input.subject}

Inhalt:
${truncatedBody}`

  const { data, completion } = await adapter.generateJson({
    system: SYSTEM_PROMPT,
    user,
    schema: ClassificationSchema,
    schemaName: "email_classification",
  })

  return {
    result: data,
    model: "", // filled by caller who has ProviderConfig
    raw: completion.raw,
  }
}

export { ClassificationSchema }
export type { MessageCategory }
