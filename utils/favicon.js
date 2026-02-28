/**
 * FAVICON UTILITY - Enciclopedia Universitaria
 * Fetches favicons from URLs using Google's favicon service
 */

const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons';
const DEFAULT_SIZE = 32;

/**
 * Extract domain from URL and fetch favicon
 * @param {string} url - The URL to get favicon for
 * @param {number} size - Favicon size (default 32)
 * @returns {string} - Favicon URL
 */
function getFaviconUrl(url, size = DEFAULT_SIZE) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, '');
    return `${GOOGLE_FAVICON_API}?domain=${encodeURIComponent(domain)}&sz=${size}`;
  } catch (e) {
    return `${GOOGLE_FAVICON_API}?domain=example.com&sz=${size}`;
  }
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL
 */
function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Extract domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} - Domain name
 */
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

module.exports = {
  getFaviconUrl,
  isValidUrl,
  getDomain,
  GOOGLE_FAVICON_API,
  DEFAULT_SIZE
};
