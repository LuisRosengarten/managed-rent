import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { db } from "@workspace/db/client"
import {
  aiProviderConfig,
  application,
  applicationMessage,
  attachment,
  classification,
  emailAccount,
  listing,
  listingIdentityAlias,
  listingMatchRejectionRule,
  message,
  messageIdentityEvidence,
  messageMatchReview,
} from "@workspace/db/schema"
import * as appCrypto from "@workspace/core/crypto"
import type {
  AiProvider,
  ClassificationResultV2,
  EmailAccountCredentials,
  ExtractedMessageIdentity,
  ListingData,
  MatchCandidateScore,
  SyncStats,
} from "@workspace/core/types"
import { createAdapter, DEFAULT_MODELS } from "@workspace/ai"
import {
  analyzeHousingMessage,
  dedupeKey,
  extractMessageIdentity,
} from "@workspace/ai"
import { classifyMessage } from "@workspace/ai/classify"
import { uploadBuffer } from "@workspace/storage/client"
import { createGmailAdapter } from "./adapters/gmail.ts"
import { createImapAdapter } from "./adapters/imap.ts"
import { createOutlookAdapter } from "./adapters/outlook.ts"
import { enrichMessageContent } from "./enrichment.ts"
import {
  getHeaderEmail,
  identityFromListingData,
  mergeIdentityWithHeuristics,
  normalizeIdentity,
  normalizeTitleFingerprint,
  strongAddressMatch,
} from "./identity-utils.ts"
import {
  isHardAliasMatch,
  scoreMatchCandidate,
  shouldAutoLink,
  shouldCreateReview,
} from "./matching.ts"
import {
  buildListingTitle,
  hasEnoughIdentity,
  shouldApplyAiStatus,
} from "./listing-utils.ts"

const CURRENT_PIPELINE_VERSION = 4
const PULL_LIMIT = 20
const ENRICH_LIMIT = 10
const CLASSIFY_LIMIT = 10
const EVIDENCE_LIMIT = 10
const MATCH_LIMIT = 5
const LOCK_SECONDS = 30

type MatchCandidateContext = {
  listingId: string
  applicationId: string | null
  baseIdentity: ExtractedMessageIdentity
  aliases: ExtractedMessageIdentity[]
}

export async function runSync(userId: string): Promise<SyncStats> {
  const stats: SyncStats = {
    pulled: 0,
    enriched: 0,
    classified: 0,
    extracted: 0,
    hasMore: false,
    errors: [],
  }

  const accounts = await db()
    .select()
    .from(emailAccount)
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(emailAccount.status, "active"),
        or(
          isNull(emailAccount.syncLockedUntil),
          lt(emailAccount.syncLockedUntil, new Date())
        )
      )
    )

  for (const acc of accounts) {
    try {
      const locked = await tryLock(acc.id)
      if (!locked) continue
      try {
        const pulled = await pullAccount(acc)
        stats.pulled += pulled.count
        if (pulled.hasMore) stats.hasMore = true
      } finally {
        await unlock(acc.id)
      }
    } catch (error) {
      stats.errors.push(`[${acc.email}] pull: ${(error as Error).message}`)
    }
  }

  try {
    await requeueOutdatedMessages(userId)
  } catch (error) {
    stats.errors.push(`requeue: ${(error as Error).message}`)
  }

  try {
    const enrichResult = await enrichPending(userId)
    stats.enriched = enrichResult.count
    if (enrichResult.hasMore) stats.hasMore = true
  } catch (error) {
    stats.errors.push(`enrich: ${(error as Error).message}`)
  }

  try {
    const classifyResult = await classifyPending(userId)
    stats.classified = classifyResult.count
    if (classifyResult.hasMore) stats.hasMore = true
  } catch (error) {
    stats.errors.push(`classify: ${(error as Error).message}`)
  }

  try {
    const indexResult = await indexIdentityEvidence(userId)
    if (indexResult.hasMore) stats.hasMore = true
  } catch (error) {
    stats.errors.push(`identity: ${(error as Error).message}`)
  }

  try {
    const matchResult = await matchAndAssignPending(userId)
    stats.extracted = matchResult.count
    if (matchResult.hasMore) stats.hasMore = true
  } catch (error) {
    stats.errors.push(`extract: ${(error as Error).message}`)
  }

  return stats
}

async function tryLock(accountId: string): Promise<boolean> {
  const until = new Date(Date.now() + LOCK_SECONDS * 1000)
  const res = await db()
    .update(emailAccount)
    .set({ syncLockedUntil: until })
    .where(
      and(
        eq(emailAccount.id, accountId),
        or(
          isNull(emailAccount.syncLockedUntil),
          lt(emailAccount.syncLockedUntil, new Date())
        )
      )
    )
    .returning({ id: emailAccount.id })
  return res.length > 0
}

async function unlock(accountId: string) {
  await db()
    .update(emailAccount)
    .set({ syncLockedUntil: null, lastSyncedAt: new Date() })
    .where(eq(emailAccount.id, accountId))
}

async function pullAccount(
  acc: typeof emailAccount.$inferSelect
): Promise<{ count: number; hasMore: boolean }> {
  const credsPlain = await appCrypto.decryptJson<EmailAccountCredentials>(
    acc.credentials
  )
  const adapter = await buildAdapter(acc.provider, credsPlain)
  const cutoff = lookbackCutoff(acc.syncLookbackDays)

  let cursor = acc.syncCursor
  const needsReset =
    (acc.provider === "imap" && cursor !== null && !cursor.startsWith("v2:")) ||
    (acc.provider === "outlook" &&
      cursor &&
      cursor.includes("/delta") &&
      !cursor.includes("deltatoken"))

  if (needsReset) {
    cursor = null
    await db()
      .update(emailAccount)
      .set({ syncCursor: null })
      .where(eq(emailAccount.id, acc.id))
  }

  const result = await adapter.pull({
    cursor,
    limit: PULL_LIMIT,
    since: cutoff,
  })

  let inserted = 0
  for (const msg of result.messages) {
    if (cutoff && msg.receivedAt < cutoff) continue
    const [row] = await db()
      .insert(message)
      .values({
        emailAccountId: acc.id,
        providerMessageId: msg.providerMessageId,
        threadId: msg.threadId,
        conversationKey: msg.conversationKey,
        fromAddr: msg.fromAddr,
        fromName: msg.fromName,
        toAddrs: msg.toAddrs,
        subject: msg.subject,
        bodyText: msg.bodyText,
        bodyHtml: msg.bodyHtml,
        receivedAt: msg.receivedAt,
        rawHeaders: msg.rawHeaders,
      })
      .onConflictDoNothing({
        target: [message.emailAccountId, message.providerMessageId],
      })
      .returning({ id: message.id })

    if (!row) continue
    inserted++

    for (const att of msg.attachments) {
      try {
        const up = await uploadBuffer(att.content, att.filename, att.mimeType)
        await db()
          .insert(attachment)
          .values({
            messageId: row.id,
            filename: att.filename,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
            uploadthingKey: up.key,
            uploadthingUrl: up.url,
          })
      } catch {
        await db()
          .insert(attachment)
          .values({
            messageId: row.id,
            filename: att.filename,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes,
          })
      }
    }
  }

  const patch: Partial<typeof emailAccount.$inferInsert> = {
    syncCursor: result.nextCursor,
    updatedAt: new Date(),
  }
  if (result.updatedCredentials) {
    patch.credentials = await appCrypto.encryptJson(result.updatedCredentials)
  }
  await db().update(emailAccount).set(patch).where(eq(emailAccount.id, acc.id))

  return { count: inserted, hasMore: result.messages.length >= PULL_LIMIT }
}

function lookbackCutoff(days: number | null | undefined): Date | null {
  if (!days || days <= 0) return null
  return new Date(Date.now() - days * 86_400_000)
}

function withinLookback() {
  return sql`(${emailAccount.syncLookbackDays} IS NULL OR ${emailAccount.syncLookbackDays} = 0 OR ${message.receivedAt} >= now() - make_interval(days => ${emailAccount.syncLookbackDays}))`
}

async function requeueOutdatedMessages(userId: string) {
  const outdated = await db()
    .select({ id: message.id })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .where(
      and(
        eq(emailAccount.userId, userId),
        lt(message.pipelineVersion, CURRENT_PIPELINE_VERSION),
        withinLookback()
      )
    )

  const ids = outdated.map((row) => row.id)
  if (ids.length === 0) return

  await db()
    .update(message)
    .set({
      enrichmentStatus: "pending",
      classificationStatus: "pending",
      extractionStatus: "pending",
      ignoreReason: null,
      enrichmentError: null,
      classificationError: null,
      extractionError: null,
      updatedAt: new Date(),
    })
    .where(inArray(message.id, ids))
}

async function enrichPending(
  userId: string
): Promise<{ count: number; hasMore: boolean }> {
  const pending = await db()
    .select({
      id: message.id,
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
      receivedAt: message.receivedAt,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(message.enrichmentStatus, "pending"),
        withinLookback()
      )
    )
    .orderBy(desc(message.receivedAt))
    .limit(ENRICH_LIMIT + 1)

  const toProcess = pending.slice(0, ENRICH_LIMIT)
  const hasMore = pending.length > ENRICH_LIMIT

  let done = 0
  for (const row of toProcess) {
    try {
      const enriched = await enrichMessageContent({
        bodyText: row.bodyText,
        bodyHtml: row.bodyHtml,
      })

      await db()
        .update(message)
        .set({
          analysisText: enriched.analysisText,
          analysisMetadata: {
            links: enriched.links,
            iframes: enriched.iframes,
            fetches: enriched.fetches,
          },
          enrichmentStatus: "enriched",
          enrichmentError: null,
          pipelineVersion: CURRENT_PIPELINE_VERSION,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
      done++
    } catch (error) {
      await db()
        .update(message)
        .set({
          enrichmentStatus: "failed",
          enrichmentError: (error as Error).message,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
    }
  }

  return { count: done, hasMore }
}

async function classifyPending(
  userId: string
): Promise<{ count: number; hasMore: boolean }> {
  const aiCfg = await getPrimaryAiConfig(userId)
  if (!aiCfg) return { count: 0, hasMore: false }

  const pending = await db()
    .select({
      id: message.id,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      subject: message.subject,
      analysisText: message.analysisText,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(message.classificationStatus, "pending"),
        eq(message.enrichmentStatus, "enriched"),
        withinLookback()
      )
    )
    .orderBy(desc(message.receivedAt))
    .limit(CLASSIFY_LIMIT + 1)

  const toProcess = pending.slice(0, CLASSIFY_LIMIT)
  const hasMore = pending.length > CLASSIFY_LIMIT

  let done = 0
  for (const row of toProcess) {
    try {
      const { result, raw } = await classifyMessage(aiCfg.adapter, {
        fromAddr: row.fromAddr,
        fromName: row.fromName,
        subject: row.subject,
        analysisText: row.analysisText || row.bodyText,
      })

      const next = classifyRoute(result)

      await db()
        .insert(classification)
        .values({
          messageId: row.id,
          isRentalRelevant: result.isRentalRelevant,
          confidence: result.confidence,
          category: result.category,
          reasoning: result.reasoning,
          model: aiCfg.model,
          provider: aiCfg.provider,
          rawResponse: raw as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: classification.messageId,
          set: {
            isRentalRelevant: result.isRentalRelevant,
            confidence: result.confidence,
            category: result.category,
            reasoning: result.reasoning,
            model: aiCfg.model,
            provider: aiCfg.provider,
            rawResponse: raw as Record<string, unknown>,
            createdAt: new Date(),
          },
        })

      await db()
        .update(message)
        .set({
          classificationStatus: "classified",
          extractionStatus: next.extractionStatus,
          ignoreReason: next.ignoreReason ?? null,
          classificationError: null,
          pipelineVersion: CURRENT_PIPELINE_VERSION,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
      done++
    } catch (error) {
      await db()
        .update(message)
        .set({
          classificationStatus: "failed",
          classificationError: (error as Error).message,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
    }
  }

  return { count: done, hasMore }
}

function classifyRoute(result: ClassificationResultV2) {
  if (result.startsWorkflow && result.isRentalRelevant) {
    return {
      extractionStatus: "pending" as const,
      ignoreReason: null,
    }
  }

  return {
    extractionStatus: "skipped" as const,
    ignoreReason: result.ignoreReason ?? null,
  }
}

async function indexIdentityEvidence(
  userId: string
): Promise<{ count: number; hasMore: boolean }> {
  const aiCfg = await getPrimaryAiConfig(userId)
  if (!aiCfg) return { count: 0, hasMore: false }

  const pending = await db()
    .select({
      id: message.id,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      subject: message.subject,
      rawHeaders: message.rawHeaders,
      analysisText: message.analysisText,
      ignoreReason: message.ignoreReason,
      category: classification.category,
      evidenceId: messageIdentityEvidence.id,
      receivedAt: message.receivedAt,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .innerJoin(classification, eq(classification.messageId, message.id))
    .leftJoin(
      messageIdentityEvidence,
      eq(messageIdentityEvidence.messageId, message.id)
    )
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(message.classificationStatus, "classified"),
        or(
          eq(classification.isRentalRelevant, true),
          eq(message.ignoreReason, "pre_contact_portal_listing")
        ),
        isNull(messageIdentityEvidence.id),
        withinLookback()
      )
    )
    .orderBy(desc(message.receivedAt))
    .limit(EVIDENCE_LIMIT + 1)

  const toProcess = pending.slice(0, EVIDENCE_LIMIT)
  const hasMore = pending.length > EVIDENCE_LIMIT

  let done = 0
  for (const row of toProcess) {
    try {
      const { result } = await extractMessageIdentity(aiCfg.adapter, {
        fromAddr: row.fromAddr,
        fromName: row.fromName,
        subject: row.subject,
        rawHeaders: row.rawHeaders,
        analysisText: row.analysisText,
      })

      const normalized = mergeIdentityWithHeuristics({
        extracted: result,
        fromAddr: row.fromAddr,
        rawHeaders: row.rawHeaders,
      })

      await db()
        .insert(messageIdentityEvidence)
        .values({
          userId,
          messageId: row.id,
          kind: evidenceKindForRow(row.category, row.ignoreReason),
          portal: normalized.portal ?? null,
          portalListingId: normalized.portalListingId ?? null,
          portalThreadKey: normalized.portalThreadKey ?? null,
          canonicalListingUrl: normalized.canonicalListingUrl ?? null,
          relayEmail: normalized.relayEmail ?? null,
          replyToEmail: normalized.replyToEmail ?? null,
          senderEmail: normalized.senderEmail ?? null,
          street: normalized.street ?? null,
          zip: normalized.zip ?? null,
          city: normalized.city ?? null,
          district: normalized.district ?? null,
          rentCold: normalized.rentCold ?? null,
          rentWarm: normalized.rentWarm ?? null,
          sizeSqm: normalized.sizeSqm ?? null,
          rooms: normalized.rooms ?? null,
          titleFingerprint: normalized.titleFingerprint ?? null,
          landlordNameHint: normalized.landlordNameHint ?? null,
          landlordEmailHint: normalized.landlordEmailHint ?? null,
          confidence: normalized.confidence,
        })
        .onConflictDoUpdate({
          target: messageIdentityEvidence.messageId,
          set: {
            kind: evidenceKindForRow(row.category, row.ignoreReason),
            portal: normalized.portal ?? null,
            portalListingId: normalized.portalListingId ?? null,
            portalThreadKey: normalized.portalThreadKey ?? null,
            canonicalListingUrl: normalized.canonicalListingUrl ?? null,
            relayEmail: normalized.relayEmail ?? null,
            replyToEmail: normalized.replyToEmail ?? null,
            senderEmail: normalized.senderEmail ?? null,
            street: normalized.street ?? null,
            zip: normalized.zip ?? null,
            city: normalized.city ?? null,
            district: normalized.district ?? null,
            rentCold: normalized.rentCold ?? null,
            rentWarm: normalized.rentWarm ?? null,
            sizeSqm: normalized.sizeSqm ?? null,
            rooms: normalized.rooms ?? null,
            titleFingerprint: normalized.titleFingerprint ?? null,
            landlordNameHint: normalized.landlordNameHint ?? null,
            landlordEmailHint: normalized.landlordEmailHint ?? null,
            confidence: normalized.confidence,
            updatedAt: new Date(),
          },
        })
      done++
    } catch (error) {
      await db()
        .update(message)
        .set({
          extractionError: `identity: ${(error as Error).message}`,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
    }
  }

  return { count: done, hasMore }
}

function evidenceKindForRow(
  category: string,
  ignoreReason: string | null
): "pre_contact_portal" | "portal_contact_progress" | "landlord_direct" {
  if (ignoreReason === "pre_contact_portal_listing") return "pre_contact_portal"
  if (category === "landlord_direct") return "landlord_direct"
  return "portal_contact_progress"
}

async function matchAndAssignPending(
  userId: string
): Promise<{ count: number; hasMore: boolean }> {
  const aiCfg = await getPrimaryAiConfig(userId)
  if (!aiCfg) return { count: 0, hasMore: false }

  const pending = await db()
    .select({
      id: message.id,
      conversationKey: message.conversationKey,
      fromAddr: message.fromAddr,
      fromName: message.fromName,
      subject: message.subject,
      rawHeaders: message.rawHeaders,
      analysisText: message.analysisText,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      category: classification.category,
      ignoreReason: message.ignoreReason,
      evidenceId: messageIdentityEvidence.id,
    })
    .from(message)
    .innerJoin(emailAccount, eq(message.emailAccountId, emailAccount.id))
    .innerJoin(classification, eq(classification.messageId, message.id))
    .leftJoin(
      messageIdentityEvidence,
      eq(messageIdentityEvidence.messageId, message.id)
    )
    .where(
      and(
        eq(emailAccount.userId, userId),
        eq(message.extractionStatus, "pending"),
        eq(message.classificationStatus, "classified"),
        eq(classification.isRentalRelevant, true),
        withinLookback()
      )
    )
    .orderBy(desc(message.receivedAt))
    .limit(MATCH_LIMIT + 1)

  const toProcess = pending.slice(0, MATCH_LIMIT)
  const hasMore = pending.length > MATCH_LIMIT

  let done = 0
  for (const row of toProcess) {
    try {
      const hasPendingReview = await hasOpenReview(row.id)
      if (hasPendingReview) continue

      const evidence = row.evidenceId
        ? await getEvidenceByMessageId(row.id)
        : await createInlineEvidence(userId, aiCfg.adapter, row)

      const { result } = await analyzeHousingMessage(aiCfg.adapter, {
        fromAddr: row.fromAddr,
        fromName: row.fromName,
        subject: row.subject,
        category: row.category,
        analysisText: row.analysisText || row.bodyText,
      })

      const listingData = mergeListingDataWithIdentity(
        normalizeListingData(result.listingData),
        evidence
      )

      const exactApplication = await findExistingApplicationLink(userId, row.id)
      if (exactApplication) {
        await applyMatchedMessage({
          userId,
          messageId: row.id,
          applicationId: exactApplication.id,
          listingId: exactApplication.listingId,
          receivedAt: row.receivedAt,
          listingData,
          evidence,
          statusSuggestion: result.statusSuggestion,
        })
        done++
        continue
      }

      const byConversation = await findConversationMatch(userId, row.conversationKey)
      if (byConversation) {
        await applyMatchedMessage({
          userId,
          messageId: row.id,
          applicationId: byConversation.id,
          listingId: byConversation.listingId,
          receivedAt: row.receivedAt,
          listingData,
          evidence,
          statusSuggestion: result.statusSuggestion,
        })
        done++
        continue
      }

      const candidates = await getMatchCandidates(userId)
      const rejectionRules = await getRejectionRules(userId)

      const hardAliasMatch = findHardAliasCandidate(
        identityFromEvidenceRow(evidence),
        candidates,
        rejectionRules
      )
      if (hardAliasMatch) {
        const applicationId = await ensureApplicationForListing(
          userId,
          hardAliasMatch.listingId,
          row.receivedAt
        )
        await applyMatchedMessage({
          userId,
          messageId: row.id,
          applicationId,
          listingId: hardAliasMatch.listingId,
          receivedAt: row.receivedAt,
          listingData,
          evidence,
          statusSuggestion: result.statusSuggestion,
        })
        done++
        continue
      }

      const scored = rankCandidates(
        identityFromEvidenceRow(evidence),
        candidates,
        rejectionRules
      )
      const best = scored[0]

      if (best && shouldAutoLink(best.score)) {
        const applicationId = await ensureApplicationForListing(
          userId,
          best.listingId,
          row.receivedAt
        )
        await applyMatchedMessage({
          userId,
          messageId: row.id,
          applicationId,
          listingId: best.listingId,
          receivedAt: row.receivedAt,
          listingData,
          evidence,
          statusSuggestion: result.statusSuggestion,
        })
        done++
        continue
      }

      if (best && shouldCreateReview(best.score)) {
        await createMatchReview(userId, row.id, best)
        await db()
          .update(message)
          .set({
            extractionStatus: "unassigned",
            extractionError: "review_pending",
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            updatedAt: new Date(),
          })
          .where(eq(message.id, row.id))
        done++
        continue
      }

      if (!hasEnoughIdentity(listingData)) {
        await db()
          .update(message)
          .set({
            extractionStatus: "unassigned",
            extractionError: "insufficient_identity",
            pipelineVersion: CURRENT_PIPELINE_VERSION,
            updatedAt: new Date(),
          })
          .where(eq(message.id, row.id))
        done++
        continue
      }

      const existingByDedupe = await findExistingListingForCreate(userId, listingData)
      const listingId = existingByDedupe
        ? existingByDedupe.id
        : await createListing(userId, listingData, row.id)
      const applicationId = await ensureApplicationForListing(
        userId,
        listingId,
        row.receivedAt
      )

      await applyMatchedMessage({
        userId,
        messageId: row.id,
        applicationId,
        listingId,
        receivedAt: row.receivedAt,
        listingData,
        evidence,
        statusSuggestion: result.statusSuggestion,
      })
      done++
    } catch (error) {
      await db()
        .update(message)
        .set({
          extractionStatus: "failed",
          extractionError: (error as Error).message,
          updatedAt: new Date(),
        })
        .where(eq(message.id, row.id))
    }
  }

  return { count: done, hasMore }
}

async function hasOpenReview(messageId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: messageMatchReview.id })
    .from(messageMatchReview)
    .where(
      and(
        eq(messageMatchReview.messageId, messageId),
        eq(messageMatchReview.status, "pending")
      )
    )
    .limit(1)
  return Boolean(row)
}

async function createInlineEvidence(
  userId: string,
  adapter: ReturnType<typeof createAdapter>,
  row: {
    id: string
    fromAddr: string
    fromName: string | null
    subject: string
    rawHeaders: Record<string, string | string[]>
    analysisText: string
    category: string
    ignoreReason: string | null
  }
): Promise<typeof messageIdentityEvidence.$inferSelect> {
  const { result } = await extractMessageIdentity(adapter, {
    fromAddr: row.fromAddr,
    fromName: row.fromName,
    subject: row.subject,
    rawHeaders: row.rawHeaders,
    analysisText: row.analysisText,
  })
  const normalized = mergeIdentityWithHeuristics({
    extracted: result,
    fromAddr: row.fromAddr,
    rawHeaders: row.rawHeaders,
  })
  const inserted = (
    await db()
      .insert(messageIdentityEvidence)
      .values({
        userId,
        messageId: row.id,
        kind: evidenceKindForRow(row.category, row.ignoreReason),
        portal: normalized.portal ?? null,
        portalListingId: normalized.portalListingId ?? null,
        portalThreadKey: normalized.portalThreadKey ?? null,
        canonicalListingUrl: normalized.canonicalListingUrl ?? null,
        relayEmail: normalized.relayEmail ?? null,
        replyToEmail: normalized.replyToEmail ?? null,
        senderEmail: normalized.senderEmail ?? null,
        street: normalized.street ?? null,
        zip: normalized.zip ?? null,
        city: normalized.city ?? null,
        district: normalized.district ?? null,
        rentCold: normalized.rentCold ?? null,
        rentWarm: normalized.rentWarm ?? null,
        sizeSqm: normalized.sizeSqm ?? null,
        rooms: normalized.rooms ?? null,
        titleFingerprint: normalized.titleFingerprint ?? null,
        landlordNameHint: normalized.landlordNameHint ?? null,
        landlordEmailHint: normalized.landlordEmailHint ?? null,
        confidence: normalized.confidence,
      })
      .returning()
  )[0]

  if (!inserted) throw new Error("Failed to create message identity evidence")
  return inserted
}

async function getEvidenceByMessageId(
  messageId: string
): Promise<typeof messageIdentityEvidence.$inferSelect> {
  const [row] = await db()
    .select()
    .from(messageIdentityEvidence)
    .where(eq(messageIdentityEvidence.messageId, messageId))
    .limit(1)
  if (!row) throw new Error("Missing message identity evidence")
  return row
}

async function findExistingApplicationLink(userId: string, messageId: string) {
  const [row] = await db()
    .select({
      id: application.id,
      listingId: application.listingId,
    })
    .from(applicationMessage)
    .innerJoin(application, eq(application.id, applicationMessage.applicationId))
    .where(
      and(
        eq(application.userId, userId),
        eq(applicationMessage.messageId, messageId)
      )
    )
    .limit(1)
  return row ?? null
}

async function findConversationMatch(
  userId: string,
  conversationKey: string | null
): Promise<{ id: string; listingId: string } | null> {
  if (!conversationKey) return null
  const [row] = await db()
    .select({
      id: application.id,
      listingId: application.listingId,
    })
    .from(message)
    .innerJoin(applicationMessage, eq(applicationMessage.messageId, message.id))
    .innerJoin(application, eq(application.id, applicationMessage.applicationId))
    .where(
      and(eq(application.userId, userId), eq(message.conversationKey, conversationKey))
    )
    .orderBy(desc(message.receivedAt))
    .limit(1)
  return row ?? null
}

async function getMatchCandidates(userId: string): Promise<MatchCandidateContext[]> {
  const baseRows = await db()
    .select({
      listingId: listing.id,
      applicationId: application.id,
      title: listing.title,
      sourcePortal: listing.sourcePortal,
      sourceUrl: listing.sourceUrl,
      landlordEmail: listing.landlordEmail,
      addressNormalized: listing.addressNormalized,
      rentCold: listing.rentCold,
      rentWarm: listing.rentWarm,
      sizeSqm: listing.sizeSqm,
      rooms: listing.rooms,
    })
    .from(listing)
    .leftJoin(application, eq(application.listingId, listing.id))
    .where(eq(listing.userId, userId))
    .orderBy(desc(application.lastMessageAt), desc(listing.updatedAt))
    .limit(30)

  const listingIds = Array.from(new Set(baseRows.map((row) => row.listingId)))
  const aliases = listingIds.length
    ? await db()
        .select()
        .from(listingIdentityAlias)
        .where(inArray(listingIdentityAlias.listingId, listingIds))
    : []

  return baseRows.map((row) => ({
    listingId: row.listingId,
    applicationId: row.applicationId ?? null,
    baseIdentity: normalizeIdentity({
      portal: row.sourcePortal ?? undefined,
      canonicalListingUrl: row.sourceUrl ?? undefined,
      street: row.addressNormalized?.street,
      zip: row.addressNormalized?.zip,
      city: row.addressNormalized?.city,
      district: row.addressNormalized?.district,
      rentCold: row.rentCold ?? undefined,
      rentWarm: row.rentWarm ?? undefined,
      sizeSqm: row.sizeSqm ?? undefined,
      rooms: row.rooms ?? undefined,
      landlordEmailHint: row.landlordEmail ?? undefined,
      titleFingerprint: row.title,
      confidence: 1,
    }),
    aliases: aliases
      .filter((alias) => alias.listingId === row.listingId)
      .map((alias) =>
        normalizeIdentity({
          portal: alias.portal ?? undefined,
          portalListingId: alias.portalListingId ?? undefined,
          portalThreadKey: alias.portalThreadKey ?? undefined,
          canonicalListingUrl: alias.canonicalListingUrl ?? undefined,
          relayEmail: alias.relayEmail ?? undefined,
          senderEmail: alias.directEmail ?? undefined,
          street: alias.street ?? undefined,
          zip: alias.zip ?? undefined,
          city: alias.city ?? undefined,
          district: alias.district ?? undefined,
          rentCold: alias.rentCold ?? undefined,
          rentWarm: alias.rentWarm ?? undefined,
          sizeSqm: alias.sizeSqm ?? undefined,
          rooms: alias.rooms ?? undefined,
          titleFingerprint: alias.titleFingerprint ?? undefined,
          confidence: 1,
        })
      ),
  }))
}

async function getRejectionRules(userId: string) {
  return db()
    .select()
    .from(listingMatchRejectionRule)
    .where(eq(listingMatchRejectionRule.userId, userId))
}

function findHardAliasCandidate(
  evidence: ExtractedMessageIdentity,
  candidates: MatchCandidateContext[],
  rejectionRules: Awaited<ReturnType<typeof getRejectionRules>>
): MatchCandidateContext | null {
  for (const candidate of candidates) {
    if (matchesRejectionRule(evidence, candidate.listingId, rejectionRules)) continue
    const identities = [candidate.baseIdentity, ...candidate.aliases]
    for (const identity of identities) {
      const hard = isHardAliasMatch({
        messageIdentity: evidence,
        aliasIdentity: identity,
      })
      if (hard.matched) return candidate
    }
  }
  return null
}

function rankCandidates(
  evidence: ExtractedMessageIdentity,
  candidates: MatchCandidateContext[],
  rejectionRules: Awaited<ReturnType<typeof getRejectionRules>>
): MatchCandidateScore[] {
  const ranked: MatchCandidateScore[] = []
  for (const candidate of candidates) {
    if (matchesRejectionRule(evidence, candidate.listingId, rejectionRules)) continue
    const scores = [candidate.baseIdentity, ...candidate.aliases].map((identity) =>
      scoreMatchCandidate({
        listingId: candidate.listingId,
        applicationId: candidate.applicationId,
        messageIdentity: evidence,
        candidateIdentity: identity,
      })
    )
    const best = scores.sort((a, b) => b.score - a.score)[0]
    if (best && best.score > 0) ranked.push(best)
  }
  return ranked.sort((a, b) => b.score - a.score)
}

function matchesRejectionRule(
  evidence: ExtractedMessageIdentity,
  listingId: string,
  rules: Awaited<ReturnType<typeof getRejectionRules>>
): boolean {
  return rules.some((rule) => {
    if (rule.candidateListingId !== listingId) return false
    if (
      rule.portalListingId &&
      evidence.portalListingId &&
      rule.portalListingId === evidence.portalListingId
    ) {
      return true
    }
    if (
      rule.canonicalListingUrl &&
      evidence.canonicalListingUrl &&
      rule.canonicalListingUrl === evidence.canonicalListingUrl
    ) {
      return true
    }
    if (rule.relayEmail && evidence.relayEmail && rule.relayEmail === evidence.relayEmail) {
      return true
    }
    if (
      rule.senderEmail &&
      evidence.senderEmail &&
      rule.senderEmail === evidence.senderEmail
    ) {
      return true
    }
    if (
      rule.city &&
      evidence.city &&
      rule.city === evidence.city &&
      ((rule.street && evidence.street && rule.street === evidence.street) ||
        (rule.zip && evidence.zip && rule.zip === evidence.zip)) &&
      (!rule.titleFingerprint ||
        !evidence.titleFingerprint ||
        rule.titleFingerprint === evidence.titleFingerprint)
    ) {
      return true
    }
    return false
  })
}

async function createMatchReview(
  userId: string,
  messageId: string,
  best: MatchCandidateScore
) {
  const [existing] = await db()
    .select({ id: messageMatchReview.id })
    .from(messageMatchReview)
    .where(
      and(
        eq(messageMatchReview.messageId, messageId),
        eq(messageMatchReview.candidateListingId, best.listingId),
        eq(messageMatchReview.status, "pending")
      )
    )
    .limit(1)
  if (existing) return

  await db().insert(messageMatchReview).values({
    userId,
    messageId,
    candidateListingId: best.listingId,
    candidateApplicationId: best.applicationId ?? null,
    score: best.score,
    reasons: best.reasons,
  })
}

async function applyMatchedMessage(args: {
  userId: string
  messageId: string
  applicationId: string
  listingId: string
  receivedAt: Date
  listingData: ListingData
  evidence: typeof messageIdentityEvidence.$inferSelect
  statusSuggestion: { suggestedStatus: string; reasoning: string }
}) {
  await updateListingFromAnalysis(args.listingId, args.listingData)
  await db()
    .insert(applicationMessage)
    .values({ applicationId: args.applicationId, messageId: args.messageId })
    .onConflictDoNothing()

  await ensureAliasForListing(args.listingId, args.messageId, args.evidence)
  await consumeMatchingEvidence(args.userId, args.listingId, args.evidence)

  const [appAfterLink] = await db()
    .select({
      status: application.status,
      statusSource: application.statusSource,
    })
    .from(application)
    .where(eq(application.id, args.applicationId))
    .limit(1)
  if (!appAfterLink) throw new Error("Application missing after link")

  const shouldApply = shouldApplyAiStatus({
    currentStatus: appAfterLink.status,
    statusSource: appAfterLink.statusSource,
  })

  await db()
    .update(application)
    .set({
      lastMessageAt: args.receivedAt,
      aiSuggestedStatus: args.statusSuggestion.suggestedStatus as
        | typeof application.$inferSelect.status
        | null,
      aiSuggestedReason: args.statusSuggestion.reasoning,
      aiSuggestedAt: new Date(),
      ...(shouldApply
        ? {
            status: args.statusSuggestion.suggestedStatus as typeof application.$inferSelect.status,
            statusSource: "ai" as const,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(application.id, args.applicationId))

  await db()
    .update(message)
    .set({
      extractionStatus: "extracted",
      extractionError: null,
      pipelineVersion: CURRENT_PIPELINE_VERSION,
      updatedAt: new Date(),
    })
    .where(eq(message.id, args.messageId))

  await db()
    .update(messageMatchReview)
    .set({
      status: "accepted",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageMatchReview.messageId, args.messageId),
        eq(messageMatchReview.candidateListingId, args.listingId),
        eq(messageMatchReview.status, "pending")
      )
    )
}

async function ensureAliasForListing(
  listingId: string,
  messageId: string,
  evidence: typeof messageIdentityEvidence.$inferSelect,
  sourceOverride?: "portal" | "landlord" | "manual_review"
) {
  const [existing] = await db()
    .select({ id: listingIdentityAlias.id })
    .from(listingIdentityAlias)
    .where(
      and(
        eq(listingIdentityAlias.listingId, listingId),
        eq(listingIdentityAlias.createdFromMessageId, messageId)
      )
    )
    .limit(1)
  if (existing) return

  const source =
    sourceOverride ??
    (evidence.kind === "landlord_direct" ? "landlord" : "portal")

  await db().insert(listingIdentityAlias).values({
    listingId,
    source,
    portal: evidence.portal,
    portalListingId: evidence.portalListingId,
    portalThreadKey: evidence.portalThreadKey,
    canonicalListingUrl: evidence.canonicalListingUrl,
    relayEmail: evidence.relayEmail,
    directEmail: evidence.senderEmail ?? evidence.landlordEmailHint,
    street: evidence.street,
    zip: evidence.zip,
    city: evidence.city,
    district: evidence.district,
    rentCold: evidence.rentCold,
    rentWarm: evidence.rentWarm,
    sizeSqm: evidence.sizeSqm,
    rooms: evidence.rooms,
    titleFingerprint: evidence.titleFingerprint,
    createdFromMessageId: messageId,
  })
}

async function consumeMatchingEvidence(
  userId: string,
  listingId: string,
  evidence: typeof messageIdentityEvidence.$inferSelect
) {
  const rows = await db()
    .select()
    .from(messageIdentityEvidence)
    .where(
      and(eq(messageIdentityEvidence.userId, userId), isNull(messageIdentityEvidence.consumedByListingId))
    )

  for (const row of rows) {
    const candidate = normalizeIdentity({
      portal: row.portal ?? undefined,
      portalListingId: row.portalListingId ?? undefined,
      portalThreadKey: row.portalThreadKey ?? undefined,
      canonicalListingUrl: row.canonicalListingUrl ?? undefined,
      relayEmail: row.relayEmail ?? undefined,
      replyToEmail: row.replyToEmail ?? undefined,
      senderEmail: row.senderEmail ?? undefined,
      street: row.street ?? undefined,
      zip: row.zip ?? undefined,
      city: row.city ?? undefined,
      district: row.district ?? undefined,
      rentCold: row.rentCold ?? undefined,
      rentWarm: row.rentWarm ?? undefined,
      sizeSqm: row.sizeSqm ?? undefined,
      rooms: row.rooms ?? undefined,
      titleFingerprint: row.titleFingerprint ?? undefined,
      landlordNameHint: row.landlordNameHint ?? undefined,
      landlordEmailHint: row.landlordEmailHint ?? undefined,
      confidence: row.confidence,
    })

    const hard = isHardAliasMatch({
      messageIdentity: identityFromEvidenceRow(evidence),
      aliasIdentity: candidate,
    })
    if (
      hard.matched ||
      (strongAddressMatch(identityFromEvidenceRow(evidence), candidate) &&
        candidate.titleFingerprint === evidence.titleFingerprint)
    ) {
      await db()
        .update(messageIdentityEvidence)
        .set({
          consumedByListingId: listingId,
          updatedAt: new Date(),
        })
        .where(eq(messageIdentityEvidence.id, row.id))
      await ensureAliasForListing(listingId, row.messageId, row)
    }
  }
}

async function ensureApplicationForListing(
  userId: string,
  listingId: string,
  receivedAt: Date
): Promise<string> {
  const [existingApp] = await db()
    .select({ id: application.id })
    .from(application)
    .where(and(eq(application.userId, userId), eq(application.listingId, listingId)))
    .limit(1)

  if (existingApp) return existingApp.id

  const [inserted] = await db()
    .insert(application)
    .values({
      userId,
      listingId,
      status: "new",
      lastMessageAt: receivedAt,
      statusSource: "manual",
    })
    .returning({ id: application.id })
  if (!inserted) throw new Error("Failed to create application")
  return inserted.id
}

async function findExistingListingForCreate(userId: string, data: ListingData) {
  const key = dedupeKey(data)
  if (key) {
    const [byKey] = await db()
      .select({ id: listing.id })
      .from(listing)
      .where(and(eq(listing.userId, userId), eq(listing.dedupeKey, key)))
      .limit(1)
    if (byKey) return byKey
  }
  const byAddress = await findListingByAddress(userId, data)
  return byAddress
}

async function createListing(
  userId: string,
  data: ListingData,
  messageId: string
): Promise<string> {
  const title = buildListingTitle(data)
  const [inserted] = await db()
    .insert(listing)
    .values({
      userId,
      title,
      addressRaw: data.addressRaw ?? null,
      addressNormalized: buildAddressNormalized(data),
      rentCold: data.rentCold ?? null,
      rentWarm: data.rentWarm ?? null,
      sizeSqm: data.sizeSqm ?? null,
      rooms: data.rooms ?? null,
      sourceUrl: data.sourceUrl ?? null,
      sourcePortal: data.sourcePortal ?? null,
      landlordName: data.landlordName ?? null,
      landlordEmail: data.landlordEmail ?? null,
      landlordContact: {
        name: data.landlordName,
        email: data.landlordEmail,
      },
      dedupeKey: dedupeKey(data),
      createdFromMessageId: messageId,
    })
    .returning({ id: listing.id })
  if (!inserted) throw new Error("Failed to create listing")
  return inserted.id
}

async function updateListingFromAnalysis(listingId: string, data: ListingData) {
  const [existing] = await db()
    .select()
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1)
  if (!existing) throw new Error("Listing missing")

  const overrides = (existing.manualOverrides ?? {}) as Record<string, boolean>

  // Helper: respect manual overrides, otherwise keep-first strategy
  const safe = <T>(field: string, existingVal: T | null | undefined, incomingVal: T | null | undefined): T | null =>
    overrides[field] ? (existingVal ?? null) : ((existingVal ?? incomingVal ?? null) as T | null)

  const nextTitle = overrides["title"]
    ? existing.title
    : buildListingTitle(
        {
          title: data.title || existing.title,
          city: data.city ?? existing.addressNormalized?.city,
          district: data.district ?? existing.addressNormalized?.district,
          rooms: data.rooms ?? existing.rooms ?? undefined,
          sizeSqm: data.sizeSqm ?? existing.sizeSqm ?? undefined,
          rentCold: data.rentCold ?? existing.rentCold ?? undefined,
          rentWarm: data.rentWarm ?? existing.rentWarm ?? undefined,
        },
        existing.title
      )

  const nextAddressNormalized = overrides["addressNormalized"] || overrides["addressRaw"]
    ? existing.addressNormalized
    : mergeAddressNormalized(existing.addressNormalized, data)

  const nextLandlordContact = overrides["landlordName"] && overrides["landlordEmail"] && overrides["landlordPhone"]
    ? existing.landlordContact
    : {
        ...(existing.landlordContact ?? {}),
        name: overrides["landlordName"]
          ? existing.landlordContact?.name
          : (existing.landlordContact?.name ?? existing.landlordName ?? data.landlordName),
        email: overrides["landlordEmail"]
          ? existing.landlordContact?.email
          : (existing.landlordContact?.email ?? existing.landlordEmail ?? data.landlordEmail),
      }

  await db()
    .update(listing)
    .set({
      title: nextTitle,
      addressRaw: safe("addressRaw", existing.addressRaw, data.addressRaw),
      addressNormalized: nextAddressNormalized,
      rentCold: safe("rentCold", existing.rentCold, data.rentCold),
      rentWarm: safe("rentWarm", existing.rentWarm, data.rentWarm),
      sizeSqm: safe("sizeSqm", existing.sizeSqm, data.sizeSqm),
      rooms: safe("rooms", existing.rooms, data.rooms),
      sourceUrl: safe("sourceUrl", existing.sourceUrl, data.sourceUrl),
      sourcePortal: safe("sourcePortal", existing.sourcePortal, data.sourcePortal),
      landlordName: safe("landlordName", existing.landlordName, data.landlordName),
      landlordEmail: overrides["landlordEmail"]
        ? existing.landlordEmail
        : (existing.landlordEmail ??
            existing.landlordContact?.email ??
            data.landlordEmail ??
            null),
      landlordContact: nextLandlordContact,
      dedupeKey: existing.dedupeKey ?? dedupeKey(data),
      updatedAt: new Date(),
    })
    .where(eq(listing.id, listingId))
}

async function findListingByAddress(userId: string, data: ListingData) {
  if (!data.city) return null
  if (!data.street && !data.zip) return null

  const conditions = [
    eq(listing.userId, userId),
    sql`${listing.addressNormalized}->>'city' = ${data.city}`,
  ]
  if (data.street) {
    conditions.push(sql`${listing.addressNormalized}->>'street' = ${data.street}`)
  }
  if (data.zip) {
    conditions.push(sql`${listing.addressNormalized}->>'zip' = ${data.zip}`)
  }

  const [existing] = await db()
    .select({ id: listing.id })
    .from(listing)
    .where(and(...conditions))
    .limit(1)
  return existing ?? null
}

function mergeListingDataWithIdentity(
  data: ListingData,
  evidence: typeof messageIdentityEvidence.$inferSelect
): ListingData {
  const identity = identityFromEvidenceRow(evidence)

  const next = {
    ...data,
    sourcePortal: data.sourcePortal ?? identity.portal,
    sourceUrl: data.sourceUrl ?? identity.canonicalListingUrl,
    street: data.street ?? identity.street,
    zip: data.zip ?? identity.zip,
    city: data.city ?? identity.city,
    district: data.district ?? identity.district,
    rentCold: data.rentCold ?? identity.rentCold,
    rentWarm: data.rentWarm ?? identity.rentWarm,
    sizeSqm: data.sizeSqm ?? identity.sizeSqm,
    rooms: data.rooms ?? identity.rooms,
    landlordEmail: data.landlordEmail ?? identity.landlordEmailHint,
    title: data.title ?? identity.titleFingerprint,
  }

  if (!next.addressRaw) {
    next.addressRaw = [next.street, next.zip, next.city].filter(Boolean).join(", ") || undefined
  }
  return next
}

function identityFromEvidenceRow(
  evidence: typeof messageIdentityEvidence.$inferSelect
): ExtractedMessageIdentity {
  return normalizeIdentity({
    portal: evidence.portal ?? undefined,
    portalListingId: evidence.portalListingId ?? undefined,
    portalThreadKey: evidence.portalThreadKey ?? undefined,
    canonicalListingUrl: evidence.canonicalListingUrl ?? undefined,
    relayEmail: evidence.relayEmail ?? undefined,
    replyToEmail: evidence.replyToEmail ?? undefined,
    senderEmail: evidence.senderEmail ?? undefined,
    street: evidence.street ?? undefined,
    zip: evidence.zip ?? undefined,
    city: evidence.city ?? undefined,
    district: evidence.district ?? undefined,
    rentCold: evidence.rentCold ?? undefined,
    rentWarm: evidence.rentWarm ?? undefined,
    sizeSqm: evidence.sizeSqm ?? undefined,
    rooms: evidence.rooms ?? undefined,
    titleFingerprint: evidence.titleFingerprint ?? undefined,
    landlordNameHint: evidence.landlordNameHint ?? undefined,
    landlordEmailHint: evidence.landlordEmailHint ?? undefined,
    confidence: evidence.confidence,
  })
}

function buildAddressNormalized(data: ListingData) {
  const next = {
    street: data.street,
    zip: data.zip,
    city: data.city,
    district: data.district,
  }
  return Object.values(next).some(Boolean) ? next : null
}

function mergeAddressNormalized(
  existing:
    | {
        street?: string
        zip?: string
        city?: string
        district?: string
      }
    | null,
  incoming: ListingData
) {
  const next = {
    street: existing?.street ?? incoming.street,
    zip: existing?.zip ?? incoming.zip,
    city: existing?.city ?? incoming.city,
    district: existing?.district ?? incoming.district,
  }
  return Object.values(next).some(Boolean) ? next : null
}

function normalizeListingData(data: ListingData): ListingData {
  return {
    title: cleanString(data.title),
    addressRaw: cleanString(data.addressRaw),
    street: cleanString(data.street),
    zip: cleanString(data.zip),
    city: cleanString(data.city),
    district: cleanString(data.district),
    sizeSqm: normalizeNumber(data.sizeSqm),
    rooms: normalizeNumber(data.rooms),
    rentCold: normalizeNumber(data.rentCold),
    rentWarm: normalizeNumber(data.rentWarm),
    landlordName: cleanString(data.landlordName),
    landlordEmail: cleanString(data.landlordEmail)?.toLowerCase(),
    sourceUrl: cleanString(data.sourceUrl),
    sourcePortal: cleanString(data.sourcePortal),
  }
}

function cleanString(value: string | undefined): string | undefined {
  const next = value?.replace(/\s+/g, " ").trim()
  return next || undefined
}

function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

async function buildAdapter(
  provider: typeof emailAccount.$inferSelect["provider"],
  creds: EmailAccountCredentials
) {
  if (provider === "imap") {
    if (creds.type !== "imap") throw new Error("IMAP account missing IMAP creds")
    return createImapAdapter(creds.imap)
  }
  if (creds.type !== "oauth") {
    throw new Error(`${provider} account missing oauth creds`)
  }
  if (provider === "gmail") {
    return createGmailAdapter({
      credentials: creds.oauth,
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirectUri: requireEnv("GOOGLE_REDIRECT_URI"),
    })
  }
  return createOutlookAdapter({
    credentials: creds.oauth,
    clientId: requireEnv("MICROSOFT_CLIENT_ID"),
    clientSecret: requireEnv("MICROSOFT_CLIENT_SECRET"),
    redirectUri: requireEnv("MICROSOFT_REDIRECT_URI"),
  })
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} env var is required`)
  return value
}

type ResolvedAiConfig = {
  provider: AiProvider
  model: string
  adapter: ReturnType<typeof createAdapter>
}

async function getPrimaryAiConfig(
  userId: string
): Promise<ResolvedAiConfig | null> {
  const [primary] = await db()
    .select()
    .from(aiProviderConfig)
    .where(
      and(
        eq(aiProviderConfig.userId, userId),
        eq(aiProviderConfig.enabled, true),
        eq(aiProviderConfig.isPrimary, true)
      )
    )
    .limit(1)

  const [fallback] = primary
    ? [primary]
    : await db()
        .select()
        .from(aiProviderConfig)
        .where(
          and(
            eq(aiProviderConfig.userId, userId),
            eq(aiProviderConfig.enabled, true)
          )
        )
        .limit(1)

  if (!fallback) return null

  const apiKey = await appCrypto.decrypt(fallback.apiKeyEncrypted)
  const model = fallback.defaultModel || DEFAULT_MODELS[fallback.provider]
  const adapter = createAdapter({ provider: fallback.provider, apiKey, model })
  return { provider: fallback.provider, model, adapter }
}

export type { SyncStats }
