/**
 * [cuadro-sinoptico name="Título" main="Título Principal" main_color="#f59e0b"]
 *   Padre -> Hijo
 *   Hijo -> Nieto
 * [/cuadro-sinoptico]
 */
const { parseArrowSyntax, buildSynopticMarkup } = require('./index').utils;

module.exports = function cuadroSinoptico(text) {
  return text.replace(/\[cuadro-sinoptico(?:\s+name="([^"]*)")?(?:\s+main="([^"]*)")?(?:\s+main_color="([^"]*)")?\]([\s\S]*?)\[\/cuadro-sinoptico\]/gi,
    (_, name, mainTitle, mainColor, body) => {
      const { lines, colors } = parseArrowSyntax(body);
      if (!lines.length) return '';

      if (mainTitle && mainColor && lines.length > 0) {
        const rootNode = lines[0].split('->')[0].trim();
        colors[rootNode] = mainColor;
      }

      return buildSynopticMarkup(name || mainTitle, lines, colors);
    }
  );
};
