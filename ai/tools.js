/**
 * ai/tools.js
 * Tool definitions and executor — the AI calls these to interact with the backend DB.
 * Single responsibility: tool schema + tool execution only.
 */

const path = require('path');
const fs   = require('fs').promises;
const db   = require('../config/db');
const { sanitizeSearchQuery } = require('../utils/sanitize');

const STORAGE = process.env.STORAGE_PATH || path.join(__dirname, '../storage');

// ─── Tool Schema (sent to agent as instructions) ──────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'search_articles',
    label: 'Buscando artículos',
    description: 'Busca artículos en la enciclopedia por palabras clave. Devuelve títulos, slugs y resúmenes.',
    parameters: {
      query:    { type: 'string',  required: true,  description: 'Términos de búsqueda en español' },
      category: { type: 'string',  required: false, description: 'Filtrar por categoría (opcional)' },
      limit:    { type: 'number',  required: false, description: 'Máx resultados 1-8, default 5' }
    }
  },
  {
    name: 'get_article_content',
    label: 'Leyendo artículo',
    description: 'Lee el contenido completo de un artículo dado su slug. Usar después de search_articles.',
    parameters: {
      slug: { type: 'string', required: true, description: 'Slug del artículo a leer' }
    }
  },
  {
    name: 'get_categories',
    label: 'Obteniendo categorías',
    description: 'Lista todas las categorías disponibles en la enciclopedia con conteo de artículos.',
    parameters: {}
  },
  {
    name: 'get_recent_articles',
    label: 'Obteniendo artículos recientes',
    description: 'Devuelve artículos recientes o populares de la enciclopedia.',
    parameters: {
      sort:  { type: 'string', required: false, description: '"recent" o "popular"' },
      limit: { type: 'number', required: false, description: 'Máx resultados 1-8, default 5' }
    }
  }
];

// ─── Schema string for system prompt ─────────────────────────────────────────

const TOOL_SCHEMA_TEXT = TOOL_DEFINITIONS.map(t => {
  const params = Object.entries(t.parameters).map(([k, v]) =>
    `  - ${k} (${v.type}${v.required ? ', requerido' : ''}): ${v.description}`
  ).join('\n');
  return `### ${t.name}\n${t.description}${params ? '\nParámetros:\n' + params : ''}`;
}).join('\n\n');

// ─── Executor ─────────────────────────────────────────────────────────────────

async function executeTool(name, params = {}) {
  switch (name) {
    case 'search_articles':      return toolSearchArticles(params);
    case 'get_article_content':  return toolGetArticleContent(params);
    case 'get_categories':       return toolGetCategories();
    case 'get_recent_articles':  return toolGetRecentArticles(params);
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

// ─── Tool Implementations ─────────────────────────────────────────────────────

async function toolSearchArticles({ query, category, limit = 5 }) {
  if (!query) return { error: 'query requerido' };

  const safeQ   = sanitizeSearchQuery(query);
  const safeL   = Math.max(1, Math.min(8, parseInt(limit) || 5));
  const conds   = ['a.status = "APPROVED"'];
  const params  = [];

  if (safeQ) {
    conds.push('MATCH(a.title, a.summary) AGAINST(? IN BOOLEAN MODE)');
    params.push(safeQ);
  }
  if (category) {
    conds.push('a.category = ?');
    params.push(String(category).slice(0, 60));
  }
  params.push(safeL);

  const [rows] = await db.query(
    `SELECT a.slug, a.title, a.summary, a.category, a.tags, a.views,
            u.username AS author
     FROM eu_articles a
     JOIN eu_users u ON a.author_id = u.id
     WHERE ${conds.join(' AND ')}
     ORDER BY a.views DESC
     LIMIT ?`,
    params
  );

  return { count: rows.length, articles: rows };
}

async function toolGetArticleContent({ slug }) {
  if (!slug) return { error: 'slug requerido' };

  const [rows] = await db.query(
    `SELECT a.slug, a.title, a.summary, a.category, a.tags, a.views,
            u.username AS author, a.updated_at
     FROM eu_articles a
     JOIN eu_users u ON a.author_id = u.id
     WHERE a.slug = ? AND a.status = "APPROVED"
     LIMIT 1`,
    [String(slug).slice(0, 120)]
  );

  if (!rows.length) return { error: 'Artículo no encontrado' };

  const article = rows[0];
  const contentPath = path.join(STORAGE, 'articles', article.slug, 'content.md');

  let content = article.summary || '';
  try {
    const raw = await fs.readFile(contentPath, 'utf8');
    // Limit to ~3500 chars to avoid token overload
    content = raw.length > 3500
      ? raw.slice(0, 3500) + '\n\n[…contenido truncado]'
      : raw;
  } catch { /* file may not exist, use summary */ }

  return {
    slug:     article.slug,
    title:    article.title,
    category: article.category,
    author:   article.author,
    summary:  article.summary,
    tags:     article.tags,
    content
  };
}

async function toolGetCategories() {
  const [rows] = await db.query(
    `SELECT category AS name, COUNT(*) AS count
     FROM eu_articles WHERE status = "APPROVED"
     GROUP BY category ORDER BY count DESC`
  );
  return { categories: rows };
}

async function toolGetRecentArticles({ sort = 'recent', limit = 5 } = {}) {
  const safeL   = Math.max(1, Math.min(8, parseInt(limit) || 5));
  const orderBy = sort === 'popular' ? 'a.views DESC' : 'a.created_at DESC';

  const [rows] = await db.query(
    `SELECT a.slug, a.title, a.summary, a.category, a.views, u.username AS author
     FROM eu_articles a
     JOIN eu_users u ON a.author_id = u.id
     WHERE a.status = "APPROVED"
     ORDER BY ${orderBy}
     LIMIT ?`,
    [safeL]
  );

  return { articles: rows };
}

module.exports = { TOOL_DEFINITIONS, TOOL_SCHEMA_TEXT, executeTool };
