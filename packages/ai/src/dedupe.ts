import type { ListingData } from "@workspace/core/types"

/**
 * Build a dedupe key from extracted listing fields.
 * Strategy:
 * 1. If sourceUrl exists → use normalized URL (removes query params, trailing slash, scheme).
 * 2. Else address hash (street + zip + city, normalized).
 * 3. Else title + rentCold + sizeSqm fingerprint.
 * Returns null when nothing distinctive found → treat as new.
 */
export function dedupeKey(result: ListingData): string | null {
  if (result.sourceUrl) {
    const normalized = normalizeUrl(result.sourceUrl)
    if (normalized) return `url:${normalized}`
  }

  const addrParts = [result.street, result.zip, result.city]
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
  if (addrParts.length >= 2) {
    return `addr:${addrParts.join("|")}`
  }

  if (result.landlordEmail && (result.title || result.rentCold || result.sizeSqm)) {
    const title = (result.title ?? "").toLowerCase().replace(/\s+/g, " ").trim()
    return `landlord:${result.landlordEmail.toLowerCase()}|${title}|${result.rentCold ?? ""}|${result.sizeSqm ?? ""}`
  }

  if (result.title && (result.rentCold || result.sizeSqm)) {
    const title = result.title.toLowerCase().replace(/\s+/g, " ").trim()
    return `fp:${title}|${result.rentCold ?? ""}|${result.sizeSqm ?? ""}`
  }

  return null
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    const path = u.pathname.replace(/\/+$/, "")
    // Strip common tracking params
    const params = new URLSearchParams(u.search)
    for (const key of Array.from(params.keys())) {
      if (/^utm_|^ref$|^source$|^gclid$/.test(key)) params.delete(key)
    }
    const qs = params.toString()
    return `${u.hostname.toLowerCase()}${path}${qs ? `?${qs}` : ""}`
  } catch {
    return null
  }
}
