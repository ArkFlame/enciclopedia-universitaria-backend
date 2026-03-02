const express  = require('express');
const router   = express.Router();
const fs       = require('fs').promises;
const path     = require('path');
const db       = require('../config/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requireVerified }           = require('../middleware/requireVerified');
const { checkRateLimit }            = require('../middleware/rateLimit');
const { processArticleContent }     = require('../utils/shortcodeParser');
const {
  sanitizeSearchQuery, sanitizeString, sanitizeInt,
  sanitizeSlug, sanitizeStatus, sanitizeContent, sanitizeSummary
} = require('../utils/sanitize');

const STORAGE = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
const BASE_URL = process.env.BASE_URL || '';

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ── GET /api/articles — List articles ──────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const rawQuery    = req.query.query    || req.query.q || '';
    const rawCategory = req.query.category || '';
    const rawPage     = req.query.page;
    const rawLimit    = req.query.limit;
    const includePending = req.query.includePending === 'true';

    // Sanitize all inputs
    const searchQuery = sanitizeSearchQuery(rawQuery);
    const category    = sanitizeString(rawCategory, 100);
    const page        = sanitizeInt(rawPage, 1, 9999, 1);
    const pageSize    = sanitizeInt(rawLimit, 1, 50, 20);
    const offset      = (page - 1) * pageSize;

    const conditions = [];
    const params     = [];

    // Visibility
    if (includePending) {
      conditions.push('a.status IN ("APPROVED","PENDING")');
    } else {
      conditions.push('a.status = "APPROVED"');
    }

    // Full-text search — uses sanitized query
    if (searchQuery) {
      conditions.push('MATCH(a.title, a.summary) AGAINST(? IN BOOLEAN MODE)');
      params.push(searchQuery);
    }

    if (category) {
      conditions.push('a.category = ?');
      params.push(category);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const [rows] = await db.query(
      `SELECT a.id, a.slug, a.title, a.summary, a.status, a.category, a.tags,
              a.views, a.created_at, a.updated_at,
              u.username AS author_username,
              (SELECT COUNT(*) FROM eu_media m WHERE m.article_id = a.id) AS image_count
       FROM eu_articles a
       JOIN eu_users u ON a.author_id = u.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM eu_articles a ${where}`,
      params
    );

    res.json({ articles: rows, total, page, pageSize });
  } catch (err) {
    console.error('GET /api/articles error:', err);
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

// ── GET /api/articles/meta/categories ──────────────────────────────────
// MUST be before /:slug to avoid route conflict
router.get('/meta/categories', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM eu_categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ── GET /api/articles/by-id/:id/content — Raw markdown (for editor) ────
router.get('/by-id/:id/content', requireAuth, async (req, res) => {
  try {
    const id = sanitizeInt(req.params.id, 1, 999999999);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await db.query(
      'SELECT content_path, author_id FROM eu_articles WHERE id = ?', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Artículo no encontrado' });

    const article = rows[0];
    const isMod   = ['MOD', 'ADMIN'].includes(req.user.role);
    if (!isMod && article.author_id !== req.user.id)
      return res.status(403).json({ error: 'Acceso denegado' });

    const content = await fs.readFile(article.content_path, 'utf8');
    res.json({ content });
  } catch (err) {
    console.error('GET /by-id/content error:', err);
    res.status(500).json({ error: 'Error al leer contenido' });
  }
});

// ── GET /api/articles/:slug — Single article ───────────────────────────
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const slug          = sanitizeSlug(req.params.slug);
    const includePending = req.query.includePending === 'true';

    if (!slug) return res.status(400).json({ error: 'Slug inválido' });

    const statusFilter = includePending
      ? 'a.status IN ("APPROVED","PENDING")'
      : 'a.status = "APPROVED"';

    const [rows] = await db.query(
      `SELECT a.id, a.slug, a.title, a.summary, a.content_path, a.status,
              a.category, a.tags, a.views, a.version, a.created_at, a.updated_at,
              a.rejection_reason,
              u.username AS author_username, u.id AS author_id,
              ru.username AS reviewer_username, a.reviewed_at
       FROM eu_articles a
       JOIN eu_users u ON a.author_id = u.id
       LEFT JOIN eu_users ru ON a.reviewed_by = ru.id
       WHERE a.slug = ? AND ${statusFilter}`,
      [slug]
    );

    if (!rows.length) return res.status(404).json({ error: 'Artículo no encontrado' });

    const article = rows[0];
    const summaryHtml = article.summary ? await processArticleContent(article.summary) : '';
    const FREE_LIMIT = sanitizeInt(process.env.FREE_ARTICLES_PER_MONTH, 1, 9999, 30);
    let limitReached = false;

    if (req.user) {
      const user = req.user;
      const resetDate = new Date(user.articles_read_reset_at);
      const now = new Date();
      if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        await db.query(
          'UPDATE eu_users SET articles_read_this_month = 0, articles_read_reset_at = NOW() WHERE id = ?',
          [user.id]
        );
        user.articles_read_this_month = 0;
      }
      if (user.role === 'FREE' && user.articles_read_this_month >= FREE_LIMIT) {
        limitReached = true;
      } else if (user.role === 'FREE') {
        await db.query(
          'UPDATE eu_users SET articles_read_this_month = articles_read_this_month + 1 WHERE id = ?',
          [user.id]
        );
      }
    }

    let rawContent = '';
    try {
      rawContent = await fs.readFile(article.content_path, 'utf8');
    } catch (e) {
      rawContent = '*Contenido no disponible temporalmente.*';
    }

    const htmlContent = await processArticleContent(rawContent);
    await db.query('UPDATE eu_articles SET views = views + 1 WHERE id = ?', [article.id]);

    const [media] = await db.query(
      'SELECT id, filename, public_url, width, height FROM eu_media WHERE article_id = ? ORDER BY created_at',
      [article.id]
    );

    const [sources] = await db.query(
      `SELECT id, type, title, url, pdf_original_name, pdf_size, favicon_url 
       FROM eu_article_sources WHERE article_id = ? ORDER BY display_order ASC, created_at ASC`,
      [article.id]
    );
    const formattedSources = sources.map(s => ({
      ...s,
      download_url: s.type === 'pdf' ? `/api/sources/pdf/${s.id}` : s.url
    }));

    const [related] = await db.query(
      `SELECT slug, title, summary FROM eu_articles
       WHERE category = ? AND slug != ? AND status = "APPROVED"
       ORDER BY views DESC LIMIT 5`,
      [article.category || '', slug]
    );

    res.json({
      ...article,
      summaryHtml,
      htmlContent: limitReached ? null : htmlContent,
      limitReached,
      freeLimit: FREE_LIMIT,
      media,
      sources: formattedSources,
      related
    });
  } catch (err) {
    console.error('GET /api/articles/:slug error:', err);
    res.status(500).json({ error: 'Error al obtener artículo' });
  }
});

// ── POST /api/articles — Create article ────────────────────────────────
router.post('/', requireAuth, requireVerified, checkRateLimit('submit_article'), async (req, res) => {
  try {
    const title    = sanitizeString(req.body.title,   500);
    const summary  = sanitizeSummary(req.body.summary, 2000);
    const content  = sanitizeContent(req.body.content);
    const category = sanitizeString(req.body.category, 100);
    const tags     = Array.isArray(req.body.tags)
      ? req.body.tags.map(t => sanitizeString(t, 50)).filter(Boolean).slice(0, 20)
      : [];

    if (!title)   return res.status(400).json({ error: 'El título es obligatorio' });
    if (!summary) return res.status(400).json({ error: 'El resumen es obligatorio' });
    if (!content) return res.status(400).json({ error: 'El contenido es obligatorio' });

    let slug = slugify(title);
    const [existing] = await db.query('SELECT id FROM eu_articles WHERE slug = ?', [slug]);
    if (existing.length) slug = `${slug}-${Date.now()}`;

    const articleDir  = path.join(STORAGE, 'articles', slug);
    await ensureDir(articleDir);
    const contentPath = path.join(articleDir, 'content.md');
    await fs.writeFile(contentPath, content, 'utf8');

    const [result] = await db.query(
      `INSERT INTO eu_articles (slug, title, summary, content_path, author_id, status, category, tags)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [slug, title, summary, contentPath, req.user.id,
       category || null, tags.length ? JSON.stringify(tags) : null]
    );

    // Notify mods/admins
    const [admins] = await db.query('SELECT id FROM eu_users WHERE role IN ("ADMIN","MOD")');
    const articleUrl = `${BASE_URL}/articulo.html?slug=${slug}`;
    for (const admin of admins) {
      await db.query(
        `INSERT INTO eu_notifications (user_id, type, message, reference_id, article_slug, notification_url) VALUES (?, 'new_submission', ?, ?, ?, ?)`,
        [admin.id, `Nuevo artículo pendiente: "${title}"`, result.insertId, slug, articleUrl]
      );
    }
    await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE role IN ("ADMIN","MOD")');

    res.status(201).json({ message: 'Artículo enviado. Quedará pendiente de aprobación.', articleId: result.insertId, slug });
  } catch (err) {
    console.error('POST /api/articles error:', err);
    res.status(500).json({ error: 'Error al crear artículo' });
  }
});

// ── POST /api/articles/:id/edit — Propose an edit ──────────────────────
router.post('/:id/edit', requireAuth, requireVerified, checkRateLimit('edit_article'), async (req, res) => {
  try {
    const articleId = sanitizeInt(req.params.id, 1, 999999999);
    if (!articleId) return res.status(400).json({ error: 'ID inválido' });

    const title    = sanitizeString(req.body.title,   500);
    const summary  = typeof req.body.summary === 'string'
      ? sanitizeSummary(req.body.summary, 2000)
      : '';
    const content  = sanitizeContent(req.body.content);
    const editNote = sanitizeString(req.body.editNote, 1000);
    const category = sanitizeString(req.body.category, 100) || null;

    if (!content) return res.status(400).json({ error: 'El contenido de la edición es obligatorio' });

    const [artRows] = await db.query('SELECT * FROM eu_articles WHERE id = ?', [articleId]);
    if (!artRows.length) return res.status(404).json({ error: 'Artículo no encontrado' });

    const editDir  = path.join(STORAGE, 'revisions', String(articleId));
    await ensureDir(editDir);
    const editPath = path.join(editDir, `${Date.now()}_${req.user.id}.md`);
    await fs.writeFile(editPath, content, 'utf8');

    const [result] = await db.query(
      `INSERT INTO eu_article_edits
       (article_id, editor_id, title, summary, content_path, edit_note, category, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [articleId, req.user.id, title || null, summary || null, editPath, editNote || null, category]
    );

    // Notify mods/admins
    const article = artRows[0];
    const articleUrl = `${BASE_URL}/articulo.html?slug=${article.slug}`;
    const [admins] = await db.query('SELECT id FROM eu_users WHERE role IN ("ADMIN","MOD")');
    for (const admin of admins) {
      await db.query(
        `INSERT INTO eu_notifications (user_id, type, message, reference_id, article_slug, notification_url) VALUES (?, 'new_submission', ?, ?, ?, ?)`,
        [admin.id, `Nueva edición pendiente en: "${article.title}"`, articleId, article.slug, articleUrl]
      );
    }
    await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE role IN ("ADMIN","MOD")');

    res.status(201).json({
      message: 'Edición enviada. Un moderador la revisará antes de publicarla.',
      editId: result.insertId
    });
  } catch (err) {
    console.error('POST /api/articles/:id/edit error:', err);
    res.status(500).json({ error: 'Error al enviar edición' });
  }
});

module.exports = router;
