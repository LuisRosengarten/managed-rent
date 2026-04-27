"use client"

import { useTransition } from "react"
import { CheckCircle2, Loader2, Zap } from "lucide-react"
import { toast } from "sonner"
import type { AiProvider } from "@workspace/core/status"
import { Button } from "@workspace/ui/components/button"
import { testAiProvider } from "@/app/actions"

export function TestButton({ provider }: { provider: AiProvider }) {
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("provider", provider)
      const res = await testAiProvider(fd)
      if (res.ok) {
        toast.success(
          `Ping erfolgreich${"model" in res ? ` (${res.model})` : ""}`
        )
      } else {
        toast.error(`Test fehlgeschlagen: ${"error" in res ? res.error : ""}`)
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Zap className="size-3.5" />
      )}
      Test
    </Button>
  )
}
