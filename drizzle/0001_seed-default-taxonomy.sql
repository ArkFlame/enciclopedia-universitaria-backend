-- Migration: 0001_seed-default-taxonomy
-- Custom migration for seed data
-- Idempotent: uses INSERT ... ON DUPLICATE KEY UPDATE

-- Seed categories
INSERT INTO eu_categories (slug, name, color, description, sort_order, is_active) VALUES
  ('ciencias-naturales', 'Ciencias Naturales', '#16a34a', NULL, 1, '1'),
  ('historia', 'Historia', '#b45309', NULL, 2, '1'),
  ('matematicas', 'Matemáticas', '#1d4ed8', NULL, 3, '1'),
  ('tecnologia', 'Tecnología', '#7c3aed', NULL, 4, '1'),
  ('fisica', 'Física', '#0891b2', NULL, 5, '1'),
  ('quimica', 'Química', '#be123c', NULL, 6, '1'),
  ('biologia', 'Biología', '#15803d', NULL, 7, '1'),
  ('filosofia', 'Filosofía', '#6b21a8', NULL, 8, '1'),
  ('arte-cultura', 'Arte y Cultura', '#c2410c', NULL, 9, '1'),
  ('sociologia', 'Sociología', '#0369a1', NULL, 10, '1'),
  ('irp', 'IRP', '#ea580c', 'Introducción a la Resolución de Problemas', 11, '1'),
  ('ieu', 'IEU', '#0d9488', 'Introducción a los Estudios Universitarios', 12, '1'),
  ('icyt', 'ICYT', '#7c2d12', 'Introducción a las Ciencias y Tecnologías', 13, '1')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  color = VALUES(color),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- Seed subcategories for IRP
INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'fisica', 'Física', NULL, 1, '1'
FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'matematicas', 'Matemáticas', NULL, 2, '1'
FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'programacion', 'Programación', NULL, 3, '1'
FROM eu_categories c WHERE c.slug = 'irp'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- Seed subcategories for IEU
INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'lenguaje', 'Lenguaje', NULL, 1, '1'
FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'comunicacion', 'Comunicación', NULL, 2, '1'
FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'literatura', 'Literatura', NULL, 3, '1'
FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'practicas-estudio-universitario', 'Prácticas de estudio universitario', NULL, 4, '1'
FROM eu_categories c WHERE c.slug = 'ieu'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- Seed subcategories for ICYT
INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'quimica', 'Química', NULL, 1, '1'
FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'biologia', 'Biología', NULL, 2, '1'
FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'bioquimica', 'Bioquímica', NULL, 3, '1'
FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
SELECT c.id, 'temas-relacionados', 'Temas relacionados', NULL, 4, '1'
FROM eu_categories c WHERE c.slug = 'icyt'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);
