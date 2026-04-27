"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { type ApplicationStatus } from "@workspace/core/status"
import { cn } from "@workspace/ui/lib/utils"
import { updateApplicationStatus } from "@/app/actions"

export function StatusSelect({
  id,
  current,
  options,
}: {
  id: string
  current: ApplicationStatus
  options: { value: ApplicationStatus; label: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <select
      className={cn(
        "h-9 max-w-[200px] rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50"
      )}
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as ApplicationStatus
        if (next === current) return
        startTransition(async () => {
          const res = await updateApplicationStatus({ id, status: next })
          if ("error" in res) {
            toast.error("Status-Update fehlgeschlagen")
            return
          }
          router.refresh()
        })
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
