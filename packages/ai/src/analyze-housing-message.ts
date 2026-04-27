import { z } from "zod"
import { APPLICATION_STATUSES } from "@workspace/core/status"
import type { ListingData, WorkflowAnalysisResult } from "@workspace/core/types"
import type { AiProviderAdapter } from "./providers/types.ts"

const ListingDataSchema = z.object({
  title: z.string().optional(),
  addressRaw: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  sizeSqm: z.number().optional(),
  rooms: z.number().optional(),
  rentCold: z.number().optional(),
  rentWarm: z.number().optional(),
  landlordName: z.string().optional(),
  landlordEmail: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourcePortal: z.string().optional(),
}) satisfies z.ZodType<ListingData>

const WorkflowAnalysisSchema = z.object({
  listingData: ListingDataSchema,
  statusSuggestion: z.object({
    suggestedStatus: z.enum(APPLICATION_STATUSES),
    reasoning: z.string(),
  }),
}) satisfies z.ZodType<WorkflowAnalysisResult>

const SYSTEM_PROMPT = `Du analysierst wohnungsbezogene Emails innerhalb eines bereits relevanten Kontaktprozesses.

Ziele:
1. Extrahiere strukturierte Objektdaten zum HAUPTOBJEKT der Mail.
2. Schlage den passenden Bewerbungsstatus vor.

Regeln:
- Kein Matching raten. Das Matching macht die Pipeline separat.
- Extrahiere nur Informationen, die im kombinierten Mail-/Portalinhalt plausibel erkennbar sind.
- WICHTIG: Extrahiere NUR Daten zum Hauptobjekt – das Objekt, um das es im Kontaktprozess geht. IGNORIERE Sektionen wie "Ähnliche Angebote", "Weitere Objekte", "Das könnte dich auch interessieren" etc.
- title muss aussagekräftig sein. Reiner Mail-Betreff ist nur letzter Fallback.
- Beträge nur als Zahl ohne Währungssymbol.
- Status-Hinweise:
  - new: erstes Auftauchen eines aktiven Vorgangs
  - contacted: Kontaktanfrage gesendet/bestätigt, Portal bestätigt Weiterleitung, Vermieter/Portal antwortet allgemein, meldet Eingang, fragt nach Infos oder Unterlagen. WICHTIG: Eine Portal-Bestätigung einer Kontaktanfrage ("Ihre Anfrage wurde gesendet", "Kontaktanfrage erfolgreich", "Nachricht wurde weitergeleitet") ist IMMER "contacted", NIEMALS "applied".
  - viewing_scheduled: Terminangebot, Terminbestätigung, Besichtigung
  - applied: NUR wenn eine formelle Bewerbung mit Bewerbungsunterlagen (Selbstauskunft, Schufa, Gehaltsnachweise, Bewerbungsmappe) explizit eingereicht oder angefordert wurde. Eine einfache Kontaktanfrage oder Nachricht an den Vermieter ist KEINE Bewerbung.
  - accepted: explizite Zusage / Vertragsangebot
  - rejected: Absage, bereits vergeben, kein Interesse
  - withdrawn: Nutzer hat selbst zurückgezogen
`

export async function analyzeHousingMessage(
  adapter: AiProviderAdapter,
  input: {
    fromAddr: string
    fromName: string | null
    subject: string
    category: string
    analysisText: string
  }
): Promise<{ result: WorkflowAnalysisResult; raw: unknown }> {
  const user = `Absender: ${input.fromName ?? ""} <${input.fromAddr}>
Betreff: ${input.subject}
Kategorie: ${input.category}

Kombinierter Inhalt:
${input.analysisText.slice(0, 16000)}`

  const { data, completion } = await adapter.generateJson({
    system: SYSTEM_PROMPT,
    user,
    schema: WorkflowAnalysisSchema,
    schemaName: "workflow_message_analysis",
  })

  return { result: data, raw: completion.raw }
}

export { WorkflowAnalysisSchema, ListingDataSchema }
