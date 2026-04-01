const { eq, asc, and } = require('drizzle-orm');
const { db } = require('../db/index');
const { categories, subcategories } = require('../db/schema');

function toDbFlag(value) {
  return value === true || value === '1' ? '1' : '0';
}

async function listCategoriesTree() {
  const allCategories = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
    color: categories.color,
  })
    .from(categories)
    .where(eq(categories.isActive, '1'))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

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
    .orderBy(asc(subcategories.categoryId), asc(subcategories.sortOrder), asc(subcategories.name));

  return allCategories.map((category) => ({
    ...category,
    children: allSubcategories
      .filter((sub) => sub.categoryId === category.id)
      .map((sub) => ({
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
    isActive: categories.isActive,
    color: categories.color,
  })
    .from(categories)
    .where(eq(categories.isActive, '1'))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
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
    .orderBy(asc(subcategories.sortOrder), asc(subcategories.name));
}

async function getCategoryBySlug(slug) {
  const rows = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
    color: categories.color,
  })
    .from(categories)
    .where(and(
      eq(categories.slug, slug),
      eq(categories.isActive, '1')
    ));

  return rows[0] || null;
}

async function getSubcategoryBySlug(categoryId, slug) {
  const rows = await db.select({
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

  return rows[0] || null;
}

async function getCategoryById(id) {
  const rows = await db.select({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    description: categories.description,
    sortOrder: categories.sortOrder,
    isActive: categories.isActive,
    color: categories.color,
  })
    .from(categories)
    .where(eq(categories.id, id));

  return rows[0] || null;
}

async function getSubcategoryById(id) {
  const rows = await db.select({
    id: subcategories.id,
    categoryId: subcategories.categoryId,
    slug: subcategories.slug,
    name: subcategories.name,
    sortOrder: subcategories.sortOrder,
    isActive: subcategories.isActive,
  })
    .from(subcategories)
    .where(eq(subcategories.id, id));

  return rows[0] || null;
}

async function createCategory(input) {
  const insertedIds = await db.insert(categories)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description || null,
      sortOrder: input.sortOrder || 0,
      isActive: toDbFlag(input.isActive !== undefined ? input.isActive : true),
      color: input.color || '#000000',
    })
    .$returningId();

  return insertedIds[0] || null;
}

async function updateCategory(id, input) {
  const updates = {};

  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updates.isActive = toDbFlag(input.isActive);
  if (input.color !== undefined) updates.color = input.color;

  if (!Object.keys(updates).length) return null;

  await db.update(categories)
    .set(updates)
    .where(eq(categories.id, id));

  return getCategoryById(id);
}

async function deleteCategory(id) {
  await db.update(categories)
    .set({ isActive: '0' })
    .where(eq(categories.id, id));

  return getCategoryById(id);
}

async function createSubcategory(input) {
  const insertedIds = await db.insert(subcategories)
    .values({
      categoryId: input.categoryId,
      slug: input.slug,
      name: input.name,
      sortOrder: input.sortOrder || 0,
      isActive: toDbFlag(input.isActive !== undefined ? input.isActive : true),
    })
    .$returningId();

  return insertedIds[0] || null;
}

async function updateSubcategory(id, input) {
  const updates = {};

  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.name !== undefined) updates.name = input.name;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updates.isActive = toDbFlag(input.isActive);

  if (!Object.keys(updates).length) return null;

  await db.update(subcategories)
    .set(updates)
    .where(eq(subcategories.id, id));

  return getSubcategoryById(id);
}

async function deleteSubcategory(id) {
  await db.update(subcategories)
    .set({ isActive: '0' })
    .where(eq(subcategories.id, id));

  return getSubcategoryById(id);
}

async function reorderCategories(orderedIds) {
  const updates = orderedIds.map((id, index) => ({
    id,
    sortOrder: index,
  }));

  for (const { id, sortOrder } of updates) {
    await db.update(categories)
      .set({ sortOrder })
      .where(eq(categories.id, id));
  }
}

async function reorderSubcategories(orderedIds) {
  const updates = orderedIds.map((id, index) => ({
    id,
    sortOrder: index,
  }));

  for (const { id, sortOrder } of updates) {
    await db.update(subcategories)
      .set({ sortOrder })
      .where(eq(subcategories.id, id));
  }
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
  reorderCategories,
  reorderSubcategories,
};
