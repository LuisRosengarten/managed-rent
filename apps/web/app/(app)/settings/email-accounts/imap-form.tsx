"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { addImapAccount } from "@/app/actions"

export function ImapForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await addImapAccount(fd)
      if ("error" in res) {
        toast.error("Ungültige Eingaben")
        return
      }
      toast.success("IMAP-Account hinzugefügt")
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        IMAP-Account hinzufügen
      </Button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Email" name="email" type="email" required />
      <Field label="Anzeigename" name="displayName" />
      <Field label="IMAP Host" name="host" required placeholder="imap.gmail.com" />
      <Field label="Port" name="port" type="number" required defaultValue="993" />
      <Field label="User" name="user" required />
      <Field label="Passwort" name="password" type="password" required />
      <div className="flex items-center gap-2 self-end">
        <input type="checkbox" id="secure" name="secure" defaultChecked value="true" />
        <Label htmlFor="secure">TLS (SSL)</Label>
      </div>
      <div className="sm:col-span-2 border-t border-border pt-3">
        <p className="mb-2 text-xs text-muted-foreground">
          SMTP optional (für Reply-Funktion später)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SMTP Host" name="smtpHost" placeholder="smtp.gmail.com" />
          <Field label="SMTP Port" name="smtpPort" type="number" defaultValue="465" />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="smtpSecure" name="smtpSecure" value="true" />
            <Label htmlFor="smtpSecure">SMTP TLS</Label>
          </div>
        </div>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichere…" : "Speichern"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </div>
  )
}
