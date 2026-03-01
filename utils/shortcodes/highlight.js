/**
 * [highlight color="yellow"]texto destacado[/highlight]
 */
const { escapeAttr } = require('./index').utils;

module.exports = function highlight(text) {
  return text.replace(/\[highlight(?:\s+color="([^"]+)")?\]([\s\S]*?)\[\/highlight\]/gi,
    (_, color, content) => {
      const bg = color || '#fef08a';
      return `<mark style="background-color:${escapeAttr(bg)};padding:0 3px;border-radius:3px">${content.trim()}</mark>`;
    }
  );
};
