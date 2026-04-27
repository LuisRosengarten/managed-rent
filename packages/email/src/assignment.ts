type HardMatch = {
  type: "application" | "listing"
  id: string
  reason: string
}

type AiDecision = {
  target: "existing_application" | "existing_listing" | "create_new" | "unassigned"
  applicationId?: string
  listingId?: string
  confidence: number
}

export function resolveAssignment(args: {
  hardMatch: HardMatch | null
  aiDecision: AiDecision
  hasEnoughIdentity: boolean
}):
  | { type: "application"; id: string; reason: string }
  | { type: "listing"; id: string; reason: string }
  | { type: "create_new"; reason: string }
  | { type: "unassigned"; reason: string } {
  if (args.hardMatch) {
    return {
      type: args.hardMatch.type,
      id: args.hardMatch.id,
      reason: args.hardMatch.reason,
    }
  }

  if (args.aiDecision.confidence >= 0.75) {
    if (
      args.aiDecision.target === "existing_application" &&
      args.aiDecision.applicationId
    ) {
      return {
        type: "application",
        id: args.aiDecision.applicationId,
        reason: "ai_match_existing_application",
      }
    }
    if (args.aiDecision.target === "existing_listing" && args.aiDecision.listingId) {
      return {
        type: "listing",
        id: args.aiDecision.listingId,
        reason: "ai_match_existing_listing",
      }
    }
  }

  if (args.hasEnoughIdentity) {
    return { type: "create_new", reason: "identity_sufficient" }
  }

  return { type: "unassigned", reason: "insufficient_identity" }
}
