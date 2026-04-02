'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
});

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getArticlesNeedingBackfill(connection) {
  const [rows] = await connection.execute(
    `SELECT id, slug, title, category, subcategory, category_id, subcategory_id
     FROM eu_articles
     WHERE category_id IS NULL OR subcategory_id IS NULL`
  );
  return rows;
}

async function getActiveCategoryByToken(connection, token) {
  const [exactSlug] = await connection.execute(
    `SELECT id, slug, name FROM eu_categories WHERE slug = ? AND is_active = '1'`,
    [token]
  );
  if (exactSlug.length === 1) return exactSlug[0];

  const [exactName] = await connection.execute(
    `SELECT id, slug, name FROM eu_categories WHERE name = ? AND is_active = '1'`,
    [token]
  );
  if (exactName.length === 1) return exactName[0];

  const normalizedSlug = slugify(token);
  const [byNormalized] = await connection.execute(
    `SELECT id, slug, name FROM eu_categories WHERE slug = ? AND is_active = '1'`,
    [normalizedSlug]
  );
  return byNormalized.length === 1 ? byNormalized[0] : null;
}

async function getActiveSubcategoryByTokenWithinCategory(connection, categoryId, token) {
  const [bySlug] = await connection.execute(
    `SELECT id, category_id, slug, name FROM eu_subcategories
     WHERE category_id = ? AND slug = ? AND is_active = '1'`,
    [categoryId, token]
  );
  if (bySlug.length === 1) return bySlug[0];

  const [byName] = await connection.execute(
    `SELECT id, category_id, slug, name FROM eu_subcategories
     WHERE category_id = ? AND name = ? AND is_active = '1'`,
    [categoryId, token]
  );
  if (byName.length === 1) return byName[0];

  const normalizedSlug = slugify(token);
  const [byNormalized] = await connection.execute(
    `SELECT id, category_id, slug, name FROM eu_subcategories
     WHERE category_id = ? AND slug = ? AND is_active = '1'`,
    [categoryId, normalizedSlug]
  );
  return byNormalized.length === 1 ? byNormalized[0] : null;
}

async function findActiveSubcategoryGlobally(connection, token) {
  const [bySlug] = await connection.execute(
    `SELECT s.id, s.category_id, s.slug, s.name
     FROM eu_subcategories s
     JOIN eu_categories c ON s.category_id = c.id
     WHERE s.slug = ? AND s.is_active = '1' AND c.is_active = '1'`,
    [token]
  );
  if (bySlug.length > 0) return bySlug;

  const [byName] = await connection.execute(
    `SELECT s.id, s.category_id, s.slug, s.name
     FROM eu_subcategories s
     JOIN eu_categories c ON s.category_id = c.id
     WHERE s.name = ? AND s.is_active = '1' AND c.is_active = '1'`,
    [token]
  );
  return byName;
}

async function updateArticleTaxonomy(connection, articleId, categoryId, subcategoryId) {
  await connection.execute(
    `UPDATE eu_articles SET category_id = ?, subcategory_id = ? WHERE id = ?`,
    [categoryId, subcategoryId, articleId]
  );
}

async function backfill() {
  const connection = await pool.getConnection();
  const stats = { total: 0, updated: 0, skipped: 0, ambiguous: 0 };
  const ambiguousLogs = [];

  try {
    const articles = await getArticlesNeedingBackfill(connection);
    stats.total = articles.length;
    console.log(`Found ${stats.total} articles needing backfill\n`);

    for (const article of articles) {
      let newCategoryId = article.category_id;
      let newSubcategoryId = article.subcategory_id;
      let didUpdate = false;
      let ambiguityReason = null;

      if (article.category && article.category.trim()) {
        const categoryResult = await getActiveCategoryByToken(connection, article.category.trim());

        if (!categoryResult) {
          ambiguityReason = `Category token "${article.category}" did not resolve to any active category`;
        } else {
          newCategoryId = categoryResult.id;

          if (article.subcategory && article.subcategory.trim()) {
            const subResult = await getActiveSubcategoryByTokenWithinCategory(
              connection,
              categoryResult.id,
              article.subcategory.trim()
            );

            if (!subResult) {
              ambiguityReason = `Subcategory token "${article.subcategory}" did not resolve within category "${categoryResult.name}"`;
            } else {
              newSubcategoryId = subResult.id;
              didUpdate = true;
            }
          } else {
            didUpdate = true;
          }
        }
      } else if (article.subcategory && article.subcategory.trim()) {
        const subResults = await findActiveSubcategoryGlobally(connection, article.subcategory.trim());

        if (subResults.length === 0) {
          ambiguityReason = `Subcategory token "${article.subcategory}" did not resolve to any active subcategory`;
        } else if (subResults.length > 1) {
          ambiguityReason = `Subcategory token "${article.subcategory}" is ambiguous (matches ${subResults.length} subcategories)`;
        } else {
          newCategoryId = subResults[0].category_id;
          newSubcategoryId = subResults[0].id;
          didUpdate = true;
        }
      }

      if (ambiguityReason) {
        stats.ambiguous++;
        ambiguousLogs.push({
          articleId: article.id,
          slug: article.slug,
          title: article.title,
          reason: ambiguityReason,
        });
        console.log(`[AMBIGUOUS] Article ${article.id} (${article.slug}): ${ambiguityReason}`);
      } else if (didUpdate && (newCategoryId !== article.category_id || newSubcategoryId !== article.subcategory_id)) {
        await updateArticleTaxonomy(connection, article.id, newCategoryId, newSubcategoryId);
        stats.updated++;
        console.log(`[UPDATED] Article ${article.id} (${article.slug}): category_id=${newCategoryId}, subcategory_id=${newSubcategoryId}`);
      } else {
        stats.skipped++;
        console.log(`[SKIPPED] Article ${article.id} (${article.slug}): no changes needed`);
      }
    }

    console.log('\n--- SUMMARY ---');
    console.log(`Total processed: ${stats.total}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Skipped (no changes): ${stats.skipped}`);
    console.log(`Ambiguous (left unchanged): ${stats.ambiguous}`);

    if (ambiguousLogs.length > 0) {
      console.log('\n--- AMBIGUOUS ARTICLES ---');
      for (const log of ambiguousLogs) {
        console.log(`  ID ${log.articleId} (${log.slug}): ${log.reason}`);
      }
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
