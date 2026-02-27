const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });

    if (username.length < 3 || username.length > 50)
      return res.status(400).json({ error: 'El nombre de usuario debe tener entre 3 y 50 caracteres' });

    if (!/^[a-zA-Z0-9_\-\.]+$/.test(username))
      return res.status(400).json({ error: 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos' });

    if (password.length < 6)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    // Verificar duplicados
    const [existing] = await db.query(
      'SELECT id FROM eu_users WHERE email = ? OR username = ?', [email, username]
    );
    if (existing.length)
      return res.status(409).json({ error: 'El email o nombre de usuario ya está registrado' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO eu_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email.toLowerCase(), hash, 'FREE']
    );

    const token = jwt.sign({ id: result.insertId, role: 'FREE' }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.status(201).json({
      message: 'Cuenta creada exitosamente',
      token,
      user: { id: result.insertId, username, email: email.toLowerCase(), role: 'FREE' }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });

    const [rows] = await db.query(
      'SELECT id, username, email, password_hash, role, monthly_expires_at, articles_read_this_month, notification_count FROM eu_users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (!rows.length)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Verificar si MONTHLY expiró
    if (user.role === 'MONTHLY' && user.monthly_expires_at && new Date(user.monthly_expires_at) < new Date()) {
      await db.query('UPDATE eu_users SET role = ? WHERE id = ?', ['FREE', user.id]);
      user.role = 'FREE';
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        articlesReadThisMonth: user.articles_read_this_month,
        notificationCount: user.notification_count,
        freeLimit: parseInt(process.env.FREE_ARTICLES_PER_MONTH) || 30
      }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    articlesReadThisMonth: u.articles_read_this_month,
    notificationCount: u.notification_count,
    freeLimit: parseInt(process.env.FREE_ARTICLES_PER_MONTH) || 30
  });
});

// GET /api/auth/notifications
router.get('/notifications', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, type, message, reference_id, read_at, created_at 
     FROM eu_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
    [req.user.id]
  );
  res.json(rows);
});

// PUT /api/auth/notifications/read
router.put('/notifications/read', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE eu_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [req.user.id]
  );
  await db.query('UPDATE eu_users SET notification_count = 0 WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
});


// POST /api/auth/refresh
// Re-emite un JWT fresco con el rol actual de la DB.
// Útil después de que un admin cambia el rol via CLI sin que el usuario
// tenga que hacer logout/login manualmente.
router.post('/refresh', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, notification_count
       FROM eu_users WHERE id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });
    const u = rows[0];

    const token = jwt.sign(
      { id: u.id, role: u.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        articlesReadThisMonth: u.articles_read_this_month,
        notificationCount: u.notification_count,
        freeLimit: parseInt(process.env.FREE_ARTICLES_PER_MONTH) || 30
      }
    });
  } catch (err) {
    console.error('Error en refresh:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
