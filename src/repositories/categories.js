const { eq, asc, and } = require('drizzle-orm');
const { db } = require('../db/index');
const { categories, subcategories } = require('../db/schema');

async function listCategoriesTree() {
  const allCategories = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
  })
    .from(categories)
    .where(eq(categories.isActive, '1'))
    .orderBy(asc(categories.sortOrder));

  const allSubcategories = await db.select({
    id: subcategories.id,
    categoryId: subcategories.categoryId,
    slug: subcategories.slug,
    name: subcategories.name,
    sortOrder: subcategories.sortOrder,
    isActive: subcategories.isActive,
  })
    .from(subcategories)
    .where(eq(subcategories.isActive, '1'))
    .orderBy(asc(subcategories.sortOrder));

  return allCategories.map(cat => ({
    ...cat,
    children: allSubcategories
      .filter(sub => sub.categoryId === cat.id)
      .map(sub => ({
        id: sub.id,
        slug: sub.slug,
        name: sub.name,
        sortOrder: sub.sortOrder,
      })),
  }));
}

async function listActiveCategories() {
  return db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
  })
    .from(categories)
    .where(eq(categories.isActive, '1'))
    .orderBy(asc(categories.sortOrder));
}

async function listSubcategoriesByCategoryId(categoryId) {
  return db.select({
    id: subcategories.id,
    categoryId: subcategories.categoryId,
    slug: subcategories.slug,
    name: subcategories.name,
    sortOrder: subcategories.sortOrder,
  })
    .from(subcategories)
    .where(and(
      eq(subcategories.categoryId, categoryId),
      eq(subcategories.isActive, '1')
    ))
    .orderBy(asc(subcategories.sortOrder));
}

async function getCategoryBySlug(slug) {
  const result = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
  })
    .from(categories)
    .where(and(
      eq(categories.slug, slug),
      eq(categories.isActive, '1')
    ));
  return result[0] || null;
}

async function getSubcategoryBySlug(categoryId, slug) {
  const result = await db.select({
    id: subcategories.id,
    categoryId: subcategories.categoryId,
    slug: subcategories.slug,
    name: subcategories.name,
    sortOrder: subcategories.sortOrder,
    isActive: subcategories.isActive,
  })
    .from(subcategories)
    .where(and(
      eq(subcategories.categoryId, categoryId),
      eq(subcategories.slug, slug),
      eq(subcategories.isActive, '1')
    ));
  return result[0] || null;
}

async function createCategory(input) {
  const [created] = await db.insert(categories).values({
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    sortOrder: input.sortOrder || 0,
    isActive: input.isActive ? '1' : '0',
  }).onDuplicateKeyUpdate({
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    sortOrder: input.sortOrder || 0,
    isActive: input.isActive ? '1' : '0',
  });
  return created;
}

async function updateCategory(id, input) {
  const updates = {};
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updates.isActive = input.isActive ? '1' : '0';

  if (Object.keys(updates).length === 0) return null;

  const [updated] = await db.update(categories)
    .set(updates)
    .where(eq(categories.id, id));
  return updated;
}

async function deleteCategory(id) {
  const [deleted] = await db.update(categories)
    .set({ isActive: '0' })
    .where(eq(categories.id, id));
  return deleted;
}

async function createSubcategory(input) {
  const [created] = await db.insert(subcategories).values({
    categoryId: input.categoryId,
    slug: input.slug,
    name: input.name,
    sortOrder: input.sortOrder || 0,
    isActive: input.isActive ? '1' : '0',
  }).onDuplicateKeyUpdate({
    slug: input.slug,
    name: input.name,
    sortOrder: input.sortOrder || 0,
    isActive: input.isActive ? '1' : '0',
  });
  return created;
}

async function updateSubcategory(id, input) {
  const updates = {};
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.name !== undefined) updates.name = input.name;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updates.isActive = input.isActive ? '1' : '0';

  if (Object.keys(updates).length === 0) return null;

  const [updated] = await db.update(subcategories)
    .set(updates)
    .where(eq(subcategories.id, id));
  return updated;
}

async function deleteSubcategory(id) {
  const [deleted] = await db.update(subcategories)
    .set({ isActive: '0' })
    .where(eq(subcategories.id, id));
  return deleted;
}

async function getCategoryById(id) {
  const result = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
  })
    .from(categories)
    .where(eq(categories.id, id));
  return result[0] || null;
}

async function getSubcategoryById(id) {
  const result = await db.select({
    id: subcategories.id,
    categoryId: subcategories.categoryId,
    slug: subcategories.slug,
    name: subcategories.name,
    sortOrder: subcategories.sortOrder,
    isActive: subcategories.isActive,
  })
    .from(subcategories)
    .where(eq(subcategories.id, id));
  return result[0] || null;
}

module.exports = {
  listCategoriesTree,
  listActiveCategories,
  listSubcategoriesByCategoryId,
  getCategoryBySlug,
  getSubcategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  getCategoryById,
  getSubcategoryById,
};
