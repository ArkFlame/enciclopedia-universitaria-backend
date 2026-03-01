/**
 * [modal id="..." title="..."]...[/modal]
 */
const { escapeHtml } = require('./index').utils;

module.exports = function modal(text) {
  return text.replace(/\[modal\s+id="([^\"]+)"\s+title="([^\"]+)"\]([\s\S]*?)\[\/modal\]/gi,
    (_, id, title, content) => {
      const safeId = `eu-modal-${id.replace(/[^a-z0-9]/gi, '')}`;
      return `<div class="modal fade eu-modal" id="${safeId}" tabindex="-1" aria-labelledby="${safeId}-label" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="${safeId}-label">${escapeHtml(title)}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">${content.trim()}</div>
          </div>
        </div>
      </div>`;
    }
  );
};
