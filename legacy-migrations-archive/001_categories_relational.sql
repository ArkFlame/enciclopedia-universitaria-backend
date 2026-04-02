-- Migration: Add categories/subcategories relational tables
-- This is an additive migration - does NOT modify existing tables

-- Step 1: Add new columns to articles (nullable initially for compatibility)
ALTER TABLE eu_articles 
  ADD COLUMN category_id INT UNSIGNED NULL,
  ADD COLUMN subcategory_id INT UNSIGNED NULL,
  ADD COLUMN cover_image_url VARCHAR(500) NULL;

-- Step 2: Add columns to article_edits
ALTER TABLE eu_article_edits
  ADD COLUMN category_id INT UNSIGNED NULL,
  ADD COLUMN subcategory_id INT UNSIGNED NULL;

-- Step 3: Create subcategories table
CREATE TABLE IF NOT EXISTS eu_subcategories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active ENUM('0', '1') NOT NULL DEFAULT '1',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_cat FOREIGN KEY (category_id) REFERENCES eu_categories(id) ON DELETE RESTRICT,
  INDEX sub_cat_slug_idx (category_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 3: Add description, sort_order, is_active to categories
ALTER TABLE eu_categories
  ADD COLUMN description TEXT NULL,
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN is_active ENUM('0', '1') NOT NULL DEFAULT '1',
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Step 4: Seed categories with IRP, IEU, ICYT (only if they exist in old data)
INSERT INTO eu_categories (slug, name, description, sort_order, is_active)
SELECT slug, name, description, COALESCE(sort_order, 0), '1'
FROM eu_categories 
WHERE slug IN ('irp', 'ieu', 'icyt')
ON DUPLICATE KEY UPDATE 
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- Step 5: Seed subcategories for IRP
INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'fisica', 'Física', 1, '1' FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE name = 'Física';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'matematicas', 'Matemáticas', 2, '1' FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE name = 'Matemáticas';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'programacion', 'Programación', 3, '1' FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE name = 'Programación';

-- Step 6: Seed subcategories for IEU
INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'lenguaje', 'Lenguaje', 1, '1' FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE name = 'Lenguaje';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'comunicacion', 'Comunicación', 2, '1' FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE name = 'Comunicación';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'literatura', 'Literatura', 3, '1' FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE name = 'Literatura';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'practicas-estudio-universitario', 'Prácticas de estudio universitario', 4, '1' FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE name = 'Prácticas de estudio universitario';

-- Step 7: Seed subcategories for ICYT
INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'quimica', 'Química', 1, '1' FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE name = 'Química';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'biologia', 'Biología', 2, '1' FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE name = 'Biología';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'bioquimica', 'Bioquímica', 3, '1' FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE name = 'Bioquímica';

INSERT INTO eu_subcategories (category_id, slug, name, sort_order, is_active)
SELECT c.id, 'temas-relacionados', 'Temas relacionados', 4, '1' FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE name = 'Temas relacionados';
