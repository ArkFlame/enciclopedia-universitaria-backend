const express = require('express');
const router = express.Router();
const { requireAuth, requireMod, requireAdmin } = require('../middleware/auth');
const { sanitizeString, sanitizeSlug, sanitizeInt } = require('../utils/sanitize');
const categoriesRepo = require('../src/repositories/categories');

function parseIsActive(value) {
  if (value === undefined) return true;
  return value === true || value === '1' || value === 1;
}

function fromDbFlag(value) {
  return value === '1' || value === 1 || value === true;
}

function mapCategoryDto(cat) {
  if (!cat) return null;
  return {
    id: cat.id,
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    sortOrder: cat.sortOrder,
    isActive: fromDbFlag(cat.isActive),
    color: cat.color,
  };
}

function mapSubcategoryDto(sub) {
  if (!sub) return null;
  return {
    id: sub.id,
    categoryId: sub.categoryId,
    slug: sub.slug,
    name: sub.name,
    description: sub.description,
    sortOrder: sub.sortOrder,
    isActive: fromDbFlag(sub.isActive),
  };
}

router.get('/categories/tree', requireAuth, requireMod, async (req, res) => {
  try {
    const tree = await categoriesRepo.listCategoriesTree({ includeInactive: true });
    res.json(tree.map(cat => ({
      ...mapCategoryDto(cat),
      children: (cat.children || []).map(mapSubcategoryDto),
    })));
  } catch (err) {
    console.error('GET /admin/categories/tree:', err);
    res.status(500).json({ error: 'Error al obtener árbol de categorías' });
  }
});

router.get('/categories', requireAuth, requireMod, async (req, res) => {
  try {
    const categories = await categoriesRepo.listCategories({ includeInactive: true });
    res.json(categories.map(mapCategoryDto));
  } catch (err) {
    console.error('GET /admin/categories:', err);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

router.post('/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug, name, description, sortOrder, isActive, color } = req.body;

    const cleanSlug = sanitizeSlug(slug);
    const cleanName = sanitizeString(name, 200);
    const cleanDesc = description ? sanitizeString(description, 2000) : '';
    const cleanOrder = sanitizeInt(sortOrder, 0, 9999, 0);
    const active = parseIsActive(isActive);
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';

    if (!cleanSlug) return res.status(400).json({ error: 'Slug inválido' });
    if (!cleanName) return res.status(400).json({ error: 'Nombre inválido' });

    const created = await categoriesRepo.createCategory({
      slug: cleanSlug,
      name: cleanName,
      description: cleanDesc || null,
      sortOrder: cleanOrder,
      isActive: active,
      color: cleanColor,
    });

    res.status(201).json({ message: 'Categoría creada', id: created && created.insertId });
  } catch (err) {
    console.error('POST /admin/categories:', err);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

router.patch('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const existing = await categoriesRepo.getCategoryById(id);
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

    const { slug, name, description, sortOrder, isActive, color } = req.body;
    const updates = {};

    if (slug !== undefined) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return res.status(400).json({ error: 'Slug inválido' });
      updates.slug = cleanSlug;
    }
    if (name !== undefined) {
      const cleanName = sanitizeString(name, 200);
      if (!cleanName) return res.status(400).json({ error: 'Nombre inválido' });
      updates.name = cleanName;
    }
    if (description !== undefined) {
      updates.description = sanitizeString(description, 2000) || null;
    }
    if (sortOrder !== undefined) {
      updates.sortOrder = sanitizeInt(sortOrder, 0, 9999, 0);
    }
    if (isActive !== undefined) {
      updates.isActive = parseIsActive(isActive);
    }
    if (color !== undefined) {
      if (/^#[0-9a-fA-F]{6}$/.test(color)) updates.color = color;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    await categoriesRepo.updateCategory(id, updates);
    res.json({ message: 'Categoría actualizada' });
  } catch (err) {
    console.error('PATCH /admin/categories/:id:', err);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

router.delete('/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const existing = await categoriesRepo.getCategoryById(id);
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

    await categoriesRepo.deleteCategory(id);
    res.json({ message: 'Categoría eliminada' });
  } catch (err) {
    console.error('DELETE /admin/categories/:id:', err);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

router.put('/categories/reorder', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds debe ser un array' });
    }

    const validated = orderedIds.map((id, index) => {
      const clean = sanitizeInt(id, 1, 999999999);
      if (!clean) throw new Error(`ID inválido en posición ${index}`);
      return clean;
    });

    await categoriesRepo.reorderCategories(validated);
    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    console.error('PUT /admin/categories/reorder:', err);
    res.status(500).json({ error: err.message || 'Error al reordenar categorías' });
  }
});

router.get('/categories/:id/subcategories', requireAuth, requireMod, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const subcategories = await categoriesRepo.listSubcategoriesByCategoryId(id, { includeInactive: true });
    res.json(subcategories.map(mapSubcategoryDto));
  } catch (err) {
    console.error('GET /admin/categories/:id/subcategories:', err);
    res.status(500).json({ error: 'Error al obtener subcategorías' });
  }
});

router.post('/subcategories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { categoryId, slug, name, description, sortOrder, isActive } = req.body;

    const cleanCatId = sanitizeInt(categoryId, 1, 999999999);
    const cleanSlug = sanitizeSlug(slug);
    const cleanName = sanitizeString(name, 200);
    const cleanDesc = description ? sanitizeString(description, 2000) : '';
    const cleanOrder = sanitizeInt(sortOrder, 0, 9999, 0);
    const active = parseIsActive(isActive);

    if (!cleanCatId) return res.status(400).json({ error: 'ID de categoría inválido' });
    if (!cleanSlug) return res.status(400).json({ error: 'Slug inválido' });
    if (!cleanName) return res.status(400).json({ error: 'Nombre inválido' });

    const category = await categoriesRepo.getCategoryById(cleanCatId);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });

    const created = await categoriesRepo.createSubcategory({
      categoryId: cleanCatId,
      slug: cleanSlug,
      name: cleanName,
      description: cleanDesc || null,
      sortOrder: cleanOrder,
      isActive: active,
    });

    res.status(201).json({ message: 'Subcategoría creada', id: created && created.insertId });
  } catch (err) {
    console.error('POST /admin/subcategories:', err);
    res.status(500).json({ error: 'Error al crear subcategoría' });
  }
});

router.patch('/subcategories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const existing = await categoriesRepo.getSubcategoryById(id);
    if (!existing) return res.status(404).json({ error: 'Subcategoría no encontrada' });

    const { slug, name, description, sortOrder, isActive } = req.body;
    const updates = {};

    if (slug !== undefined) {
      const cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return res.status(400).json({ error: 'Slug inválido' });
      updates.slug = cleanSlug;
    }
    if (name !== undefined) {
      const cleanName = sanitizeString(name, 200);
      if (!cleanName) return res.status(400).json({ error: 'Nombre inválido' });
      updates.name = cleanName;
    }
    if (description !== undefined) {
      updates.description = sanitizeString(description, 2000) || null;
    }
    if (sortOrder !== undefined) {
      updates.sortOrder = sanitizeInt(sortOrder, 0, 9999, 0);
    }
    if (isActive !== undefined) {
      updates.isActive = parseIsActive(isActive);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    await categoriesRepo.updateSubcategory(id, updates);
    res.json({ message: 'Subcategoría actualizada' });
  } catch (err) {
    console.error('PATCH /admin/subcategories/:id:', err);
    res.status(500).json({ error: 'Error al actualizar subcategoría' });
  }
});

router.delete('/subcategories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const existing = await categoriesRepo.getSubcategoryById(id);
    if (!existing) return res.status(404).json({ error: 'Subcategoría no encontrada' });

    await categoriesRepo.deleteSubcategory(id);
    res.json({ message: 'Subcategoría eliminada' });
  } catch (err) {
    console.error('DELETE /admin/subcategories/:id:', err);
    res.status(500).json({ error: 'Error al eliminar subcategoría' });
  }
});

router.put('/categories/:id/subcategories/reorder', requireAuth, requireAdmin, async (req, res) => {
  try {
    const categoryId = sanitizeInt(req.params.id, 1, 999999999);
    if (!categoryId) return res.status(400).json({ error: 'ID inválido' });

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds debe ser un array' });
    }

    const validated = orderedIds.map((id, index) => {
      const clean = sanitizeInt(id, 1, 999999999);
      if (!clean) throw new Error(`ID inválido en posición ${index}`);
      return clean;
    });

    const subcats = await categoriesRepo.listSubcategoriesByCategoryId(categoryId, { includeInactive: true });
    const subcatIds = new Set(subcats.map(s => s.id));
    for (const id of validated) {
      if (!subcatIds.has(id)) {
        return res.status(400).json({ error: 'Una o más subcategorías no pertenecen a esta categoría' });
      }
    }

    await categoriesRepo.reorderSubcategories(validated);
    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    console.error('PUT /admin/categories/:id/subcategories/reorder:', err);
    res.status(500).json({ error: err.message || 'Error al reordenar subcategorías' });
  }
});

module.exports = router;