// shortcodeParser.js
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const garbageParser = require('./garbageParser');
const { parsers, utils, sourceRef } = require('./shortcodes');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p','br','strong','em','u','s','h1','h2','h3','h4','h5','h6',
    'ul','ol','li','blockquote','code','pre','table','thead','tbody','tr','th','td',
    'a','img','figure','figcaption','hr','span','div','section','aside'],
  ALLOWED_ATTR: ['href','src','alt','class','id','data-*','aria-*','role','title',
    'target','rel','width','height','style'],
  FORBID_TAGS: ['script','iframe','object','embed','form','input','button','select','textarea'],
  FORBID_ATTR: ['onerror','onclick','onload','onmouseover','onfocus','onblur','onchange','onsubmit'],
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['data-bs-toggle','data-bs-target','data-bs-dismiss','data-article-ref','data-mermaid']
};

function parseShortcodes(text) {
  let result = text;
  if (sourceRef && typeof sourceRef.resetCounter === 'function') {
    sourceRef.resetCounter();
  }
  for (const parser of parsers) {
    result = parser(result);
  }
  return result;
}

async function processArticleContent(rawMarkdown) {
  const { marked } = require('marked');
  const normalizedMarkdown = garbageParser.normalizeMarkdown(rawMarkdown);
  const withShortcodes = parseShortcodes(normalizedMarkdown);
  const html = await marked.parse(withShortcodes, {
    breaks: true,
    gfm: true
  });
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
  return clean;
}

module.exports = {
  parseShortcodes,
  processArticleContent,
  escapeAttr: utils.escapeAttr,
  escapeHtml: utils.escapeHtml,
  getContrastColor: utils.getContrastColor,
  parseArrowSyntax: utils.parseArrowSyntax,
  buildSynopticMarkup: utils.buildSynopticMarkup
};