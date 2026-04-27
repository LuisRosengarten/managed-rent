export const APPLICATION_STATUSES = [
  "new",
  "contacted",
  "viewing_scheduled",
  "applied",
  "accepted",
  "rejected",
  "withdrawn",
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const TERMINAL_APPLICATION_STATUSES = [
  "accepted",
  "rejected",
  "withdrawn",
] as const

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "Neu",
  contacted: "Kontaktiert",
  viewing_scheduled: "Besichtigung",
  applied: "Beworben",
  accepted: "Zusage",
  rejected: "Absage",
  withdrawn: "Zurückgezogen",
}

export const EMAIL_PROVIDERS = ["gmail", "outlook", "imap"] as const
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

export const AI_PROVIDERS = ["anthropic", "openai", "google"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const CLASSIFICATION_STATUSES = [
  "pending",
  "classified",
  "failed",
] as const
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number]

export const ENRICHMENT_STATUSES = [
  "pending",
  "enriched",
  "skipped",
  "failed",
] as const
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number]

export const EXTRACTION_STATUSES = [
  "pending",
  "extracted",
  "unassigned",
  "skipped",
  "failed",
] as const
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number]

export const APPLICATION_STATUS_SOURCES = ["manual", "ai"] as const
export type ApplicationStatusSource =
  (typeof APPLICATION_STATUS_SOURCES)[number]

export const MESSAGE_IGNORE_REASONS = [
  "pre_contact_portal_listing",
  "marketing_or_digest",
  "non_housing",
] as const
export type MessageIgnoreReason = (typeof MESSAGE_IGNORE_REASONS)[number]

export const MESSAGE_CATEGORIES = [
  "portal_contact_progress",
  "landlord_direct",
  "portal_notification",
  "irrelevant",
] as const
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number]

export const IDENTITY_EVIDENCE_KINDS = [
  "pre_contact_portal",
  "portal_contact_progress",
  "landlord_direct",
] as const
export type IdentityEvidenceKind = (typeof IDENTITY_EVIDENCE_KINDS)[number]

export const LISTING_ALIAS_SOURCES = [
  "portal",
  "landlord",
  "manual_review",
  "manual_assignment",
] as const
export type ListingAliasSource = (typeof LISTING_ALIAS_SOURCES)[number]

export const MATCH_REVIEW_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const
export type MatchReviewStatus = (typeof MATCH_REVIEW_STATUSES)[number]

export const USER_CORRECTION_KINDS = [
  "manual_assignment",
  "reassignment",
  "unassignment",
  "listing_field_edit",
  "status_override",
  "match_review_accept",
  "match_review_reject",
] as const
export type UserCorrectionKind = (typeof USER_CORRECTION_KINDS)[number]
