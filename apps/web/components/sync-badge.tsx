"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { useSync } from "@/components/sync-runner"

export function SyncBadge() {
  const { stats, isSyncing, triggerNow } = useSync()
  return (
    <div className="flex items-center gap-2">
      {stats && (
        <Badge variant="outline" className="font-normal">
          {stats.pulled}p · {stats.enriched}n · {stats.classified}c · {stats.extracted}e
          {stats.hasMore ? " · more" : ""}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={triggerNow}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        Sync
      </Button>
    </div>
  )
}
