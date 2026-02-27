/**
 * sanitize.js - Input sanitization for all API routes
 * Prevents FULLTEXT injection, SQL edge cases, XSS in stored content
 */

/**
 * Sanitize a FULLTEXT BOOLEAN MODE search query.
 * MySQL BOOLEAN MODE special chars: + - > < ( ) ~ * " @
 * We strip all of them except * (wildcard at end only) and " (phrase search)
 * to prevent parse errors like the one with "asd}+*"
 */
function sanitizeSearchQuery(raw) {
  if (!raw || typeof raw !== 'string') return '';
  
  // Trim and limit length
  let q = raw.trim().slice(0, 200);
  
  // Remove characters that cause MySQL FULLTEXT parse errors
  // Keep alphanumeric, spaces, accented chars, hyphens within words
  // Strip: + - > < ( ) ~ * { } [ ] \ / ^ $ | ? @ # % & = ! ; :
  q = q.replace(/[+\-><()~*"@#$%^&=!;:{}\[\]\\\/|?]/g, ' ');
  
  // Collapse multiple spaces
  q = q.replace(/\s+/g, ' ').trim();
  
  // Split into words and append * for prefix matching (safe wildcard)
  if (!q) return '';
  const words = q.split(' ').filter(w => w.length >= 2);
  if (!words.length) return '';
  
  return words.map(w => `+${w}*`).join(' ');
}

/**
 * Sanitize a plain string input (title, username, category, etc.)
 * Removes null bytes and control characters, limits length.
 */
function sanitizeString(raw, maxLen = 500) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\0/g, '')           // null bytes
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // control chars except \t \n \r
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitize integer input (page, limit, id)
 */
function sanitizeInt(raw, min = 1, max = 9999, fallback = 1) {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Sanitize a slug - only lowercase alphanumeric and hyphens
 */
function sanitizeSlug(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 200);
}

/**
 * Sanitize a role value
 */
function sanitizeRole(raw) {
  const valid = ['FREE', 'MONTHLY', 'MOD', 'ADMIN'];
  const upper = (raw || '').toUpperCase().trim();
  return valid.includes(upper) ? upper : null;
}

/**
 * Sanitize a status value for articles/edits
 */
function sanitizeStatus(raw, allowed = ['PENDING', 'APPROVED', 'REJECTED', 'ALL']) {
  const upper = (raw || '').toUpperCase().trim();
  return allowed.includes(upper) ? upper : null;
}

/**
 * Sanitize markdown content - only removes null bytes and extremely long content.
 * Do NOT strip HTML/Markdown chars here - that's the shortcode parser's job.
 */
function sanitizeContent(raw, maxLen = 200000) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\0/g, '').slice(0, maxLen);
}

/**
 * Sanitize email
 */
function sanitizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().slice(0, 255);
}

module.exports = {
  sanitizeSearchQuery,
  sanitizeString,
  sanitizeInt,
  sanitizeSlug,
  sanitizeRole,
  sanitizeStatus,
  sanitizeContent,
  sanitizeEmail
};
