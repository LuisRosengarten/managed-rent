"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Search } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@workspace/ui/components/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  assignMessageToListing,
  reassignMessage,
  getUserListings,
} from "@/app/actions"

type ListingRow = Awaited<ReturnType<typeof getUserListings>>[number]

export function AssignMessageSheet({
  messageId,
  open,
  onOpenChange,
  fromApplicationId,
}: {
  messageId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, performs a reassign instead of assign */
  fromApplicationId?: string
}) {
  const router = useRouter()
  const [listings, setListings] = useState<ListingRow[]>([])
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSearch("")
    getUserListings()
      .then(setListings)
      .finally(() => setLoading(false))
  }, [open])

  const filtered = listings.filter((l) => {
    if (!search) return true
    const q = search.toLowerCase()
    const addr = l.addressNormalized
    const searchable = [
      l.title,
      l.addressRaw,
      addr?.street,
      addr?.city,
      addr?.zip,
      l.sourcePortal,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return searchable.includes(q)
  })

  function handleSelect(listingId: string) {
    startTransition(async () => {
      let res
      if (fromApplicationId) {
        res = await reassignMessage({
          messageId,
          fromApplicationId,
          toListingId: listingId,
        })
      } else {
        res = await assignMessageToListing({ messageId, listingId })
      }
      if (res && "error" in res) {
        toast.error(
          fromApplicationId
            ? "Neuzuordnung fehlgeschlagen"
            : "Zuordnung fehlgeschlagen"
        )
        return
      }
      toast.success(
        fromApplicationId ? "Mail neu zugeordnet" : "Mail zugeordnet"
      )
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {fromApplicationId ? "Mail neu zuordnen" : "Mail zuordnen"}
          </SheetTitle>
          <SheetDescription>Objekt auswählen</SheetDescription>
        </SheetHeader>
        <div className="px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Objekt suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <ScrollArea className="flex-1 px-6">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Lade Objekte…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine Objekte gefunden
            </p>
          ) : (
            <div className="space-y-2 pb-6">
              {filtered.map((l) => {
                const addr = l.addressNormalized
                const addrStr =
                  [addr?.street, addr?.zip, addr?.city]
                    .filter(Boolean)
                    .join(", ") ||
                  l.addressRaw ||
                  "Adresse unbekannt"
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSelect(l.id)}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium">
                      {l.title || "(ohne Titel)"}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {addrStr}
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      {l.rentWarm && (
                        <Badge variant="outline" className="text-[10px]">
                          {l.rentWarm.toLocaleString("de-DE")} €
                        </Badge>
                      )}
                      {l.rooms && (
                        <Badge variant="outline" className="text-[10px]">
                          {l.rooms} Zimmer
                        </Badge>
                      )}
                      {l.sourcePortal && (
                        <Badge variant="outline" className="text-[10px]">
                          {l.sourcePortal}
                        </Badge>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
