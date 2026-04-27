import { and, asc, eq, inArray } from "drizzle-orm"
import { notFound } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Building2,
  Calendar,
  ExternalLink,
  Mail,
  MapPin,
  Paperclip,
  User as UserIcon,
} from "lucide-react"
import {
  application,
  applicationMessage,
  attachment,
  classification,
  db,
  emailAccount,
  listing,
  message,
} from "@workspace/db"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from "@workspace/core/status"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { requireSession } from "@/lib/session"
import { StatusSelect } from "./status-select"
import { NotesEditor } from "./notes-editor"
import { ListingEditor } from "./listing-editor"
import { MessageActions } from "./message-actions"

export const dynamic = "force-dynamic"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()

  const [row] = await db()
    .select({
      id: application.id,
      status: application.status,
      statusSource: application.statusSource,
      aiSuggestedStatus: application.aiSuggestedStatus,
      aiSuggestedReason: application.aiSuggestedReason,
      aiSuggestedAt: application.aiSuggestedAt,
      notes: application.notes,
      viewingAt: application.viewingAt,
      lastMessageAt: application.lastMessageAt,
      createdAt: application.createdAt,
      listingId: listing.id,
      title: listing.title,
      addressRaw: listing.addressRaw,
      addressNormalized: listing.addressNormalized,
      rentCold: listing.rentCold,
      rentWarm: listing.rentWarm,
      sizeSqm: listing.sizeSqm,
      rooms: listing.rooms,
      floor: listing.floor,
      availableFrom: listing.availableFrom,
      description: listing.description,
      sourceUrl: listing.sourceUrl,
      sourcePortal: listing.sourcePortal,
      landlordName: listing.landlordName,
      landlordEmail: listing.landlordEmail,
      landlordContact: listing.landlordContact,
      manualOverrides: listing.manualOverrides,
    })
    .from(application)
    .innerJoin(listing, eq(listing.id, application.listingId))
    .where(
      and(eq(application.id, id), eq(application.userId, session.user.id))
    )
    .limit(1)

  if (!row) notFound()

  const messages = await db()
    .select({
      id: message.id,
      subject: message.subject,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      receivedAt: message.receivedAt,
      bodyText: message.bodyText,
      accountEmail: emailAccount.email,
      category: classification.category,
    })
    .from(applicationMessage)
    .innerJoin(message, eq(message.id, applicationMessage.messageId))
    .innerJoin(emailAccount, eq(emailAccount.id, message.emailAccountId))
    .leftJoin(classification, eq(classification.messageId, message.id))
    .where(eq(applicationMessage.applicationId, id))
    .orderBy(asc(message.receivedAt))

  const msgIds = messages.map((m) => m.id)
  const allAttachments = msgIds.length
    ? await db()
        .select()
        .from(attachment)
        .where(inArray(attachment.messageId, msgIds))
    : []
  const attsByMsg = new Map<string, typeof allAttachments>()
  for (const a of allAttachments) {
    const list = attsByMsg.get(a.messageId) ?? []
    list.push(a)
    attsByMsg.set(a.messageId, list)
  }

  const addr = row.addressNormalized ?? null
  const addrDisplay =
    [addr?.street, addr?.zip, addr?.city].filter(Boolean).join(", ") ||
    row.addressRaw ||
    "Adresse unbekannt"

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Bewerbungen
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {row.title || "(ohne Titel)"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-3.5" />
            {addrDisplay}
            {row.statusSource === "ai" && (
              <Badge className="ml-1 bg-amber-100 text-amber-900 hover:bg-amber-100">
                KI-Vorschlag aktiv
              </Badge>
            )}
          </div>
        </div>
        <StatusSelect
          id={row.id}
          current={row.status}
          options={APPLICATION_STATUSES.map((s) => ({
            value: s,
            label: APPLICATION_STATUS_LABELS[s],
          }))}
        />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickStat
          label="Warmmiete"
          value={row.rentWarm ? `${row.rentWarm.toLocaleString("de-DE")} €` : "—"}
        />
        <QuickStat
          label="Kaltmiete"
          value={row.rentCold ? `${row.rentCold.toLocaleString("de-DE")} €` : "—"}
        />
        <QuickStat
          label="Größe"
          value={row.sizeSqm ? `${row.sizeSqm} m²` : "—"}
        />
        <QuickStat
          label="Zimmer"
          value={row.rooms ? `${row.rooms} Zimmer` : "—"}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="messages">
            Mails ({messages.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notizen</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Property details */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <CardTitle className="text-base">Objekt</CardTitle>
                  </div>
                  <ListingEditor
                    data={{
                      listingId: row.listingId,
                      title: row.title,
                      addressRaw: row.addressRaw,
                      rentCold: row.rentCold,
                      rentWarm: row.rentWarm,
                      sizeSqm: row.sizeSqm,
                      rooms: row.rooms,
                      floor: row.floor,
                      availableFrom: row.availableFrom,
                      sourceUrl: row.sourceUrl,
                      landlordName: row.landlordName,
                      landlordEmail: row.landlordEmail ?? row.landlordContact?.email ?? null,
                      landlordPhone: row.landlordContact?.phone ?? null,
                      landlordAgency: row.landlordContact?.agency ?? null,
                      manualOverrides: row.manualOverrides ?? {},
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <DetailRow label="Etage" value={row.floor ?? "—"} />
                  <DetailRow label="Frei ab" value={row.availableFrom ?? "—"} />
                  <DetailRow label="Portal" value={row.sourcePortal ?? "—"} />
                  <DetailRow
                    label="URL"
                    value={
                      row.sourceUrl ? (
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Original
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                </dl>
              </CardContent>
            </Card>

            {/* Landlord */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <UserIcon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">Vermieter</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <DetailRow label="Name" value={row.landlordName ?? "—"} />
                  <DetailRow
                    label="Email"
                    value={
                      row.landlordContact?.email ? (
                        <a
                          href={`mailto:${row.landlordContact.email}`}
                          className="text-primary hover:underline"
                        >
                          {row.landlordContact.email}
                        </a>
                      ) : row.landlordEmail ? (
                        <a
                          href={`mailto:${row.landlordEmail}`}
                          className="text-primary hover:underline"
                        >
                          {row.landlordEmail}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Telefon"
                    value={
                      row.landlordContact?.phone ? (
                        <a
                          href={`tel:${row.landlordContact.phone}`}
                          className="text-primary hover:underline"
                        >
                          {row.landlordContact.phone}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Agentur"
                    value={row.landlordContact?.agency ?? "—"}
                  />
                </dl>
              </CardContent>
            </Card>

            {/* Meta */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">Meta</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="mt-1">
                      <Badge>{APPLICATION_STATUS_LABELS[row.status]}</Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Statusquelle</span>
                    <div className="mt-1 font-medium">
                      {row.statusSource === "ai" ? "KI" : "Manuell"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Erstellt</span>
                    <div className="mt-1 font-medium">
                      {row.createdAt.toLocaleString("de-DE")}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Letzte Mail</span>
                    <div className="mt-1 font-medium">
                      {row.lastMessageAt?.toLocaleString("de-DE") ?? "—"}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mails</span>
                    <div className="mt-1 font-medium">{messages.length}</div>
                  </div>
                </div>
                {(row.aiSuggestedStatus || row.aiSuggestedReason) && (
                  <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm">
                    <div className="font-medium text-amber-950">KI-Vorschlag</div>
                    <div className="mt-1 text-amber-900">
                      {row.aiSuggestedStatus
                        ? APPLICATION_STATUS_LABELS[row.aiSuggestedStatus]
                        : "Kein Status"}
                    </div>
                    {row.aiSuggestedReason && (
                      <p className="mt-2 text-amber-900/90">{row.aiSuggestedReason}</p>
                    )}
                    {row.statusSource === "manual" &&
                      row.aiSuggestedStatus &&
                      row.aiSuggestedStatus !== row.status && (
                        <p className="mt-2 text-amber-950">
                          Manuelle Führung überschreibt aktuell den KI-Vorschlag.
                        </p>
                      )}
                    {row.aiSuggestedAt && (
                      <p className="mt-2 text-xs text-amber-900/80">
                        Aktualisiert: {row.aiSuggestedAt.toLocaleString("de-DE")}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {row.description && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {row.description}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mail-Thread</CardTitle>
              <CardDescription>
                {messages.length} verknüpfte Mail{messages.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Mail className="size-8 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Noch keine Mails verknüpft.
                  </p>
                </div>
              ) : (
                <div className="space-y-0">
                  {messages.map((m, i) => (
                    <div key={m.id}>
                      {i > 0 && <Separator className="my-4" />}
                      <div className="flex items-start gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted mt-0.5">
                          <Mail className="size-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">
                                {m.fromName ?? m.fromAddr}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {m.fromAddr} → {m.accountEmail}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-start gap-1">
                              <div className="flex flex-col items-end gap-1">
                                {m.category && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {m.category}
                                  </Badge>
                                )}
                                <time className="text-xs text-muted-foreground">
                                  {m.receivedAt.toLocaleString("de-DE")}
                                </time>
                              </div>
                              <MessageActions
                                messageId={m.id}
                                applicationId={id}
                              />
                            </div>
                          </div>
                          <div className="mt-1 text-sm font-medium">
                            {m.subject || "(kein Betreff)"}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-muted-foreground">
                            {m.bodyText.slice(0, 1200)}
                            {m.bodyText.length > 1200 ? "…" : ""}
                          </p>
                          {(() => {
                            const atts = attsByMsg.get(m.id) ?? []
                            return atts.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {atts.map((a) => (
                                  <a
                                    key={a.id}
                                    href={a.uploadthingUrl ?? "#"}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                    >
                                      <Paperclip className="mr-1 size-3" />
                                      {a.filename}
                                    </Button>
                                  </a>
                                ))}
                              </div>
                            ) : null
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notizen</CardTitle>
              <CardDescription>
                Eigene Notizen zu dieser Bewerbung. Werden automatisch beim Verlassen gespeichert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotesEditor id={row.id} initial={row.notes ?? ""} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
