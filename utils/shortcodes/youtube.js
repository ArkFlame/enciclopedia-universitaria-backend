/**
 * [youtube id="VIDEO_ID"]
 */
const { escapeAttr } = require('./index').utils;

module.exports = function youtube(text) {
  return text.replace(/\[youtube\s+id="([A-Za-z0-9_\-]{11})"\]/gi,
    (_, id) => {
      return `<div class="eu-video-wrapper ratio ratio-16x9 my-3"><iframe src="https://www.youtube.com/embed/${escapeAttr(id)}" allowfullscreen loading="lazy" title="Video de YouTube"></iframe></div>`;
    }
  );
};
