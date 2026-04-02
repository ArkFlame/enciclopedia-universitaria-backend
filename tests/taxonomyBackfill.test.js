const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTaxonomyAssignment,
} = require('../src/db/taxonomyBackfill');

test('resolveTaxonomyAssignment maps category and subcategory tokens within the resolved category', async () => {
  const row = {
    id: 1,
    category: 'IRP',
    subcategory: 'Programación',
    category_id: null,
    subcategory_id: null,
  };

  const result = await resolveTaxonomyAssignment(row, {
    getActiveCategoryById: async () => null,
    getActiveCategoryByToken: async (token) => {
      assert.equal(token, 'IRP');
      return { id: 10, name: 'IRP' };
    },
    getActiveSubcategoryByTokenWithinCategory: async (categoryId, token) => {
      assert.equal(categoryId, 10);
      assert.equal(token, 'Programación');
      return { id: 33, category_id: 10, name: 'Programación' };
    },
    findActiveSubcategoryGlobally: async () => [],
  });

  assert.deepEqual(result, {
    updated: true,
    categoryId: 10,
    subcategoryId: 33,
    ambiguityReason: null,
  });
});

test('resolveTaxonomyAssignment uses the existing category id when only the subcategory token needs resolution', async () => {
  const row = {
    id: 2,
    category: null,
    subcategory: 'Lenguaje',
    category_id: 12,
    subcategory_id: null,
  };

  const result = await resolveTaxonomyAssignment(row, {
    getActiveCategoryById: async (categoryId) => {
      assert.equal(categoryId, 12);
      return { id: 12, name: 'IEU' };
    },
    getActiveCategoryByToken: async () => null,
    getActiveSubcategoryByTokenWithinCategory: async (categoryId, token) => {
      assert.equal(categoryId, 12);
      assert.equal(token, 'Lenguaje');
      return { id: 44, category_id: 12, name: 'Lenguaje' };
    },
    findActiveSubcategoryGlobally: async () => [],
  });

  assert.deepEqual(result, {
    updated: true,
    categoryId: 12,
    subcategoryId: 44,
    ambiguityReason: null,
  });
});

test('resolveTaxonomyAssignment reports ambiguous global subcategory matches without changing ids', async () => {
  const row = {
    id: 3,
    category: null,
    subcategory: 'Temas relacionados',
    category_id: null,
    subcategory_id: null,
  };

  const result = await resolveTaxonomyAssignment(row, {
    getActiveCategoryById: async () => null,
    getActiveCategoryByToken: async () => null,
    getActiveSubcategoryByTokenWithinCategory: async () => null,
    findActiveSubcategoryGlobally: async () => [
      { id: 51, category_id: 13, name: 'Temas relacionados' },
      { id: 52, category_id: 14, name: 'Temas relacionados' },
    ],
  });

  assert.equal(result.updated, false);
  assert.equal(result.categoryId, null);
  assert.equal(result.subcategoryId, null);
  assert.match(result.ambiguityReason, /ambiguous/);
});
