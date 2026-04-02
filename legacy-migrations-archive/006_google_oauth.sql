-- ================================================================
-- Migration 006: Google OAuth
-- Adds google_id column to eu_users.
-- Makes password_hash nullable so Google-only accounts don't need one.
-- ================================================================

USE enciclopediadb;

-- Allow password_hash to be NULL for OAuth-only users
ALTER TABLE eu_users
  MODIFY COLUMN password_hash VARCHAR(255) NULL;

-- Store the Google sub (subject) ID — globally unique per Google account
ALTER TABLE eu_users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(128) NULL UNIQUE AFTER email,
  ADD INDEX IF NOT EXISTS idx_eu_users_google_id (google_id);

-- Google-authenticated users have verified emails by definition
-- (Google only returns verified emails)
