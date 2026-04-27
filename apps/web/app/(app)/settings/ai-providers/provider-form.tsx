"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AI_PROVIDERS } from "@workspace/core/status"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"
import { saveAiProvider } from "@/app/actions"

const MODEL_HINTS: Record<string, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
}

export function AiProviderForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await saveAiProvider(fd)
      if ("error" in res) {
        toast.error("Ungültige Eingaben")
        return
      }
      toast.success("Provider gespeichert")
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider">Provider</Label>
        <select
          id="provider"
          name="provider"
          required
          defaultValue="anthropic"
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="model">Modell (optional)</Label>
        <Input
          id="model"
          name="model"
          placeholder={`z.B. ${Object.values(MODEL_HINTS).join(" / ")}`}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="apiKey">API-Key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          placeholder="sk-…"
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          id="isPrimary"
          name="isPrimary"
          value="true"
          defaultChecked
        />
        <Label htmlFor="isPrimary">Als Primary setzen</Label>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </form>
  )
}
