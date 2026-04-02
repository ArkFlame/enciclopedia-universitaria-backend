function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getRowsNeedingBackfill(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT id, category, subcategory, category_id, subcategory_id
      FROM \`${tableName}\`
      WHERE category_id IS NULL
         OR (subcategory IS NOT NULL AND subcategory <> '' AND subcategory_id IS NULL)
      ORDER BY id
    `
  );

  return rows;
}

async function getActiveCategoryById(connection, categoryId) {
  const [rows] = await connection.query(
    `SELECT id, slug, name FROM eu_categories WHERE id = ? AND is_active IN ('1', 1) LIMIT 1`,
    [categoryId]
  );

  return rows[0] || null;
}

async function getActiveCategoryByToken(connection, token) {
  const [exactSlug] = await connection.query(
    `SELECT id, slug, name FROM eu_categories WHERE slug = ? AND is_active IN ('1', 1) LIMIT 1`,
    [token]
  );
  if (exactSlug[0]) {
    return exactSlug[0];
  }

  const [exactName] = await connection.query(
    `SELECT id, slug, name FROM eu_categories WHERE name = ? AND is_active IN ('1', 1) LIMIT 1`,
    [token]
  );
  if (exactName[0]) {
    return exactName[0];
  }

  const normalizedSlug = slugify(token);
  const [byNormalized] = await connection.query(
    `SELECT id, slug, name FROM eu_categories WHERE slug = ? AND is_active IN ('1', 1) LIMIT 1`,
    [normalizedSlug]
  );

  return byNormalized[0] || null;
}

async function getActiveSubcategoryByTokenWithinCategory(connection, categoryId, token) {
  const [bySlug] = await connection.query(
    `
      SELECT id, category_id, slug, name
      FROM eu_subcategories
      WHERE category_id = ?
        AND slug = ?
        AND is_active IN ('1', 1)
      LIMIT 1
    `,
    [categoryId, token]
  );
  if (bySlug[0]) {
    return bySlug[0];
  }

  const [byName] = await connection.query(
    `
      SELECT id, category_id, slug, name
      FROM eu_subcategories
      WHERE category_id = ?
        AND name = ?
        AND is_active IN ('1', 1)
      LIMIT 1
    `,
    [categoryId, token]
  );
  if (byName[0]) {
    return byName[0];
  }

  const normalizedSlug = slugify(token);
  const [byNormalized] = await connection.query(
    `
      SELECT id, category_id, slug, name
      FROM eu_subcategories
      WHERE category_id = ?
        AND slug = ?
        AND is_active IN ('1', 1)
      LIMIT 1
    `,
    [categoryId, normalizedSlug]
  );

  return byNormalized[0] || null;
}

async function findActiveSubcategoryGlobally(connection, token) {
  const [bySlug] = await connection.query(
    `
      SELECT s.id, s.category_id, s.slug, s.name
      FROM eu_subcategories s
      JOIN eu_categories c ON c.id = s.category_id
      WHERE s.slug = ?
        AND s.is_active IN ('1', 1)
        AND c.is_active IN ('1', 1)
    `,
    [token]
  );
  if (bySlug.length > 0) {
    return bySlug;
  }

  const [byName] = await connection.query(
    `
      SELECT s.id, s.category_id, s.slug, s.name
      FROM eu_subcategories s
      JOIN eu_categories c ON c.id = s.category_id
      WHERE s.name = ?
        AND s.is_active IN ('1', 1)
        AND c.is_active IN ('1', 1)
    `,
    [token]
  );
  if (byName.length > 0) {
    return byName;
  }

  const normalizedSlug = slugify(token);
  const [byNormalized] = await connection.query(
    `
      SELECT s.id, s.category_id, s.slug, s.name
      FROM eu_subcategories s
      JOIN eu_categories c ON c.id = s.category_id
      WHERE s.slug = ?
        AND s.is_active IN ('1', 1)
        AND c.is_active IN ('1', 1)
    `,
    [normalizedSlug]
  );

  return byNormalized;
}

async function resolveTaxonomyAssignment(row, lookups) {
  let categoryId = row.category_id ?? null;
  let subcategoryId = row.subcategory_id ?? null;
  let category = null;

  const categoryToken = typeof row.category === 'string' ? row.category.trim() : '';
  const subcategoryToken = typeof row.subcategory === 'string' ? row.subcategory.trim() : '';

  if (categoryToken) {
    category = await lookups.getActiveCategoryByToken(categoryToken);
    if (!category) {
      return {
        updated: false,
        categoryId: row.category_id ?? null,
        subcategoryId: row.subcategory_id ?? null,
        ambiguityReason: `Category token "${row.category}" did not resolve to any active category`,
      };
    }

    categoryId = category.id;
  } else if (categoryId) {
    category = await lookups.getActiveCategoryById(categoryId);
    if (!category) {
      categoryId = null;
    }
  }

  if (subcategoryToken) {
    if (categoryId) {
      const subcategory = await lookups.getActiveSubcategoryByTokenWithinCategory(categoryId, subcategoryToken);
      if (!subcategory) {
        return {
          updated: false,
          categoryId: row.category_id ?? null,
          subcategoryId: row.subcategory_id ?? null,
          ambiguityReason: `Subcategory token "${row.subcategory}" did not resolve within category "${category ? category.name : categoryId}"`,
        };
      }

      subcategoryId = subcategory.id;
      categoryId = subcategory.category_id;
    } else {
      const matches = await lookups.findActiveSubcategoryGlobally(subcategoryToken);
      if (matches.length === 0) {
        return {
          updated: false,
          categoryId: row.category_id ?? null,
          subcategoryId: row.subcategory_id ?? null,
          ambiguityReason: `Subcategory token "${row.subcategory}" did not resolve to any active subcategory`,
        };
      }
      if (matches.length > 1) {
        return {
          updated: false,
          categoryId: row.category_id ?? null,
          subcategoryId: row.subcategory_id ?? null,
          ambiguityReason: `Subcategory token "${row.subcategory}" is ambiguous (matches ${matches.length} subcategories)`,
        };
      }

      categoryId = matches[0].category_id;
      subcategoryId = matches[0].id;
    }
  }

  const changed = categoryId !== (row.category_id ?? null) || subcategoryId !== (row.subcategory_id ?? null);
  return {
    updated: changed,
    categoryId,
    subcategoryId,
    ambiguityReason: null,
  };
}

async function updateTaxonomyAssignment(connection, tableName, rowId, categoryId, subcategoryId) {
  await connection.query(
    `UPDATE \`${tableName}\` SET category_id = ?, subcategory_id = ? WHERE id = ?`,
    [categoryId, subcategoryId, rowId]
  );
}

async function backfillTable(connection, tableName) {
  const rows = await getRowsNeedingBackfill(connection, tableName);
  const stats = {
    tableName,
    total: rows.length,
    updated: 0,
    skipped: 0,
    ambiguous: 0,
    ambiguousRows: [],
  };

  const lookups = {
    getActiveCategoryById: (categoryId) => getActiveCategoryById(connection, categoryId),
    getActiveCategoryByToken: (token) => getActiveCategoryByToken(connection, token),
    getActiveSubcategoryByTokenWithinCategory: (categoryId, token) =>
      getActiveSubcategoryByTokenWithinCategory(connection, categoryId, token),
    findActiveSubcategoryGlobally: (token) => findActiveSubcategoryGlobally(connection, token),
  };

  for (const row of rows) {
    const resolution = await resolveTaxonomyAssignment(row, lookups);

    if (resolution.ambiguityReason) {
      stats.ambiguous += 1;
      stats.ambiguousRows.push({
        id: row.id,
        reason: resolution.ambiguityReason,
      });
      continue;
    }

    if (!resolution.updated) {
      stats.skipped += 1;
      continue;
    }

    await updateTaxonomyAssignment(
      connection,
      tableName,
      row.id,
      resolution.categoryId,
      resolution.subcategoryId
    );
    stats.updated += 1;
  }

  return stats;
}

async function backfillTaxonomy(pool) {
  const connection = await pool.getConnection();

  try {
    const articles = await backfillTable(connection, 'eu_articles');
    const edits = await backfillTable(connection, 'eu_article_edits');
    return { articles, edits };
  } finally {
    connection.release();
  }
}

module.exports = {
  slugify,
  resolveTaxonomyAssignment,
  backfillTaxonomy,
};
