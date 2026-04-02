const { escapeHtml } = require('./index').utils;

const OPEN_TAG_REGEX = /^\[accordion\s+title="([^"]+)"\]/i;
const CLOSING_TAG = '[/accordion]';

let accordionCounter = 0;

function generateAccordionId() {
  const id = `eu-acc-${accordionCounter++}`;
  return id;
}

function parseAccordionOpen(text, startIndex) {
  const slice = text.slice(startIndex);
  const match = slice.match(OPEN_TAG_REGEX);
  if (!match) {
    return null;
  }
  return {
    title: match[1],
    length: match[0].length
  };
}

function findNextValidAccordionOpen(text, fromIndex) {
  let cursor = text.indexOf('[accordion', fromIndex);
  while (cursor !== -1) {
    const parsed = parseAccordionOpen(text, cursor);
    if (parsed) {
      return {
        index: cursor,
        length: parsed.length
      };
    }
    cursor = text.indexOf('[accordion', cursor + 1);
  }
  return null;
}

function findMatchingAccordionEnd(text, startIndex) {
  let depth = 1;
  let cursor = startIndex;
  while (cursor < text.length) {
    const nextClose = text.indexOf(CLOSING_TAG, cursor);
    if (nextClose === -1) {
      return -1;
    }
    const nextOpenMatch = findNextValidAccordionOpen(text, cursor);
    if (nextOpenMatch && nextOpenMatch.index < nextClose) {
      depth += 1;
      cursor = nextOpenMatch.index + nextOpenMatch.length;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return nextClose;
    }
    cursor = nextClose + CLOSING_TAG.length;
  }
  return -1;
}

function renderAccordionBlock(title, body) {
  const id = generateAccordionId();
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

function replaceAccordions(text) {
  let cursor = 0;
  let result = '';
  while (cursor < text.length) {
    const nextOpenIndex = text.indexOf('[accordion', cursor);
    if (nextOpenIndex === -1) {
      break;
    }
    const openMatch = parseAccordionOpen(text, nextOpenIndex);
    if (!openMatch) {
      result += text.slice(cursor, nextOpenIndex + 1);
      cursor = nextOpenIndex + 1;
      continue;
    }
    result += text.slice(cursor, nextOpenIndex);
    const closingIndex = findMatchingAccordionEnd(text, nextOpenIndex + openMatch.length);
    if (closingIndex === -1) {
      result += text.slice(nextOpenIndex);
      return result;
    }
    const bodyStart = nextOpenIndex + openMatch.length;
    const bodyContent = text.slice(bodyStart, closingIndex);
    const processedBody = replaceAccordions(bodyContent);
    result += renderAccordionBlock(openMatch.title, processedBody);
    cursor = closingIndex + CLOSING_TAG.length;
  }
  result += text.slice(cursor);
  return result;
}

module.exports = function accordion(text) {
  return replaceAccordions(text);
};