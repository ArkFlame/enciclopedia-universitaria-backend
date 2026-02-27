const jwt = require('jsonwebtoken');
const db  = require('../config/db');

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// Middleware: JWT opcional — no falla si no hay token
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, articles_read_reset_at, notification_count
       FROM eu_users WHERE id = ?`,
      [decoded.id]
    );
    if (rows.length) req.user = rows[0];
  } catch (_) { /* token inválido — ignorar silenciosamente */ }
  next();
};

// Middleware: JWT obligatorio
const requireAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Autenticación requerida' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, articles_read_reset_at, notification_count
       FROM eu_users WHERE id = ?`,
      [decoded.id]
    );
    if (!rows.length) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Fábrica de middleware por rol
// Uso: requireRole('MOD', 'ADMIN')  → devuelve una función middleware
const requireRole = (...roles) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
  }
  next();
};

// Atajos pre-construidos (son funciones middleware, NO llamadas de función)
const requireMod   = requireRole('MOD', 'ADMIN');
const requireAdmin = requireRole('ADMIN');

module.exports = { optionalAuth, requireAuth, requireRole, requireMod, requireAdmin };
