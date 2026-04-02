-- Migration 008: Add subcategory column to articles and edits
-- Additive-only migration - no data loss

ALTER TABLE eu_articles
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) NULL COMMENT 'Subcategoría dentro de la categoría principal';

ALTER TABLE eu_article_edits
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100) NULL COMMENT 'Subcategoría propuesta en la edición';