import { normalizeUrl } from "@workspace/ai"
import type { ExtractedMessageIdentity, ListingData } from "@workspace/core/types"

export function normalizeIdentity(
  identity: Partial<ExtractedMessageIdentity>
): ExtractedMessageIdentity {
  return {
    portal: clean(identity.portal),
    portalListingId: clean(identity.portalListingId),
    portalThreadKey: clean(identity.portalThreadKey),
    canonicalListingUrl: identity.canonicalListingUrl
      ? normalizeUrl(identity.canonicalListingUrl) ?? clean(identity.canonicalListingUrl)
      : undefined,
    relayEmail: normalizeEmail(identity.relayEmail),
    replyToEmail: normalizeEmail(identity.replyToEmail),
    senderEmail: normalizeEmail(identity.senderEmail),
    street: clean(identity.street),
    zip: clean(identity.zip),
    city: clean(identity.city),
    district: clean(identity.district),
    rentCold: normalizeNumber(identity.rentCold),
    rentWarm: normalizeNumber(identity.rentWarm),
    sizeSqm: normalizeNumber(identity.sizeSqm),
    rooms: normalizeNumber(identity.rooms),
    titleFingerprint: normalizeTitleFingerprint(identity.titleFingerprint),
    landlordNameHint: clean(identity.landlordNameHint),
    landlordEmailHint: normalizeEmail(identity.landlordEmailHint),
    confidence:
      typeof identity.confidence === "number" && Number.isFinite(identity.confidence)
        ? Math.min(1, Math.max(0, identity.confidence))
        : 0,
  }
}

export function mergeIdentityWithHeuristics(args: {
  extracted: Partial<ExtractedMessageIdentity>
  fromAddr: string
  rawHeaders: Record<string, string | string[]>
  listingData?: ListingData
}): ExtractedMessageIdentity {
  const replyTo = getHeaderEmail(args.rawHeaders, "reply-to")
  const deliveredTo = getHeaderEmail(args.rawHeaders, "delivered-to")
  const sender = normalizeEmail(args.fromAddr)
  const listing = args.listingData ?? {}

  return normalizeIdentity({
    ...args.extracted,
    senderEmail: args.extracted.senderEmail ?? sender,
    replyToEmail: args.extracted.replyToEmail ?? replyTo,
    relayEmail: args.extracted.relayEmail ?? deliveredTo,
    canonicalListingUrl:
      args.extracted.canonicalListingUrl ?? listing.sourceUrl ?? undefined,
    street: args.extracted.street ?? listing.street,
    zip: args.extracted.zip ?? listing.zip,
    city: args.extracted.city ?? listing.city,
    district: args.extracted.district ?? listing.district,
    rentCold: args.extracted.rentCold ?? listing.rentCold,
    rentWarm: args.extracted.rentWarm ?? listing.rentWarm,
    sizeSqm: args.extracted.sizeSqm ?? listing.sizeSqm,
    rooms: args.extracted.rooms ?? listing.rooms,
    landlordEmailHint:
      args.extracted.landlordEmailHint ?? normalizeEmail(listing.landlordEmail),
    titleFingerprint:
      args.extracted.titleFingerprint ??
      normalizeTitleFingerprint(listing.title ?? undefined),
  })
}

export function identityFromListingData(data: ListingData): ExtractedMessageIdentity {
  return normalizeIdentity({
    portal: data.sourcePortal,
    canonicalListingUrl: data.sourceUrl,
    street: data.street,
    zip: data.zip,
    city: data.city,
    district: data.district,
    rentCold: data.rentCold,
    rentWarm: data.rentWarm,
    sizeSqm: data.sizeSqm,
    rooms: data.rooms,
    landlordEmailHint: data.landlordEmail,
    titleFingerprint: data.title,
    confidence: 1,
  })
}

export function normalizeTitleFingerprint(value: string | undefined): string | undefined {
  const cleaned = clean(value)
    ?.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned || undefined
}

export function normalizeEmail(value: string | undefined | null): string | undefined {
  const cleaned = clean(value)?.toLowerCase()
  if (!cleaned) return undefined
  const match = cleaned.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)
  return match?.[0]
}

export function getHeaderEmail(
  headers: Record<string, string | string[]>,
  key: string
): string | undefined {
  const value = headers[key]
  const text = Array.isArray(value) ? value.join(" ") : value
  return normalizeEmail(text)
}

export function strongAddressMatch(
  left: Partial<ExtractedMessageIdentity>,
  right: Partial<ExtractedMessageIdentity>
): boolean {
  if (!left.city || !right.city) return false
  if (left.city !== right.city) return false
  if (left.street && right.street && left.street === right.street) return true
  if (left.zip && right.zip && left.zip === right.zip) return true
  return false
}

function clean(value: string | null | undefined): string | undefined {
  const next = value?.replace(/\s+/g, " ").trim()
  return next || undefined
}

function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
