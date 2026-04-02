-- Migration 007: Seed canonical IRP / IEU / ICYT categories
-- These are display names, not engineering degree names.

INSERT INTO eu_categories (name, slug, color, description, sort_order, is_active)
VALUES
  ('IRP',  'irp',  '#ea580c', 'Introducción a la Resolución de Problemas', 11, 1),
  ('IEU',  'ieu',  '#0d9488', 'Introducción a los Estudios Universitarios', 12, 1),
  ('ICYT', 'icyt', '#7c2d12', 'Introducción a las Ciencias y Tecnologías', 13, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  color = VALUES(color),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);