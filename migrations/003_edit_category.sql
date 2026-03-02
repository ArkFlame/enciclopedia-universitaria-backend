-- Migration 003: Allow edit proposals to include a category
-- Run this after 002_notification_url.sql

ALTER TABLE eu_article_edits
ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL COMMENT 'Categoria propuesta para la edición';

SELECT 'Migration 003 complete' AS result;
