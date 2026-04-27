import { simpleParser, type ParsedMail, type AddressObject } from "mailparser"
import type { ParsedAttachment, ParsedMessage } from "@workspace/core/types"

/**
 * Parse a raw RFC822 email buffer into our canonical ParsedMessage shape.
 * providerMessageId/threadId must be supplied by caller (provider-specific).
 */
export async function parseRaw(
  raw: Buffer | string,
  args: { providerMessageId: string; threadId: string | null }
): Promise<ParsedMessage> {
  const mail: ParsedMail = await simpleParser(raw)
  return fromParsedMail(mail, args)
}

export function fromParsedMail(
  mail: ParsedMail,
  args: { providerMessageId: string; threadId: string | null }
): ParsedMessage {
  const fromFirst = getFirstAddress(mail.from)
  const toAddrs: string[] = []
  if (mail.to) {
    for (const entry of Array.isArray(mail.to) ? mail.to : [mail.to]) {
      for (const v of entry.value) if (v.address) toAddrs.push(v.address)
    }
  }

  const rawHeaders: Record<string, string | string[]> = {}
  for (const [k, v] of mail.headers.entries()) {
    if (typeof v === "string") rawHeaders[k] = v
    else if (Array.isArray(v)) rawHeaders[k] = v.map(String)
    else rawHeaders[k] = String(v)
  }

  const attachments: ParsedAttachment[] = (mail.attachments ?? [])
    .filter((a) => a.content && a.filename)
    .map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.contentType ?? "application/octet-stream",
      sizeBytes: a.size ?? a.content.length,
      content: new Uint8Array(a.content),
    }))

  return {
    providerMessageId: args.providerMessageId,
    threadId: args.threadId,
    conversationKey: buildConversationKey(mail, args.threadId),
    fromAddr: fromFirst?.address ?? "",
    fromName: fromFirst?.name ?? null,
    toAddrs,
    subject: mail.subject ?? "",
    bodyText: mail.text ?? htmlToText(mail.html),
    bodyHtml: typeof mail.html === "string" ? mail.html : null,
    receivedAt: mail.date ?? new Date(),
    rawHeaders,
    attachments,
  }
}

export function buildConversationKey(
  mail: ParsedMail,
  providerThreadId: string | null
): string | null {
  if (providerThreadId?.trim()) {
    return `thread:${providerThreadId.trim()}`
  }

  const refs = readHeaderArray(mail, "references")
    .flatMap((value) => extractMessageIds(value))
    .filter(Boolean)
  if (refs.length > 0) {
    return `refs:${refs.join("|")}`
  }

  const inReplyTo = readHeaderArray(mail, "in-reply-to")
    .flatMap((value) => extractMessageIds(value))
    .find(Boolean)
  if (inReplyTo) {
    return `reply:${inReplyTo}`
  }

  const messageId = readHeaderArray(mail, "message-id")
    .flatMap((value) => extractMessageIds(value))
    .find(Boolean)
  return messageId ? `msg:${messageId}` : null
}

function getFirstAddress(
  field: AddressObject | AddressObject[] | undefined
): { address?: string; name?: string } | null {
  if (!field) return null
  const arr = Array.isArray(field) ? field : [field]
  for (const a of arr) {
    const first = a.value[0]
    if (first) return { address: first.address, name: first.name }
  }
  return null
}

function htmlToText(html: string | false | undefined): string {
  if (typeof html !== "string") return ""
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function readHeaderArray(mail: ParsedMail, key: string): string[] {
  const value = mail.headers.get(key)
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.map(String)
  if (value == null) return []
  return [String(value)]
}

function extractMessageIds(value: string): string[] {
  return Array.from(value.matchAll(/<([^>]+)>/g), (match) => match[1]?.trim()).filter(
    (entry): entry is string => Boolean(entry)
  )
}
