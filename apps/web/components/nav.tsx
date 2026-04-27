"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Inbox, Kanban, Settings } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { SyncBadge } from "./sync-badge"

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/applications", label: "Bewerbungen", icon: Kanban },
  { href: "/settings/email-accounts", label: "Einstellungen", icon: Settings },
]

export function Nav({ userName }: { userName: string }) {
  const pathname = usePathname()
  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold">
          managed-rent
        </Link>
        <nav className="flex items-center gap-1">
          {ITEMS.map((it) => {
            const active =
              pathname === it.href ||
              (it.href.startsWith("/settings") &&
                pathname.startsWith("/settings"))
            const Icon = it.icon
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm",
                  active && "bg-muted text-foreground"
                )}
              >
                <Icon className="size-4" />
                {it.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <SyncBadge />
        <span className="text-muted-foreground text-sm">{userName}</span>
      </div>
    </header>
  )
}
