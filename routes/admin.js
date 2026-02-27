const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const db = require('../config/db');
const { requireAuth, requireMod, requireAdmin } = require('../middleware/auth');
const { processArticleContent } = require('../utils/shortcodeParser');

// Middleware: todos los endpoints admin requieren auth
router.use(requireAuth);

// ─── ARTÍCULOS ────────────────────────────────────────────────────

// GET /api/admin/articles - Listar con filtros de estado
router.get('/articles', requireMod, async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, limit = 30 } = req.query;
    const offset = (Math.max(parseInt(page), 1) - 1) * 30;
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
    const st = validStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : 'PENDING';

    const where = st === 'ALL' ? '' : 'WHERE a.status = ?';
    const params = st === 'ALL' ? [] : [st];

    const [rows] = await db.query(
      `SELECT a.id, a.slug, a.title, a.summary, a.status, a.category, a.created_at, a.updated_at,
              a.rejection_reason, a.reviewed_at,
              u.username AS author_username, u.email AS author_email, u.role AS author_role,
              ru.username AS reviewer_username
       FROM eu_articles a
       JOIN eu_users u ON a.author_id = u.id
       LEFT JOIN eu_users ru ON a.reviewed_by = ru.id
       ${where}
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, 30, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM eu_articles a ${where}`,
      params
    );

    res.json({ articles: rows, total, page: parseInt(page) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

// PUT /api/admin/articles/:id/status - Aprobar / Rechazar artículo
router.put('/articles/:id/status', requireMod, async (req, res) => {
  try {
    const { status, reason } = req.body;
    const validStatuses = ['APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status))
      return res.status(400).json({ error: 'Estado inválido' });

    const [rows] = await db.query('SELECT * FROM eu_articles WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Artículo no encontrado' });

    const article = rows[0];

    await db.query(
      `UPDATE eu_articles SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?`,
      [status, req.user.id, reason || null, req.params.id]
    );

    // Notificar al autor
    const notifType = status === 'APPROVED' ? 'article_approved' : 'article_rejected';
    const msg = status === 'APPROVED'
      ? `Tu artículo "${article.title}" fue aprobado ✓`
      : `Tu artículo "${article.title}" fue rechazado. Motivo: ${reason || 'Sin especificar'}`;

    await db.query(
      'INSERT INTO eu_notifications (user_id, type, message, reference_id) VALUES (?, ?, ?, ?)',
      [article.author_id, notifType, msg, article.id]
    );
    await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?', [article.author_id]);

    // Log de admin
    await db.query(
      'INSERT INTO eu_admin_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, `article_${status.toLowerCase()}`, 'article', req.params.id, JSON.stringify({ reason })]
    );

    res.json({ message: `Artículo ${status === 'APPROVED' ? 'aprobado' : 'rechazado'} exitosamente` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// ─── EDICIONES ────────────────────────────────────────────────────

// GET /api/admin/edits - Listar ediciones pendientes
router.get('/edits', requireMod, async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query;
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
       WHERE ae.status = ?
       ORDER BY ae.created_at DESC LIMIT 50`,
      [status]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ediciones' });
  }
});

// PUT /api/admin/edits/:id/status - Aprobar / Rechazar edición
router.put('/edits/:id/status', requireMod, async (req, res) => {
  try {
    const { status, reason } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status))
      return res.status(400).json({ error: 'Estado inválido' });

    const [rows] = await db.query(
      `SELECT ae.*, a.title AS article_title, a.content_path AS original_path
       FROM eu_article_edits ae JOIN eu_articles a ON ae.article_id = a.id WHERE ae.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Edición no encontrada' });
    const edit = rows[0];

    await db.query(
      'UPDATE eu_article_edits SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?',
      [status, req.user.id, reason || null, req.params.id]
    );

    if (status === 'APPROVED') {
      // Aplicar cambios al artículo original
      const updates = {};
      if (edit.title) updates.title = edit.title;
      if (edit.summary) updates.summary = edit.summary;

      if (edit.content_path) {
        // Copiar contenido de la edición al archivo original del artículo
        const editContent = await fs.readFile(edit.content_path, 'utf8');
        await fs.writeFile(edit.original_path, editContent, 'utf8');
      }

      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      if (setClause) {
        await db.query(
          `UPDATE eu_articles SET ${setClause}, version = version + 1, updated_at = NOW() WHERE id = ?`,
          [...Object.values(updates), edit.article_id]
        );
      } else {
        await db.query('UPDATE eu_articles SET version = version + 1, updated_at = NOW() WHERE id = ?', [edit.article_id]);
      }
    }

    // Notificar al editor
    const msg = status === 'APPROVED'
      ? `Tu edición en "${edit.article_title}" fue aprobada ✓`
      : `Tu edición en "${edit.article_title}" fue rechazada. Motivo: ${reason || 'Sin especificar'}`;

    await db.query(
      'INSERT INTO eu_notifications (user_id, type, message, reference_id) VALUES (?, ?, ?, ?)',
      [edit.editor_id, status === 'APPROVED' ? 'edit_approved' : 'edit_rejected', msg, edit.article_id]
    );
    await db.query('UPDATE eu_users SET notification_count = notification_count + 1 WHERE id = ?', [edit.editor_id]);

    await db.query(
      'INSERT INTO eu_admin_logs (admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?)',
      [req.user.id, `edit_${status.toLowerCase()}`, 'edit', req.params.id]
    );

    res.json({ message: `Edición ${status === 'APPROVED' ? 'aprobada' : 'rechazada'}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar edición' });
  }
});

// ─── USUARIOS ─────────────────────────────────────────────────────

// GET /api/admin/users - Listar usuarios
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { query, role, page = 1 } = req.query;
    const offset = (Math.max(parseInt(page), 1) - 1) * 30;
    let conditions = [];
    let params = [];

    if (query) {
      conditions.push('(username LIKE ? OR email LIKE ?)');
      params.push(`%${query}%`, `%${query}%`);
    }
    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await db.query(
      `SELECT id, username, email, role, created_at, paid_at, monthly_expires_at, role_assigned_at,
              articles_read_this_month
       FROM eu_users ${where} ORDER BY created_at DESC LIMIT 30 OFFSET ?`,
      [...params, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM eu_users ${where}`, params);
    res.json({ users: rows, total });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// GET /api/admin/stats - Estadísticas del panel
router.get('/stats', requireMod, async (req, res) => {
  try {
    const [[artStats]] = await db.query(
      `SELECT
        SUM(status = 'PENDING') AS pending,
        SUM(status = 'APPROVED') AS approved,
        SUM(status = 'REJECTED') AS rejected,
        COUNT(*) AS total
       FROM eu_articles`
    );
    const [[editStats]] = await db.query(
      `SELECT SUM(status = 'PENDING') AS pending, COUNT(*) AS total FROM eu_article_edits`
    );
    const [[userStats]] = await db.query(
      `SELECT
        SUM(role = 'FREE') AS free_users,
        SUM(role = 'MONTHLY') AS monthly_users,
        SUM(role = 'MOD') AS mod_users,
        SUM(role = 'ADMIN') AS admin_users,
        COUNT(*) AS total
       FROM eu_users`
    );
    const [[payStats]] = await db.query(
      `SELECT SUM(amount) AS total_revenue, COUNT(*) AS total_payments
       FROM eu_payment_history WHERE status = 'approved'`
    );

    res.json({
      articles: artStats,
      edits: editStats,
      users: userStats,
      payments: payStats
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// GET /api/admin/logs - Logs de administración
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT al.*, u.username AS admin_username
       FROM eu_admin_logs al JOIN eu_users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener logs' });
  }
});

// GET /api/admin/edit-preview/:editId - Preview de una edición
router.get('/edit-preview/:editId', requireMod, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT content_path FROM eu_article_edits WHERE id = ?', [req.params.editId]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });

    const content = await fs.readFile(rows[0].content_path, 'utf8');
    const html = await processArticleContent(content);
    res.json({ html, markdown: content });
  } catch (err) {
    res.status(500).json({ error: 'Error al generar preview' });
  }
});

module.exports = router;
