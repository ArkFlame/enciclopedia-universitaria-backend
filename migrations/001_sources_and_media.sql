-- Database Migration: Enciclopedia Universitaria - Sources & Media Updates
-- Version: 2024.01
-- Date: 2024

-- ============================================================
-- TABLE: eu_article_sources
-- Stores links and PDF sources for articles
-- ============================================================
CREATE TABLE IF NOT EXISTS eu_article_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NOT NULL,
  type ENUM('link', 'pdf') NOT NULL,
  title VARCHAR(500) NOT NULL,
  url VARCHAR(2000),
  pdf_path VARCHAR(1000),
  pdf_original_name VARCHAR(500),
  pdf_size BIGINT DEFAULT 0,
  favicon_url VARCHAR(500),
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (article_id) REFERENCES eu_articles(id) ON DELETE CASCADE,
  INDEX idx_article (article_id),
  INDEX idx_type (type),
  INDEX idx_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: eu_source_downloads
-- Tracks PDF downloads for rate limiting
-- ============================================================
CREATE TABLE IF NOT EXISTS eu_source_downloads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  user_id INT,
  ip_address VARCHAR(45),
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES eu_article_sources(id) ON DELETE CASCADE,
  INDEX idx_source (source_id),
  INDEX idx_ip (ip_address),
  INDEX idx_date (downloaded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: eu_media updates
-- Add unique constraint and display_order
-- ============================================================
ALTER TABLE eu_media 
ADD COLUMN display_order INT DEFAULT 0,
ADD COLUMN file_size BIGINT DEFAULT 0;

-- Add unique constraint to prevent duplicates
ALTER TABLE eu_media 
ADD UNIQUE KEY uk_article_filename (article_id, filename);

-- ============================================================
-- TABLE: eu_articles updates
-- Add sources count column
-- ============================================================
ALTER TABLE eu_articles 
ADD COLUMN sources_count INT DEFAULT 0;

-- ============================================================
-- Update existing rate limits table if needed
-- Add new rate limit actions
-- ============================================================
-- Note: The rate limits are managed in middleware/rateLimit.js
-- This migration just ensures the log table can track new actions
ALTER TABLE eu_rate_limit_log 
MODIFY COLUMN action VARCHAR(50);

-- ============================================================
-- VIEW: Article with sources (for quick queries)
-- ============================================================
CREATE OR REPLACE VIEW v_articles_with_sources AS
SELECT 
  a.id,
  a.slug,
  a.title,
  a.status,
  COUNT(DISTINCT s.id) AS sources_count,
  COUNT(DISTINCT CASE WHEN s.type = 'link' THEN s.id END) AS links_count,
  COUNT(DISTINCT CASE WHEN s.type = 'pdf' THEN s.id END) AS pdfs_count
FROM eu_articles a
LEFT JOIN eu_article_sources s ON a.id = s.article_id
GROUP BY a.id, a.slug, a.title, a.status;
