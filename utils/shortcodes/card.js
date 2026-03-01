/**
 * [card title="Título" image="ruta/imagen.jpg"]Contenido[/card]
 */
const { escapeHtml, escapeAttr } = require('./index').utils;

module.exports = function card(text) {
  return text.replace(/\[card\s+title="([^"]+)"(?:\s+image="([^"]*)")?\]([\s\S]*?)\[\/card\]/gi,
    (_, title, image, content) => {
      const imgHtml = image ? `<img src="${escapeAttr(image)}" class="card-img-top" alt="${escapeAttr(title)}" loading="lazy">` : '';
      return `<div class="card eu-card my-2 shadow-sm">
        ${imgHtml}
        <div class="card-body">
          <h5 class="card-title">${escapeHtml(title)}</h5>
          <div class="card-text">${content.trim()}</div>
        </div>
      </div>`;
    }
  );
};
