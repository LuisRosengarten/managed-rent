import { relations, sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_SOURCES,
  AI_PROVIDERS,
  CLASSIFICATION_STATUSES,
  EMAIL_PROVIDERS,
  ENRICHMENT_STATUSES,
  EXTRACTION_STATUSES,
  IDENTITY_EVIDENCE_KINDS,
  LISTING_ALIAS_SOURCES,
  MATCH_REVIEW_STATUSES,
  MESSAGE_CATEGORIES,
  MESSAGE_IGNORE_REASONS,
  USER_CORRECTION_KINDS,
} from "@workspace/core/status"

// ---------- Enums ----------

export const applicationStatusEnum = pgEnum(
  "application_status",
  APPLICATION_STATUSES
)
export const emailProviderEnum = pgEnum("email_provider", EMAIL_PROVIDERS)
export const aiProviderEnum = pgEnum("ai_provider", AI_PROVIDERS)
export const classificationStatusEnum = pgEnum(
  "classification_status",
  CLASSIFICATION_STATUSES
)
export const enrichmentStatusEnum = pgEnum(
  "enrichment_status",
  ENRICHMENT_STATUSES
)
export const extractionStatusEnum = pgEnum(
  "extraction_status",
  EXTRACTION_STATUSES
)
export const applicationStatusSourceEnum = pgEnum(
  "application_status_source",
  APPLICATION_STATUS_SOURCES
)
export const messageIgnoreReasonEnum = pgEnum(
  "message_ignore_reason",
  MESSAGE_IGNORE_REASONS
)
export const messageCategoryEnum = pgEnum(
  "message_category",
  MESSAGE_CATEGORIES
)
export const identityEvidenceKindEnum = pgEnum(
  "identity_evidence_kind",
  IDENTITY_EVIDENCE_KINDS
)
export const listingAliasSourceEnum = pgEnum(
  "listing_alias_source",
  LISTING_ALIAS_SOURCES
)
export const matchReviewStatusEnum = pgEnum(
  "match_review_status",
  MATCH_REVIEW_STATUSES
)
export const userCorrectionKindEnum = pgEnum(
  "user_correction_kind",
  USER_CORRECTION_KINDS
)

// ---------- Better-Auth tables ----------
// Schema per better-auth docs (https://www.better-auth.com/docs/adapters/drizzle)

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp().notNull(),
  ipAddress: text(),
  userAgent: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export const account = pgTable("account", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  idToken: text(),
  password: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

// ---------- App tables ----------

export const emailAccount = pgTable(
  "email_account",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: emailProviderEnum().notNull(),
    email: text().notNull(),
    displayName: text(),
    // AES-GCM encrypted JSON of EmailAccountCredentials
    credentials: text().notNull(),
    syncCursor: text(),
    lastSyncedAt: timestamp(),
    syncLockedUntil: timestamp(),
    // Analyze emails received within last N days. 0 / null = no limit.
    syncLookbackDays: integer().notNull().default(30),
    status: text().notNull().default("active"), // active | disabled | error
    errorMessage: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_account_user_email_uq").on(t.userId, t.email)]
)

export const message = pgTable(
  "message",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    emailAccountId: text()
      .notNull()
      .references(() => emailAccount.id, { onDelete: "cascade" }),
    providerMessageId: text().notNull(),
    threadId: text(),
    fromAddr: text().notNull(),
    fromName: text(),
    toAddrs: jsonb().$type<string[]>().notNull().default([]),
    subject: text().notNull().default(""),
    bodyText: text().notNull().default(""),
    bodyHtml: text(),
    conversationKey: text(),
    receivedAt: timestamp().notNull(),
    rawHeaders: jsonb()
      .$type<Record<string, string | string[]>>()
      .notNull()
      .default({}),
    analysisText: text().notNull().default(""),
    analysisMetadata: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ignoreReason: messageIgnoreReasonEnum(),
    classificationStatus: classificationStatusEnum().notNull().default("pending"),
    enrichmentStatus: enrichmentStatusEnum().notNull().default("pending"),
    extractionStatus: extractionStatusEnum().notNull().default("pending"),
    enrichmentError: text(),
    classificationError: text(),
    extractionError: text(),
    pipelineVersion: integer().notNull().default(1),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_account_provider_id_uq").on(
      t.emailAccountId,
      t.providerMessageId
    ),
  ]
)

export const attachment = pgTable("attachment", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  messageId: text()
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  filename: text().notNull(),
  mimeType: text().notNull().default("application/octet-stream"),
  sizeBytes: integer().notNull().default(0),
  uploadthingKey: text(),
  uploadthingUrl: text(),
  createdAt: timestamp().notNull().defaultNow(),
})

export const classification = pgTable("classification", {
  messageId: text()
    .primaryKey()
    .references(() => message.id, { onDelete: "cascade" }),
  isRentalRelevant: boolean().notNull(),
  confidence: real().notNull().default(0),
  category: messageCategoryEnum().notNull(),
  reasoning: text(),
  model: text().notNull(),
  provider: aiProviderEnum().notNull(),
  rawResponse: jsonb(),
  createdAt: timestamp().notNull().defaultNow(),
})

export const messageIdentityEvidence = pgTable(
  "message_identity_evidence",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messageId: text()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    kind: identityEvidenceKindEnum().notNull(),
    portal: text(),
    portalListingId: text(),
    portalThreadKey: text(),
    canonicalListingUrl: text(),
    relayEmail: text(),
    replyToEmail: text(),
    senderEmail: text(),
    street: text(),
    zip: text(),
    city: text(),
    district: text(),
    rentCold: doublePrecision(),
    rentWarm: doublePrecision(),
    sizeSqm: doublePrecision(),
    rooms: doublePrecision(),
    titleFingerprint: text(),
    landlordNameHint: text(),
    landlordEmailHint: text(),
    confidence: real().notNull().default(0),
    consumedByListingId: text().references(() => listing.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("message_identity_evidence_message_uq").on(t.messageId)]
)

export const listing = pgTable(
  "listing",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull().default(""),
    addressRaw: text(),
    addressNormalized: jsonb().$type<{
      street?: string
      zip?: string
      city?: string
      district?: string
    }>(),
    rentCold: doublePrecision(),
    rentWarm: doublePrecision(),
    sizeSqm: doublePrecision(),
    rooms: doublePrecision(),
    floor: text(),
    availableFrom: text(),
    description: text(),
    sourceUrl: text(),
    sourcePortal: text(),
    landlordName: text(),
    landlordEmail: text(),
    landlordContact: jsonb().$type<{
      name?: string
      email?: string
      phone?: string
      agency?: string
    }>(),
    dedupeKey: text(),
    manualOverrides: jsonb()
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    createdFromMessageId: text().references(() => message.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("listing_user_dedupe_uq").on(t.userId, t.dedupeKey)]
)

export const application = pgTable("application", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  listingId: text()
    .notNull()
    .references(() => listing.id, { onDelete: "cascade" }),
  status: applicationStatusEnum().notNull().default("new"),
  aiSuggestedStatus: applicationStatusEnum(),
  aiSuggestedReason: text(),
  aiSuggestedAt: timestamp(),
  statusSource: applicationStatusSourceEnum().notNull().default("manual"),
  viewingAt: timestamp(),
  notes: text(),
  lastMessageAt: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export const listingIdentityAlias = pgTable("listing_identity_alias", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  listingId: text()
    .notNull()
    .references(() => listing.id, { onDelete: "cascade" }),
  source: listingAliasSourceEnum().notNull(),
  portal: text(),
  portalListingId: text(),
  portalThreadKey: text(),
  canonicalListingUrl: text(),
  relayEmail: text(),
  directEmail: text(),
  street: text(),
  zip: text(),
  city: text(),
  district: text(),
  rentCold: doublePrecision(),
  rentWarm: doublePrecision(),
  sizeSqm: doublePrecision(),
  rooms: doublePrecision(),
  titleFingerprint: text(),
  createdFromMessageId: text().references(() => message.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp().notNull().defaultNow(),
})

export const messageMatchReview = pgTable("message_match_review", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  messageId: text()
    .notNull()
    .references(() => message.id, { onDelete: "cascade" }),
  candidateListingId: text()
    .notNull()
    .references(() => listing.id, { onDelete: "cascade" }),
  candidateApplicationId: text().references(() => application.id, {
    onDelete: "set null",
  }),
  score: real().notNull(),
  reasons: jsonb().$type<string[]>().notNull().default([]),
  status: matchReviewStatusEnum().notNull().default("pending"),
  resolvedAt: timestamp(),
  resolvedBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
})

export const listingMatchRejectionRule = pgTable("listing_match_rejection_rule", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  candidateListingId: text()
    .notNull()
    .references(() => listing.id, { onDelete: "cascade" }),
  portalListingId: text(),
  canonicalListingUrl: text(),
  relayEmail: text(),
  senderEmail: text(),
  street: text(),
  zip: text(),
  city: text(),
  titleFingerprint: text(),
  createdAt: timestamp().notNull().defaultNow(),
})

export const applicationMessage = pgTable(
  "application_message",
  {
    applicationId: text()
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    messageId: text()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    source: text().notNull().default("pipeline"), // "pipeline" | "manual_review" | "manual_assignment"
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.messageId] })]
)

export const aiProviderConfig = pgTable(
  "ai_provider_config",
  {
    id: text()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: aiProviderEnum().notNull(),
    apiKeyEncrypted: text().notNull(),
    defaultModel: text().notNull(),
    enabled: boolean().notNull().default(true),
    isPrimary: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_provider_user_provider_uq").on(t.userId, t.provider)]
)

// ---------- Relations ----------

export const userRelations = relations(user, ({ many }) => ({
  emailAccounts: many(emailAccount),
  listings: many(listing),
  applications: many(application),
  identityEvidence: many(messageIdentityEvidence),
  matchReviews: many(messageMatchReview),
  aiProviderConfigs: many(aiProviderConfig),
  corrections: many(userCorrection),
}))

export const emailAccountRelations = relations(emailAccount, ({ one, many }) => ({
  user: one(user, { fields: [emailAccount.userId], references: [user.id] }),
  messages: many(message),
}))

export const messageRelations = relations(message, ({ one, many }) => ({
  account: one(emailAccount, {
    fields: [message.emailAccountId],
    references: [emailAccount.id],
  }),
  classification: one(classification, {
    fields: [message.id],
    references: [classification.messageId],
  }),
  attachments: many(attachment),
  applicationLinks: many(applicationMessage),
  identityEvidence: many(messageIdentityEvidence),
  matchReviews: many(messageMatchReview),
}))

export const listingRelations = relations(listing, ({ one, many }) => ({
  user: one(user, { fields: [listing.userId], references: [user.id] }),
  applications: many(application),
  aliases: many(listingIdentityAlias),
  identityEvidence: many(messageIdentityEvidence),
  matchReviews: many(messageMatchReview),
  createdFromMessage: one(message, {
    fields: [listing.createdFromMessageId],
    references: [message.id],
  }),
}))

export const applicationRelations = relations(application, ({ one, many }) => ({
  user: one(user, { fields: [application.userId], references: [user.id] }),
  listing: one(listing, {
    fields: [application.listingId],
    references: [listing.id],
  }),
  messageLinks: many(applicationMessage),
}))

export const applicationMessageRelations = relations(
  applicationMessage,
  ({ one }) => ({
    application: one(application, {
      fields: [applicationMessage.applicationId],
      references: [application.id],
    }),
    message: one(message, {
      fields: [applicationMessage.messageId],
      references: [message.id],
    }),
  })
)

export const attachmentRelations = relations(attachment, ({ one }) => ({
  message: one(message, {
    fields: [attachment.messageId],
    references: [message.id],
  }),
}))

export const messageIdentityEvidenceRelations = relations(
  messageIdentityEvidence,
  ({ one }) => ({
    user: one(user, {
      fields: [messageIdentityEvidence.userId],
      references: [user.id],
    }),
    message: one(message, {
      fields: [messageIdentityEvidence.messageId],
      references: [message.id],
    }),
    consumedByListing: one(listing, {
      fields: [messageIdentityEvidence.consumedByListingId],
      references: [listing.id],
    }),
  })
)

export const listingIdentityAliasRelations = relations(
  listingIdentityAlias,
  ({ one }) => ({
    listing: one(listing, {
      fields: [listingIdentityAlias.listingId],
      references: [listing.id],
    }),
    createdFromMessage: one(message, {
      fields: [listingIdentityAlias.createdFromMessageId],
      references: [message.id],
    }),
  })
)

export const messageMatchReviewRelations = relations(
  messageMatchReview,
  ({ one }) => ({
    user: one(user, {
      fields: [messageMatchReview.userId],
      references: [user.id],
    }),
    message: one(message, {
      fields: [messageMatchReview.messageId],
      references: [message.id],
    }),
    candidateListing: one(listing, {
      fields: [messageMatchReview.candidateListingId],
      references: [listing.id],
    }),
    candidateApplication: one(application, {
      fields: [messageMatchReview.candidateApplicationId],
      references: [application.id],
    }),
  })
)

// ---------- User corrections (F3: AI learning) ----------

export const userCorrection = pgTable("user_correction", {
  id: text()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: userCorrectionKindEnum().notNull(),
  messageId: text().references(() => message.id, { onDelete: "set null" }),
  listingId: text().references(() => listing.id, { onDelete: "set null" }),
  applicationId: text().references(() => application.id, {
    onDelete: "set null",
  }),
  beforeValue: jsonb()
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  afterValue: jsonb()
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  context: jsonb()
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp().notNull().defaultNow(),
})

export const userCorrectionRelations = relations(
  userCorrection,
  ({ one }) => ({
    user: one(user, {
      fields: [userCorrection.userId],
      references: [user.id],
    }),
    message: one(message, {
      fields: [userCorrection.messageId],
      references: [message.id],
    }),
    listing: one(listing, {
      fields: [userCorrection.listingId],
      references: [listing.id],
    }),
    application: one(application, {
      fields: [userCorrection.applicationId],
      references: [application.id],
    }),
  })
)
