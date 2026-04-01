-- Migration 007: Add new main categories IRP, IEU, ICYT
-- Adds three new categories for engineering programs

INSERT IGNORE INTO eu_categories (name, slug, color) VALUES
  ('Ing. en Sistemas',   'irp',                '#ea580c'),
  ('Ing. Electronica',   'ieu',                '#0d9488'),
  ('Ing. Quimica',       'icyt',               '#7c2d12');