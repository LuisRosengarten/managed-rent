"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Textarea } from "@workspace/ui/components/textarea"
import { updateApplicationNotes } from "@/app/actions"

export function NotesEditor({
  id,
  initial,
}: {
  id: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [isPending, startTransition] = useTransition()

  function save() {
    if (value === saved) return
    startTransition(async () => {
      const res = await updateApplicationNotes({ id, notes: value })
      if ("error" in res) {
        toast.error("Speichern fehlgeschlagen")
        return
      }
      setSaved(value)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={5}
        placeholder="Interne Notizen …"
        disabled={isPending}
      />
      <p className="text-muted-foreground text-xs">
        {isPending
          ? "Speichere…"
          : value === saved
            ? "Gespeichert"
            : "Ungespeichert — klick außerhalb zum Speichern"}
      </p>
    </div>
  )
}
