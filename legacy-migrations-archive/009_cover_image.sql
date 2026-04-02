-- Migration 009: Add cover_image_id column to articles
-- Additive-only migration - no data loss
-- Uses existing eu_media table for cover images

ALTER TABLE eu_articles
ADD COLUMN IF NOT EXISTS cover_image_id BIGINT UNSIGNED NULL COMMENT 'Imagen de portada del artículo';

ALTER TABLE eu_articles
ADD CONSTRAINT fk_eu_art_cover_image
FOREIGN KEY (cover_image_id) REFERENCES eu_media(id) ON DELETE SET NULL;