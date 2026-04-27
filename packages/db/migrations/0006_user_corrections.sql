-- Feature 3: User correction tracking for AI learning
DO $$ BEGIN
  CREATE TYPE user_correction_kind AS ENUM (
    'manual_assignment',
    'reassignment',
    'unassignment',
    'listing_field_edit',
    'status_override',
    'match_review_accept',
    'match_review_reject'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_correction (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind user_correction_kind NOT NULL,
  message_id text REFERENCES message(id) ON DELETE SET NULL,
  listing_id text REFERENCES listing(id) ON DELETE SET NULL,
  application_id text REFERENCES application(id) ON DELETE SET NULL,
  before_value jsonb NOT NULL DEFAULT '{}',
  after_value jsonb NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_correction_user_kind ON user_correction (user_id, kind);
