/**
 * [modal-trigger modal="..."]...[/modal-trigger]
 */
module.exports = function modalTrigger(text) {
  return text.replace(/\[modal-trigger\s+modal="([^\"]+)"\]([\s\S]*?)\[\/modal-trigger\]/gi,
    (_, id, content) => {
      const safeId = `eu-modal-${id.replace(/[^a-z0-9]/gi, '')}`;
      return `<button class="btn btn-sm btn-outline-secondary eu-modal-trigger" data-bs-toggle="modal" data-bs-target="#${safeId}">${content.trim()}</button>`;
    }
  );
};
