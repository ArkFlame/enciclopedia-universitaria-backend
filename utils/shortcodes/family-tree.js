/**
 * [family-tree name="Título"]
 *   Padre -> Hijo
 *   Hijo -> Nieto  
 * [/family-tree]
 */
const { parseArrowSyntax, buildSynopticMarkup } = require('./index').utils;

module.exports = function familyTree(text) {
  return text.replace(/\[family-tree(?:\s+name="([^"]*)")?\]([\s\S]*?)\[\/family-tree\]/gi,
    (_, name, body) => {
      const { lines, colors } = parseArrowSyntax(body);
      if (!lines.length) return '';
      return buildSynopticMarkup(name, lines, colors);
    }
  );
};
