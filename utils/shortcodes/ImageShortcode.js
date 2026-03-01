const IShortcodeHandler = require('./IShortcodeHandler')

function escapeAttr(s){ return String(s||'').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function parseAttrs(text){
  const out = {}
  const re = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(text)) !== null){ out[m[1]] = m[2] }
  return out
}

class ImageShortcode extends IShortcodeHandler {
  apply(input){
    const RE = /\[image\s+([^\]]+)\]/g
    return input.replace(RE, (_, attrs) => {
      const a = parseAttrs(attrs)
      const src = a.src
      const alt = a.alt || ''
      const caption = a.caption
      if (!src) return ''
      const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="eu-article-img" loading="lazy">`
      if (caption){
        return `<figure class="eu-figure text-center my-3">${img}<figcaption class="eu-caption text-muted mt-1">${escapeAttr(caption)}</figcaption></figure>`
      }
      return `<div class="text-center my-3">${img}</div>`
    })
  }
}

module.exports = ImageShortcode
