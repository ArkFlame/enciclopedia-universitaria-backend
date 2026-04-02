-- Migration: 0000_init
-- Generated baseline migration for enciclopediadb
-- This migration creates all tables from the combined schema.sql and migrations

-- eu_users must be created first (many tables reference it)
CREATE TABLE IF NOT EXISTS `eu_users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NULL,
  `role` ENUM('FREE','MONTHLY','MOD','ADMIN') NOT NULL DEFAULT 'FREE',
  `role_assigned_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `monthly_expires_at` DATETIME NULL,
  `articles_read_this_month` INT UNSIGNED NOT NULL DEFAULT 0,
  `articles_read_reset_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notification_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `email_verified` ENUM('0','1') NOT NULL DEFAULT '0',
  `verification_token` VARCHAR(128) NULL,
  `verification_expires_at` DATETIME NULL,
  `reset_token` VARCHAR(128) NULL,
  `reset_expires_at` DATETIME NULL,
  `google_id` VARCHAR(128) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_eu_users_username` (`username`),
  UNIQUE KEY `uk_eu_users_email` (`email`),
  UNIQUE KEY `uk_eu_users_google_id` (`google_id`),
  INDEX `idx_eu_users_role` (`role`),
  INDEX `idx_eu_users_verification_token` (`verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_payment_history` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `mp_payment_id` VARCHAR(100) NOT NULL,
  `mp_preference_id` VARCHAR(150) NULL,
  `mp_merchant_order` VARCHAR(100) NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'ARS',
  `status` ENUM('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` VARCHAR(50) NULL,
  `paid_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `raw_notification` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_payment_history_user_id` (`user_id`),
  INDEX `idx_eu_payment_history_mp_payment` (`mp_payment_id`),
  INDEX `idx_eu_payment_history_status` (`status`),
  CONSTRAINT `fk_eu_ph_user` FOREIGN KEY (`user_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- eu_categories and eu_subcategories (no FK dependencies on app tables)
CREATE TABLE IF NOT EXISTS `eu_categories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `color` VARCHAR(7) NOT NULL DEFAULT '#000000',
  `description` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` ENUM('0','1') NOT NULL DEFAULT '1',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_eu_categories_slug` (`slug`),
  UNIQUE KEY `uk_eu_categories_name` (`name`),
  INDEX `idx_eu_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_subcategories` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT UNSIGNED NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` ENUM('0','1') NOT NULL DEFAULT '1',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_eu_subcategories_category_slug` (`category_id`, `slug`),
  CONSTRAINT `fk_eu_subcategories_category` FOREIGN KEY (`category_id`) REFERENCES `eu_categories`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- eu_media before eu_articles (FK from eu_articles.cover_image_id references eu_media.id)
CREATE TABLE IF NOT EXISTS `eu_media` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `article_id` INT UNSIGNED NULL,
  `uploader_id` INT UNSIGNED NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size_bytes` INT UNSIGNED NOT NULL,
  `width` INT UNSIGNED NULL,
  `height` INT UNSIGNED NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `public_url` VARCHAR(500) NOT NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `file_size` BIGINT UNSIGNED DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_media_article` (`article_id`),
  INDEX `idx_eu_media_uploader` (`uploader_id`),
  CONSTRAINT `fk_eu_media_article` FOREIGN KEY (`article_id`) REFERENCES `eu_articles`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eu_media_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- eu_articles (references eu_users for author and reviewer)
CREATE TABLE IF NOT EXISTS `eu_articles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(255) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `summary` TEXT NOT NULL,
  `content_path` VARCHAR(500) NOT NULL,
  `author_id` INT UNSIGNED NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `rejection_reason` TEXT NULL,
  `category` VARCHAR(100) NULL,
  `subcategory` VARCHAR(100) NULL,
  `category_id` INT UNSIGNED NULL,
  `subcategory_id` INT UNSIGNED NULL,
  `cover_image_url` VARCHAR(500) NULL,
  `cover_image_id` INT UNSIGNED NULL,
  `tags` TEXT NULL,
  `sources_count` INT NOT NULL DEFAULT 0,
  `views` INT UNSIGNED NOT NULL DEFAULT 0,
  `version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_eu_articles_slug` (`slug`),
  INDEX `idx_eu_articles_status` (`status`),
  INDEX `idx_eu_articles_author` (`author_id`),
  INDEX `idx_eu_articles_created` (`created_at`),
  INDEX `idx_eu_articles_category` (`category`),
  CONSTRAINT `fk_eu_articles_author` FOREIGN KEY (`author_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eu_articles_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `eu_users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add cover_image FK after eu_media exists
ALTER TABLE `eu_articles`
  ADD CONSTRAINT `fk_eu_articles_cover_image` FOREIGN KEY (`cover_image_id`) REFERENCES `eu_media`(`id`) ON DELETE SET NULL;

-- eu_article_edits (references eu_articles and eu_users)
CREATE TABLE IF NOT EXISTS `eu_article_edits` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `article_id` INT UNSIGNED NOT NULL,
  `editor_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(500) NULL,
  `summary` TEXT NULL,
  `content_path` VARCHAR(500) NULL,
  `edit_note` TEXT NULL,
  `category` VARCHAR(100) NULL,
  `subcategory` VARCHAR(100) NULL,
  `category_id` INT UNSIGNED NULL,
  `subcategory_id` INT UNSIGNED NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` INT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `rejection_reason` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_article_edits_article_status` (`article_id`, `status`),
  INDEX `idx_eu_article_edits_editor` (`editor_id`),
  CONSTRAINT `fk_eu_ae_article` FOREIGN KEY (`article_id`) REFERENCES `eu_articles`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eu_ae_editor` FOREIGN KEY (`editor_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eu_ae_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `eu_users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_article_sources` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `article_id` INT UNSIGNED NOT NULL,
  `type` ENUM('link','pdf') NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `url` VARCHAR(2000) NULL,
  `pdf_path` VARCHAR(1000) NULL,
  `pdf_original_name` VARCHAR(500) NULL,
  `pdf_size` BIGINT DEFAULT 0,
  `favicon_url` VARCHAR(500) NULL,
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_eu_article_sources_article` (`article_id`),
  INDEX `idx_eu_article_sources_type` (`type`),
  INDEX `idx_eu_article_sources_order` (`display_order`),
  CONSTRAINT `fk_eu_article_sources_article` FOREIGN KEY (`article_id`) REFERENCES `eu_articles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_source_downloads` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `source_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `ip_address` VARCHAR(45) NULL,
  `downloaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_source_downloads_source` (`source_id`),
  INDEX `idx_eu_source_downloads_user` (`user_id`),
  INDEX `idx_eu_source_downloads_ip` (`ip_address`),
  INDEX `idx_eu_source_downloads_date` (`downloaded_at`),
  CONSTRAINT `fk_eu_source_downloads_source` FOREIGN KEY (`source_id`) REFERENCES `eu_article_sources`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eu_source_downloads_user` FOREIGN KEY (`user_id`) REFERENCES `eu_users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_rate_limit_log` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `ip_address` VARCHAR(50) NOT NULL,
  `action` ENUM('submit_article','edit_article','upload_image') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_rate_limit_user_action` (`user_id`, `action`, `created_at`),
  INDEX `idx_eu_rate_limit_ip_action` (`ip_address`, `action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_notifications` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `type` ENUM('article_approved','article_rejected','edit_approved','edit_rejected','subscription_expired','subscription_activated','new_submission') NOT NULL,
  `message` TEXT NOT NULL,
  `reference_id` INT UNSIGNED NULL,
  `article_slug` VARCHAR(255) NULL,
  `notification_url` VARCHAR(500) NULL,
  `read_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_notifications_user_unread` (`user_id`, `read_at`),
  CONSTRAINT `fk_eu_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eu_admin_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `admin_id` INT UNSIGNED NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `target_type` VARCHAR(50) NULL,
  `target_id` INT UNSIGNED NULL,
  `details` JSON NULL,
  `ip_address` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_eu_admin_logs_admin` (`admin_id`),
  INDEX `idx_eu_admin_logs_created` (`created_at`),
  CONSTRAINT `fk_eu_admin_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `eu_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
