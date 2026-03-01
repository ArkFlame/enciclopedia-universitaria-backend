/**
 * [mapa-sinoptico name="Título"]
 *   Padre -> Hijo
 *   Hijo -> Nieto
 * [/mapa-sinoptico]
 */
const { parseArrowSyntax, buildSynopticMarkup } = require('./index').utils;

module.exports = function mapaSinoptico(text) {
  return text.replace(/\[mapa-sinoptico(?:\s+name="([^"]*)")?\]([\s\S]*?)\[\/mapa-sinoptico\]/gi,
    (_, name, body) => {
      const { lines, colors } = parseArrowSyntax(body);
      if (!lines.length) return '';
      return buildSynopticMarkup(name, lines, colors);
    }
  );
};
