-- Feature 2: Manual listing field edits with override tracking
ALTER TABLE listing ADD COLUMN IF NOT EXISTS manual_overrides jsonb NOT NULL DEFAULT '{}';
