/**
 * [callout icon="🔬"]Nota científica importante[/callout]
 */
module.exports = function callout(text) {
  return text.replace(/\[callout(?:\s+icon="([^"]+)")?\]([\s\S]*?)\[\/callout\]/gi,
    (_, icon, content) => {
      return `<div class="eu-callout"><span class="eu-callout-icon">${icon || '📌'}</span><div class="eu-callout-body">${content.trim()}</div></div>`;
    }
  );
};
