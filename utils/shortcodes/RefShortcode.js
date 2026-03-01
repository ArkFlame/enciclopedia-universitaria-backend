const IShortcodeHandler = require('./IShortcodeHandler')

function escapeAttr(s){ return String(s||'').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

class RefShortcode extends IShortcodeHandler {
  apply(input){
    const RE = /\[ref\s+article="([^\"]+)"\]([\s\S]*?)\[\/ref\]/gi
    return input.replace(RE, (_, slug, content) => {
      return `<a href="/articulo.html?slug=${escapeAttr(slug)}" class="eu-article-ref" data-article-ref="${escapeAttr(slug)}">${content.trim()} <sup>↗</sup></a>`
    })
  }
}

module.exports = RefShortcode
