-- ================================================================
-- Migration 005: Password Reset
-- Adds reset_token and reset_expires_at to eu_users table.
-- ================================================================

USE enciclopediadb;

ALTER TABLE eu_users
  ADD COLUMN IF NOT EXISTS reset_token      VARCHAR(128) NULL AFTER verification_expires_at,
  ADD COLUMN IF NOT EXISTS reset_expires_at DATETIME     NULL AFTER reset_token;

ALTER TABLE eu_users
  ADD INDEX IF NOT EXISTS idx_eu_users_reset_token (reset_token);
