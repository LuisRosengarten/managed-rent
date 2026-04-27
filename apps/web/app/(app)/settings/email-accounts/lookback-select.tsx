"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"

type Props = {
  accountId: string
  value: number
  action: (fd: FormData) => Promise<{ ok?: boolean; error?: unknown }>
}

const OPTIONS: { label: string; value: number }[] = [
  { label: "Letzte 7 Tage", value: 7 },
  { label: "Letzte 14 Tage", value: 14 },
  { label: "Letzte 30 Tage", value: 30 },
  { label: "Letzte 60 Tage", value: 60 },
  { label: "Letzte 90 Tage", value: 90 },
  { label: "Letztes halbes Jahr", value: 180 },
  { label: "Letztes Jahr", value: 365 },
  { label: "Kein Limit", value: 0 },
]

export function LookbackSelect({ accountId, value, action }: Props) {
  const [pending, start] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value)
    const fd = new FormData()
    fd.set("id", accountId)
    fd.set("days", String(next))
    start(async () => {
      const res = await action(fd)
      if (res?.error) toast.error("Speichern fehlgeschlagen")
      else toast.success("Zeitraum aktualisiert")
    })
  }

  // Ensure current value exists in options (e.g. legacy value).
  const hasValue = OPTIONS.some((o) => o.value === value)

  return (
    <select
      aria-label="Analyse-Zeitraum"
      className={cn(
        "h-8 w-[160px] rounded-md border border-input bg-background px-2 text-xs ring-offset-background",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
      value={String(value)}
      onChange={onChange}
      disabled={pending}
    >
      {!hasValue && (
        <option value={String(value)}>{value} Tage</option>
      )}
      {OPTIONS.map((o) => (
        <option key={o.value} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
