const crypto = require('crypto');

/**
 * Generates a cryptographically secure random token.
 * @returns {string} 64-character hex string (256 bits of entropy)
 */
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Returns a Date object 24 hours from now.
 * @returns {Date}
 */
function getTokenExpiry() {
  const expires = new Date();
  expires.setHours(expires.getHours() + 24);
  return expires;
}

module.exports = { generateVerificationToken, getTokenExpiry };
