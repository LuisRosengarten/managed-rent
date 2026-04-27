import { eq } from "drizzle-orm"
import { Mail, Trash2, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import Link from "next/link"
import { db, emailAccount } from "@workspace/db"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { requireSession } from "@/lib/session"
import { deleteEmailAccount, updateEmailAccountLookback } from "@/app/actions"
import { ImapForm } from "./imap-form"
import { LookbackSelect } from "./lookback-select"

export const dynamic = "force-dynamic"

type SearchParams = {
  added?: string
  error?: string
}

export default async function EmailAccountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await requireSession()
  const sp = await searchParams

  const accounts = await db()
    .select()
    .from(emailAccount)
    .where(eq(emailAccount.userId, session.user.id))
    .orderBy(emailAccount.createdAt)

  return (
    <div className="flex flex-col gap-6">
      {sp.added && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" />
          Account ({sp.added}) erfolgreich verbunden.
        </div>
      )}
      {sp.error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          OAuth-Fehler: {sp.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verbundene Accounts</CardTitle>
          <CardDescription>
            Emails werden alle ~3 Minuten synchronisiert solange die App offen ist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-3">
                <Mail className="size-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Noch kein Account verbunden.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Mail className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {a.displayName ?? a.email}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{a.email}</span>
                        <span>·</span>
                        <Clock className="size-3" />
                        {a.lastSyncedAt
                          ? a.lastSyncedAt.toLocaleString("de-DE")
                          : "nie synchronisiert"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <LookbackSelect
                      accountId={a.id}
                      value={a.syncLookbackDays ?? 0}
                      action={updateEmailAccountLookback}
                    />
                    <Badge variant="outline" className="capitalize">
                      {a.provider}
                    </Badge>
                    <Badge
                      variant={a.status === "active" ? "outline" : "destructive"}
                      className={
                        a.status === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {a.status === "active" ? "Aktiv" : a.status}
                    </Badge>
                    <form
                      action={async (fd: FormData) => {
                        "use server"
                        await deleteEmailAccount(fd)
                      }}
                    >
                      <input type="hidden" name="id" value={a.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Neuen Account hinzufügen</CardTitle>
          <CardDescription>
            Gmail oder Outlook via OAuth — oder generisches IMAP.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/api/oauth/google/start"
              className={buttonVariants({ variant: "outline", size: "default" })}
            >
              <Mail className="mr-2 size-4" />
              Gmail verbinden
            </Link>
            <Link
              href="/api/oauth/microsoft/start"
              className={buttonVariants({ variant: "outline", size: "default" })}
            >
              <Mail className="mr-2 size-4" />
              Outlook verbinden
            </Link>
          </div>
          <Separator />
          <div>
            <h3 className="mb-3 text-sm font-medium">IMAP / Generic</h3>
            <ImapForm />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
