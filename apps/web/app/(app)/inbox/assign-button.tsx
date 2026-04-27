"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { AssignMessageSheet } from "./assign-message-sheet"

export function AssignButton({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 h-7 text-xs"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        Zuordnen
      </Button>
      <AssignMessageSheet
        messageId={messageId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
