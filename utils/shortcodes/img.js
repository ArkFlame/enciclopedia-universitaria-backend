/**
 * [img file="hero.jpg" alt="Descripción" caption="Pie de foto" width="800"]
 */
const { escapeAttr, escapeHtml } = require('./index').utils;

module.exports = function img(text) {
  return text.replace(/\[img\s+file="([^"]+)"(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?(?:\s+width="(\d+)")?\]/gi,
    (_, file, alt, caption, width) => {
      const safeAlt = escapeAttr(alt || '');
      const style = width ? `style="max-width:${escapeAttr(width)}px"` : '';
      const imgTag = `<img src="${escapeAttr(file)}" alt="${safeAlt}" class="img-fluid rounded eu-article-img" loading="lazy" ${style}>`;
      if (caption) {
        return `<figure class="eu-figure text-center my-3">${imgTag}<figcaption class="eu-caption text-muted mt-1">${escapeHtml(caption)}</figcaption></figure>`;
      }
      return `<div class="text-center my-3">${imgTag}</div>`;
    }
  );
};
