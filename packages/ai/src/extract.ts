import { z } from "zod"
import type { AiProviderAdapter } from "./providers/types.ts"
import {
  getRecentCorrections,
  formatFieldCorrectionsForPrompt,
} from "./correction-context.ts"

const ExtractionSchema = z.object({
  title: z.string(),
  addressRaw: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  rentCold: z.number().optional(),
  rentWarm: z.number().optional(),
  sizeSqm: z.number().optional(),
  rooms: z.number().optional(),
  floor: z.string().optional(),
  availableFrom: z.string().optional(),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourcePortal: z.string().optional(),
  landlordName: z.string().optional(),
  landlordEmail: z.string().optional(),
  landlordPhone: z.string().optional(),
  landlordAgency: z.string().optional(),
})

export type ExtractionResult = z.infer<typeof ExtractionSchema>

const SYSTEM_PROMPT = `Du extrahierst strukturierte Daten aus einer wohnungsbezogenen Email.
Fülle nur Felder aus, die in der Email klar erkennbar sind.
- Beträge ohne Währungs-Suffix, als Zahl (z.B. 850 statt "850 €").
- Adresse: straße, PLZ, Stadt, Stadtteil getrennt.
- sourcePortal: "ImmoScout24", "Immowelt", "WG-Gesucht", "Kleinanzeigen", "Immonet", "Direkt" etc.
- title: kurze Beschreibung (Objektname oder Betreff-Kurzform).
- sourceUrl: falls URL zur Original-Anzeige vorhanden.
- availableFrom: als ISO-Datum (YYYY-MM-DD) wenn datierbar, sonst freitext.
Lass Felder weg, wenn die Info fehlt.`

export async function extractListing(
  adapter: AiProviderAdapter,
  input: {
    fromAddr: string
    fromName: string | null
    subject: string
    bodyText: string
    userId?: string
  }
): Promise<{ result: ExtractionResult; raw: unknown }> {
  const truncatedBody = input.bodyText.slice(0, 8000)
  const user = `Absender: ${input.fromName ?? ""} <${input.fromAddr}>
Betreff: ${input.subject}

Body:
${truncatedBody}`

  // Enrich system prompt with user correction patterns (F3)
  let system = SYSTEM_PROMPT
  if (input.userId) {
    try {
      const corrections = await getRecentCorrections(
        input.userId,
        ["listing_field_edit"],
        5
      )
      system += formatFieldCorrectionsForPrompt(corrections)
    } catch {
      // Non-critical: proceed without corrections
    }
  }

  const { data, completion } = await adapter.generateJson({
    system,
    user,
    schema: ExtractionSchema,
    schemaName: "listing_extraction",
  })

  return { result: data, raw: completion.raw }
}

export { ExtractionSchema }
