CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'enriched', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."application_status_source" AS ENUM('manual', 'ai');--> statement-breakpoint
ALTER TYPE "public"."extraction_status" ADD VALUE IF NOT EXISTS 'unassigned';--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "conversation_key" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "analysis_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "analysis_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "enrichment_status" "enrichment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "enrichment_error" text;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "pipeline_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "landlord_email" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "ai_suggested_status" "application_status";--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "ai_suggested_reason" text;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "ai_suggested_at" timestamp;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "status_source" "application_status_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
