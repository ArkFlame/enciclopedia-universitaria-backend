/**
 * [source-ref title="Título de la fuente"] - inline citation
 */
const { escapeAttr } = require('./index').utils;

let sourceRefCounter = 0;

module.exports = function sourceRef(text) {
  return text.replace(/\[source-ref\s+title="([^\"]+)"\]/gi,
    (_, title) => {
      sourceRefCounter++;
      const n = sourceRefCounter;
      const safeTitle = escapeAttr(title);
      return `<a class="eu-source-ref" data-source-title="${safeTitle}" href="#" role="link" title="Ir a la fuente: ${safeTitle}">[${n}]</a>`;
    }
  );
};

module.exports.resetCounter = () => { sourceRefCounter = 0; };
