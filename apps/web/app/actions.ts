"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import {
  aiProviderConfig,
  application,
  applicationMessage,
  db,
  emailAccount,
  listing,
  listingIdentityAlias,
  listingMatchRejectionRule,
  message,
  messageIdentityEvidence,
  messageMatchReview,
  userCorrection,
} from "@workspace/db"
import * as appCrypto from "@workspace/core/crypto"
import { APPLICATION_STATUSES, AI_PROVIDERS } from "@workspace/core/status"
import type { UserCorrectionKind } from "@workspace/core/status"
import { DEFAULT_MODELS, createAdapter } from "@workspace/ai"
import type { EmailAccountCredentials } from "@workspace/core/types"
import { requireSession } from "@/lib/session"

// ---------- Email accounts ----------

const ImapSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.coerce.boolean(),
  user: z.string().min(1),
  password: z.string().min(1),
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpSecure: z.coerce.boolean().optional(),
})

export async function addImapAccount(formData: FormData) {
  const session = await requireSession()
  const parsed = ImapSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const v = parsed.data
  const creds: EmailAccountCredentials = {
    type: "imap",
    imap: {
      host: v.host,
      port: v.port,
      secure: v.secure,
      user: v.user,
      password: v.password,
      smtpHost: v.smtpHost,
      smtpPort: v.smtpPort,
      smtpSecure: v.smtpSecure,
    },
  }
  const encrypted = await appCrypto.encryptJson(creds)

  await db()
    .insert(emailAccount)
    .values({
      userId: session.user.id,
      provider: "imap",
      email: v.email,
      displayName: v.displayName ?? v.email,
      credentials: encrypted,
    })
    .onConflictDoUpdate({
      target: [emailAccount.userId, emailAccount.email],
      set: {
        credentials: encrypted,
        displayName: v.displayName ?? v.email,
        status: "active",
        updatedAt: new Date(),
      },
    })

  revalidatePath("/settings/email-accounts")
  return { ok: true }
}

export async function deleteEmailAccount(formData: FormData) {
  const session = await requireSession()
  const id = String(formData.get("id") ?? "")
  if (!id) return { error: "Missing id" }
  await db()
    .delete(emailAccount)
    .where(
      and(eq(emailAccount.id, id), eq(emailAccount.userId, session.user.id))
    )
  revalidatePath("/settings/email-accounts")
  return { ok: true }
}

const LookbackSchema = z.object({
  id: z.string().min(1),
  // 0 = no limit, else max 5 years to prevent absurd ranges.
  days: z.coerce.number().int().min(0).max(365 * 5),
})

export async function updateEmailAccountLookback(formData: FormData) {
  const session = await requireSession()
  const parsed = LookbackSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "invalid" }
  const { id, days } = parsed.data

  await db()
    .update(emailAccount)
    .set({ syncLookbackDays: days, updatedAt: new Date() })
    .where(and(eq(emailAccount.id, id), eq(emailAccount.userId, session.user.id)))

  revalidatePath("/settings/email-accounts")
  return { ok: true }
}

// ---------- AI providers ----------

const AiProviderSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().min(10),
  model: z.string().optional(),
  isPrimary: z.coerce.boolean().optional(),
})

export async function saveAiProvider(formData: FormData) {
  const session = await requireSession()
  const parsed = AiProviderSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }
  const { provider, apiKey, model, isPrimary } = parsed.data
  const encrypted = await appCrypto.encrypt(apiKey)
  const defaultModel = model || DEFAULT_MODELS[provider]

  if (isPrimary) {
    await db()
      .update(aiProviderConfig)
      .set({ isPrimary: false })
      .where(eq(aiProviderConfig.userId, session.user.id))
  }

  await db()
    .insert(aiProviderConfig)
    .values({
      userId: session.user.id,
      provider,
      apiKeyEncrypted: encrypted,
      defaultModel,
      enabled: true,
      isPrimary: !!isPrimary,
    })
    .onConflictDoUpdate({
      target: [aiProviderConfig.userId, aiProviderConfig.provider],
      set: {
        apiKeyEncrypted: encrypted,
        defaultModel,
        enabled: true,
        isPrimary: !!isPrimary,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/settings/ai-providers")
  return { ok: true }
}

export async function testAiProvider(formData: FormData) {
  const session = await requireSession()
  const provider = String(formData.get("provider") ?? "")
  const [cfg] = await db()
    .select()
    .from(aiProviderConfig)
    .where(
      and(
        eq(aiProviderConfig.userId, session.user.id),
        eq(
          aiProviderConfig.provider,
          provider as (typeof AI_PROVIDERS)[number]
        )
      )
    )
    .limit(1)
  if (!cfg) return { ok: false, error: "Provider not configured" }
  const apiKey = await appCrypto.decrypt(cfg.apiKeyEncrypted)
  const adapter = createAdapter({
    provider: cfg.provider,
    apiKey,
    model: cfg.defaultModel,
  })
  return adapter.ping()
}

export async function deleteAiProvider(formData: FormData) {
  const session = await requireSession()
  const id = String(formData.get("id") ?? "")
  await db()
    .delete(aiProviderConfig)
    .where(
      and(
        eq(aiProviderConfig.id, id),
        eq(aiProviderConfig.userId, session.user.id)
      )
    )
  revalidatePath("/settings/ai-providers")
  return { ok: true }
}

// ---------- Applications ----------

const StatusSchema = z.object({
  id: z.string(),
  status: z.enum(APPLICATION_STATUSES),
})

export async function updateApplicationStatus(input: {
  id: string
  status: (typeof APPLICATION_STATUSES)[number]
}) {
  const session = await requireSession()
  const parsed = StatusSchema.safeParse(input)
  if (!parsed.success) return { error: "invalid" }

  // Fetch current status for correction recording
  const [current] = await db()
    .select({
      status: application.status,
      statusSource: application.statusSource,
      listingId: application.listingId,
    })
    .from(application)
    .where(
      and(
        eq(application.id, parsed.data.id),
        eq(application.userId, session.user.id)
      )
    )
    .limit(1)

  if (!current) return { error: "not_found" }

  await db()
    .update(application)
    .set({
      status: parsed.data.status,
      statusSource: "manual",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(application.id, parsed.data.id),
        eq(application.userId, session.user.id)
      )
    )

  await recordCorrection({
    userId: session.user.id,
    kind: "status_override",
    applicationId: parsed.data.id,
    listingId: current.listingId,
    beforeValue: { status: current.status, statusSource: current.statusSource },
    afterValue: { status: parsed.data.status, statusSource: "manual" },
  })

  revalidatePath("/applications")
  revalidatePath(`/applications/${parsed.data.id}`)
  return { ok: true }
}

export async function updateApplicationNotes(input: {
  id: string
  notes: string
}) {
  const session = await requireSession()
  await db()
    .update(application)
    .set({ notes: input.notes, updatedAt: new Date() })
    .where(
      and(
        eq(application.id, input.id),
        eq(application.userId, session.user.id)
      )
    )
  revalidatePath(`/applications/${input.id}`)
  return { ok: true }
}

export async function acceptMatchReview(formData: FormData) {
  const session = await requireSession()
  const reviewId = String(formData.get("reviewId") ?? "")
  if (!reviewId) return

  const [review] = await db()
    .select({
      id: messageMatchReview.id,
      userId: messageMatchReview.userId,
      messageId: messageMatchReview.messageId,
      candidateListingId: messageMatchReview.candidateListingId,
      candidateApplicationId: messageMatchReview.candidateApplicationId,
      status: messageMatchReview.status,
      receivedAt: message.receivedAt,
      evidenceId: messageIdentityEvidence.id,
      portal: messageIdentityEvidence.portal,
      portalListingId: messageIdentityEvidence.portalListingId,
      portalThreadKey: messageIdentityEvidence.portalThreadKey,
      canonicalListingUrl: messageIdentityEvidence.canonicalListingUrl,
      relayEmail: messageIdentityEvidence.relayEmail,
      senderEmail: messageIdentityEvidence.senderEmail,
      street: messageIdentityEvidence.street,
      zip: messageIdentityEvidence.zip,
      city: messageIdentityEvidence.city,
      district: messageIdentityEvidence.district,
      rentCold: messageIdentityEvidence.rentCold,
      rentWarm: messageIdentityEvidence.rentWarm,
      sizeSqm: messageIdentityEvidence.sizeSqm,
      rooms: messageIdentityEvidence.rooms,
      titleFingerprint: messageIdentityEvidence.titleFingerprint,
    })
    .from(messageMatchReview)
    .innerJoin(message, eq(message.id, messageMatchReview.messageId))
    .leftJoin(
      messageIdentityEvidence,
      eq(messageIdentityEvidence.messageId, messageMatchReview.messageId)
    )
    .where(
      and(
        eq(messageMatchReview.id, reviewId),
        eq(messageMatchReview.userId, session.user.id)
      )
    )
    .limit(1)

  if (!review || review.status !== "pending") return

  const applicationId = review.candidateApplicationId
    ? review.candidateApplicationId
    : await ensureApplicationForListingForUser(
        session.user.id,
        review.candidateListingId,
        review.receivedAt
      )

  await db()
    .insert(applicationMessage)
    .values({
      applicationId,
      messageId: review.messageId,
    })
    .onConflictDoNothing()

  await db()
    .update(message)
    .set({
      extractionStatus: "extracted",
      extractionError: null,
      updatedAt: new Date(),
    })
    .where(eq(message.id, review.messageId))

  await db()
    .update(application)
    .set({
      lastMessageAt: review.receivedAt,
      updatedAt: new Date(),
    })
    .where(eq(application.id, applicationId))

  if (review.evidenceId) {
    await db()
      .insert(listingIdentityAlias)
      .values({
        listingId: review.candidateListingId,
        source: "manual_review",
        portal: review.portal,
        portalListingId: review.portalListingId,
        portalThreadKey: review.portalThreadKey,
        canonicalListingUrl: review.canonicalListingUrl,
        relayEmail: review.relayEmail,
        directEmail: review.senderEmail,
        street: review.street,
        zip: review.zip,
        city: review.city,
        district: review.district,
        rentCold: review.rentCold,
        rentWarm: review.rentWarm,
        sizeSqm: review.sizeSqm,
        rooms: review.rooms,
        titleFingerprint: review.titleFingerprint,
        createdFromMessageId: review.messageId,
      })
      .onConflictDoNothing()

    await db()
      .update(messageIdentityEvidence)
      .set({
        consumedByListingId: review.candidateListingId,
        updatedAt: new Date(),
      })
      .where(eq(messageIdentityEvidence.id, review.evidenceId))
  }

  await db()
    .update(messageMatchReview)
    .set({
      status: "accepted",
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(messageMatchReview.id, review.id))

  await db()
    .update(messageMatchReview)
    .set({
      status: "rejected",
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageMatchReview.messageId, review.messageId),
        eq(messageMatchReview.status, "pending")
      )
    )

  await recordCorrection({
    userId: session.user.id,
    kind: "match_review_accept",
    messageId: review.messageId,
    listingId: review.candidateListingId,
    applicationId,
    beforeValue: { reviewId: review.id },
    afterValue: { decision: "accepted" },
  })

  revalidatePath("/inbox")
  revalidatePath("/applications")
  revalidatePath(`/applications/${applicationId}`)
}

export async function rejectMatchReview(formData: FormData) {
  const session = await requireSession()
  const reviewId = String(formData.get("reviewId") ?? "")
  if (!reviewId) return

  const [review] = await db()
    .select({
      id: messageMatchReview.id,
      userId: messageMatchReview.userId,
      messageId: messageMatchReview.messageId,
      candidateListingId: messageMatchReview.candidateListingId,
      status: messageMatchReview.status,
      portalListingId: messageIdentityEvidence.portalListingId,
      canonicalListingUrl: messageIdentityEvidence.canonicalListingUrl,
      relayEmail: messageIdentityEvidence.relayEmail,
      senderEmail: messageIdentityEvidence.senderEmail,
      street: messageIdentityEvidence.street,
      zip: messageIdentityEvidence.zip,
      city: messageIdentityEvidence.city,
      titleFingerprint: messageIdentityEvidence.titleFingerprint,
    })
    .from(messageMatchReview)
    .leftJoin(
      messageIdentityEvidence,
      eq(messageIdentityEvidence.messageId, messageMatchReview.messageId)
    )
    .where(
      and(
        eq(messageMatchReview.id, reviewId),
        eq(messageMatchReview.userId, session.user.id)
      )
    )
    .limit(1)

  if (!review || review.status !== "pending") return

  await db().insert(listingMatchRejectionRule).values({
    userId: session.user.id,
    candidateListingId: review.candidateListingId,
    portalListingId: review.portalListingId,
    canonicalListingUrl: review.canonicalListingUrl,
    relayEmail: review.relayEmail,
    senderEmail: review.senderEmail,
    street: review.street,
    zip: review.zip,
    city: review.city,
    titleFingerprint: review.titleFingerprint,
  })

  await db()
    .update(messageMatchReview)
    .set({
      status: "rejected",
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(messageMatchReview.id, review.id))

  await db()
    .update(message)
    .set({
      extractionStatus: "unassigned",
      extractionError: "review_rejected",
      updatedAt: new Date(),
    })
    .where(eq(message.id, review.messageId))

  await recordCorrection({
    userId: session.user.id,
    kind: "match_review_reject",
    messageId: review.messageId,
    listingId: review.candidateListingId,
    beforeValue: { reviewId: review.id },
    afterValue: { decision: "rejected" },
  })

  revalidatePath("/inbox")
}

async function ensureApplicationForListingForUser(
  userId: string,
  listingId: string,
  receivedAt: Date
) {
  const [existing] = await db()
    .select({ id: application.id })
    .from(application)
    .where(and(eq(application.userId, userId), eq(application.listingId, listingId)))
    .limit(1)
  if (existing) return existing.id

  const [inserted] = await db()
    .insert(application)
    .values({
      userId,
      listingId,
      status: "new",
      statusSource: "manual",
      lastMessageAt: receivedAt,
    })
    .returning({ id: application.id })
  if (!inserted) throw new Error("failed_to_create_application")
  return inserted.id
}

// ---------- Correction recording (F3) ----------

async function recordCorrection(data: {
  userId: string
  kind: UserCorrectionKind
  messageId?: string
  listingId?: string
  applicationId?: string
  beforeValue?: Record<string, unknown>
  afterValue?: Record<string, unknown>
  context?: Record<string, unknown>
}) {
  await db()
    .insert(userCorrection)
    .values({
      userId: data.userId,
      kind: data.kind,
      messageId: data.messageId ?? null,
      listingId: data.listingId ?? null,
      applicationId: data.applicationId ?? null,
      beforeValue: data.beforeValue ?? {},
      afterValue: data.afterValue ?? {},
      context: data.context ?? {},
    })
}

// ---------- Manual mail assignment (F1) ----------

export async function getUserListings() {
  const session = await requireSession()
  return db()
    .select({
      id: listing.id,
      title: listing.title,
      addressRaw: listing.addressRaw,
      addressNormalized: listing.addressNormalized,
      rentWarm: listing.rentWarm,
      rooms: listing.rooms,
      sourcePortal: listing.sourcePortal,
    })
    .from(listing)
    .where(eq(listing.userId, session.user.id))
    .orderBy(desc(listing.updatedAt))
}

const AssignSchema = z.object({
  messageId: z.string().min(1),
  listingId: z.string().min(1),
})

export async function assignMessageToListing(input: {
  messageId: string
  listingId: string
}) {
  const session = await requireSession()
  const parsed = AssignSchema.safeParse(input)
  if (!parsed.success) return { error: "invalid" }
  const { messageId, listingId } = parsed.data

  // Validate message ownership via emailAccount
  const [msg] = await db()
    .select({
      id: message.id,
      receivedAt: message.receivedAt,
      subject: message.subject,
      fromAddr: message.fromAddr,
      accountUserId: emailAccount.userId,
    })
    .from(message)
    .innerJoin(emailAccount, eq(emailAccount.id, message.emailAccountId))
    .where(eq(message.id, messageId))
    .limit(1)
  if (!msg || msg.accountUserId !== session.user.id) return { error: "not_found" }

  // Validate listing ownership
  const [lst] = await db()
    .select({ id: listing.id, title: listing.title })
    .from(listing)
    .where(and(eq(listing.id, listingId), eq(listing.userId, session.user.id)))
    .limit(1)
  if (!lst) return { error: "listing_not_found" }

  const applicationId = await ensureApplicationForListingForUser(
    session.user.id,
    listingId,
    msg.receivedAt
  )

  await db()
    .insert(applicationMessage)
    .values({ applicationId, messageId, source: "manual_assignment" })
    .onConflictDoNothing()

  await db()
    .update(message)
    .set({ extractionStatus: "extracted", extractionError: null, updatedAt: new Date() })
    .where(eq(message.id, messageId))

  await db()
    .update(application)
    .set({ lastMessageAt: msg.receivedAt, updatedAt: new Date() })
    .where(eq(application.id, applicationId))

  // Consume identity evidence if present
  const [evidence] = await db()
    .select()
    .from(messageIdentityEvidence)
    .where(eq(messageIdentityEvidence.messageId, messageId))
    .limit(1)

  if (evidence) {
    await db()
      .insert(listingIdentityAlias)
      .values({
        listingId,
        source: "manual_assignment",
        portal: evidence.portal,
        portalListingId: evidence.portalListingId,
        portalThreadKey: evidence.portalThreadKey,
        canonicalListingUrl: evidence.canonicalListingUrl,
        relayEmail: evidence.relayEmail,
        directEmail: evidence.senderEmail,
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
      .onConflictDoNothing()

    await db()
      .update(messageIdentityEvidence)
      .set({ consumedByListingId: listingId, updatedAt: new Date() })
      .where(eq(messageIdentityEvidence.id, evidence.id))
  }

  // Reject pending match reviews for this message
  await db()
    .update(messageMatchReview)
    .set({
      status: "rejected",
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(messageMatchReview.messageId, messageId),
        eq(messageMatchReview.status, "pending")
      )
    )

  await recordCorrection({
    userId: session.user.id,
    kind: "manual_assignment",
    messageId,
    listingId,
    applicationId,
    afterValue: { listingId, applicationId },
    context: { messageSubject: msg.subject, messageFrom: msg.fromAddr, listingTitle: lst.title },
  })

  revalidatePath("/inbox")
  revalidatePath("/applications")
  revalidatePath(`/applications/${applicationId}`)
  return { ok: true }
}

export async function reassignMessage(input: {
  messageId: string
  fromApplicationId: string
  toListingId: string
}) {
  const session = await requireSession()
  const { messageId, fromApplicationId, toListingId } = input
  if (!messageId || !fromApplicationId || !toListingId) return { error: "invalid" }

  // Validate ownership of source application
  const [fromApp] = await db()
    .select({ id: application.id, listingId: application.listingId })
    .from(application)
    .where(
      and(eq(application.id, fromApplicationId), eq(application.userId, session.user.id))
    )
    .limit(1)
  if (!fromApp) return { error: "not_found" }

  // Validate message ownership
  const [msg] = await db()
    .select({
      id: message.id,
      receivedAt: message.receivedAt,
      accountUserId: emailAccount.userId,
    })
    .from(message)
    .innerJoin(emailAccount, eq(emailAccount.id, message.emailAccountId))
    .where(eq(message.id, messageId))
    .limit(1)
  if (!msg || msg.accountUserId !== session.user.id) return { error: "not_found" }

  // Validate target listing ownership
  const [toListing] = await db()
    .select({ id: listing.id })
    .from(listing)
    .where(and(eq(listing.id, toListingId), eq(listing.userId, session.user.id)))
    .limit(1)
  if (!toListing) return { error: "listing_not_found" }

  // Remove from old application
  await db()
    .delete(applicationMessage)
    .where(
      and(
        eq(applicationMessage.applicationId, fromApplicationId),
        eq(applicationMessage.messageId, messageId)
      )
    )

  // Add to new application
  const newAppId = await ensureApplicationForListingForUser(
    session.user.id,
    toListingId,
    msg.receivedAt
  )

  await db()
    .insert(applicationMessage)
    .values({ applicationId: newAppId, messageId, source: "manual_assignment" })
    .onConflictDoNothing()

  await db()
    .update(application)
    .set({ lastMessageAt: msg.receivedAt, updatedAt: new Date() })
    .where(eq(application.id, newAppId))

  // Create alias from evidence if available
  const [evidence] = await db()
    .select()
    .from(messageIdentityEvidence)
    .where(eq(messageIdentityEvidence.messageId, messageId))
    .limit(1)

  if (evidence) {
    await db()
      .insert(listingIdentityAlias)
      .values({
        listingId: toListingId,
        source: "manual_assignment",
        portal: evidence.portal,
        portalListingId: evidence.portalListingId,
        portalThreadKey: evidence.portalThreadKey,
        canonicalListingUrl: evidence.canonicalListingUrl,
        relayEmail: evidence.relayEmail,
        directEmail: evidence.senderEmail,
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
      .onConflictDoNothing()
  }

  await recordCorrection({
    userId: session.user.id,
    kind: "reassignment",
    messageId,
    listingId: toListingId,
    applicationId: newAppId,
    beforeValue: { listingId: fromApp.listingId, applicationId: fromApplicationId },
    afterValue: { listingId: toListingId, applicationId: newAppId },
  })

  revalidatePath("/inbox")
  revalidatePath("/applications")
  revalidatePath(`/applications/${fromApplicationId}`)
  revalidatePath(`/applications/${newAppId}`)
  return { ok: true }
}

export async function unassignMessage(input: {
  messageId: string
  applicationId: string
}) {
  const session = await requireSession()
  const { messageId, applicationId: appId } = input
  if (!messageId || !appId) return { error: "invalid" }

  // Validate ownership
  const [app] = await db()
    .select({ id: application.id, listingId: application.listingId })
    .from(application)
    .where(and(eq(application.id, appId), eq(application.userId, session.user.id)))
    .limit(1)
  if (!app) return { error: "not_found" }

  await db()
    .delete(applicationMessage)
    .where(
      and(
        eq(applicationMessage.applicationId, appId),
        eq(applicationMessage.messageId, messageId)
      )
    )

  await db()
    .update(message)
    .set({
      extractionStatus: "unassigned",
      extractionError: "manually_unassigned",
      updatedAt: new Date(),
    })
    .where(eq(message.id, messageId))

  await recordCorrection({
    userId: session.user.id,
    kind: "unassignment",
    messageId,
    listingId: app.listingId,
    applicationId: appId,
    beforeValue: { listingId: app.listingId, applicationId: appId },
    afterValue: {},
  })

  revalidatePath("/inbox")
  revalidatePath("/applications")
  revalidatePath(`/applications/${appId}`)
  return { ok: true }
}

// ---------- Manual listing edits (F2) ----------

const EditableListingSchema = z.object({
  listingId: z.string().min(1),
  fields: z.object({
    title: z.string().optional(),
    addressRaw: z.string().optional(),
    rentCold: z.number().nullable().optional(),
    rentWarm: z.number().nullable().optional(),
    sizeSqm: z.number().nullable().optional(),
    rooms: z.number().nullable().optional(),
    floor: z.string().nullable().optional(),
    availableFrom: z.string().nullable().optional(),
    landlordName: z.string().nullable().optional(),
    landlordEmail: z.string().nullable().optional(),
    landlordPhone: z.string().nullable().optional(),
    landlordAgency: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
  }),
})

export async function updateListingFields(input: {
  listingId: string
  fields: Record<string, unknown>
}) {
  const session = await requireSession()
  const parsed = EditableListingSchema.safeParse(input)
  if (!parsed.success) return { error: "invalid" }
  const { listingId, fields } = parsed.data

  // Fetch existing listing
  const [existing] = await db()
    .select()
    .from(listing)
    .where(and(eq(listing.id, listingId), eq(listing.userId, session.user.id)))
    .limit(1)
  if (!existing) return { error: "not_found" }

  // Build update set and track overrides
  const overrides = { ...(existing.manualOverrides ?? {}) } as Record<string, boolean>
  const beforeValue: Record<string, unknown> = {}
  const updateSet: Record<string, unknown> = { updatedAt: new Date() }

  // Direct field mappings
  const directFields = [
    "title",
    "addressRaw",
    "rentCold",
    "rentWarm",
    "sizeSqm",
    "rooms",
    "floor",
    "availableFrom",
    "landlordName",
    "landlordEmail",
    "sourceUrl",
  ] as const
  for (const field of directFields) {
    if (field in fields) {
      beforeValue[field] = existing[field]
      updateSet[field] = fields[field as keyof typeof fields]
      overrides[field] = true
    }
  }

  // Handle landlordContact sub-fields
  const existingContact = existing.landlordContact ?? {}
  let contactChanged = false
  const newContact = { ...existingContact }
  if ("landlordPhone" in fields) {
    beforeValue.landlordPhone = existingContact.phone
    newContact.phone = fields.landlordPhone ?? undefined
    overrides.landlordPhone = true
    contactChanged = true
  }
  if ("landlordAgency" in fields) {
    beforeValue.landlordAgency = existingContact.agency
    newContact.agency = fields.landlordAgency ?? undefined
    overrides.landlordAgency = true
    contactChanged = true
  }
  if (contactChanged) {
    updateSet.landlordContact = newContact
  }

  // If addressRaw changed, also protect addressNormalized
  if ("addressRaw" in fields) {
    overrides.addressNormalized = true
  }

  updateSet.manualOverrides = overrides

  await db()
    .update(listing)
    .set(updateSet)
    .where(eq(listing.id, listingId))

  // Find applications for this listing to revalidate
  const apps = await db()
    .select({ id: application.id })
    .from(application)
    .where(
      and(eq(application.listingId, listingId), eq(application.userId, session.user.id))
    )

  await recordCorrection({
    userId: session.user.id,
    kind: "listing_field_edit",
    listingId,
    beforeValue,
    afterValue: fields as Record<string, unknown>,
  })

  revalidatePath("/applications")
  for (const app of apps) {
    revalidatePath(`/applications/${app.id}`)
  }
  return { ok: true }
}
