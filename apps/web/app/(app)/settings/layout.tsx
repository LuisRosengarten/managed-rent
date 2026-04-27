"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Mail, Sparkles, User } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

const TABS = [
  { href: "/settings/email-accounts", label: "Email-Accounts", icon: Mail },
  { href: "/settings/ai-providers", label: "AI-Provider", icon: Sparkles },
  { href: "/settings/profile", label: "Profil", icon: User },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground mt-1">
          Verwalte Email-Accounts, AI-Provider und Profil.
        </p>
      </div>
      <SettingsTabs />
      <div>{children}</div>
    </div>
  )
}

function SettingsTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
