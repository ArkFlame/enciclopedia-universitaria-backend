const BULLET_CHAR_CLASS = '[·•∙◦‣⚫▪▫●]';
const INVISIBLE_WHITESPACE = '\u00A0\u200B\u200C\u200D\uFEFF';
const BOLD_OPEN_PATTERN = new RegExp(`\\*\\*[${INVISIBLE_WHITESPACE}]+`, 'g');
const BOLD_CLOSE_PATTERN = new RegExp(`[${INVISIBLE_WHITESPACE}]+\\*\\*`, 'g');
const ITALIC_OPEN_PATTERN = new RegExp(`\\*[${INVISIBLE_WHITESPACE}]+`, 'g');
const ITALIC_CLOSE_PATTERN = new RegExp(`[${INVISIBLE_WHITESPACE}]+\\*`, 'g');
const BULLET_PATTERN = new RegExp(`^[ \\t]*${BULLET_CHAR_CLASS}+[ \\t]*`, 'gm');

function convertBullets(markdown) {
  return markdown.replace(BULLET_PATTERN, '- ');
}

function stripInvisibleWhitespace(markdown) {
  let normalized = markdown;
  normalized = normalized.replace(BOLD_OPEN_PATTERN, '**');
  normalized = normalized.replace(BOLD_CLOSE_PATTERN, '**');
  normalized = normalized.replace(ITALIC_OPEN_PATTERN, '*');
  normalized = normalized.replace(ITALIC_CLOSE_PATTERN, '*');
  return normalized;
}

function normalizeMarkdown(markdown) {
  if (typeof markdown !== 'string') {
    return markdown;
  }
  const bulletNormalized = convertBullets(markdown);
  const whitespaceCleaned = stripInvisibleWhitespace(bulletNormalized);
  return whitespaceCleaned;
}

module.exports = {
  normalizeMarkdown
};