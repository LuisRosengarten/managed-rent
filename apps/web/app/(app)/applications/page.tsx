import { desc, eq } from "drizzle-orm"
import { application, db, listing } from "@workspace/db"
import { requireSession } from "@/lib/session"
import { KanbanBoard } from "./kanban-board"

export const dynamic = "force-dynamic"

export default async function ApplicationsPage() {
  const session = await requireSession()

  const rows = await db()
    .select({
      id: application.id,
      status: application.status,
      statusSource: application.statusSource,
      aiSuggestedStatus: application.aiSuggestedStatus,
      listingId: application.listingId,
      title: listing.title,
      rentCold: listing.rentCold,
      rentWarm: listing.rentWarm,
      sizeSqm: listing.sizeSqm,
      rooms: listing.rooms,
      city: listing.addressNormalized,
      sourcePortal: listing.sourcePortal,
      lastMessageAt: application.lastMessageAt,
    })
    .from(application)
    .innerJoin(listing, eq(listing.id, application.listingId))
    .where(eq(application.userId, session.user.id))
    .orderBy(desc(application.lastMessageAt))

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bewerbungen</h1>
        <p className="text-muted-foreground mt-1">
          Ziehe Karten zwischen Spalten, um den Status zu ändern.
        </p>
      </div>
      <KanbanBoard
        items={rows.map((r) => ({
          id: r.id,
          status: r.status,
          statusSource: r.statusSource,
          aiSuggestedStatus: r.aiSuggestedStatus,
          listingId: r.listingId,
          title: r.title || "(ohne Titel)",
          rentCold: r.rentCold,
          rentWarm: r.rentWarm,
          sizeSqm: r.sizeSqm,
          rooms: r.rooms,
          city: r.city?.city ?? null,
          sourcePortal: r.sourcePortal,
          lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
