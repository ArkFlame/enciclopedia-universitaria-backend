// shortcodeParser.js
/**
 * PARSER DE SHORTCODES - Enciclopedia Universitaria
 * Router principal que delega a parsers individuales en /shortcodes/
 * Convierte shortcodes seguros a HTML Bootstrap/Tailwind
 * NO permite JS arbitrario. Solo componentes predefinidos.
 */
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { parsers, utils, sourceRef } = require('./shortcodes');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Configuración DOMPurify - MUY restrictiva
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

/**
 * SHORTCODES DISPONIBLES (todos en /shortcodes/):
 *
 * [tooltip text="Descripción"]Término[/tooltip]
 * [ref article="slug-del-articulo"]Texto del enlace[/ref]
 * [highlight color="yellow"]texto destacado[/highlight]
 * [alert type="info|warning|danger|success"]Mensaje[/alert]
 * [callout icon="🔬"]Nota científica importante[/callout]
 * [formula]E = mc^2[/formula]
 * [img file="hero.jpg" alt="Descripción" caption="Pie de foto"]
 * [image src="ruta/img.jpg" alt="descripción" caption="Pie de foto"]
 * [youtube id="VIDEO_ID"]
 * [mapa-sinoptico name="Título"]Padre -> Hijo[/mapa-sinoptico]
 * [accordion title="Título"]Contenido desplegable[/accordion]
 * [card title="Título" image="ruta/imagen.jpg"]Contenido[/card]
 * [grid cols="3"]contenido[/grid]
 * [tabs][tab title="Tab 1"]Contenido 1[/tab][/tabs]
 * [modal id="..." title="..."]...[/modal]
 * [modal-trigger modal="..."]...[/modal-trigger]
 * [source-ref title="Título de la fuente"]
 */

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

/**
 * Pipeline completo: shortcodes → marked → DOMPurify
 */
async function processArticleContent(rawMarkdown) {
  const { marked } = require('marked');
  const withShortcodes = parseShortcodes(rawMarkdown);
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
