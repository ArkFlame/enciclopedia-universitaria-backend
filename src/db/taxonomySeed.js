const CATEGORY_SEEDS = [
  {
    slug: 'irp',
    name: 'IRP',
    color: '#ea580c',
    description: 'Introducción a la Resolución de Problemas',
    sortOrder: 11,
    isActive: 1,
  },
  {
    slug: 'ieu',
    name: 'IEU',
    color: '#0d9488',
    description: 'Introducción a los Estudios Universitarios',
    sortOrder: 12,
    isActive: 1,
  },
  {
    slug: 'icyt',
    name: 'ICYT',
    color: '#7c2d12',
    description: 'Introducción a las Ciencias y Tecnologías',
    sortOrder: 13,
    isActive: 1,
  },
];

const SUBCATEGORY_SEEDS = {
  irp: [
    { slug: 'fisica', name: 'Física', description: null, sortOrder: 1, isActive: 1 },
    { slug: 'matematicas', name: 'Matemáticas', description: null, sortOrder: 2, isActive: 1 },
    { slug: 'programacion', name: 'Programación', description: null, sortOrder: 3, isActive: 1 },
  ],
  ieu: [
    { slug: 'lenguaje', name: 'Lenguaje', description: null, sortOrder: 1, isActive: 1 },
    { slug: 'comunicacion', name: 'Comunicación', description: null, sortOrder: 2, isActive: 1 },
    { slug: 'literatura', name: 'Literatura', description: null, sortOrder: 3, isActive: 1 },
    { slug: 'practicas-estudio-universitario', name: 'Prácticas de estudio universitario', description: null, sortOrder: 4, isActive: 1 },
  ],
  icyt: [
    { slug: 'quimica', name: 'Química', description: null, sortOrder: 1, isActive: 1 },
    { slug: 'biologia', name: 'Biología', description: null, sortOrder: 2, isActive: 1 },
    { slug: 'bioquimica', name: 'Bioquímica', description: null, sortOrder: 3, isActive: 1 },
    { slug: 'temas-relacionados', name: 'Temas relacionados', description: null, sortOrder: 4, isActive: 1 },
  ],
};

async function findCategoryBySlugOrName(pool, seed) {
  const [rows] = await pool.query(
    `
      SELECT id, slug, name
      FROM eu_categories
      WHERE slug = ? OR name = ?
      ORDER BY CASE WHEN slug = ? THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `,
    [seed.slug, seed.name, seed.slug]
  );

  return rows[0] || null;
}

async function ensureCategory(pool, seed) {
  const existing = await findCategoryBySlugOrName(pool, seed);

  if (existing) {
    await pool.query(
      `
        UPDATE eu_categories
        SET description = ?, sort_order = ?, is_active = ?
        WHERE id = ?
      `,
      [seed.description, seed.sortOrder, seed.isActive, existing.id]
    );

    return {
      id: existing.id,
      action: 'updated',
      slug: existing.slug,
    };
  }

  const [result] = await pool.query(
    `
      INSERT INTO eu_categories (slug, name, color, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [seed.slug, seed.name, seed.color, seed.description, seed.sortOrder, seed.isActive]
  );

  return {
    id: result.insertId,
    action: 'inserted',
    slug: seed.slug,
  };
}

async function subcategoryExists(pool, categoryId, seed) {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM eu_subcategories
      WHERE category_id = ?
        AND (slug = ? OR name = ?)
      ORDER BY CASE WHEN slug = ? THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `,
    [categoryId, seed.slug, seed.name, seed.slug]
  );

  return rows[0] || null;
}

async function ensureSubcategory(pool, categoryId, seed) {
  const existing = await subcategoryExists(pool, categoryId, seed);
  if (existing) {
    return { id: existing.id, action: 'unchanged', slug: seed.slug };
  }

  const [result] = await pool.query(
    `
      INSERT INTO eu_subcategories (category_id, slug, name, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [categoryId, seed.slug, seed.name, seed.description, seed.sortOrder, seed.isActive]
  );

  return {
    id: result.insertId,
    action: 'inserted',
    slug: seed.slug,
  };
}

async function seedTaxonomy(pool) {
  const report = {
    categories: [],
    subcategories: [],
  };

  for (const categorySeed of CATEGORY_SEEDS) {
    const categoryResult = await ensureCategory(pool, categorySeed);
    report.categories.push(categoryResult);

    const subcategorySeeds = SUBCATEGORY_SEEDS[categorySeed.slug] || [];
    for (const subcategorySeed of subcategorySeeds) {
      const subcategoryResult = await ensureSubcategory(pool, categoryResult.id, subcategorySeed);
      report.subcategories.push({
        categorySlug: categorySeed.slug,
        ...subcategoryResult,
      });
    }
  }

  return report;
}

module.exports = {
  CATEGORY_SEEDS,
  SUBCATEGORY_SEEDS,
  seedTaxonomy,
};
