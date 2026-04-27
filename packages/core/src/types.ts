import type {
  AiProvider,
  ApplicationStatus,
  ApplicationStatusSource,
  ClassificationStatus,
  EmailProvider,
  EnrichmentStatus,
  ExtractionStatus,
  IdentityEvidenceKind,
  ListingAliasSource,
  MatchReviewStatus,
  MessageCategory,
  MessageIgnoreReason,
} from "./status.ts"

export type SyncStats = {
  pulled: number
  enriched: number
  classified: number
  extracted: number
  hasMore: boolean
  errors: string[]
}

export type ParsedAddress = {
  street?: string
  zip?: string
  city?: string
  district?: string
}

export type LandlordContact = {
  name?: string
  email?: string
  phone?: string
  agency?: string
}

export type ImapCredentials = {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  // SMTP (optional, for later reply feature)
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
}

export type OAuthCredentials = {
  accessToken: string
  refreshToken: string
  expiresAt: number // unix ms
  scope?: string
  tokenType?: string
}

export type EmailAccountCredentials =
  | { type: "imap"; imap: ImapCredentials }
  | { type: "oauth"; oauth: OAuthCredentials }

export type ParsedMessage = {
  providerMessageId: string
  threadId: string | null
  conversationKey: string | null
  fromAddr: string
  fromName: string | null
  toAddrs: string[]
  subject: string
  bodyText: string
  bodyHtml: string | null
  receivedAt: Date
  rawHeaders: Record<string, string | string[]>
  attachments: ParsedAttachment[]
}

export type ParsedMailThreadInfo = {
  messageIdHeader: string | null
  inReplyTo: string | null
  references: string[]
}

export type ParsedAttachment = {
  filename: string
  mimeType: string
  sizeBytes: number
  content: Uint8Array
}

export type EnrichedLink = {
  url: string
  text?: string
  kind: "anchor" | "button" | "iframe"
  source: "email" | "portal" | "iframe"
}

export type EnrichmentFetchResult = {
  url: string
  ok: boolean
  status?: number
  error?: string
  textLength?: number
  source: "link" | "iframe"
}

export type EnrichedMessageContent = {
  baseText: string
  htmlText: string
  analysisText: string
  links: EnrichedLink[]
  iframes: string[]
  fetches: EnrichmentFetchResult[]
}

export type ListingData = {
  title?: string
  addressRaw?: string
  street?: string
  zip?: string
  city?: string
  district?: string
  sizeSqm?: number
  rooms?: number
  rentCold?: number
  rentWarm?: number
  landlordName?: string
  landlordEmail?: string
  sourceUrl?: string
  sourcePortal?: string
}

export type ClassificationResultV2 = {
  isRentalRelevant: boolean
  category: MessageCategory
  ignoreReason?: MessageIgnoreReason
  startsWorkflow: boolean
  confidence: number
  reasoning: string
}

export type ExtractedMessageIdentity = {
  portal?: string
  portalListingId?: string
  portalThreadKey?: string
  canonicalListingUrl?: string
  relayEmail?: string
  replyToEmail?: string
  senderEmail?: string
  street?: string
  zip?: string
  city?: string
  district?: string
  rentCold?: number
  rentWarm?: number
  sizeSqm?: number
  rooms?: number
  titleFingerprint?: string
  landlordNameHint?: string
  landlordEmailHint?: string
  confidence: number
}

export type IdentityEvidence = ExtractedMessageIdentity & {
  id: string
  userId: string
  messageId: string
  kind: IdentityEvidenceKind
  consumedByListingId?: string | null
  createdAt: Date
}

export type ListingIdentityAlias = ExtractedMessageIdentity & {
  id: string
  listingId: string
  source: ListingAliasSource
  directEmail?: string
  createdFromMessageId?: string | null
  createdAt: Date
}

export type MatchCandidateScore = {
  listingId: string
  applicationId?: string | null
  score: number
  reasons: string[]
}

export type WorkflowAnalysisResult = {
  listingData: ListingData
  statusSuggestion: {
    suggestedStatus: ApplicationStatus
    reasoning: string
  }
}

export type {
  AiProvider,
  ApplicationStatus,
  ApplicationStatusSource,
  ClassificationStatus,
  EmailProvider,
  EnrichmentStatus,
  ExtractionStatus,
  IdentityEvidenceKind,
  ListingAliasSource,
  MatchReviewStatus,
  MessageCategory,
  MessageIgnoreReason,
}
