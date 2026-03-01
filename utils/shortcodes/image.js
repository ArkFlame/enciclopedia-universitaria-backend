/**
 * [image src="ruta/img.jpg" alt="descripción" caption="Pie de foto"] (legacy)
 */
const { escapeAttr, escapeHtml } = require('./index').utils;

module.exports = function image(text) {
  return text.replace(/\[image\s+src="([^"]+)"(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?\]/gi,
    (_, src, alt, caption) => {
      const safeAlt = escapeAttr(alt || '');
      const imgTag = `<img src="${escapeAttr(src)}" alt="${safeAlt}" class="img-fluid rounded eu-article-img" loading="lazy">`;
      if (caption) {
        return `<figure class="eu-figure text-center my-3">${imgTag}<figcaption class="eu-caption text-muted mt-1">${escapeHtml(caption)}</figcaption></figure>`;
      }
      return `<div class="text-center my-3">${imgTag}</div>`;
    }
  );
};
