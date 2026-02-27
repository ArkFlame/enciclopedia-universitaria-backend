const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeString, sanitizeInt } = require('../utils/sanitize');

// GET /api/profile/my-articles
router.get('/my-articles', requireAuth, async (req, res) => {
  try {
    const page     = sanitizeInt(req.query.page,  1, 9999, 1);
    const pageSize = sanitizeInt(req.query.limit, 1, 100,  50);
    const offset   = (page - 1) * pageSize;

    const [articles] = await db.query(
      `SELECT id, slug, title, summary, status, category, views, rejection_reason,
              created_at, updated_at
       FROM eu_articles
       WHERE author_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, pageSize, offset]
    );

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM eu_articles WHERE author_id = ?',
      [req.user.id]
    );

    res.json({ articles, total, page, pageSize });
  } catch (err) {
    console.error('GET /api/profile/my-articles:', err);
    res.status(500).json({ error: 'Error al obtener artículos' });
  }
});

// GET /api/profile/my-edits
router.get('/my-edits', requireAuth, async (req, res) => {
  try {
    const [edits] = await db.query(
      `SELECT ae.id, ae.article_id, ae.status, ae.edit_note, ae.rejection_reason,
              ae.created_at, ae.reviewed_at,
              a.title AS article_title, a.slug AS article_slug
       FROM eu_article_edits ae
       JOIN eu_articles a ON ae.article_id = a.id
       WHERE ae.editor_id = ?
       ORDER BY ae.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(edits);
  } catch (err) {
    console.error('GET /api/profile/my-edits:', err);
    res.status(500).json({ error: 'Error al obtener ediciones' });
  }
});

// POST /api/auth/change-password  (mounted via profile router on /api/profile)
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword || '';
    const newPassword     = sanitizeString(req.body.newPassword, 200);

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    if (newPassword.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

    // Fetch current hash
    const [rows] = await db.query(
      'SELECT password_hash FROM eu_users WHERE id = ?', [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

    const hash = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE eu_users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('POST /api/profile/change-password:', err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

module.exports = router;
