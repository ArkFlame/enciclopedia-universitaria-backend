/**
 * requireVerified middleware
 * 
 * Must be used AFTER requireAuth.
 * Returns 403 if the authenticated user has not verified their email.
 */
function requireVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Autenticación requerida', code: 'NO_USER' });
  }

  // MOD and ADMIN are always considered verified (pre-verified via migration)
  if (req.user.role === 'MOD' || req.user.role === 'ADMIN') {
    return next();
  }

  if (!req.user.email_verified) {
    return res.status(403).json({
      error: 'Debes verificar tu correo electrónico para realizar esta acción.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
}

module.exports = { requireVerified };
