"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  inbox: "Inbox",
  applications: "Bewerbungen",
  settings: "Einstellungen",
  "email-accounts": "Email-Accounts",
  "ai-providers": "AI-Provider",
  profile: "Profil",
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0) return null

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/")
        const label = LABELS[segment] ?? segment
        const isLast = i === segments.length - 1
        // Skip UUID-like segments in display but show in path
        const isUuid = segment.length > 20 && segment.includes("-")

        if (isUuid) {
          return (
            <span key={href} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <span className="text-foreground font-medium">Detail</span>
            </span>
          )
        }

        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" />}
            {isLast ? (
              <span className="text-foreground font-medium">{label}</span>
            ) : (
              <Link href={href} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
