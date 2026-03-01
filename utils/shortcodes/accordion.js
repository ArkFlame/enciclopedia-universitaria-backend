/**
 * [accordion title="Título"]Contenido desplegable[/accordion]
 */
const { escapeHtml } = require('./index').utils;

let accIdx = 0;

module.exports = function accordion(text) {
  return text.replace(/\[accordion\s+title="([^"]+)"\]([\s\S]*?)\[\/accordion\]/gi,
    (_, title, content) => {
      const id = `eu-acc-${Date.now()}-${accIdx++}`;
      return `<div class="accordion eu-accordion my-2">
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false">${escapeHtml(title)}</button>
          </h2>
          <div id="${id}" class="accordion-collapse collapse">
            <div class="accordion-body">${content.trim()}</div>
          </div>
        </div>
      </div>`;
    }
  );
};
