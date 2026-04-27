import { SyncRunner } from "@/components/sync-runner"
import { AppSidebar } from "@/components/app-sidebar"
import { requireSession } from "@/lib/session"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { SyncStatus } from "@/components/sync-status"

export const dynamic = "force-dynamic"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  return (
    <SyncRunner>
      <SidebarProvider className="!h-svh">
        <AppSidebar
          userName={session.user.name ?? session.user.email}
          userEmail={session.user.email}
        />
        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="-ml-1 text-muted-foreground" />
              <Breadcrumbs />
            </div>
            <SyncStatus />
          </header>
          <div className="min-w-0 flex-1 overflow-auto p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </SyncRunner>
  )
}
