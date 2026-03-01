/**
 * PARSER DE SHORTCODES - Enciclopedia Universitaria
 * Convierte shortcodes seguros a HTML Bootstrap/Tailwind
 * NO permite JS arbitrario. Solo componentes predefinidos.
 */

const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Configuración DOMPurify - MUY restrictiva
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p','br','strong','em','u','s','h1','h2','h3','h4','h5','h6',
    'ul','ol','li','blockquote','code','pre','table','thead','tbody','tr','th','td',
    'a','img','figure','figcaption','hr','span','div','section','aside',
    // Componentes interactivos (generados por nosotros, no por usuarios)
  ],
  ALLOWED_ATTR: ['href','src','alt','class','id','data-*','aria-*','role','title',
    'target','rel','width','height','style'],
  FORBID_TAGS: ['script','iframe','object','embed','form','input','button','select','textarea'],
  FORBID_ATTR: ['onerror','onclick','onload','onmouseover','onfocus','onblur','onchange','onsubmit'],
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ['data-bs-toggle','data-bs-target','data-bs-dismiss','data-article-ref']
};

/**
 * SHORTCODES DISPONIBLES:
 * 
 * [tooltip text="Descripción"]Término[/tooltip]
 * [modal id="m1" title="Título"]Contenido del modal[/modal]
 * [modal-trigger modal="m1"]Abrir modal[/modal-trigger]
 * [ref article="slug-del-articulo"]Texto del enlace[/ref]
 * [card title="Título" image="ruta/imagen.jpg"]Contenido[/card]
 * [grid cols="3"]contenido[/grid]
 * [tabs]
 *   [tab title="Tab 1"]Contenido 1[/tab]
 *   [tab title="Tab 2"]Contenido 2[/tab]
 * [/tabs]
 * [accordion title="Título"]Contenido desplegable[/accordion]
 * [highlight color="yellow"]texto destacado[/highlight]
 * [cuadro-sinoptico main="Título Principal" main_color="#f59e0b"]
 *   [etapa title="ETAPA 1" color="#fbbf24"]Descripción de la etapa 1[/etapa]
 *   [etapa title="ETAPA 2" color="#10b981"]Descripción de la etapa 2[/etapa]
 *   [etapa title="ETAPA 3" color="#8b5cf6"]Descripción de la etapa 3[/etapa]
 *   [etapa title="ETAPA 4" color="#06b6d4"]Descripción de la etapa 4[/etapa]
 *   [etapa title="ETAPA 5" color="#84cc16"]Descripción de la etapa 5[/etapa]
 * [/cuadro-sinoptico]
 * [img file="hero.jpg" alt="Descripción" caption="Pie de foto"]
 * [image src="ruta/img.jpg" alt="descripción" caption="Pie de foto"]
 * [alert type="info|warning|danger|success"]Mensaje[/alert]
 * [callout icon="🔬"]Nota científica importante[/callout]
 * [formula]E = mc^2[/formula]
 * [youtube id="VIDEO_ID"]
 */

function parseShortcodes(text) {
  let result = text;

  // [source-ref title="Título de la fuente"] - inline citation
  let sourceRefCounter = 0;
  result = result.replace(/\[source-ref\s+title="([^"]+)"\]/gi, (_, title) => {
    sourceRefCounter++;
    const n = sourceRefCounter;
    return `<sup class="eu-source-ref" title="${escapeAttr(title)}" style="cursor:help">[${n}]</sup>`;
  });

  // [tooltip text="..."]...[/tooltip]
  result = result.replace(/\[tooltip\s+text="([^"]+)"\]([\s\S]*?)\[\/tooltip\]/gi, (_, tip, content) => {
    return `<span class="eu-tooltip" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeAttr(tip)}" style="border-bottom:1px dashed #666;cursor:help">${content.trim()}</span>`;
  });

  // [ref article="slug"]Texto[/ref]
  result = result.replace(/\[ref\s+article="([^"]+)"\]([\s\S]*?)\[\/ref\]/gi, (_, slug, content) => {
    return `<a href="/articulo.html?slug=${escapeAttr(slug)}" class="eu-article-ref" data-article-ref="${escapeAttr(slug)}">${content.trim()} <sup>↗</sup></a>`;
  });

  // [highlight color="..."]...[/highlight]
  result = result.replace(/\[highlight(?:\s+color="([^"]+)")?\]([\s\S]*?)\[\/highlight\]/gi, (_, color, content) => {
    const bg = color || '#fef08a';
    return `<mark style="background-color:${escapeAttr(bg)};padding:0 3px;border-radius:3px">${content.trim()}</mark>`;
  });

  // [alert type="..."]...[/alert]
  result = result.replace(/\[alert\s+type="([^"]+)"\]([\s\S]*?)\[\/alert\]/gi, (_, type, content) => {
    const types = { info: 'info', warning: 'warning', danger: 'danger', success: 'success' };
    const t = types[type] || 'info';
    return `<div class="alert alert-${t} eu-alert" role="alert">${content.trim()}</div>`;
  });

  // [callout icon="..."]...[/callout]
  result = result.replace(/\[callout(?:\s+icon="([^"]+)")?\]([\s\S]*?)\[\/callout\]/gi, (_, icon, content) => {
    return `<div class="eu-callout"><span class="eu-callout-icon">${icon || '📌'}</span><div class="eu-callout-body">${content.trim()}</div></div>`;
  });

  // [formula]...[/formula]
  result = result.replace(/\[formula\]([\s\S]*?)\[\/formula\]/gi, (_, math) => {
    return `<div class="eu-formula" style="text-align:center;font-family:'Times New Roman',serif;font-size:1.2em;padding:12px;background:var(--eu-code-bg);border-radius:8px;margin:12px 0">\\(${math.trim()}\\)</div>`;
  });

  // [img file="filename" alt="..." caption="..." width="800"]
  result = result.replace(/\[img\s+file="([^"]+)"(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?(?:\s+width="(\d+)")?\]/gi, (_, file, alt, caption, width) => {
    const safeAlt = escapeAttr(alt || '');
    const style = width ? `style="max-width:${escapeAttr(width)}px"` : '';
    const img = `<img src="${escapeAttr(file)}" alt="${safeAlt}" class="img-fluid rounded eu-article-img" loading="lazy" ${style}>`;
    if (caption) {
      return `<figure class="eu-figure text-center my-3">${img}<figcaption class="eu-caption text-muted mt-1">${escapeHtml(caption)}</figcaption></figure>`;
    }
    return `<div class="text-center my-3">${img}</div>`;
  });

  // [image src="..." alt="..." caption="..."] (legacy)
  result = result.replace(/\[image\s+src="([^"]+)"(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?\]/gi, (_, src, alt, caption) => {
    const safeAlt = escapeAttr(alt || '');
    const img = `<img src="${escapeAttr(src)}" alt="${safeAlt}" class="img-fluid rounded eu-article-img" loading="lazy">`;
    if (caption) {
      return `<figure class="eu-figure text-center my-3">${img}<figcaption class="eu-caption text-muted mt-1">${escapeHtml(caption)}</figcaption></figure>`;
    }
    return `<div class="text-center my-3">${img}</div>`;
  });

  // [youtube id="VIDEO_ID"]
  result = result.replace(/\[youtube\s+id="([A-Za-z0-9_\-]{11})"\]/gi, (_, id) => {
    return `<div class="eu-video-wrapper ratio ratio-16x9 my-3"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen loading="lazy" title="Video de YouTube"></iframe></div>`;
  });

  // [cuadro-sinoptico main="..." main_color="..."]...[etapa title="..." color="..."]...[/etapa]...[/cuadro-sinoptico]
  result = result.replace(/\[cuadro-sinoptico\s+main="([^"]+)"(?:\s+main_color="([^"]+)")?\]([\s\S]*?)\[\/cuadro-sinoptico\]/gi, (_, mainTitle, mainColor, content) => {
    const etapaRegex = /\[etapa\s+title="([^"]+)"(?:\s+color="([^"]+)")?\]([\s\S]*?)\[\/etapa\]/gi;
    let etapas = [];
    let match;
    const diagramaId = `eu-cuadro-${Date.now()}`;
    
    while ((match = etapaRegex.exec(content)) !== null) {
      etapas.push({
        title: match[1].trim(),
        color: match[2] || '#3b82f6',
        description: match[3].trim()
      });
    }
    
    if (etapas.length === 0) return '';
    
    const color = mainColor || '#f59e0b';
    const etapasHtml = etapas.map((e, i) => `
      <div class="etapa flex items-center gap-8">
        <div class="min-w-[210px] px-7 py-5 rounded-3xl font-bold text-xl shadow-md text-center" 
             style="background:${e.color};color:${getContrastColor(e.color)}">
          ${escapeHtml(e.title)}
        </div>
        <div class="flex-1 bg-white border border-gray-200 p-6 rounded-3xl shadow text-base leading-relaxed" style="background:var(--eu-bg);color:var(--eu-text)">
          ${e.description}
        </div>
      </div>
    `).join('');
    
    return `<div class="eu-cuadro-sinoptico my-5" id="${diagramaId}">
      <div class="relative max-w-6xl mx-auto px-6">
        <!-- Caja principal -->
        <div class="absolute left-8 top-1/2 -translate-y-1/2 shadow-2xl w-80 py-10 px-8 rounded-3xl text-center z-20" 
             style="background:${color};color:${getContrastColor(color)}">
          <h2 class="font-black text-3xl leading-tight" style="color:${getContrastColor(color)}">${escapeHtml(mainTitle)}</h2>
        </div>
        
        <!-- Etapas -->
        <div class="ml-96 space-y-12 pt-12">
          ${etapasHtml}
        </div>
        
        <!-- SVG líneas conexión -->
        <svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-10" style="overflow:visible">
          <defs>
            <marker id="arrowhead-${diagramaId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#475569"/>
            </marker>
          </defs>
        </svg>
      </div>
      <p class="text-center text-muted mt-4" style="font-size:0.75rem">Cuadro Sinóptico - ${mainTitle}</p>
    </div>`;
  });

  // Legacy: keep interactive-diagram but deprecate
  result = result.replace(/\[interactive-diagram(?:\s+title="([^"]+)")?\]([\s\S]*?)\[\/interactive-diagram\]/gi, (_, title, cellsContent) => {
    const cellRegex = /\[cell\s+label="([^"]+)"\s+article="([^"]*)"\s+x="(\d+)"\s+y="(\d+)"(?:\s+color="([^"]*)")?\]([\s\S]*?)\[\/cell\]/gi;
    let cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(cellsContent)) !== null) {
      cells.push({
        label: cellMatch[1],
        article: cellMatch[2],
        x: Math.min(Math.max(parseInt(cellMatch[3]), 0), 95),
        y: Math.min(Math.max(parseInt(cellMatch[4]), 0), 95),
        color: cellMatch[5] || '#3b82f6',
        description: cellMatch[6].trim()
      });
    }
    const diagramId = `eu-diag-${Date.now()}`;
    const titleHtml = title ? `<h6 class="eu-diagram-title text-center mb-2">${escapeHtml(title)}</h6>` : '';
    const cellsHtml = cells.map((c, i) => {
      const articleLink = c.article
        ? `<a href="/articulo.html?slug=${escapeAttr(c.article)}" class="btn btn-sm btn-dark mt-2">Ver artículo ↗</a>`
        : '';
      return `<button class="eu-diagram-cell" 
        style="left:${c.x}%;top:${c.y}%;background:${escapeAttr(c.color)}"
        data-cell-id="${diagramId}-cell-${i}"
        aria-label="${escapeAttr(c.label)}"
      >${escapeHtml(c.label)}</button>
      <div class="eu-cell-popup" id="${diagramId}-cell-${i}" role="tooltip">
        <strong>${escapeHtml(c.label)}</strong>
        <div class="eu-cell-desc">${c.description}</div>
        ${articleLink}
      </div>`;
    }).join('');

    return `<div class="eu-interactive-diagram" id="${diagramId}">
      ${titleHtml}
      <div class="eu-diagram-canvas">${cellsHtml}</div>
      <p class="text-muted text-center mt-1" style="font-size:0.75rem">Haz clic en cada elemento para más información</p>
    </div>`;
  });

  // [youtube id="VIDEO_ID"]
  result = result.replace(/\[youtube\s+id="([A-Za-z0-9_\-]{11})"\]/gi, (_, id) => {
    return `<div class="eu-video-wrapper ratio ratio-16x9 my-3"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen loading="lazy" title="Video de YouTube"></iframe></div>`;
  });

  // [accordion title="..."]...[/accordion]
  let accIdx = 0;
  result = result.replace(/\[accordion\s+title="([^"]+)"\]([\s\S]*?)\[\/accordion\]/gi, (_, title, content) => {
    const id = `eu-acc-${Date.now()}-${accIdx++}`;
    return `<div class="accordion eu-accordion my-2">
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false">${escapeHtml(title)}</button>
        </h2>
        <div id="${id}" class="accordion-collapse collapse">
          <div class="accordion-body">${content.trim()}</div>
        </div>
      </div>
    </div>`;
  });

  // [card title="..." image="..."]...[/card]
  result = result.replace(/\[card\s+title="([^"]+)"(?:\s+image="([^"]*)")?\]([\s\S]*?)\[\/card\]/gi, (_, title, image, content) => {
    const imgHtml = image ? `<img src="${escapeAttr(image)}" class="card-img-top" alt="${escapeAttr(title)}" loading="lazy">` : '';
    return `<div class="card eu-card my-2 shadow-sm">
      ${imgHtml}
      <div class="card-body">
        <h5 class="card-title">${escapeHtml(title)}</h5>
        <div class="card-text">${content.trim()}</div>
      </div>
    </div>`;
  });

  // [grid cols="N"]...[/grid]
  result = result.replace(/\[grid\s+cols="(\d+)"\]([\s\S]*?)\[\/grid\]/gi, (_, cols, content) => {
    const n = Math.min(Math.max(parseInt(cols) || 2, 1), 6);
    return `<div class="row row-cols-1 row-cols-md-${n} g-3 eu-grid my-3">${content.trim()}</div>`;
  });

  // [tabs][tab title="..."]...[/tab]...[/tabs]
  result = result.replace(/\[tabs\]([\s\S]*?)\[\/tabs\]/gi, (_, tabsContent) => {
    const tabRegex = /\[tab\s+title="([^"]+)"\]([\s\S]*?)\[\/tab\]/gi;
    let tabs = [];
    let match;
    const tabsId = `eu-tabs-${Date.now()}`;
    while ((match = tabRegex.exec(tabsContent)) !== null) {
      tabs.push({ title: match[1], content: match[2].trim() });
    }
    if (!tabs.length) return tabsContent;
    const navItems = tabs.map((t, i) => `
      <li class="nav-item" role="presentation">
        <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#${tabsId}-tab${i}" type="button" role="tab">${escapeHtml(t.title)}</button>
      </li>`).join('');
    const panes = tabs.map((t, i) => `
      <div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="${tabsId}-tab${i}" role="tabpanel">${t.content}</div>`).join('');
    return `<div class="eu-tabs my-3">
      <ul class="nav nav-tabs" role="tablist">${navItems}</ul>
      <div class="tab-content p-3 border border-top-0 rounded-bottom">${panes}</div>
    </div>`;
  });

  // [modal id="..." title="..."]...[/modal]
  result = result.replace(/\[modal\s+id="([^"]+)"\s+title="([^"]+)"\]([\s\S]*?)\[\/modal\]/gi, (_, id, title, content) => {
    const safeId = `eu-modal-${id.replace(/[^a-z0-9]/gi, '')}`;
    return `<div class="modal fade eu-modal" id="${safeId}" tabindex="-1" aria-labelledby="${safeId}-label" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${safeId}-label">${escapeHtml(title)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">${content.trim()}</div>
        </div>
      </div>
    </div>`;
  });

  // [modal-trigger modal="..."]...[/modal-trigger]
  result = result.replace(/\[modal-trigger\s+modal="([^"]+)"\]([\s\S]*?)\[\/modal-trigger\]/gi, (_, id, content) => {
    const safeId = `eu-modal-${id.replace(/[^a-z0-9]/gi, '')}`;
    return `<button class="btn btn-sm btn-outline-secondary eu-modal-trigger" data-bs-toggle="modal" data-bs-target="#${safeId}">${content.trim()}</button>`;
  });

  // [interactive-diagram title="..."]...[/interactive-diagram]
  result = result.replace(/\[interactive-diagram(?:\s+title="([^"]+)")?\]([\s\S]*?)\[\/interactive-diagram\]/gi, (_, title, cellsContent) => {
    const cellRegex = /\[cell\s+label="([^"]+)"\s+article="([^"]*)"\s+x="(\d+)"\s+y="(\d+)"(?:\s+color="([^"]*)")?\]([\s\S]*?)\[\/cell\]/gi;
    let cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(cellsContent)) !== null) {
      cells.push({
        label: cellMatch[1],
        article: cellMatch[2],
        x: Math.min(Math.max(parseInt(cellMatch[3]), 0), 95),
        y: Math.min(Math.max(parseInt(cellMatch[4]), 0), 95),
        color: cellMatch[5] || '#3b82f6',
        description: cellMatch[6].trim()
      });
    }
    const diagramId = `eu-diag-${Date.now()}`;
    const titleHtml = title ? `<h6 class="eu-diagram-title text-center mb-2">${escapeHtml(title)}</h6>` : '';
    const cellsHtml = cells.map((c, i) => {
      const articleLink = c.article
        ? `<a href="/articulo.html?slug=${escapeAttr(c.article)}" class="btn btn-sm btn-dark mt-2">Ver artículo ↗</a>`
        : '';
      return `<button class="eu-diagram-cell" 
        style="left:${c.x}%;top:${c.y}%;background:${escapeAttr(c.color)}"
        data-cell-id="${diagramId}-cell-${i}"
        aria-label="${escapeAttr(c.label)}"
      >${escapeHtml(c.label)}</button>
      <div class="eu-cell-popup" id="${diagramId}-cell-${i}" role="tooltip">
        <strong>${escapeHtml(c.label)}</strong>
        <div class="eu-cell-desc">${c.description}</div>
        ${articleLink}
      </div>`;
    }).join('');

    return `<div class="eu-interactive-diagram" id="${diagramId}">
      ${titleHtml}
      <div class="eu-diagram-canvas">${cellsHtml}</div>
      <p class="text-muted text-center mt-1" style="font-size:0.75rem">Haz clic en cada elemento para más información</p>
    </div>`;
  });

  return result;
}

/**
 * Pipeline completo: shortcodes → marked → DOMPurify
 */
async function processArticleContent(rawMarkdown) {
  const { marked } = require('marked');
  
  // 1. Parsear shortcodes primero
  let withShortcodes = parseShortcodes(rawMarkdown);
  
  // 2. Convertir Markdown a HTML
  const html = await marked.parse(withShortcodes, {
    breaks: true,
    gfm: true
  });
  
  // 3. Sanitizar con DOMPurify
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
  
  return clean;
}

function escapeAttr(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Get contrast color (black or white) for text on colored background
 */
function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

module.exports = { parseShortcodes, processArticleContent };
