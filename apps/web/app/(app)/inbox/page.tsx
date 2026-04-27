import { and, desc, eq } from "drizzle-orm"
import Link from "next/link"
import { Inbox as InboxIcon, MailOpen, ShieldAlert, Link2 } from "lucide-react"
import {
  application,
  applicationMessage,
  classification,
  db,
  emailAccount,
  listing,
  message,
  messageMatchReview,
} from "@workspace/db"
import { Card } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { acceptMatchReview, rejectMatchReview } from "@/app/actions"
import { requireSession } from "@/lib/session"
import { AssignButton } from "./assign-button"

export const dynamic = "force-dynamic"

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  const session = await requireSession()

  const rows = await db()
    .select({
      id: message.id,
      subject: message.subject,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      receivedAt: message.receivedAt,
      category: classification.category,
      isRentalRelevant: classification.isRentalRelevant,
      ignoreReason: message.ignoreReason,
      extractionStatus: message.extractionStatus,
      accountEmail: emailAccount.email,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .leftJoin(classification, eq(classification.messageId, message.id))
    .where(
      and(
        eq(emailAccount.userId, session.user.id),
        filter === "all"
          ? undefined
          : eq(classification.isRentalRelevant, true)
      )
    )
    .orderBy(desc(message.receivedAt))
    .limit(200)

  const appLinks = await db()
    .select({
      messageId: applicationMessage.messageId,
      applicationId: applicationMessage.applicationId,
    })
    .from(applicationMessage)
    .innerJoin(application, eq(application.id, applicationMessage.applicationId))
    .where(eq(application.userId, session.user.id))
  const byMsg = new Map(appLinks.map((l) => [l.messageId, l.applicationId]))

  const reviewRows = await db()
    .select({
      id: messageMatchReview.id,
      messageId: message.id,
      score: messageMatchReview.score,
      reasons: messageMatchReview.reasons,
      subject: message.subject,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      receivedAt: message.receivedAt,
      listingId: listing.id,
      listingTitle: listing.title,
      sourcePortal: listing.sourcePortal,
      applicationId: application.id,
      listingAddress: listing.addressNormalized,
    })
    .from(messageMatchReview)
    .innerJoin(message, eq(message.id, messageMatchReview.messageId))
    .innerJoin(listing, eq(listing.id, messageMatchReview.candidateListingId))
    .leftJoin(application, eq(application.id, messageMatchReview.candidateApplicationId))
    .where(
      and(
        eq(messageMatchReview.userId, session.user.id),
        eq(messageMatchReview.status, "pending")
      )
    )
    .orderBy(desc(message.receivedAt))

  const isAll = filter === "all"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground mt-1">
            {isAll ? "Alle synchronisierten Mails" : "Wohnungsrelevante Mails"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Link href="/inbox">
            <Button
              variant={!isAll ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
            >
              Relevant
            </Button>
          </Link>
          <Link href="/inbox?filter=all">
            <Button
              variant={isAll ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
            >
              Alle
            </Button>
          </Link>
        </div>
      </div>

      {reviewRows.length > 0 && (
        <Card className="overflow-hidden border-amber-200 bg-amber-50/60 p-0">
          <div className="border-b border-amber-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-700" />
              <h2 className="text-sm font-semibold text-amber-950">
                Matching prüfen
              </h2>
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                {reviewRows.length}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-amber-900/80">
              Diese Mails haben einen plausiblen Objekt-Treffer, aber die Pipeline verknüpft sie absichtlich nicht automatisch.
            </p>
          </div>
          <div className="divide-y divide-amber-200/80">
            {reviewRows.map((review) => {
              const address = [
                review.listingAddress?.street,
                review.listingAddress?.zip,
                review.listingAddress?.city,
              ]
                .filter(Boolean)
                .join(", ")
              return (
                <div key={review.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.3fr_1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-amber-300 text-amber-900">
                        Score {Math.round(review.score * 100)}%
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {review.fromName ?? review.fromAddr}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {review.receivedAt.toLocaleString("de-DE")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {review.subject || "(kein Betreff)"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {review.reasons.map((reason) => (
                        <Badge key={reason} variant="outline" className="text-[10px]">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl border border-amber-200 bg-background/70 p-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-amber-700">
                      <Link2 className="size-3.5" />
                      Kandidat
                    </div>
                    <p className="mt-2 text-sm font-semibold">
                      {review.listingTitle || "(ohne Titel)"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {address || "Adresse unbekannt"}
                    </p>
                    {review.sourcePortal && (
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {review.sourcePortal}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 md:flex-col md:items-end">
                    <form action={acceptMatchReview}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <Button size="sm">Zuordnen</Button>
                    </form>
                    <form action={rejectMatchReview}>
                      <input type="hidden" name="reviewId" value={review.id} />
                      <Button size="sm" variant="outline">
                        Nicht zuordnen
                      </Button>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4">
            <InboxIcon className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Keine Mails</h3>
          <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
            Verbinde einen Email-Account in den Einstellungen, um Mails zu synchronisieren.
          </p>
          <Link href="/settings/email-accounts" className="mt-4">
            <Button variant="outline" size="sm">
              Account verbinden
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {rows.map((r) => {
              const applicationId = byMsg.get(r.id)
              const isUnassigned = r.extractionStatus === "unassigned"
              const isIgnoredPreContact =
                r.ignoreReason === "pre_contact_portal_listing"
              const content = (
                <>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <MailOpen className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {r.fromName ?? r.fromAddr}
                      </span>
                      {r.category && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {r.category}
                        </Badge>
                      )}
                      {isUnassigned && (
                        <Badge className="shrink-0 bg-amber-100 text-amber-900 hover:bg-amber-100">
                          Nicht zugeordnet
                        </Badge>
                      )}
                      {isIgnoredPreContact && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          Ignoriert: Vor Kontakt
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.subject || "(kein Betreff)"}
                    </p>
                  </div>
                  <time
                    dateTime={r.receivedAt.toISOString()}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {r.receivedAt.toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </>
              )

              return applicationId ? (
                <Link
                  key={r.id}
                  href={`/applications/${applicationId}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
                >
                  {content}
                </Link>
              ) : (
                <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 opacity-95">
                  {content}
                  {(isUnassigned || r.extractionStatus === "pending" || r.extractionStatus === "failed") && (
                    <AssignButton messageId={r.id} />
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
