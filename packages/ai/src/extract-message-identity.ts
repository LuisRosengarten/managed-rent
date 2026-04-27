import { z } from "zod"
import type { ExtractedMessageIdentity } from "@workspace/core/types"
import type { AiProviderAdapter } from "./providers/types.ts"
import {
  getRecentCorrections,
  formatAssignmentCorrectionsForPrompt,
} from "./correction-context.ts"

const MessageIdentitySchema = z.object({
  portal: z.string().optional(),
  portalListingId: z.string().optional(),
  portalThreadKey: z.string().optional(),
  canonicalListingUrl: z.string().optional(),
  relayEmail: z.string().optional(),
  replyToEmail: z.string().optional(),
  senderEmail: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  rentCold: z.number().optional(),
  rentWarm: z.number().optional(),
  sizeSqm: z.number().optional(),
  rooms: z.number().optional(),
  titleFingerprint: z.string().optional(),
  landlordNameHint: z.string().optional(),
  landlordEmailHint: z.string().optional(),
  confidence: z.number(),
}) satisfies z.ZodType<ExtractedMessageIdentity>

const SYSTEM_PROMPT = `Du extrahierst Identitätssignale aus wohnungsbezogenen Emails für ein späteres Matching zwischen Portal- und Vermieter-Mails.

Extrahiere möglichst stabile Referenzen:
- Portalname
- Portal-Listing-ID (z.B. ImmoScout-Exposé-Nr., Immowelt-ID, WG-Gesucht-ID etc.)
- Portal-Thread/Referenz
- kanonische Listing-URL (Portal-URL zum Inserat, Tracking-Parameter entfernen)
- Relay- oder Reply-To-Email
- direkte Absender-Mail
- Adresse
- Miete / Fläche / Zimmer
- titelartiger Fingerprint
- Vermieter-Hinweise

Regeln:
- WICHTIG: Extrahiere NUR Daten zum Hauptobjekt der Mail – das Objekt, um das es im Kontaktprozess tatsächlich geht (Kontaktanfrage, Antwort, Terminvereinbarung etc.).
- IGNORIERE Sektionen wie "Ähnliche Angebote", "Weitere Objekte", "Das könnte dich auch interessieren", "Passende Angebote" etc. Diese enthalten fremde Objekte, die nicht zum aktuellen Vorgang gehören.
- portalListingId und canonicalListingUrl sind besonders wichtige Matching-Signale. Extrahiere sie wenn möglich immer.
- Bei Portal-URLs: Tracking-Parameter (?utm_*, ?ref=, etc.) entfernen, aber die Objekt-ID in der URL beibehalten.
- confidence beschreibt, wie belastbar die Identitätssignale insgesamt sind.
- titleFingerprint soll kurz, stabil und normalisiert sein; kein Fließtext.
- Gib nur Felder aus, die plausibel erkennbar sind.
`

export async function extractMessageIdentity(
  adapter: AiProviderAdapter,
  input: {
    fromAddr: string
    fromName: string | null
    subject: string
    rawHeaders: Record<string, string | string[]>
    analysisText: string
  }
): Promise<{ result: ExtractedMessageIdentity; raw: unknown }> {
  const user = `Absender: ${input.fromName ?? ""} <${input.fromAddr}>
Betreff: ${input.subject}
Headers:
${JSON.stringify(input.rawHeaders, null, 2).slice(0, 4000)}

Kombinierter Inhalt:
${input.analysisText.slice(0, 16000)}`

  const { data, completion } = await adapter.generateJson({
    system: SYSTEM_PROMPT,
    user,
    schema: MessageIdentitySchema,
    schemaName: "message_identity_extraction",
  })

  return { result: data, raw: completion.raw }
}

export { MessageIdentitySchema }
