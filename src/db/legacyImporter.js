const mysql = require('mysql2/promise');
require('dotenv').config();

const getLegacyPool = () => mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'enciclopediadb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const getDrizzlePool = () => mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DRIZZLE_DB_NAME || 'enciclopediadb_drizzle',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const SEED_SUBCATEGORIES = [
  { categorySlug: 'IRP', name: 'Investigación y Desarrollo', slug: 'investigacion-y-desarrollo', sortOrder: 1 },
  { categorySlug: 'IRP', name: 'Publicaciones', slug: 'publicaciones', sortOrder: 2 },
  { categorySlug: 'IRP', name: 'Proyectos', slug: 'proyectos', sortOrder: 3 },
  { categorySlug: 'IRP', name: 'Recursos', slug: 'recursos', sortOrder: 4 },
  { categorySlug: 'IEU', name: 'Oferta Académica', slug: 'oferta-academica', sortOrder: 1 },
  { categorySlug: 'IEU', name: 'Admisión', slug: 'admision', sortOrder: 2 },
  { categorySlug: 'IEU', name: 'Vida Estudiantil', slug: 'vida-estudiantil', sortOrder: 3 },
  { categorySlug: 'IEU', name: 'Formación Continua', slug: 'formacion-continua', sortOrder: 4 },
  { categorySlug: 'ICYТ', name: 'Institutos', slug: 'institutos', sortOrder: 1 },
  { categorySlug: 'ICYТ', name: 'Centros de Investigación', slug: 'centros-de-investigacion', sortOrder: 2 },
  { categorySlug: 'ICYТ', name: 'Laboratorios', slug: 'laboratorios', sortOrder: 3 },
  { categorySlug: 'ICYТ', name: 'Convenios', slug: 'convenios', sortOrder: 4 },
];

async function importLegacyData() {
  const legacyPool = getLegacyPool();
  const drizzlePool = getDrizzlePool();

  const result = {
    categoriesImported: 0,
    articlesImported: 0,
    subcategoriesCreated: 0,
  };

  try {
    console.log('[LegacyImporter] Starting import from legacy DB...');

    console.log('[LegacyImporter] Fetching categories from legacy DB...');
    const [legacyCategories] = await legacyPool.query('SELECT * FROM eu_categories');
    console.log(`[LegacyImporter] Found ${legacyCategories.length} categories in legacy DB`);

    if (legacyCategories.length > 0) {
      const placeholders = legacyCategories.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = legacyCategories.flatMap(cat => [
        cat.id, cat.name, cat.slug, cat.description || null, cat.sort_order || 0, cat.is_active || '1', cat.created_at || new Date(), cat.updated_at || new Date()
      ]);

      await drizzlePool.query(
        `INSERT IGNORE INTO eu_categories (id, name, slug, description, sort_order, is_active, created_at, updated_at) VALUES ${placeholders}`,
        values
      );
      result.categoriesImported = legacyCategories.length;
      console.log(`[LegacyImporter] Imported ${result.categoriesImported} categories`);
    }

    console.log('[LegacyImporter] Fetching articles from legacy DB...');
    const [legacyArticles] = await legacyPool.query('SELECT * FROM eu_articles');
    console.log(`[LegacyImporter] Found ${legacyArticles.length} articles in legacy DB`);

    if (legacyArticles.length > 0) {
      const articleFields = [
        'id', 'slug', 'title', 'summary', 'content_path', 'author_id', 'status', 'reviewed_by',
        'reviewed_at', 'rejection_reason', 'category', 'subcategory', 'category_id', 'subcategory_id',
        'cover_image_url', 'cover_image_id', 'tags', 'views', 'version', 'created_at', 'updated_at'
      ];
      const placeholders = legacyArticles.map(() => '(' + articleFields.map(() => '?').join(',') + ')').join(', ');
      const values = legacyArticles.flatMap(art => [
        art.id, art.slug, art.title, art.summary, art.content_path, art.author_id, art.status || 'PENDING',
        art.reviewed_by || null, art.reviewed_at || null, art.rejection_reason || null,
        art.category || null, art.subcategory || null, art.category_id || null, art.subcategory_id || null,
        art.cover_image_url || null, art.cover_image_id || null,
        art.tags ? JSON.stringify(art.tags) : null, art.views || 0, art.version || 1,
        art.created_at || new Date(), art.updated_at || new Date()
      ]);

      await drizzlePool.query(
        `INSERT IGNORE INTO eu_articles (${articleFields.join(',')}) VALUES ${placeholders}`,
        values
      );
      result.articlesImported = legacyArticles.length;
      console.log(`[LegacyImporter] Imported ${result.articlesImported} articles`);
    }

    console.log('[LegacyImporter] Creating subcategories from seed data...');
    const [existingCategories] = await drizzlePool.query('SELECT id, slug FROM eu_categories WHERE slug IN (?, ?, ?)', ['IRP', 'IEU', 'ICYТ']);
    const categoryIdMap = {};
    existingCategories.forEach(cat => { categoryIdMap[cat.slug] = cat.id; });

    for (const subcat of SEED_SUBCATEGORIES) {
      const categoryId = categoryIdMap[subcat.categorySlug];
      if (categoryId) {
        try {
          await drizzlePool.query(
            `INSERT IGNORE INTO eu_subcategories (category_id, name, slug, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, '1', NOW(), NOW())`,
            [categoryId, subcat.name, subcat.slug, subcat.sortOrder]
          );
          result.subcategoriesCreated++;
        } catch (err) {
          console.log(`[LegacyImporter] Subcategory ${subcat.slug} may already exist: ${err.message}`);
        }
      }
    }
    console.log(`[LegacyImporter] Created ${result.subcategoriesCreated} subcategories`);

    console.log('[LegacyImporter] Import completed successfully');
  } catch (error) {
    console.error('[LegacyImporter] Error during import:', error.message);
    throw error;
  } finally {
    await legacyPool.end();
    await drizzlePool.end();
  }

  return result;
}

module.exports = { importLegacyData };