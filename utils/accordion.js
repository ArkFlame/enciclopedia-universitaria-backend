/**
 * [accordion title="Título"]Contenido desplegable[/accordion]
 */
const { escapeHtml } = require('./index').utils;

let accIdx = 0;

module.exports = function accordion(text) {
  const openTag = '[accordion';
  const closeTag = '[/accordion]';
  let result = '';
  let lastIndex = 0;
  let i = 0;
  
  while ((i = text.indexOf(openTag, i)) !== -1) {
    // Add text before this accordion
    result += text.slice(lastIndex, i);
    
    // Find the title
    const titleMatch = text.slice(i).match(/^\[accordion\s+title="([^"]+)"\]/i);
    if (!titleMatch) {
      // Malformed tag, skip
      result += text[i];
      i++;
      continue;
    }
    
    const title = titleMatch[1];
    const contentStart = i + titleMatch[0].length;
    
    // Find the matching close tag (accounting for nesting)
    let depth = 1;
    let pos = contentStart;
    let contentEnd = -1;
    
    while (pos < text.length && depth > 0) {
      const nextOpen = text.indexOf(openTag, pos);
      const nextClose = text.indexOf(closeTag, pos);
      
      if (nextClose === -1) break; // No closing tag found
      
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Found an opening before closing, increase depth
        depth++;
        pos = nextOpen + openTag.length;
      } else {
        // Found a closing
        depth--;
        if (depth === 0) {
          contentEnd = nextClose;
        }
        pos = nextClose + closeTag.length;
      }
    }
    
    if (contentEnd === -1) {
      // No matching close tag, treat as plain text
      result += text.slice(i, pos);
    } else {
      const content = text.slice(contentStart, contentEnd);
      const id = `eu-acc-${Date.now()}-${accIdx++}`;
      result += `<div class="accordion eu-accordion my-2">
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
    
    lastIndex = contentEnd !== -1 ? contentEnd + closeTag.length : pos;
    i = lastIndex;
  }
  
  // Add remaining text
  result += text.slice(lastIndex);
  return result;
};