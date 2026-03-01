/**
 * [mapa-sinoptico name="Título"] Padre -> Hijo [/mapa-sinoptico]
 * Legacy aliases: [cuadro-sinoptico], [family-tree]
 */
const { parseArrowSyntax, buildSynopticMarkup } = require('./index').utils;
const processMapaSinoptico = (name, body, mainTitle, mainColor, summaryAttr) => {
  const { lines, colors } = parseArrowSyntax(body);
  if (!lines.length) return '';
  if (mainTitle && mainColor && lines.length > 0) {
    const rootNode = lines[0].split('->')[0].trim();
    colors[rootNode] = mainColor;
  }
  const summaries = parseSummaryAttr(summaryAttr);
  return buildSynopticMarkup(name || mainTitle, lines, colors, summaries);
};
function parseShortcodeAttributes(raw) {
  const attrs = {};
  if (!raw) return attrs;
  const pattern = /([\w-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}
function parseSummaryAttr(value) {
  if (!value) return {};
  const map = {};
  const entries = value.split(/[\n;]+/);
  entries.forEach(entry => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const [keyPart, ...rest] = trimmed.split(':');
    if (!keyPart) return;
    const name = keyPart.trim();
    const summary = rest.join(':').trim();
    if (name && summary) {
      map[name] = summary;
    }
  });
  return map;
}
module.exports = function mapaSinoptico(text) {
  let result = text;
  result = result.replace(/\[mapa-sinoptico([^\]]*)\]([\s\S]*?)\[\/mapa-sinoptico\]/gi,
    (_, attrString, body) => {
      const attrs = parseShortcodeAttributes(attrString);
      return processMapaSinoptico(attrs.name, body, null, null, attrs.summary);
    });
  result = result.replace(/\[cuadro-sinoptico([^\]]*)\]([\s\S]*?)\[\/cuadro-sinoptico\]/gi,
    (_, attrString, body) => {
      const attrs = parseShortcodeAttributes(attrString);
      return processMapaSinoptico(attrs.name, body, attrs.main, attrs.main_color, attrs.summary);
    });
  result = result.replace(/\[family-tree([^\]]*)\]([\s\S]*?)\[\/family-tree\]/gi,
    (_, attrString, body) => {
      const attrs = parseShortcodeAttributes(attrString);
      return processMapaSinoptico(attrs.name, body, null, null, attrs.summary);
    });
  return result;
};