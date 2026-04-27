import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import type {
  EnrichedLink,
  EnrichedMessageContent,
  EnrichmentFetchResult,
} from "@workspace/core/types"

const FETCH_TIMEOUT_MS = 8000
const MAX_FETCH_BYTES = 250_000
const MAX_LINK_FETCHES = 3
const MAX_IFRAME_FETCHES = 2

export async function enrichMessageContent(
  input: {
    bodyText: string
    bodyHtml: string | null
  },
  deps: {
    fetchImpl?: typeof fetch
    resolveHostname?: typeof lookup
  } = {}
): Promise<EnrichedMessageContent> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const resolveHostname = deps.resolveHostname ?? lookup
  const htmlExtract = extractHtmlContent(input.bodyHtml)

  const linkUrls = uniqueUrls(htmlExtract.links.map((link) => link.url)).slice(
    0,
    MAX_LINK_FETCHES
  )
  const iframeUrls = uniqueUrls(htmlExtract.iframes).slice(0, MAX_IFRAME_FETCHES)

  const fetches: EnrichmentFetchResult[] = []
  const fetchedSections: string[] = []

  for (const url of linkUrls) {
    const fetched = await fetchExternalHtml(url, "link", fetchImpl, resolveHostname)
    fetches.push(fetched.result)
    if (fetched.text) {
      fetchedSections.push(`Externe Seite (${url}):\n${fetched.text}`)
    }
  }

  for (const url of iframeUrls) {
    const fetched = await fetchExternalHtml(url, "iframe", fetchImpl, resolveHostname)
    fetches.push(fetched.result)
    if (fetched.text) {
      fetchedSections.push(`Iframe (${url}):\n${fetched.text}`)
    }
  }

  const analysisText = buildAnalysisText({
    baseText: input.bodyText,
    htmlText: htmlExtract.text,
    links: htmlExtract.links,
    externalSections: fetchedSections,
  })

  return {
    baseText: input.bodyText,
    htmlText: htmlExtract.text,
    analysisText,
    links: htmlExtract.links,
    iframes: htmlExtract.iframes,
    fetches,
  }
}

export function extractHtmlContent(html: string | null | undefined): {
  text: string
  links: EnrichedLink[]
  iframes: string[]
} {
  if (!html) return { text: "", links: [], iframes: [] }

  const cleaned = stripSimilarOffersSection(html)

  const text = htmlToText(cleaned)
  const links = [
    ...extractAnchorLinks(cleaned),
    ...extractButtonLinks(cleaned),
  ]
  const iframes = uniqueUrls(
    Array.from(cleaned.matchAll(/<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi), (match) =>
      sanitizeUrl(match[1])
    ).filter(Boolean) as string[]
  )

  return {
    text,
    links: dedupeLinks(links),
    iframes,
  }
}

export function buildAnalysisText(args: {
  baseText: string
  htmlText: string
  links: EnrichedLink[]
  externalSections: string[]
}): string {
  const sections = [
    `Mail-Text:\n${cleanText(args.baseText) || "(leer)"}`,
    args.htmlText ? `HTML-Text:\n${cleanText(args.htmlText)}` : null,
    args.links.length
      ? `Links:\n${args.links
          .map((link) => `- [${link.kind}] ${link.text ? `${link.text} -> ` : ""}${link.url}`)
          .join("\n")}`
      : null,
    ...args.externalSections,
  ].filter(Boolean)

  return sections.join("\n\n").slice(0, 24_000)
}

async function fetchExternalHtml(
  url: string,
  source: "link" | "iframe",
  fetchImpl: typeof fetch,
  resolveHostname: typeof lookup
): Promise<{ text: string | null; result: EnrichmentFetchResult }> {
  if (!(await isSafeExternalUrl(url, resolveHostname))) {
    return {
      text: null,
      result: {
        url,
        ok: false,
        error: "blocked_url",
        source,
      },
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "managed-rent-bot/1.0",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      return {
        text: null,
        result: {
          url,
          ok: false,
          status: res.status,
          error: `http_${res.status}`,
          source,
        },
      }
    }

    const contentType = res.headers.get("content-type") ?? ""
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return {
        text: null,
        result: {
          url,
          ok: false,
          status: res.status,
          error: "unsupported_content_type",
          source,
        },
      }
    }

    const html = await res.text()
    const clipped = html.slice(0, MAX_FETCH_BYTES)
    const extracted = extractHtmlContent(clipped)
    const text = cleanText(extracted.text)
    return {
      text,
      result: {
        url,
        ok: true,
        status: res.status,
        textLength: text.length,
        source,
      },
    }
  } catch (error) {
    return {
      text: null,
      result: {
        url,
        ok: false,
        error: error instanceof Error ? error.message : "fetch_failed",
        source,
      },
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function isSafeExternalUrl(
  raw: string,
  resolveHostname: typeof lookup = lookup
): Promise<boolean> {
  const url = sanitizeUrl(raw)
  if (!url) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return false
  if (parsed.username || parsed.password) return false
  if (
    parsed.hostname === "localhost" ||
    parsed.hostname.endsWith(".local") ||
    parsed.hostname.endsWith(".internal")
  ) {
    return false
  }

  const addresses = await resolveIpAddresses(parsed.hostname, resolveHostname)
  return addresses.every((address) => !isPrivateAddress(address))
}

async function resolveIpAddresses(
  hostname: string,
  resolveHostname: typeof lookup
): Promise<string[]> {
  if (isIP(hostname)) return [hostname]
  try {
    const records = await resolveHostname(hostname, { all: true })
    return records.map((record) => record.address)
  } catch {
    return [hostname]
  }
}

function isPrivateAddress(address: string): boolean {
  if (address === "localhost") return true
  if (address === "::1") return true
  if (address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) {
    return true
  }
  const parts = address.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false
  const [a, b] = parts
  if (a == null || b == null) return false
  if (a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

function extractAnchorLinks(html: string): EnrichedLink[] {
  return Array.from(
    html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
    (match) => ({
      url: sanitizeUrl(match[1]) ?? "",
      text: cleanText(htmlToText(match[2] ?? "")),
      kind: "anchor" as const,
      source: "email" as const,
    })
  ).filter((link) => Boolean(link.url))
}

function extractButtonLinks(html: string): EnrichedLink[] {
  return Array.from(
    html.matchAll(
      /<(?:button|div|span)[^>]*(?:data-href|data-url|onclick)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:button|div|span)>/gi
    ),
    (match) => ({
      url: sanitizeUrl(match[1]) ?? "",
      text: cleanText(htmlToText(match[2] ?? "")),
      kind: "button" as const,
      source: "email" as const,
    })
  ).filter((link) => Boolean(link.url))
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeUrl(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.toString()
  } catch {
    return null
  }
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)))
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Strip "similar offers" / "you might also like" sections from portal emails.
 * These sections contain unrelated listings that pollute identity extraction
 * and matching. We remove everything from the trigger heading to the end of
 * its container (or the end of the HTML if no container boundary is found).
 */
function stripSimilarOffersSection(html: string): string {
  // Common headings used by German real-estate portals for "similar offers" sections
  const triggerPatterns = [
    /ähnliche\s+(?:angebote|objekte|wohnungen|immobilien)/i,
    /weitere\s+(?:angebote|objekte|wohnungen|immobilien|vorschläge|empfehlungen)/i,
    /das\s+könnte\s+(?:dich|sie|ihnen)\s+(?:auch\s+)?interessieren/i,
    /passende\s+(?:angebote|objekte|wohnungen|immobilien)/i,
    /(?:vielleicht|auch)\s+interessant/i,
    /empfohlene\s+(?:angebote|objekte|immobilien)/i,
    /mehr\s+(?:angebote|objekte|immobilien)\s+(?:für\s+(?:dich|sie)|in)/i,
    /similar\s+(?:listings?|offers?|properties)/i,
    /you\s+might\s+also\s+like/i,
    /recommended\s+(?:for\s+you|listings?|properties)/i,
  ]

  let result = html
  for (const pattern of triggerPatterns) {
    // Match heading tags or table cells containing trigger text
    const headingRegex = new RegExp(
      `(<(?:h[1-6]|td|div|p|span)[^>]*>\\s*(?:<[^>]*>)*\\s*)(${pattern.source})(\\s*(?:<[^>]*>)*\\s*<\\/(?:h[1-6]|td|div|p|span)>)`,
      "gi"
    )
    const match = headingRegex.exec(result)
    if (match && match.index !== undefined) {
      // Remove everything from the trigger heading onwards
      result = result.slice(0, match.index)
    }
  }

  // Also strip by plain text trigger in case heading is embedded differently
  const plainTextTriggers = [
    /\n\s*ähnliche\s+(?:angebote|objekte|wohnungen)/i,
    /\n\s*weitere\s+(?:angebote|objekte|wohnungen|vorschläge)/i,
    /\n\s*das\s+könnte\s+(?:dich|sie)\s+(?:auch\s+)?interessieren/i,
    /\n\s*passende\s+(?:angebote|objekte|wohnungen)/i,
  ]
  for (const pattern of plainTextTriggers) {
    const textVersion = htmlToText(result)
    const textMatch = pattern.exec(textVersion)
    if (textMatch && textMatch.index !== undefined) {
      // Estimate position in original HTML (rough but effective)
      const triggerText = textMatch[0].trim()
      const htmlPos = result.toLowerCase().indexOf(triggerText.toLowerCase())
      if (htmlPos !== -1) {
        result = result.slice(0, htmlPos)
      }
    }
  }

  return result
}

function dedupeLinks(links: EnrichedLink[]): EnrichedLink[] {
  const seen = new Set<string>()
  const result: EnrichedLink[] = []
  for (const link of links) {
    const key = `${link.kind}:${link.url}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(link)
  }
  return result
}
