// index.js
/**
 * Shortcode parsers index - Enciclopedia Universitaria
 * Each shortcode is a separate module for maintainability
 */
function escapeAttr(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

function parseArrowSyntax(body) {
  const lines = [];
  const colors = {};
  body.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/(?:-+>|→)/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      lines.push(`${parts[0]} -> ${parts[1]}`);
    }
  });
  return { lines, colors };
}

function buildSynopticMarkup(name, lines, colors = {}, summaries = {}) {
  if (!lines.length) return '';
  const safeCaption = escapeAttr(name || 'Mapa Sinóptico');
  const payload = escapeHtml(lines.join('\n'));
  const colorAttr = Object.keys(colors).length
    ? ` data-node-colors="${escapeAttr(JSON.stringify(colors))}"`
    : '';
  const summaryAttr = Object.keys(summaries).length
    ? ` data-node-summaries="${escapeAttr(JSON.stringify(summaries))}"`
    : '';
  return `<div class="eu-mapa-sinoptico" data-caption="${safeCaption}"${colorAttr}${summaryAttr}>
    <div class="eu-mapa-sinoptico-header"></div>
    <div class="eu-mapa-sinoptico-body">
      <div class="eu-mapa-sinoptico-wrapper">
        <div class="eu-mapa-sinoptico-tree" role="presentation"></div>
      </div>
      <div class="eu-mapa-sinoptico-caption"></div>
    </div>
    <pre class="eu-mapa-sinoptico-data" hidden>${payload}</pre>
  </div>`;
}

const utils = {
  escapeAttr,
  escapeHtml,
  getContrastColor,
  parseArrowSyntax,
  buildSynopticMarkup
};

module.exports.utils = utils;

const sourceRef = require('./source-ref');
const tooltip = require('./tooltip');
const ref = require('./ref');
const highlight = require('./highlight');
const alert = require('./alert');
const callout = require('./callout');
const formula = require('./formula');
const img = require('./img');
const image = require('./image');
const youtube = require('./youtube');
const mapaSinoptico = require('./mapa-sinoptico');
const interactiveDiagram = require('./interactive-diagram');
const card = require('./card');
const grid = require('./grid');
const tabs = require('./tabs');
const modal = require('./modal');
const modalTrigger = require('./modal-trigger');

const parsers = [
  sourceRef,
  tooltip,
  ref,
  highlight,
  alert,
  callout,
  formula,
  img,
  image,
  youtube,
  mapaSinoptico,
  interactiveDiagram,
  card,
  grid,
  tabs,
  modal,
  modalTrigger
];

module.exports.parsers = parsers;
module.exports.sourceRef = sourceRef;
