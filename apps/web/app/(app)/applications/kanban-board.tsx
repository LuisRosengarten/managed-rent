"use client"

import * as React from "react"
import Link from "next/link"
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { useDraggable } from "@dnd-kit/core"
import { toast } from "sonner"
import {
  MapPin,
  Euro,
  Ruler,
  DoorOpen,
  ExternalLink,
  GripVertical,
  Layers,
} from "lucide-react"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
  type ApplicationStatus,
} from "@workspace/core/status"
import { Card } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
// native overflow used instead of ScrollArea for reliable horizontal kanban scroll
import { cn } from "@workspace/ui/lib/utils"
import { updateApplicationStatus } from "@/app/actions"

export type KanbanItem = {
  id: string
  status: ApplicationStatus
  statusSource: "manual" | "ai"
  aiSuggestedStatus: ApplicationStatus | null
  listingId: string
  title: string
  rentCold: number | null
  rentWarm: number | null
  sizeSqm: number | null
  rooms: number | null
  city: string | null
  sourcePortal: string | null
  lastMessageAt: string | null
}

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  new: "bg-blue-500",
  contacted: "bg-amber-500",
  viewing_scheduled: "bg-purple-500",
  applied: "bg-cyan-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  withdrawn: "bg-zinc-400",
}

export function KanbanBoard({ items: initial }: { items: KanbanItem[] }) {
  const [items, setItems] = React.useState(initial)
  React.useEffect(() => setItems(initial), [initial])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as ApplicationStatus
    const itemId = String(active.id)
    const prev = items.find((i) => i.id === itemId)
    if (!prev || prev.status === newStatus) return

    setItems((curr) =>
      curr.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i))
    )

    const res = await updateApplicationStatus({
      id: itemId,
      status: newStatus,
    })
    if ("error" in res) {
      toast.error("Status-Update fehlgeschlagen")
      setItems(initial)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="min-w-0 overflow-x-auto pb-4">
        <div className="flex gap-4">
          {APPLICATION_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              items={items.filter((i) => i.status === status)}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function Column({
  status,
  items,
}: {
  status: ApplicationStatus
  items: KanbanItem[]
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] min-w-[280px] flex-col rounded-xl border border-border bg-muted/30 transition-colors",
        isOver && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className={cn("size-2 rounded-full", STATUS_COLORS[status])} />
        <h3 className="text-sm font-medium">
          {APPLICATION_STATUS_LABELS[status]}
        </h3>
        <Badge variant="outline" className="ml-auto text-xs tabular-nums">
          {items.length}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="size-6 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">
              Keine Einträge
            </p>
          </div>
        ) : (
          items.map((item) => <KanbanCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}

function KanbanCard({ item }: { item: KanbanItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id })

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : {}

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className={cn(
          "group cursor-grab bg-background p-0 transition-all hover:shadow-md active:cursor-grabbing",
          isDragging && "opacity-60 shadow-lg ring-2 ring-primary/20"
        )}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/applications/${item.id}`}
              onClick={(e) => e.stopPropagation()}
              className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary transition-colors"
            >
              {item.title}
            </Link>
            <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {item.city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" />
                {item.city}
              </span>
            )}
            {typeof item.rentWarm === "number" && (
              <span className="flex items-center gap-1">
                <Euro className="size-3" />
                {item.rentWarm}€
              </span>
            )}
            {typeof item.rentCold === "number" &&
              typeof item.rentWarm !== "number" && (
                <span className="flex items-center gap-1">
                  <Euro className="size-3" />
                  {item.rentCold}€ kalt
                </span>
              )}
            {typeof item.sizeSqm === "number" && (
              <span className="flex items-center gap-1">
                <Ruler className="size-3" />
                {item.sizeSqm}m²
              </span>
            )}
            {typeof item.rooms === "number" && (
              <span className="flex items-center gap-1">
                <DoorOpen className="size-3" />
                {item.rooms} Zi.
              </span>
            )}
          </div>

          {item.sourcePortal && (
            <div className="mt-2">
              <Badge variant="outline" className="text-[10px] font-normal">
                <ExternalLink className="mr-1 size-2.5" />
                {item.sourcePortal}
              </Badge>
            </div>
          )}

          {item.statusSource === "ai" && item.aiSuggestedStatus && (
            <div className="mt-2">
              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
                KI-Vorschlag
              </Badge>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
