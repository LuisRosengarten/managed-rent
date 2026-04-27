"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Building2, Loader2 } from "lucide-react"
import { signIn } from "@workspace/auth/client"
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn.email({ email, password })
    setLoading(false)
    if (res.error) {
      setError(res.error.message ?? "Login fehlgeschlagen")
      return
    }
    router.push(search.get("next") ?? "/dashboard")
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
          <CardTitle className="text-xl">Anmelden</CardTitle>
          <CardDescription>
            Melde dich an, um deine Bewerbungen zu verwalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                autoComplete="current-password"
                placeholder="••••••••"
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
              Anmelden
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Kein Konto?{" "}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Registrieren
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
