const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// ── JWT format pre-check ────────────────────────────────────────────────────
// A valid JWT is exactly 3 base64url segments separated by dots.
// Catches garbage like "hola", "null", "undefined" before jwt.verify() or any DB query.
const JWT_SHAPE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

function looksLikeJWT(token) {
  return typeof token === 'string' &&
         token.length >= 20 &&    // real JWTs are always longer
         token.length <= 2048 &&  // hard cap — no legitimate token is 2 KB
         JWT_SHAPE.test(token);
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Structured log for anomalies ────────────────────────────────────────────
// Replaces the [AUTH DEBUG] console.log spam.
// Only logs warn/error events (bad tokens, role violations). Successful
// authenticated requests log nothing so normal traffic stays quiet.
function secLog(level, msg, meta = {}) {
  if (process.env.NODE_ENV === 'test') return;
  if (level === 'warn' || level === 'error') {
    console.warn('[AUTH]', JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
  }
}

// ── optionalAuth ─────────────────────────────────────────────────────────────
const optionalAuth = async (req, res, next) => {
  const raw = extractToken(req);
  if (!raw) return next();
  if (!looksLikeJWT(raw)) return next(); // silently drop garbage
  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, articles_read_reset_at,
              notification_count, email_verified
       FROM eu_users WHERE id = ?`,
      [decoded.id]
    );
    if (rows.length) req.user = rows[0];
  } catch (_) { /* invalid token in optional context — ignore */ }
  next();
};

// ── requireAuth ───────────────────────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  const raw = extractToken(req);

  if (!raw) {
    return res.status(401).json({ error: 'Autenticación requerida', code: 'NO_TOKEN' });
  }

  // Fast-path: reject clearly-invalid tokens without hitting jwt.verify or the DB
  if (!looksLikeJWT(raw)) {
    secLog('warn', 'Malformed token rejected', { ip: req.ip, path: req.path,
      ua: (req.get('user-agent') || '').slice(0, 120) });
    return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
  }

  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);

    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, articles_read_reset_at,
              notification_count, email_verified
       FROM eu_users WHERE id = ?`,
      [decoded.id]
    );

    if (!rows.length) {
      secLog('warn', 'Valid JWT but user deleted from DB', { userId: decoded.id, ip: req.ip });
      return res.status(401).json({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
    }

    req.user = rows[0];
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED', expiredAt: err.expiredAt });
    }
    secLog('warn', 'JWT verification failed', { ip: req.ip, error: err.name, path: req.path });
    return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
  }
};

// ── requireRole factory ───────────────────────────────────────────────────────
const requireRole = (...roles) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticación requerida', code: 'NO_USER' });
  }
  if (!roles.includes(req.user.role)) {
    secLog('warn', 'Insufficient role', {
      user: req.user.username, role: req.user.role, required: roles, path: req.path
    });
    return res.status(403).json({
      error: 'Acceso denegado. Permisos insuficientes.',
      code: 'INSUFFICIENT_ROLE',
      yourRole: req.user.role,
      requiredRoles: roles
    });
  }
  next();
};

const requireMod   = requireRole('MOD', 'ADMIN');
const requireAdmin = requireRole('ADMIN');

module.exports = { optionalAuth, requireAuth, requireRole, requireMod, requireAdmin };
