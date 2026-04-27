ALTER TYPE "public"."message_category" ADD VALUE IF NOT EXISTS 'portal_contact_progress';--> statement-breakpoint
CREATE TYPE "public"."message_ignore_reason" AS ENUM('pre_contact_portal_listing', 'marketing_or_digest', 'non_housing');--> statement-breakpoint
CREATE TYPE "public"."identity_evidence_kind" AS ENUM('pre_contact_portal', 'portal_contact_progress', 'landlord_direct');--> statement-breakpoint
CREATE TYPE "public"."listing_alias_source" AS ENUM('portal', 'landlord', 'manual_review');--> statement-breakpoint
CREATE TYPE "public"."match_review_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "ignore_reason" "message_ignore_reason";--> statement-breakpoint
CREATE TABLE "message_identity_evidence" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "message_id" text NOT NULL,
  "kind" "identity_evidence_kind" NOT NULL,
  "portal" text,
  "portal_listing_id" text,
  "portal_thread_key" text,
  "canonical_listing_url" text,
  "relay_email" text,
  "reply_to_email" text,
  "sender_email" text,
  "street" text,
  "zip" text,
  "city" text,
  "district" text,
  "rent_cold" double precision,
  "rent_warm" double precision,
  "size_sqm" double precision,
  "rooms" double precision,
  "title_fingerprint" text,
  "landlord_name_hint" text,
  "landlord_email_hint" text,
  "confidence" real DEFAULT 0 NOT NULL,
  "consumed_by_listing_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "listing_identity_alias" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" text NOT NULL,
  "source" "listing_alias_source" NOT NULL,
  "portal" text,
  "portal_listing_id" text,
  "portal_thread_key" text,
  "canonical_listing_url" text,
  "relay_email" text,
  "direct_email" text,
  "street" text,
  "zip" text,
  "city" text,
  "district" text,
  "rent_cold" double precision,
  "rent_warm" double precision,
  "size_sqm" double precision,
  "rooms" double precision,
  "title_fingerprint" text,
  "created_from_message_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "message_match_review" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "message_id" text NOT NULL,
  "candidate_listing_id" text NOT NULL,
  "candidate_application_id" text,
  "score" real NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" "match_review_status" DEFAULT 'pending' NOT NULL,
  "resolved_at" timestamp,
  "resolved_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "listing_match_rejection_rule" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "candidate_listing_id" text NOT NULL,
  "portal_listing_id" text,
  "canonical_listing_url" text,
  "relay_email" text,
  "sender_email" text,
  "street" text,
  "zip" text,
  "city" text,
  "title_fingerprint" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "message_identity_evidence" ADD CONSTRAINT "message_identity_evidence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_identity_evidence" ADD CONSTRAINT "message_identity_evidence_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_identity_evidence" ADD CONSTRAINT "message_identity_evidence_consumed_by_listing_id_listing_id_fk" FOREIGN KEY ("consumed_by_listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_identity_alias" ADD CONSTRAINT "listing_identity_alias_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_identity_alias" ADD CONSTRAINT "listing_identity_alias_created_from_message_id_message_id_fk" FOREIGN KEY ("created_from_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_match_review" ADD CONSTRAINT "message_match_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_match_review" ADD CONSTRAINT "message_match_review_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_match_review" ADD CONSTRAINT "message_match_review_candidate_listing_id_listing_id_fk" FOREIGN KEY ("candidate_listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_match_review" ADD CONSTRAINT "message_match_review_candidate_application_id_application_id_fk" FOREIGN KEY ("candidate_application_id") REFERENCES "public"."application"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_match_review" ADD CONSTRAINT "message_match_review_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_match_rejection_rule" ADD CONSTRAINT "listing_match_rejection_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_match_rejection_rule" ADD CONSTRAINT "listing_match_rejection_rule_candidate_listing_id_listing_id_fk" FOREIGN KEY ("candidate_listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_identity_evidence_message_uq" ON "message_identity_evidence" USING btree ("message_id");--> statement-breakpoint
