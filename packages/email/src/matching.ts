import type {
  ExtractedMessageIdentity,
  MatchCandidateScore,
} from "@workspace/core/types"
import { strongAddressMatch } from "./identity-utils.ts"

export function isHardAliasMatch(args: {
  messageIdentity: ExtractedMessageIdentity
  aliasIdentity: Partial<ExtractedMessageIdentity>
}): { matched: boolean; reason?: string } {
  const { messageIdentity, aliasIdentity } = args

  if (
    messageIdentity.portalListingId &&
    aliasIdentity.portalListingId &&
    messageIdentity.portalListingId === aliasIdentity.portalListingId
  ) {
    return { matched: true, reason: "portal_listing_id" }
  }

  if (
    messageIdentity.canonicalListingUrl &&
    aliasIdentity.canonicalListingUrl &&
    messageIdentity.canonicalListingUrl === aliasIdentity.canonicalListingUrl
  ) {
    return { matched: true, reason: "canonical_listing_url" }
  }

  if (
    messageIdentity.relayEmail &&
    aliasIdentity.relayEmail &&
    messageIdentity.relayEmail === aliasIdentity.relayEmail
  ) {
    return { matched: true, reason: "relay_email" }
  }

  if (strongAddressMatch(messageIdentity, aliasIdentity) && hasStrongAnchor(messageIdentity, aliasIdentity)) {
    return { matched: true, reason: "address_plus_anchor" }
  }

  return { matched: false }
}

export function scoreMatchCandidate(args: {
  listingId: string
  applicationId?: string | null
  messageIdentity: ExtractedMessageIdentity
  candidateIdentity: Partial<ExtractedMessageIdentity>
}): MatchCandidateScore {
  const reasons: string[] = []
  let score = 0

  // Portal listing ID is a strong deterministic signal
  if (
    args.messageIdentity.portalListingId &&
    args.candidateIdentity.portalListingId &&
    args.messageIdentity.portalListingId === args.candidateIdentity.portalListingId
  ) {
    score += 0.7
    reasons.push("portal_listing_id")
  }

  // Canonical listing URL is equally strong
  if (
    args.messageIdentity.canonicalListingUrl &&
    args.candidateIdentity.canonicalListingUrl &&
    args.messageIdentity.canonicalListingUrl === args.candidateIdentity.canonicalListingUrl
  ) {
    score += 0.7
    reasons.push("canonical_listing_url")
  }

  if (strongAddressMatch(args.messageIdentity, args.candidateIdentity)) {
    score += 0.5
    reasons.push("address")
  }

  if (sameNumber(args.messageIdentity.rentWarm, args.candidateIdentity.rentWarm, 30)) {
    score += 0.15
    reasons.push("rent_warm")
  }
  if (sameNumber(args.messageIdentity.rentCold, args.candidateIdentity.rentCold, 30)) {
    score += 0.15
    reasons.push("rent_cold")
  }
  if (sameNumber(args.messageIdentity.sizeSqm, args.candidateIdentity.sizeSqm, 3)) {
    score += 0.12
    reasons.push("size")
  }
  if (sameNumber(args.messageIdentity.rooms, args.candidateIdentity.rooms, 0.5)) {
    score += 0.1
    reasons.push("rooms")
  }

  if (
    args.messageIdentity.titleFingerprint &&
    args.candidateIdentity.titleFingerprint &&
    args.messageIdentity.titleFingerprint === args.candidateIdentity.titleFingerprint
  ) {
    score += 0.12
    reasons.push("title_fingerprint")
  }

  if (
    args.messageIdentity.portal &&
    args.candidateIdentity.portal &&
    args.messageIdentity.portal === args.candidateIdentity.portal
  ) {
    score += 0.08
    reasons.push("portal")
  }

  if (
    args.messageIdentity.replyToEmail &&
    args.candidateIdentity.relayEmail &&
    args.messageIdentity.replyToEmail === args.candidateIdentity.relayEmail
  ) {
    score += 0.22
    reasons.push("reply_to_vs_relay")
  }
  if (
    args.messageIdentity.senderEmail &&
    args.candidateIdentity.landlordEmailHint &&
    args.messageIdentity.senderEmail === args.candidateIdentity.landlordEmailHint
  ) {
    score += 0.2
    reasons.push("sender_vs_landlord")
  }
  if (
    args.messageIdentity.landlordEmailHint &&
    args.candidateIdentity.landlordEmailHint &&
    args.messageIdentity.landlordEmailHint === args.candidateIdentity.landlordEmailHint
  ) {
    score += 0.18
    reasons.push("landlord_email")
  }
  if (
    args.messageIdentity.relayEmail &&
    args.candidateIdentity.relayEmail &&
    args.messageIdentity.relayEmail === args.candidateIdentity.relayEmail
  ) {
    score += 0.18
    reasons.push("relay_email")
  }

  return {
    listingId: args.listingId,
    applicationId: args.applicationId ?? null,
    score: Math.min(1, Number(score.toFixed(2))),
    reasons,
  }
}

export function shouldCreateReview(score: number): boolean {
  return score >= 0.6 && score < 0.9
}

export function shouldAutoLink(score: number): boolean {
  return score >= 0.9
}

function hasStrongAnchor(
  left: Partial<ExtractedMessageIdentity>,
  right: Partial<ExtractedMessageIdentity>
): boolean {
  return (
    sameNumber(left.sizeSqm, right.sizeSqm, 3) ||
    sameNumber(left.rentWarm, right.rentWarm, 30) ||
    sameNumber(left.rentCold, right.rentCold, 30) ||
    sameNumber(left.rooms, right.rooms, 0.5)
  )
}

function sameNumber(
  left: number | undefined,
  right: number | undefined,
  tolerance: number
): boolean {
  if (typeof left !== "number" || typeof right !== "number") return false
  return Math.abs(left - right) <= tolerance
}
