"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { updateListingFields } from "@/app/actions"

export interface ListingData {
  listingId: string
  title: string
  addressRaw: string | null
  rentCold: number | null
  rentWarm: number | null
  sizeSqm: number | null
  rooms: number | null
  floor: string | null
  availableFrom: string | null
  sourceUrl: string | null
  landlordName: string | null
  landlordEmail: string | null
  landlordPhone: string | null
  landlordAgency: string | null
  manualOverrides: Record<string, boolean>
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  isOverridden,
}: {
  label: string
  name: string
  value: string
  onChange: (name: string, value: string) => void
  type?: "text" | "number"
  isOverridden: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={name}>{label}</Label>
        {isOverridden && (
          <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
            Manuell
          </Badge>
        )}
      </div>
      <Input
        id={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        step={type === "number" ? "any" : undefined}
      />
    </div>
  )
}

export function ListingEditor({ data }: { data: ListingData }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [fields, setFields] = useState(() => toFormState(data))

  function toFormState(d: ListingData) {
    return {
      title: d.title ?? "",
      addressRaw: d.addressRaw ?? "",
      rentCold: d.rentCold?.toString() ?? "",
      rentWarm: d.rentWarm?.toString() ?? "",
      sizeSqm: d.sizeSqm?.toString() ?? "",
      rooms: d.rooms?.toString() ?? "",
      floor: d.floor ?? "",
      availableFrom: d.availableFrom ?? "",
      sourceUrl: d.sourceUrl ?? "",
      landlordName: d.landlordName ?? "",
      landlordEmail: d.landlordEmail ?? "",
      landlordPhone: d.landlordPhone ?? "",
      landlordAgency: d.landlordAgency ?? "",
    }
  }

  function handleChange(name: string, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }))
  }

  function handleOpen() {
    setFields(toFormState(data))
    setOpen(true)
  }

  function handleSave() {
    startTransition(async () => {
      const update: Record<string, unknown> = {}
      const numFields = ["rentCold", "rentWarm", "sizeSqm", "rooms"] as const
      const strFields = [
        "title",
        "addressRaw",
        "floor",
        "availableFrom",
        "sourceUrl",
        "landlordName",
        "landlordEmail",
        "landlordPhone",
        "landlordAgency",
      ] as const

      for (const f of strFields) {
        const orig = data[f as keyof ListingData]
        const next = fields[f] || null
        if (next !== (orig ?? "")) {
          update[f] = next
        }
      }
      for (const f of numFields) {
        const orig = data[f as keyof ListingData] as number | null
        const next = fields[f] ? parseFloat(fields[f]) : null
        if (next !== orig) {
          update[f] = next
        }
      }

      if (Object.keys(update).length === 0) {
        setOpen(false)
        return
      }

      const res = await updateListingFields({
        listingId: data.listingId,
        fields: update,
      })
      if (res && "error" in res) {
        toast.error("Speichern fehlgeschlagen")
        return
      }
      toast.success("Objekt aktualisiert")
      setOpen(false)
      router.refresh()
    })
  }

  const ov = data.manualOverrides ?? {}

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={handleOpen}>
        <Pencil className="size-3.5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Objekt bearbeiten</SheetTitle>
            <SheetDescription>
              Manuell geänderte Felder werden nicht von der Pipeline überschrieben.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1 px-6">
            <div className="space-y-4 pb-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Objekt
              </div>
              <Field label="Titel" name="title" value={fields.title} onChange={handleChange} isOverridden={!!ov.title} />
              <Field label="Adresse" name="addressRaw" value={fields.addressRaw} onChange={handleChange} isOverridden={!!ov.addressRaw} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kaltmiete (€)" name="rentCold" value={fields.rentCold} onChange={handleChange} type="number" isOverridden={!!ov.rentCold} />
                <Field label="Warmmiete (€)" name="rentWarm" value={fields.rentWarm} onChange={handleChange} type="number" isOverridden={!!ov.rentWarm} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Größe (m²)" name="sizeSqm" value={fields.sizeSqm} onChange={handleChange} type="number" isOverridden={!!ov.sizeSqm} />
                <Field label="Zimmer" name="rooms" value={fields.rooms} onChange={handleChange} type="number" isOverridden={!!ov.rooms} />
              </div>
              <Field label="Etage" name="floor" value={fields.floor} onChange={handleChange} isOverridden={!!ov.floor} />
              <Field label="Frei ab" name="availableFrom" value={fields.availableFrom} onChange={handleChange} isOverridden={!!ov.availableFrom} />
              <Field label="Inserat-URL" name="sourceUrl" value={fields.sourceUrl} onChange={handleChange} isOverridden={!!ov.sourceUrl} />

              <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vermieter
              </div>
              <Field label="Name" name="landlordName" value={fields.landlordName} onChange={handleChange} isOverridden={!!ov.landlordName} />
              <Field label="Email" name="landlordEmail" value={fields.landlordEmail} onChange={handleChange} isOverridden={!!ov.landlordEmail} />
              <Field label="Telefon" name="landlordPhone" value={fields.landlordPhone} onChange={handleChange} isOverridden={!!ov.landlordPhone} />
              <Field label="Agentur" name="landlordAgency" value={fields.landlordAgency} onChange={handleChange} isOverridden={!!ov.landlordAgency} />
            </div>
          </ScrollArea>
          <SheetFooter>
            <SheetClose render={<Button variant="outline" />}>
              Abbrechen
            </SheetClose>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Speichere…" : "Speichern"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
