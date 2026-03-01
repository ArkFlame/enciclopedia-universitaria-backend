const IShortcodeHandler = require('./IShortcodeHandler')

function escapeAttr(s){ return String(s||'').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

class TooltipShortcode extends IShortcodeHandler {
  apply(input){
    const RE = /\[tooltip\s+text="([^"]+)"\]([\s\S]*?)\[\/tooltip\]/gi
    return input.replace(RE, (_, tip, content) => {
      return `<span class="eu-tooltip" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeAttr(tip)}" style="border-bottom:1px dashed #666;cursor:help">${content.trim()}</span>`
    })
  }
}

module.exports = TooltipShortcode
