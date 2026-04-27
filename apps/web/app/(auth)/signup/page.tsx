"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2, Loader2 } from "lucide-react"
import { signUp } from "@workspace/auth/client"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signUp.email({ email, password, name })
    setLoading(false)
    if (res.error) {
      setError(res.error.message ?? "Registrierung fehlgeschlagen")
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center lg:hidden">
        <Building2 className="size-8 text-primary" />
        <span className="text-lg font-semibold">managed-rent</span>
      </div>

      <Card className="border-0 shadow-none sm:border sm:shadow-xs">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Registrieren</CardTitle>
          <CardDescription>
            Erstelle einen Account, um deine Wohnungssuche zu organisieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                placeholder="Max Mustermann"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Mind. 8 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Registrieren
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Schon registriert?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Anmelden
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
