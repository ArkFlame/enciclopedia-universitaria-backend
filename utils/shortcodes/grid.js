/**
 * [grid cols="3"]contenido[/grid]
 */
module.exports = function grid(text) {
  return text.replace(/\[grid\s+cols="(\d+)"\]([\s\S]*?)\[\/grid\]/gi,
    (_, cols, content) => {
      const n = Math.min(Math.max(parseInt(cols) || 2, 1), 6);
      return `<div class="row row-cols-1 row-cols-md-${n} g-3 eu-grid my-3">${content.trim()}</div>`;
    }
  );
};
