/**
 * [ref article="slug-del-articulo"]Texto del enlace[/ref]
 */
const { escapeAttr } = require('./index').utils;

module.exports = function ref(text) {
  return text.replace(/\[ref\s+article="([^"]+)"\]([\s\S]*?)\[\/ref\]/gi,
    (_, slug, content) => {
      return `<a href="/articulo.html?slug=${escapeAttr(slug)}" class="eu-article-ref" data-article-ref="${escapeAttr(slug)}">${content.trim()} <sup>↗</sup></a>`;
    }
  );
};
