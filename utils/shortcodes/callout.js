module.exports = function callout(text, helpers) {
  const renderMarkdownFragment = helpers?.renderMarkdownFragment;
  return text.replace(/\[callout(?:\s+icon="([^"]+)")?\]([\s\S]*?)\[\/callout\]/gi,
    (_match, icon, content) => {
      const renderedBody = renderMarkdownFragment
        ? renderMarkdownFragment(content.trim())
        : content.trim();
      return `<div class="eu-callout"><span class="eu-callout-icon">${icon || '📌'}</span><div class="eu-callout-body">${renderedBody}</div></div>`;
    }
  );
};