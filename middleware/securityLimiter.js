/**
 * middleware/securityLimiter.js
 *
 * Layered rate limiting and abuse detection on top of the global
 * express-rate-limit in server.js.
 *
 * Layers:
 *  1. authLimiter      — tight limit on all /api/auth/* routes
 *  2. loginLimiter     — extra-tight limit on /login and /register (brute-force)
 *  3. badTokenTracker  — in-memory strike counter per IP; bans IPs that keep
 *                        sending malformed tokens (the "hola" attack pattern)
 *  4. tokenSanityCheck — fast pre-flight that detects bad tokens BEFORE they
 *                        reach any route handler and increments the strike counter
 */

const rateLimit = require('express-rate-limit');

// ── 1. Auth-wide limiter ─────────────────────────────────────────────────────
// Covers every /api/auth/* endpoint. Much tighter than the global 300/15min.
const authLimiter = rateLimit({
  windowMs:        10 * 60 * 1000, // 10 minutes
  max:             60,              // 60 auth requests per 10 min per IP
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  message:         { error: 'Demasiadas solicitudes de autenticación. Intenta en unos minutos.', code: 'AUTH_RATE_LIMIT' },
  skip:            (req) => {
    // Never rate-limit health checks
    return req.path === '/health';
  }
});

// ── 2. Login / Register limiter ──────────────────────────────────────────────
// Specifically targets credential-submission endpoints to slow brute-force.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             20,              // 20 login/register attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.ip,
  message:         { error: 'Demasiados intentos. Por favor espera 15 minutos antes de intentar de nuevo.', code: 'LOGIN_RATE_LIMIT' }
});

// ── 3. Bad-token strike tracker ──────────────────────────────────────────────
// In-memory map: ip → { count, firstSeen, bannedUntil }
// An IP that sends N malformed tokens within the window gets temporarily banned.
const BAD_TOKEN_STRIKES = new Map();
const STRIKE_LIMIT      = 10;          // strikes before temp ban
const STRIKE_WINDOW_MS  = 5 * 60 * 1000;  // 5-minute rolling window
const BAN_DURATION_MS   = 15 * 60 * 1000; // 15-minute temp ban

// Clean up old entries every 10 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of BAD_TOKEN_STRIKES) {
    if (entry.bannedUntil && now > entry.bannedUntil) {
      BAD_TOKEN_STRIKES.delete(ip);
    } else if (!entry.bannedUntil && now - entry.firstSeen > STRIKE_WINDOW_MS) {
      BAD_TOKEN_STRIKES.delete(ip);
    }
  }
}, 10 * 60 * 1000);

function recordBadToken(ip) {
  const now     = Date.now();
  const entry   = BAD_TOKEN_STRIKES.get(ip) || { count: 0, firstSeen: now, bannedUntil: null };

  // Reset window if previous window expired and they weren't banned
  if (!entry.bannedUntil && now - entry.firstSeen > STRIKE_WINDOW_MS) {
    entry.count     = 0;
    entry.firstSeen = now;
  }

  entry.count++;

  if (entry.count >= STRIKE_LIMIT) {
    entry.bannedUntil = now + BAN_DURATION_MS;
    console.warn('[SECURITY] IP temp-banned for repeated bad tokens:', JSON.stringify({
      ip, strikes: entry.count, bannedUntil: new Date(entry.bannedUntil).toISOString()
    }));
  }

  BAD_TOKEN_STRIKES.set(ip, entry);
}

function isIPBanned(ip) {
  const entry = BAD_TOKEN_STRIKES.get(ip);
  if (!entry || !entry.bannedUntil) return false;
  if (Date.now() > entry.bannedUntil) {
    BAD_TOKEN_STRIKES.delete(ip);
    return false;
  }
  return true;
}

// ── 4. tokenSanityCheck middleware ───────────────────────────────────────────
// Applied to all /api/auth/* routes BEFORE requireAuth.
// If the Authorization header contains a clearly-invalid token:
//   - Records a strike for that IP
//   - If the IP is already banned, short-circuits with 429
//   - Otherwise lets the request through (requireAuth will still reject it),
//     but the strike counter keeps accumulating

const JWT_SHAPE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;

const tokenSanityCheck = (req, res, next) => {
  const ip  = req.ip;

  // Check existing ban first
  if (isIPBanned(ip)) {
    return res.status(429).json({
      error: 'IP temporalmente bloqueada por envío repetido de tokens inválidos.',
      code:  'IP_BANNED'
    });
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next(); // no token — let requireAuth handle it

  const token = auth.slice(7);
  const isGarbage = !(
    typeof token === 'string' &&
    token.length >= 20 &&
    token.length <= 2048 &&
    JWT_SHAPE.test(token)
  );

  if (isGarbage) {
    recordBadToken(ip);
    // If they just hit the limit, return banned immediately
    if (isIPBanned(ip)) {
      return res.status(429).json({
        error: 'IP temporalmente bloqueada por envío repetido de tokens inválidos.',
        code:  'IP_BANNED'
      });
    }
    // Otherwise still reject this request fast (no need to go further)
    return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
  }

  next();
};

module.exports = { authLimiter, loginLimiter, tokenSanityCheck, recordBadToken, isIPBanned };
