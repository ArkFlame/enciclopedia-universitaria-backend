const express = require('express');
const router  = express.Router();
const fs      = require('fs').promises;
const db      = require('../config/db');
const { requireAuth, requireMod, requireAdmin } = require('../middleware/auth'); // Added requireAuth
const { sanitizeInt, sanitizeString, sanitizeStatus } = require('../utils/sanitize');

// ── GET /api/admin/articles ─────────────────────────────────────────────
// FIX: Added requireAuth before requireMod
router.get('/articles', requireAuth, requireMod, async (req, res) => {
  try {
    const st      = sanitizeStatus(req.query.status, ['PENDING','APPROVED','REJECTED','ALL']) || 'PENDING';
    const page    = sanitizeInt(req.query.page,  1, 9999, 1);
    const limit   = sanitizeInt(req.query.limit, 1, 100,  30);
    const offset  = (page - 1) * limit;

    const where  = st === 'ALL' ? '' : 'WHERE a.status = ?';
    const params = st === 'ALL' ? [] : [st];

    const [rows] = await db.query(
      `SELECT a.id, a.slug, a.title, a.summary, a.status, a.category,
              a.created_at, a.updated_at, a.rejection_reason, a.reviewed_at,
              u.username AS author_username, u.email AS author_email, u.role AS author_role,
              ru.username AS reviewer_username
       FROM eu_articles a
       JOIN eu_users u ON a.author_id = u.id
       LEFT JOIN eu_users ru ON a.reviewed_by = ru.id
       ${where}
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM eu_articles a ${where}`, params
    );

    res.json({ articles: rows, total, page, pageSize: limit });
  } catch (err) {
    console.error('GET /admin/articles:', err);
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

// ── PUT /api/admin/articles/:id/status ────────────────────────────────
// FIX: Added requireAuth before requireMod
router.put('/articles/:id/status', requireAuth, requireMod, async (req, res) => {
  try {
    const id     = sanitizeInt(req.params.id, 1, 999999999);
    const status = sanitizeStatus(req.body.status, ['APPROVED','REJECTED']);
    const reason = sanitizeString(req.body.reason, 500);

    if (!id)     return res.status(400).json({ error: 'ID inválido' });
    if (!status) return res.status(400).json({ error: 'Estado inválido' });

    const [rows] = await db.query('SELECT * FROM eu_articles WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Artículo no encontrado' });
    const article = rows[0];

    await db.query(
      `UPDATE eu_articles SET status = ?, reviewed_by = ?, reviewed_at = NOW(),
       rejection_reason = ? WHERE id = ?`,
      [status, req.user.id, reason || null, id]
    );

    const notifType = status === 'APPROVED' ? 'article_approved' : 'article_rejected';
    const msg = status === 'APPROVED'
      ? `Tu artículo "${article.title}" fue aprobado ✓`
      : `Tu artículo "${article.title}" fue rechazado. Motivo: ${reason || 'Sin especificar'}`;

    await db.query(
      'INSERT INTO eu_notifications (user_id, type, message, reference_id) VALUES (?, ?, ?, ?)',
      [article.author_id, notifType, msg, article.id]
    );
    await db.query(
      'UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?',
      [article.author_id]
    );
    await db.query(
      'INSERT INTO eu_admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, `article_${status.toLowerCase()}`, 'article', id, JSON.stringify({ reason })]
    );

    res.json({ message: `Artículo ${status === 'APPROVED' ? 'aprobado' : 'rechazado'}` });
  } catch (err) {
    console.error('PUT /admin/articles/:id/status:', err);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// ── GET /api/admin/edits ───────────────────────────────────────────────
// FIX: Added requireAuth before requireMod
router.get('/edits', requireAuth, requireMod, async (req, res) => {
  try {
    const st    = sanitizeStatus(req.query.status, ['PENDING','APPROVED','REJECTED','ALL']) || 'PENDING';
    const page  = sanitizeInt(req.query.page,  1, 9999, 1);
    const limit = sanitizeInt(req.query.limit, 1, 100,  50);
    const offset = (page - 1) * limit;

    const where  = st === 'ALL' ? '' : 'WHERE ae.status = ?';
    const params = st === 'ALL' ? [] : [st];

    const [rows] = await db.query(
      `SELECT ae.id, ae.article_id, ae.title, ae.summary, ae.edit_note, ae.status,
              ae.created_at, ae.rejection_reason, ae.reviewed_at,
              a.title AS article_title, a.slug AS article_slug,
              u.username AS editor_username, u.role AS editor_role,
              ru.username AS reviewer_username
       FROM eu_article_edits ae
       JOIN eu_articles a ON ae.article_id = a.id
       JOIN eu_users u ON ae.editor_id = u.id
       LEFT JOIN eu_users ru ON ae.reviewed_by = ru.id
       ${where}
       ORDER BY ae.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM eu_article_edits ae ${where}`, params
    );

    res.json({ edits: rows, total, page, pageSize: limit });
  } catch (err) {
    console.error('GET /admin/edits:', err);
    res.status(500).json({ error: 'Error al obtener ediciones' });
  }
});

// ── GET /api/admin/edit-preview/:editId ───────────────────────────────
// FIX: Added requireAuth before requireMod
router.get('/edit-preview/:editId', requireAuth, requireMod, async (req, res) => {
  try {
    const editId = sanitizeInt(req.params.editId, 1, 999999999);
    if (!editId) return res.status(400).json({ error: 'ID inválido' });

    const [rows] = await db.query(
      `SELECT ae.id, ae.title, ae.summary, ae.edit_note, ae.content_path AS edit_path,
              ae.status, ae.created_at,
              a.title AS original_title, a.summary AS original_summary,
              a.content_path AS original_path, a.slug,
              u.username AS editor_username
       FROM eu_article_edits ae
       JOIN eu_articles a ON ae.article_id = a.id
       JOIN eu_users u ON ae.editor_id = u.id
       WHERE ae.id = ?`,
      [editId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Edición no encontrada' });

    const edit = rows[0];
    let originalContent = '', proposedContent = '';

    try { originalContent = await fs.readFile(edit.original_path, 'utf8'); } catch(e) {}
    try { proposedContent = await fs.readFile(edit.edit_path, 'utf8'); }     catch(e) {}

    res.json({ ...edit, originalContent, proposedContent });
  } catch (err) {
    console.error('GET /admin/edit-preview:', err);
    res.status(500).json({ error: 'Error al cargar previsualización' });
  }
});

// ── PUT /api/admin/edits/:id/status ───────────────────────────────────
// FIX: Added requireAuth before requireMod
router.put('/edits/:id/status', requireAuth, requireMod, async (req, res) => {
  try {
    const editId = sanitizeInt(req.params.id, 1, 999999999);
    const status = sanitizeStatus(req.body.status, ['APPROVED','REJECTED']);
    const reason = sanitizeString(req.body.reason, 500);

    if (!editId) return res.status(400).json({ error: 'ID inválido' });
    if (!status) return res.status(400).json({ error: 'Estado inválido' });

    const [rows] = await db.query(
      `SELECT ae.*, a.title AS article_title, a.content_path AS original_path
       FROM eu_article_edits ae
       JOIN eu_articles a ON ae.article_id = a.id
       WHERE ae.id = ?`,
      [editId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Edición no encontrada' });
    const edit = rows[0];

    if (edit.status !== 'PENDING')
      return res.status(409).json({ error: 'Esta edición ya fue revisada' });

    await db.query(
      `UPDATE eu_article_edits SET status = ?, reviewed_by = ?, reviewed_at = NOW(),
       rejection_reason = ? WHERE id = ?`,
      [status, req.user.id, reason || null, editId]
    );

    if (status === 'APPROVED') {
      // Apply edit to the article
      const updates = {};
      if (edit.title)   updates.title   = edit.title;
      if (edit.summary) updates.summary = edit.summary;

      if (edit.content_path) {
        try {
          const proposed = await fs.readFile(edit.content_path, 'utf8');
          await fs.writeFile(edit.original_path, proposed, 'utf8');
        } catch(e) {
          console.error('Failed to copy edit content to article:', e);
        }
      }

      if (Object.keys(updates).length) {
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        await db.query(
          `UPDATE eu_articles SET ${setClauses}, version = version + 1, updated_at = NOW() WHERE id = ?`,
          [...Object.values(updates), edit.article_id]
        );
      } else {
        await db.query(
          'UPDATE eu_articles SET version = version + 1, updated_at = NOW() WHERE id = ?',
          [edit.article_id]
        );
      }
    }

    // Notify editor
    const msg = status === 'APPROVED'
      ? `Tu edición en "${edit.article_title}" fue aprobada y publicada ✓`
      : `Tu edición en "${edit.article_title}" fue rechazada. Motivo: ${reason || 'Sin especificar'}`;

    await db.query(
      'INSERT INTO eu_notifications (user_id, type, message, reference_id) VALUES (?, ?, ?, ?)',
      [edit.editor_id, status === 'APPROVED' ? 'edit_approved' : 'edit_rejected', msg, edit.article_id]
    );
    await db.query(
      'UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?',
      [edit.editor_id]
    );
    await db.query(
      'INSERT INTO eu_admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, `edit_${status.toLowerCase()}`, 'edit', editId]
    );

    res.json({ message: `Edición ${status === 'APPROVED' ? 'aprobada y aplicada' : 'rechazada'}` });
  } catch (err) {
    console.error('PUT /admin/edits/:id/status:', err);
    res.status(500).json({ error: 'Error al actualizar edición' });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────
// FIX: Added requireAuth before requireMod
router.get('/stats', requireAuth, requireMod, async (req, res) => {
  try {
    const [[art]]   = await db.query(
      `SELECT SUM(status='PENDING') AS pending, SUM(status='APPROVED') AS approved,
              SUM(status='REJECTED') AS rejected, COUNT(*) AS total FROM eu_articles`
    );
    const [[users]] = await db.query(
      `SELECT SUM(role='FREE') AS free, SUM(role='MONTHLY') AS monthly,
              SUM(role='MOD') AS mod, SUM(role='ADMIN') AS admin,
              COUNT(*) AS total FROM eu_users`
    );
    const [[pay]]   = await db.query(
      `SELECT SUM(amount) AS revenue, COUNT(*) AS payments
       FROM eu_payment_history WHERE status='approved'`
    );
    const [[edits]] = await db.query(
      `SELECT SUM(status='PENDING') AS pending, COUNT(*) AS total FROM eu_article_edits`
    );

    res.json({ articles: art, users, payments: pay, edits });
  } catch (err) {
    console.error('GET /admin/stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────
// FIX: Added requireAuth before requireAdmin
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page   = sanitizeInt(req.query.page,  1, 9999, 1);
    const limit  = sanitizeInt(req.query.limit, 1, 100,  50);
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT id, username, email, role, created_at, monthly_expires_at,
              articles_read_this_month, notification_count
       FROM eu_users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM eu_users');

    res.json({ users: rows, total, page, pageSize: limit });
  } catch (err) {
    console.error('GET /admin/users:', err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ── GET /api/admin/logs ───────────────────────────────────────────────
// FIX: Added requireAuth before requireAdmin
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page   = sanitizeInt(req.query.page,  1, 9999, 1);
    const limit  = sanitizeInt(req.query.limit, 1, 100,  50);
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
              u.username AS admin_username
       FROM eu_admin_logs al
       JOIN eu_users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /admin/logs:', err);
    res.status(500).json({ error: 'Error al obtener logs' });
  }
});

module.exports = router;
