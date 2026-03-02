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
              articles_read_this_month, articles_read_reset_at, notification_count, email_verified
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

  // DEBUG LOGGING
  console.log(`[AUTH DEBUG] ${req.method} ${req.path} - Token present: ${!!token}`);
  if (token) {
    console.log(`[AUTH DEBUG] Token preview: ${token.substring(0, 20)}...`);
  }

  if (!token) {
    console.log(`[AUTH DEBUG] REJECTED: No token provided`);
    return res.status(401).json({ error: 'Autenticación requerida', code: 'NO_TOKEN' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`[AUTH DEBUG] Token decoded: userId=${decoded.id}, role=${decoded.role}`);

    const [rows] = await db.query(
      `SELECT id, username, email, role, monthly_expires_at,
              articles_read_this_month, articles_read_reset_at, notification_count, email_verified
       FROM eu_users WHERE id = ?`,
      [decoded.id]
    );

    if (!rows.length) {
      console.log(`[AUTH DEBUG] REJECTED: User ${decoded.id} not found in DB`);
      return res.status(401).json({ error: 'Usuario no encontrado', code: 'USER_NOT_FOUND' });
    }

    req.user = rows[0];
    console.log(`[AUTH DEBUG] AUTHENTICATED: ${req.user.username} (${req.user.role})`);
    next();
  } catch (err) {
    console.log(`[AUTH DEBUG] REJECTED: Token invalid - ${err.name}: ${err.message}`);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED',
        expiredAt: err.expiredAt
      });
    }
    return res.status(401).json({ error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
  }
};

// Fábrica de middleware por rol
// Uso: requireRole('MOD', 'ADMIN')  → devuelve una función middleware
const requireRole = (...roles) => async (req, res, next) => {
  console.log(`[AUTH DEBUG] Role check: required=[${roles.join(',')}], user=${req.user?.username}, role=${req.user?.role}`);

  if (!req.user) {
    console.log(`[AUTH DEBUG] REJECTED: No user in request (auth middleware not run or failed)`);
    return res.status(401).json({ error: 'Autenticación requerida', code: 'NO_USER' });
  }

  if (!roles.includes(req.user.role)) {
    console.log(`[AUTH DEBUG] REJECTED: Role ${req.user.role} not in [${roles.join(',')}]`);
    return res.status(403).json({
      error: 'Acceso denegado. Permisos insuficientes.',
      code: 'INSUFFICIENT_ROLE',
      yourRole: req.user.role,
      requiredRoles: roles
    });
  }

  console.log(`[AUTH DEBUG] AUTHORIZED: ${req.user.username} has role ${req.user.role}`);
  next();
};

// Atajos pre-construidos (son funciones middleware, NO llamadas de función)
const requireMod   = requireRole('MOD', 'ADMIN');
const requireAdmin = requireRole('ADMIN');

module.exports = { optionalAuth, requireAuth, requireRole, requireMod, requireAdmin };
