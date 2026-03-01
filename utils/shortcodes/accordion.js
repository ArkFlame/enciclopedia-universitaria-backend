const { escapeHtml } = require('./index').utils;

const ACCORDION_OPEN = '[accordion';
const ACCORDION_CLOSE = '[/accordion]';
let accIdx = 0;

function renderAccordionBlock(title, body) {
  const id = `eu-acc-${Date.now()}-${accIdx++}`;
  const trimmedBody = body.trim();
  const escapedTitle = escapeHtml(title);
  return `<div class="accordion eu-accordion my-2">
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false">${escapedTitle}</button>
          </h2>
          <div id="${id}" class="accordion-collapse collapse">
            <div class="accordion-body">${trimmedBody}</div>
          </div>
        </div>
      </div>`;
}

function findAccordionClosing(text, startIndex) {
  let depth = 1;
  let searchIndex = startIndex;
  while (true) {
    const nextOpen = text.indexOf(ACCORDION_OPEN, searchIndex);
    const nextClose = text.indexOf(ACCORDION_CLOSE, searchIndex);
    if (nextClose === -1) {
      return -1;
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      searchIndex = nextOpen + ACCORDION_OPEN.length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return nextClose;
      }
      searchIndex = nextClose + ACCORDION_CLOSE.length;
    }
  }
}

function replaceAccordions(text) {
  let result = '';
  let cursor = 0;
  const regex = /\[accordion\s+title="([^"]+)"\]/gi;
  while (true) {
    regex.lastIndex = cursor;
    const match = regex.exec(text);
    if (!match) {
      break;
    }
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;
    const title = match[1];
    result += text.substring(cursor, matchStart);
    const closingStart = findAccordionClosing(text, matchEnd);
    const closingEnd = closingStart === -1 ? text.length : closingStart + ACCORDION_CLOSE.length;
    const innerContent = closingStart === -1 ? text.slice(matchEnd) : text.slice(matchEnd, closingStart);
    const expandedInner = replaceAccordions(innerContent);
    result += renderAccordionBlock(title, expandedInner);
    cursor = closingEnd;
  }
  result += text.substring(cursor);
  return result;
}

module.exports = function accordion(text) {
  return replaceAccordions(text);
};