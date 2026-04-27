import { eq } from "drizzle-orm"
import { Sparkles, Trash2, Star } from "lucide-react"
import { aiProviderConfig, db } from "@workspace/db"
import { AI_PROVIDERS } from "@workspace/core/status"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { requireSession } from "@/lib/session"
import { deleteAiProvider } from "@/app/actions"
import { AiProviderForm } from "./provider-form"
import { TestButton } from "./test-button"

export const dynamic = "force-dynamic"

export default async function AiProvidersPage() {
  const session = await requireSession()

  const configs = await db()
    .select({
      id: aiProviderConfig.id,
      provider: aiProviderConfig.provider,
      defaultModel: aiProviderConfig.defaultModel,
      enabled: aiProviderConfig.enabled,
      isPrimary: aiProviderConfig.isPrimary,
    })
    .from(aiProviderConfig)
    .where(eq(aiProviderConfig.userId, session.user.id))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI-Provider</CardTitle>
          <CardDescription>
            Keys werden verschlüsselt gespeichert. Der Primary-Provider wird für
            Klassifikation + Extraktion genutzt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="rounded-full bg-muted p-3">
                <Sparkles className="size-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Noch kein Provider konfiguriert.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Sparkles className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {c.provider}
                        </span>
                        {c.isPrimary && (
                          <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            <Star className="size-2.5" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Model: {c.defaultModel}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        c.enabled
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {c.enabled ? "Aktiv" : "Deaktiviert"}
                    </Badge>
                    <TestButton provider={c.provider} />
                    <form
                      action={async (fd: FormData) => {
                        "use server"
                        await deleteAiProvider(fd)
                      }}
                    >
                      <input type="hidden" name="id" value={c.id} />
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
          <CardTitle className="text-base">Provider hinzufügen</CardTitle>
          <CardDescription>
            Key für {AI_PROVIDERS.join(", ")} eintragen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiProviderForm />
        </CardContent>
      </Card>
    </div>
  )
}
