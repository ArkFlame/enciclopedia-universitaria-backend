-- ================================================================
-- ENCICLOPEDIA UNIVERSITARIA - Schema de Base de Datos
-- MySQL 8.0+
--
-- IMPORTANTE:
--   - Solo crea objetos, NO borra nada existente
--   - Base de datos propia: enciclopediadb
--   - Prefijo eu_ en todas las tablas para evitar colisiones
-- ================================================================

CREATE DATABASE IF NOT EXISTS enciclopediadb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE enciclopediadb;

-- ---------------------------------------------------------------
-- eu_users
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_users (
  id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username                 VARCHAR(50)  NOT NULL UNIQUE,
  email                    VARCHAR(255) NOT NULL UNIQUE,
  password_hash            VARCHAR(255) NOT NULL,
  role                     ENUM('FREE','MONTHLY','MOD','ADMIN') NOT NULL DEFAULT 'FREE',
  role_assigned_at         DATETIME     NULL,
  paid_at                  DATETIME     NULL,
  monthly_expires_at       DATETIME     NULL,
  articles_read_this_month INT UNSIGNED NOT NULL DEFAULT 0,
  articles_read_reset_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notification_count       INT UNSIGNED NOT NULL DEFAULT 0,
  created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_eu_users_role  (role),
  INDEX idx_eu_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_payment_history
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_payment_history (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED  NOT NULL,
  mp_payment_id     VARCHAR(100)     NOT NULL,
  mp_preference_id  VARCHAR(150)     NULL,
  mp_merchant_order VARCHAR(100)     NULL,
  amount            DECIMAL(12,2)    NOT NULL,
  currency          VARCHAR(10)      NOT NULL DEFAULT 'ARS',
  status            ENUM('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
  payment_method    VARCHAR(50)      NULL,
  paid_at           DATETIME         NULL,
  expires_at        DATETIME         NULL,
  raw_notification  JSON             NULL,
  created_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_ph_user
    FOREIGN KEY (user_id) REFERENCES eu_users(id) ON DELETE CASCADE,
  INDEX idx_eu_ph_user_id      (user_id),
  INDEX idx_eu_ph_mp_payment   (mp_payment_id),
  INDEX idx_eu_ph_status       (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_articles
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_articles (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug             VARCHAR(255) NOT NULL UNIQUE,
  title            VARCHAR(500) NOT NULL,
  summary          TEXT         NOT NULL,
  content_path     VARCHAR(500) NOT NULL COMMENT 'Ruta al .md en disco',
  author_id        BIGINT UNSIGNED NOT NULL,
  status           ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by      BIGINT UNSIGNED NULL,
  reviewed_at      DATETIME     NULL,
  rejection_reason TEXT         NULL,
  category         VARCHAR(100) NULL,
  tags             JSON         NULL,
  views            INT UNSIGNED NOT NULL DEFAULT 0,
  version          INT UNSIGNED NOT NULL DEFAULT 1,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_art_author
    FOREIGN KEY (author_id)   REFERENCES eu_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_eu_art_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES eu_users(id) ON DELETE SET NULL,
  FULLTEXT INDEX ft_eu_articles_search (title, summary),
  INDEX idx_eu_art_status  (status),
  INDEX idx_eu_art_author  (author_id),
  INDEX idx_eu_art_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_article_edits
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_article_edits (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_id       BIGINT UNSIGNED NOT NULL,
  editor_id        BIGINT UNSIGNED NOT NULL,
  title            VARCHAR(500) NULL,
  summary          TEXT         NULL,
  content_path     VARCHAR(500) NULL COMMENT 'Ruta al .md de la edicion en disco',
  edit_note        TEXT         NULL,
  category         VARCHAR(100) NULL,
  category         VARCHAR(100) NULL,
  status           ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by      BIGINT UNSIGNED NULL,
  reviewed_at      DATETIME     NULL,
  rejection_reason TEXT         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_ae_article
    FOREIGN KEY (article_id)  REFERENCES eu_articles(id) ON DELETE CASCADE,
  CONSTRAINT fk_eu_ae_editor
    FOREIGN KEY (editor_id)   REFERENCES eu_users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_eu_ae_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES eu_users(id)    ON DELETE SET NULL,
  INDEX idx_eu_ae_article_status (article_id, status),
  INDEX idx_eu_ae_editor         (editor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_media
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_media (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  article_id    BIGINT UNSIGNED NULL COMMENT 'NULL = subida temporal sin articulo asignado',
  uploader_id   BIGINT UNSIGNED NOT NULL,
  filename      VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  width         INT UNSIGNED NULL,
  height        INT UNSIGNED NULL,
  file_path     VARCHAR(500) NOT NULL COMMENT 'Ruta absoluta en disco',
  public_url    VARCHAR(500) NOT NULL COMMENT 'URL publica accesible',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_media_article
    FOREIGN KEY (article_id)  REFERENCES eu_articles(id) ON DELETE SET NULL,
  CONSTRAINT fk_eu_media_uploader
    FOREIGN KEY (uploader_id) REFERENCES eu_users(id)    ON DELETE CASCADE,
  INDEX idx_eu_media_article  (article_id),
  INDEX idx_eu_media_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_rate_limit_log
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_rate_limit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NULL,
  ip_address VARCHAR(50)  NOT NULL,
  action     ENUM('submit_article','edit_article','upload_image') NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eu_rl_user_action (user_id, action, created_at),
  INDEX idx_eu_rl_ip_action   (ip_address, action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_notifications
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_notifications (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  type         ENUM(
                 'article_approved','article_rejected',
                 'edit_approved','edit_rejected',
                 'subscription_expired','subscription_activated',
                 'new_submission'
               ) NOT NULL,
  message      TEXT         NOT NULL,
  reference_id BIGINT UNSIGNED NULL COMMENT 'ID del articulo o edicion relacionada',
  read_at      DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eu_notif_user
    FOREIGN KEY (user_id) REFERENCES eu_users(id) ON DELETE CASCADE,
  INDEX idx_eu_notif_user_unread (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_admin_logs
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_admin_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    BIGINT UNSIGNED NOT NULL,
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50)  NULL,
  target_id   BIGINT UNSIGNED NULL,
  details     JSON         NULL,
  ip_address  VARCHAR(50)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_eu_al_admin   (admin_id),
  INDEX idx_eu_al_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------
-- eu_categories
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eu_categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  slug       VARCHAR(100) NOT NULL UNIQUE,
  color      VARCHAR(7)   NOT NULL DEFAULT '#000000',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO eu_categories (name, slug, color) VALUES
  ('Ciencias Naturales', 'ciencias-naturales', '#16a34a'),
  ('Historia',           'historia',           '#b45309'),
  ('Matematicas',        'matematicas',        '#1d4ed8'),
  ('Tecnologia',         'tecnologia',         '#7c3aed'),
  ('Fisica',             'fisica',             '#0891b2'),
  ('Quimica',            'quimica',            '#be123c'),
  ('Biologia',           'biologia',           '#15803d'),
  ('Filosofia',          'filosofia',          '#6b21a8'),
  ('Arte y Cultura',     'arte-cultura',       '#c2410c'),
  ('Sociologia',         'sociologia',         '#0369a1');

-- ---------------------------------------------------------------
-- Verificacion final
-- ---------------------------------------------------------------
SELECT CONCAT('OK - Tabla creada: ', table_name) AS resultado
FROM information_schema.tables
WHERE table_schema = 'enciclopediadb'
ORDER BY table_name;
