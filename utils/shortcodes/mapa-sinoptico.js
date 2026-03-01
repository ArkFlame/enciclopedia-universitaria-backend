// mapa-sinoptico.js
/**
 * [mapa-sinoptico name="Título"] Padre -> Hijo [/mapa-sinoptico]
 * Legacy aliases: [cuadro-sinoptico], [family-tree]
 */
const { parseArrowSyntax, buildSynopticMarkup } = require('./index').utils;

const processMapaSinoptico = (name, body, mainTitle, mainColor) => {
  const { lines, colors } = parseArrowSyntax(body);
  if (!lines.length) return '';
  if (mainTitle && mainColor && lines.length > 0) {
    const rootNode = lines[0].split('->')[0].trim();
    colors[rootNode] = mainColor;
  }
  return buildSynopticMarkup(name || mainTitle, lines, colors);
};

module.exports = function mapaSinoptico(text) {
  let result = text;
  result = result.replace(/\[mapa-sinoptico(?:\s+name="([^"]*)")?\]([\s\S]*?)\[\/mapa-sinoptico\]/gi,
    (_, name, body) => processMapaSinoptico(name, body));
  result = result.replace(/\[cuadro-sinoptico(?:\s+name="([^"]*)")?(?:\s+main="([^"]*)")?(?:\s+main_color="([^"]*)")?\]([\s\S]*?)\[\/cuadro-sinoptico\]/gi,
    (_, name, mainTitle, mainColor, body) => processMapaSinoptico(name, body, mainTitle, mainColor));
  result = result.replace(/\[family-tree(?:\s+name="([^"]*)")?\]([\s\S]*?)\[\/family-tree\]/gi,
    (_, name, body) => processMapaSinoptico(name, body));
  return result;
};
