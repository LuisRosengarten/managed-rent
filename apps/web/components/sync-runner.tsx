"use client"

import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

type SyncStats = {
  pulled: number
  enriched: number
  classified: number
  extracted: number
  hasMore: boolean
  errors: string[]
}

async function fetchSync(): Promise<SyncStats> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => "sync failed")
    throw new Error(msg)
  }
  return (await res.json()) as SyncStats
}

type Ctx = {
  stats: SyncStats | null
  isSyncing: boolean
  triggerNow: () => void
}

const SyncContext = React.createContext<Ctx>({
  stats: null,
  isSyncing: false,
  triggerNow: () => {},
})

export function useSync() {
  return React.useContext(SyncContext)
}

export function SyncRunner({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const query = useQuery<SyncStats, Error>({
    queryKey: ["sync"],
    queryFn: fetchSync,
    refetchInterval: 3 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  // Chain re-runs when hasMore is true (drain backlog without waiting 3min)
  React.useEffect(() => {
    if (query.data?.hasMore && !query.isFetching) {
      const t = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["sync"] })
      }, 250)
      return () => clearTimeout(t)
    }
  }, [query.data, query.isFetching, queryClient])

  // Toast errors once per call
  const errorsRef = React.useRef<string>("")
  React.useEffect(() => {
    if (!query.data?.errors?.length) return
    const joined = query.data.errors.join("|")
    if (joined && joined !== errorsRef.current) {
      errorsRef.current = joined
      for (const e of query.data.errors) toast.error(`Sync: ${e}`)
    }
  }, [query.data])

  // Refresh data views after successful sync with counts > 0
  React.useEffect(() => {
    if (!query.data) return
    if (
      query.data.pulled > 0 ||
      query.data.enriched > 0 ||
      query.data.classified > 0 ||
      query.data.extracted > 0
    ) {
      queryClient.invalidateQueries({ queryKey: ["inbox"] })
      queryClient.invalidateQueries({ queryKey: ["applications"] })
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    }
  }, [query.data, queryClient])

  const ctx: Ctx = {
    stats: query.data ?? null,
    isSyncing: query.isFetching,
    triggerNow: () => queryClient.invalidateQueries({ queryKey: ["sync"] }),
  }

  return <SyncContext.Provider value={ctx}>{children}</SyncContext.Provider>
}
