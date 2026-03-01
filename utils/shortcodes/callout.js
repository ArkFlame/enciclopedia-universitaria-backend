const { marked } = require('marked');

const MARKED_OPTIONS = {
  breaks: true,
  gfm: true
};

/**
 * [callout icon="🔬"]Nota científica importante[/callout]
 */
module.exports = function callout(text) {
  return text.replace(/\[callout(?:\s+icon="([^"]+)")?\]([\s\S]*?)\[\/callout\]/gi,
    (_, icon, content) => {
      const trimmedContent = String(content || '').trim();
      const renderedContent = trimmedContent
        ? marked.parse(trimmedContent, MARKED_OPTIONS).trim()
        : '';
      return `<div class="eu-callout"><span class="eu-callout-icon">${icon || '📌'}</span><div class="eu-callout-body">${renderedContent}</div></div>`;
    }
  );
};