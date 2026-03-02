const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { sanitizeString, sanitizeEmail } = require('../utils/sanitize');
const { generateVerificationToken, getTokenExpiry } = require('../utils/token');
const { sendVerificationEmail } = require('../email/sendVerificationEmail');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const username = sanitizeString(req.body.username, 50);
    const email    = sanitizeEmail(req.body.email);
    const password = req.body.password || '';

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
    const verificationToken = generateVerificationToken();
    const verificationExpiry = getTokenExpiry();

    const [result] = await db.query(
      `INSERT INTO eu_users
         (username, email, password_hash, role, email_verified, verification_token, verification_expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [username, email.toLowerCase(), hash, 'FREE', verificationToken, verificationExpiry]
    );

    // Send verification email (non-blocking — don't fail registration if email fails)
    try {
      await sendVerificationEmail(email.toLowerCase(), username, verificationToken);
    } catch (emailErr) {
      console.error('Error enviando email de verificación:', emailErr);
    }

    const token = jwt.sign({ id: result.insertId, role: 'FREE' }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    res.status(201).json({
      message: 'Cuenta creada exitosamente. Revisa tu correo para verificar tu cuenta.',
      token,
      user: {
        id: result.insertId,
        username,
        email: email.toLowerCase(),
        role: 'FREE',
        emailVerified: false
      }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email    = sanitizeEmail(req.body.email);
    const password = req.body.password || '';
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });

    const [rows] = await db.query(
      'SELECT id, username, email, password_hash, role, monthly_expires_at, articles_read_this_month, notification_count, email_verified FROM eu_users WHERE email = ?',
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
        emailVerified: !!user.email_verified,
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
    emailVerified: !!u.email_verified,
    articlesReadThisMonth: u.articles_read_this_month,
    notificationCount: u.notification_count,
    freeLimit: parseInt(process.env.FREE_ARTICLES_PER_MONTH) || 30
  });
});

// GET /api/auth/notifications
router.get('/notifications', requireAuth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, type, message, reference_id, article_slug, notification_url, read_at, created_at
     FROM eu_notifications
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`,
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

// PUT /api/auth/notifications/:id/read
router.put('/notifications/:id/read', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  await db.query(
    'UPDATE eu_notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
    [id, req.user.id]
  );

  const [[{ count }]] = await db.query(
    'SELECT COUNT(*) AS count FROM eu_notifications WHERE user_id = ? AND read_at IS NULL',
    [req.user.id]
  );
  await db.query('UPDATE eu_users SET notification_count = ? WHERE id = ?', [count, req.user.id]);

  res.json({ ok: true, unread: count });
});

// DELETE /api/auth/notifications
router.delete('/notifications', requireAuth, async (req, res) => {
  await db.query('DELETE FROM eu_notifications WHERE user_id = ?', [req.user.id]);
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

// GET /api/auth/verify-email?token=xxx
// Verifies the user's email address using the token sent by email.
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string' || token.length !== 64) {
      return res.status(400).json({ error: 'Token inválido o malformado', code: 'INVALID_TOKEN' });
    }

    const [rows] = await db.query(
      'SELECT id, username, email_verified, verification_expires_at FROM eu_users WHERE verification_token = ?',
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'El token no existe o ya fue usado', code: 'TOKEN_NOT_FOUND' });
    }

    const user = rows[0];

    if (user.email_verified) {
      return res.json({ message: 'Tu cuenta ya estaba verificada.', alreadyVerified: true });
    }

    if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
      return res.status(400).json({
        error: 'El token ha expirado. Solicita un nuevo enlace de verificación.',
        code: 'TOKEN_EXPIRED'
      });
    }

    await db.query(
      'UPDATE eu_users SET email_verified = 1, verification_token = NULL, verification_expires_at = NULL WHERE id = ?',
      [user.id]
    );

    res.json({ message: '¡Cuenta verificada exitosamente! Ya puedes publicar y editar artículos.' });
  } catch (err) {
    console.error('Error en verify-email:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// POST /api/auth/resend-verification
// Resends the verification email. Requires authentication.
// Rate-limited: max 1 resend per 5 minutes.
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.user.email_verified) {
      return res.status(400).json({ error: 'Tu cuenta ya está verificada', code: 'ALREADY_VERIFIED' });
    }

    // Simple cooldown: check if a token was already issued recently (< 5 min ago)
    const [rows] = await db.query(
      'SELECT verification_expires_at FROM eu_users WHERE id = ?',
      [userId]
    );

    if (rows.length && rows[0].verification_expires_at) {
      const expiresAt = new Date(rows[0].verification_expires_at);
      const issuedAt  = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
      const cooldownUntil = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      if (new Date() < cooldownUntil) {
        const waitSeconds = Math.ceil((cooldownUntil - new Date()) / 1000);
        return res.status(429).json({
          error: `Espera ${waitSeconds} segundos antes de solicitar otro correo.`,
          code: 'RESEND_COOLDOWN',
          waitSeconds
        });
      }
    }

    const newToken  = generateVerificationToken();
    const newExpiry = getTokenExpiry();

    await db.query(
      'UPDATE eu_users SET verification_token = ?, verification_expires_at = ? WHERE id = ?',
      [newToken, newExpiry, userId]
    );

    try {
      await sendVerificationEmail(req.user.email, req.user.username, newToken);
    } catch (emailErr) {
      console.error('Error reenviando email de verificación:', emailErr);
      return res.status(500).json({ error: 'No se pudo enviar el correo. Intenta más tarde.' });
    }

    res.json({ message: 'Correo de verificación reenviado. Revisa tu bandeja de entrada.' });
  } catch (err) {
    console.error('Error en resend-verification:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


module.exports = router;
