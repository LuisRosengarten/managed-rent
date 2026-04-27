"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, ArrowRightLeft, Unlink } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { unassignMessage } from "@/app/actions"
import { AssignMessageSheet } from "@/app/(app)/inbox/assign-message-sheet"

export function MessageActions({
  messageId,
  applicationId,
}: {
  messageId: string
  applicationId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [reassignOpen, setReassignOpen] = useState(false)

  function handleUnassign() {
    if (!confirm("Zuordnung dieser Mail wirklich entfernen?")) return
    startTransition(async () => {
      const res = await unassignMessage({ messageId, applicationId })
      if (res && "error" in res) {
        toast.error("Entfernen fehlgeschlagen")
        return
      }
      toast.success("Zuordnung entfernt")
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" disabled={isPending} />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setReassignOpen(true)}>
            <ArrowRightLeft className="mr-2 size-4" />
            Neu zuordnen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleUnassign}>
            <Unlink className="mr-2 size-4" />
            Zuordnung entfernen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AssignMessageSheet
        messageId={messageId}
        fromApplicationId={applicationId}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
      />
    </>
  )
}
