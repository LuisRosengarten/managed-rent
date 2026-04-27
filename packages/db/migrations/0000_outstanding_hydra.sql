CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'google');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('new', 'contacted', 'viewing_scheduled', 'applied', 'accepted', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."classification_status" AS ENUM('pending', 'classified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gmail', 'outlook', 'imap');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'extracted', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_category" AS ENUM('portal_listing', 'landlord_direct', 'portal_notification', 'irrelevant');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_config" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"default_model" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"status" "application_status" DEFAULT 'new' NOT NULL,
	"viewing_at" timestamp,
	"notes" text,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_message" (
	"application_id" text NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_message_application_id_message_id_pk" PRIMARY KEY("application_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"uploadthing_key" text,
	"uploadthing_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classification" (
	"message_id" text PRIMARY KEY NOT NULL,
	"is_rental_relevant" boolean NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"category" "message_category" NOT NULL,
	"reasoning" text,
	"model" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_account" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "email_provider" NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"credentials" text NOT NULL,
	"sync_cursor" text,
	"last_synced_at" timestamp,
	"sync_locked_until" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"address_raw" text,
	"address_normalized" jsonb,
	"rent_cold" double precision,
	"rent_warm" double precision,
	"size_sqm" double precision,
	"rooms" double precision,
	"floor" text,
	"available_from" text,
	"description" text,
	"source_url" text,
	"source_portal" text,
	"landlord_name" text,
	"landlord_contact" jsonb,
	"dedupe_key" text,
	"created_from_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_account_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"thread_id" text,
	"from_addr" text NOT NULL,
	"from_name" text,
	"to_addrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text,
	"received_at" timestamp NOT NULL,
	"raw_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification_status" "classification_status" DEFAULT 'pending' NOT NULL,
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"classification_error" text,
	"extraction_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_config" ADD CONSTRAINT "ai_provider_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_message" ADD CONSTRAINT "application_message_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_message" ADD CONSTRAINT "application_message_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification" ADD CONSTRAINT "classification_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_account" ADD CONSTRAINT "email_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_created_from_message_id_message_id_fk" FOREIGN KEY ("created_from_message_id") REFERENCES "public"."message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_email_account_id_email_account_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_user_provider_uq" ON "ai_provider_config" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "email_account_user_email_uq" ON "email_account" USING btree ("user_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_user_dedupe_uq" ON "listing" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_account_provider_id_uq" ON "message" USING btree ("email_account_id","provider_message_id");