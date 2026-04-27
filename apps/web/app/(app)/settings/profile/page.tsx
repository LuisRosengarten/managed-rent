import { FileText, User } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Separator } from "@workspace/ui/components/separator"
import { requireSession } from "@/lib/session"

export const dynamic = "force-dynamic"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export default async function ProfilePage() {
  const session = await requireSession()
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Profil</CardTitle>
          </div>
          <CardDescription>Basisdaten des Accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <Avatar size="lg">
              <AvatarFallback>
                {getInitials(session.user.name ?? session.user.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{session.user.name}</div>
              <div className="text-sm text-muted-foreground">
                {session.user.email}
              </div>
            </div>
          </div>
          <Separator className="my-4" />
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{session.user.name}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{session.user.email}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">ID</dt>
              <dd className="font-mono text-xs text-muted-foreground">
                {session.user.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Dokumente</CardTitle>
          </div>
          <CardDescription>
            Schufa, Gehaltsnachweise, Mieterselbstauskunft — kommt in Phase 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Upload via Uploadthing ist vorbereitet. UI folgt nach MVP.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
