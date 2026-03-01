-- Migration 002: Add notification_url and other improvements
-- Run this after 001_sources_and_media.sql

-- Add URL field to notifications so they can be clickable
ALTER TABLE eu_notifications 
ADD COLUMN IF NOT EXISTS notification_url VARCHAR(500) NULL COMMENT 'Direct URL for this notification';

-- Add article_slug to notifications for easier linking
ALTER TABLE eu_notifications
ADD COLUMN IF NOT EXISTS article_slug VARCHAR(255) NULL;

-- Create index for faster notification lookups
ALTER TABLE eu_notifications
ADD INDEX IF NOT EXISTS idx_notif_article_slug (article_slug);

SELECT 'Migration 002 complete' AS result;
