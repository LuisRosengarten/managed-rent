import { and, desc, eq, gte, sql } from "drizzle-orm"
import {
  ArrowRight,
  Building2,
  Inbox,
  Mail,
  TrendingUp,
} from "lucide-react"
import {
  application,
  classification,
  db,
  emailAccount,
  listing,
  message,
} from "@workspace/db"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@workspace/core/status"
import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import Link from "next/link"
import { requireSession } from "@/lib/session"
import { PipelineChart } from "./pipeline-chart"
import { MailActivityChart } from "./mail-activity-chart"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await requireSession()
  const userId = session.user.id

  // ── Queries ──

  const [messageCount] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .where(eq(emailAccount.userId, userId))

  const [relevantCount] = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .innerJoin(classification, eq(classification.messageId, message.id))
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(classification.isRentalRelevant, true)
      )
    )

  const statusCounts = await db()
    .select({
      status: application.status,
      count: sql<number>`count(*)::int`,
    })
    .from(application)
    .where(eq(application.userId, userId))
    .groupBy(application.status)

  const recentApplications = await db()
    .select({
      id: application.id,
      status: application.status,
      listingTitle: listing.title,
      address: listing.addressNormalized,
      rentCold: listing.rentCold,
      rentWarm: listing.rentWarm,
      sizeSqm: listing.sizeSqm,
      rooms: listing.rooms,
      floor: listing.floor,
      availableFrom: listing.availableFrom,
      landlordName: listing.landlordName,
      lastMessageAt: application.lastMessageAt,
    })
    .from(application)
    .innerJoin(listing, eq(listing.id, application.listingId))
    .where(eq(application.userId, userId))
    .orderBy(desc(application.lastMessageAt))
    .limit(6)

  // Mails per day (last 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)
  const mailsPerDay = await db()
    .select({
      day: sql<string>`to_char(${message.receivedAt}, 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      relevant: sql<number>`count(${classification.messageId}) filter (where ${classification.isRentalRelevant} = true)::int`,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .leftJoin(classification, eq(classification.messageId, message.id))
    .where(
      and(
        eq(emailAccount.userId, userId),
        gte(message.receivedAt, fourteenDaysAgo)
      )
    )
    .groupBy(sql`to_char(${message.receivedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${message.receivedAt}, 'YYYY-MM-DD')`)

  // Build full 14-day series (fill gaps with 0)
  const dayMap = Object.fromEntries(mailsPerDay.map((d) => [d.day, d]))
  const activityData: { day: string; label: string; total: number; relevant: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
    const entry = dayMap[key]
    activityData.push({
      day: key,
      label,
      total: entry?.total ?? 0,
      relevant: entry?.relevant ?? 0,
    })
  }

  const totalApplications = statusCounts.reduce((acc, s) => acc + s.count, 0)
  const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s.count]))

  const pipelineData = APPLICATION_STATUSES.map((status) => ({
    status,
    label: APPLICATION_STATUS_LABELS[status],
    count: statusMap[status] ?? 0,
  }))

  const stats = [
    { value: messageCount?.count ?? 0, label: "Mails", icon: Mail },
    { value: relevantCount?.count ?? 0, label: "Relevant", icon: TrendingUp },
    { value: totalApplications, label: "Bewerbungen", icon: Building2 },
  ]

  const STATUS_DOT_COLORS: Record<ApplicationStatus, string> = {
    new: "bg-blue-500",
    contacted: "bg-amber-500",
    viewing_scheduled: "bg-purple-500",
    applied: "bg-cyan-500",
    accepted: "bg-emerald-500",
    rejected: "bg-red-500",
    withdrawn: "bg-zinc-400",
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Willkommen, {session.user.name?.split(" ")[0] ?? "zurück"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Dein Überblick auf einen Blick.
          </p>
        </div>
        <div className="flex items-center gap-8">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                <s.icon className="size-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums leading-none">
                  {s.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 1: Charts ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* Pipeline donut */}
        <div className="col-span-2 rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Pipeline</h2>
            <Link
              href="/applications"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Kanban →
            </Link>
          </div>
          <PipelineChart data={pipelineData} total={totalApplications} />
        </div>

        {/* Mail activity area chart */}
        <div className="col-span-3 rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Mail-Aktivität</h2>
            <span className="text-xs text-muted-foreground">Letzte 14 Tage</span>
          </div>
          <MailActivityChart data={activityData} />
        </div>
      </div>

      {/* ── Row 2: Recent objects ── */}
      <div className="min-h-0 flex-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Neueste Objekte</h2>
        </div>
        {recentApplications.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-12 text-center">
            <Inbox className="size-5 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Noch keine Objekte vorhanden.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {recentApplications.map((r) => (
                <Link
                  key={r.id}
                  href={`/applications/${r.id}`}
                  className="flex w-[280px] flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
                >
                  {/* Header: Status + Date */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`size-2 shrink-0 rounded-full ${STATUS_DOT_COLORS[r.status]}`}
                      />
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {APPLICATION_STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    {r.lastMessageAt && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {r.lastMessageAt.toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <p className="truncate text-sm font-medium leading-tight">
                    {r.listingTitle || "(ohne Titel)"}
                  </p>

                  {/* Address */}
                  {r.address && (r.address.street || r.address.city) && (
                    <div className="text-xs text-muted-foreground">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Adresse</span>
                      <p className="mt-0.5 truncate">
                        {[r.address.street, [r.address.zip, r.address.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {typeof r.rentWarm === "number" && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Warmmiete</span>
                        <p className="tabular-nums font-medium">{r.rentWarm} €</p>
                      </div>
                    )}
                    {typeof r.rentCold === "number" && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Kaltmiete</span>
                        <p className="tabular-nums font-medium">{r.rentCold} €</p>
                      </div>
                    )}
                    {typeof r.sizeSqm === "number" && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Fläche</span>
                        <p className="tabular-nums font-medium">{r.sizeSqm} m²</p>
                      </div>
                    )}
                    {typeof r.rooms === "number" && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Zimmer</span>
                        <p className="tabular-nums font-medium">{r.rooms}</p>
                      </div>
                    )}
                    {r.floor && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Etage</span>
                        <p className="font-medium">{r.floor}</p>
                      </div>
                    )}
                    {r.availableFrom && (
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Verfügbar</span>
                        <p className="font-medium">{r.availableFrom}</p>
                      </div>
                    )}
                  </div>

                  {/* Landlord */}
                  {r.landlordName && (
                    <div className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Vermieter</span>
                      <p className="mt-0.5 truncate">{r.landlordName}</p>
                    </div>
                  )}
                </Link>
              ))}
            </div>

            {/* CTA button */}
            {totalApplications > 6 && (
              <div className="mt-4 flex justify-center">
                <Link
                  href="/applications"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Alle {totalApplications} Objekte anzeigen
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
