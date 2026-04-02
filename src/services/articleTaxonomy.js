const categoriesRepo = require('../repositories/categories');

async function resolveArticleTaxonomyInput({ categoryId, subcategoryId, category, subcategory }) {
  if (!categoryId && !subcategoryId && !category && !subcategory) {
    return { category: null, subcategory: null, categoryId: null, subcategoryId: null };
  }

  if (categoryId && !subcategoryId) {
    const cat = await categoriesRepo.getActiveCategoryById(categoryId);
    if (!cat) {
      throw new Error('Categoría no encontrada');
    }
    return { category: cat, subcategory: null, categoryId: cat.id, subcategoryId: null };
  }

  if (subcategoryId && !categoryId) {
    const sub = await categoriesRepo.getActiveSubcategoryById(subcategoryId);
    if (!sub) {
      throw new Error('Subcategoría no encontrada');
    }
    const cat = await categoriesRepo.getActiveCategoryById(sub.categoryId);
    if (!cat) {
      throw new Error('La categoría padre de la subcategoría no existe');
    }
    return { category: cat, subcategory: sub, categoryId: cat.id, subcategoryId: sub.id };
  }

  if (categoryId && subcategoryId) {
    const cat = await categoriesRepo.getActiveCategoryById(categoryId);
    if (!cat) {
      throw new Error('Categoría no encontrada');
    }
    const sub = await categoriesRepo.getActiveSubcategoryById(subcategoryId);
    if (!sub) {
      throw new Error('Subcategoría no encontrada');
    }
    if (sub.categoryId !== categoryId) {
      throw new Error('La subcategoría no pertenece a la categoría especificada');
    }
    return { category: cat, subcategory: sub, categoryId: cat.id, subcategoryId: sub.id };
  }

  if (category || subcategory) {
    const categorySlug = typeof category === 'string' ? category.toLowerCase().replace(/\s+/g, '-') : null;
    const subcategorySlug = typeof subcategory === 'string' ? subcategory.toLowerCase().replace(/\s+/g, '-') : null;

    let resolvedCategory = null;
    let resolvedSubcategory = null;

    if (categorySlug) {
      resolvedCategory = await categoriesRepo.getCategoryBySlug(categorySlug);
      if (!resolvedCategory) {
        const allCategories = await categoriesRepo.listActiveCategories();
        resolvedCategory = allCategories.find(c => c.name.toLowerCase() === category.toLowerCase());
      }
    }

    if (subcategorySlug && resolvedCategory) {
      resolvedSubcategory = await categoriesRepo.getSubcategoryBySlug(resolvedCategory.id, subcategorySlug);
      if (!resolvedSubcategory) {
        const subcategories = await categoriesRepo.listSubcategoriesByCategoryId(resolvedCategory.id);
        resolvedSubcategory = subcategories.find(s => s.name.toLowerCase() === subcategory.toLowerCase());
      }
    } else if (subcategorySlug && !resolvedCategory) {
      const allCategories = await categoriesRepo.listActiveCategories();
      for (const cat of allCategories) {
        const sub = await categoriesRepo.getSubcategoryBySlug(cat.id, subcategorySlug);
        if (sub) {
          resolvedSubcategory = sub;
          resolvedCategory = cat;
          break;
        }
        const subcategories = await categoriesRepo.listSubcategoriesByCategoryId(cat.id);
        const byName = subcategories.find(s => s.name.toLowerCase() === subcategory.toLowerCase());
        if (byName) {
          resolvedSubcategory = byName;
          resolvedCategory = cat;
          break;
        }
      }
    }

    if (categorySlug && !resolvedCategory) {
      throw new Error(`Categoría "${category}" no encontrada`);
    }

    return {
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      categoryId: resolvedCategory ? resolvedCategory.id : null,
      subcategoryId: resolvedSubcategory ? resolvedSubcategory.id : null,
    };
  }

  return { category: null, subcategory: null, categoryId: null, subcategoryId: null };
}

async function resolveFilterTaxonomyInput({ categoryId, subcategoryId, categorySlug, subcategorySlug }) {
  const result = {
    categoryId: null,
    subcategoryId: null,
    categorySlug: null,
    subcategorySlug: null,
    categoryName: null,
    subcategoryName: null,
  };

  if (categoryId) {
    const cat = await categoriesRepo.getCategoryById(categoryId);
    if (cat) {
      result.categoryId = cat.id;
      result.categorySlug = cat.slug;
      result.categoryName = cat.name;
    }
  }

  if (subcategoryId) {
    const sub = await categoriesRepo.getSubcategoryById(subcategoryId);
    if (sub) {
      result.subcategoryId = sub.id;
      result.subcategorySlug = sub.slug;
      result.subcategoryName = sub.name;
      if (!result.categoryId && sub.categoryId) {
        const cat = await categoriesRepo.getCategoryById(sub.categoryId);
        if (cat) {
          result.categoryId = cat.id;
          result.categorySlug = cat.slug;
          result.categoryName = cat.name;
        }
      }
    }
  }

  if (categorySlug && !result.categoryId) {
    const cat = await categoriesRepo.getCategoryBySlug(categorySlug);
    if (cat) {
      result.categoryId = cat.id;
      result.categorySlug = cat.slug;
      result.categoryName = cat.name;
    }
  }

  if (subcategorySlug && !result.subcategoryId) {
    const searchCategoryId = result.categoryId;
    if (searchCategoryId) {
      const sub = await categoriesRepo.getSubcategoryBySlug(searchCategoryId, subcategorySlug);
      if (sub) {
        result.subcategoryId = sub.id;
        result.subcategorySlug = sub.slug;
        result.subcategoryName = sub.name;
      }
    } else {
      const allCategories = await categoriesRepo.listActiveCategories();
      for (const cat of allCategories) {
        const sub = await categoriesRepo.getSubcategoryBySlug(cat.id, subcategorySlug);
        if (sub) {
          result.subcategoryId = sub.id;
          result.subcategorySlug = sub.slug;
          result.subcategoryName = sub.name;
          result.categoryId = cat.id;
          result.categorySlug = cat.slug;
          result.categoryName = cat.name;
          break;
        }
      }
    }
  }

  return result;
}

module.exports = {
  resolveArticleTaxonomyInput,
  resolveFilterTaxonomyInput,
};
