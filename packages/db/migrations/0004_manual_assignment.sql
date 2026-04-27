-- Feature 1: Manual mail-to-listing assignment
ALTER TYPE listing_alias_source ADD VALUE IF NOT EXISTS 'manual_assignment';
ALTER TABLE application_message ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pipeline';
