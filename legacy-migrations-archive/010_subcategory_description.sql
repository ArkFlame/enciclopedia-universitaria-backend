-- Migration 010: Add description column to subcategories
-- Additive-only migration - no data loss

ALTER TABLE eu_subcategories
  ADD COLUMN IF NOT EXISTS description TEXT NULL;
