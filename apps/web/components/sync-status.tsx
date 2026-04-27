"use client"

import {
  Loader2,
  RefreshCw,
  ArrowDownToLine,
  ScanSearch,
  Tags,
  FileSearch,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { useSync } from "@/components/sync-runner"

function Counter({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3" />
      <span className="tabular-nums">{count}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  )
}

export function SyncStatus() {
  const { stats, isSyncing, triggerNow } = useSync()

  return (
    <div className="flex items-center gap-1">
      {stats && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-1 mr-1">
          <Counter icon={ArrowDownToLine} label="abgerufen" count={stats.pulled} />
          <Counter icon={ScanSearch} label="angereichert" count={stats.enriched} />
          <Counter icon={Tags} label="klassifiziert" count={stats.classified} />
          <Counter icon={FileSearch} label="extrahiert" count={stats.extracted} />
          {stats.hasMore && (
            <span className="text-xs text-amber-500 font-medium">…mehr</span>
          )}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        onClick={triggerNow}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
      </Button>
    </div>
  )
}
