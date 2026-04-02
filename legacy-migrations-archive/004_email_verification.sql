-- ================================================================
-- Migration 004: Email Verification
-- Adds email_verified, verification_token, verification_expires_at
-- to eu_users table.
-- ================================================================

USE enciclopediadb;

ALTER TABLE eu_users
  ADD COLUMN IF NOT EXISTS email_verified       TINYINT(1)   NOT NULL DEFAULT 0       AFTER notification_count,
  ADD COLUMN IF NOT EXISTS verification_token   VARCHAR(128) NULL                      AFTER email_verified,
  ADD COLUMN IF NOT EXISTS verification_expires_at DATETIME  NULL                      AFTER verification_token;

-- Index to look up tokens quickly
ALTER TABLE eu_users
  ADD INDEX IF NOT EXISTS idx_eu_users_verification_token (verification_token);

-- Existing users (MOD/ADMIN) are considered pre-verified so they don't lose access
UPDATE eu_users SET email_verified = 1 WHERE role IN ('MOD', 'ADMIN');
