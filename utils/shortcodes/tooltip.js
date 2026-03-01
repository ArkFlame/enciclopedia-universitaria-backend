/**
 * [tooltip text="Descripción"]Término[/tooltip]
 */
const { escapeAttr } = require('./index').utils;

module.exports = function tooltip(text) {
  return text.replace(/\[tooltip\s+text="([^"]+)"\]([\s\S]*?)\[\/tooltip\]/gi,
    (_, tip, content) => {
      return `<span class="eu-tooltip" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeAttr(tip)}" style="border-bottom:1px dashed #666;cursor:help">${content.trim()}</span>`;
    }
  );
};
