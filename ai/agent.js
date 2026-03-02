/**
 * ai/agent.js
 * Agentic loop with real OpenRouter streaming for the final answer.
 *
 * Flow:
 *   1. Non-streaming calls during tool-call detection phases.
 *   2. Once done with tools, a REAL streaming call is made so the user
 *      sees genuine token-by-token output — no word-batch simulation.
 *
 * SSE events: tool_start | tool_done | tool_skip | tool_error | chunk | answer
 */

const { chat, streamChat }              = require('./openrouter');
const { executeTool, TOOL_DEFINITIONS } = require('./tools');
const {
  NANAMI_SYSTEM_PROMPT,
  buildArticleContextBlock,
  buildToolResultMessage
} = require('./prompts');

const TOOL_LABELS = Object.fromEntries(
  TOOL_DEFINITIONS.map(t => [t.name, t.label])
);

// ─── Main export ──────────────────────────────────────────────────────────────

async function runAgentStream({
  userMessage, history = [], articleContext, articleTitle, emit, maxIterations
}) {
  maxIterations = maxIterations || parseInt(process.env.AI_MAX_ITERATIONS) || 4;

  const messages = [{ role: 'system', content: NANAMI_SYSTEM_PROMPT }];

  if (articleContext) {
    messages.push({
      role:    'system',
      content: buildArticleContextBlock(articleTitle || 'Artículo actual', articleContext)
    });
  }

  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 1200)
    }));

  messages.push(...safeHistory);
  messages.push({ role: 'user', content: String(userMessage).slice(0, 2000) });

  const readSlugs     = new Set();
  const searchQueries = new Set();
  const articleLinks  = [];
  let   iterations    = 0;

  while (iterations < maxIterations) {
    iterations++;

    // Non-streaming planning call
    const response = await chat(messages, { maxTokens: 900, temperature: 0.6 });
    const toolMatch = response.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);

    if (!toolMatch) {
      // No tool needed — add planning turn and stream final answer for real
      messages.push({ role: 'assistant', content: response });
      messages.push({
        role:    'user',
        content: 'Ahora responde al usuario de forma clara, amigable y académica.'
      });
      await doStreamAnswer(messages, emit, articleLinks);
      return;
    }

    // Parse tool call
    let toolCall;
    try {
      toolCall = JSON.parse(toolMatch[1]);
    } catch {
      // Malformed JSON — stream the sanitized response directly
      await simulateStream(
        response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(),
        emit,
        articleLinks
      );
      return;
    }

    const { tool: toolName, params = {} } = toolCall;

    // Dedup: get_article_content
    if (toolName === 'get_article_content') {
      const slug = String(params.slug || '').trim();
      if (readSlugs.has(slug)) {
        emit({ type: 'tool_skip', tool: toolName, message: `Ya leí "${slug}", usando información previa` });
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: `"${slug}" ya fue leído. Usa esa información para responder.` });
        continue;
      }
      readSlugs.add(slug);
    }

    // Dedup: search_articles
    if (toolName === 'search_articles') {
      const q = String(params.query || '').trim().toLowerCase();
      if (searchQueries.has(q)) {
        emit({ type: 'tool_skip', tool: toolName, message: `Ya busqué "${params.query}", usando resultados previos` });
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: `La búsqueda "${params.query}" ya fue realizada. Usa esos resultados.` });
        continue;
      }
      searchQueries.add(q);
    }

    emit({
      type: 'tool_start',
      tool: toolName,
      label: TOOL_LABELS[toolName] || toolName,
      message: buildProgressMessage(toolName, params)
    });

    let result;
    try {
      result = await executeTool(toolName, params);
      if (toolName === 'get_article_content' && result.slug && result.title) {
        articleLinks.push({ slug: result.slug, title: result.title });
      }
      emit({
        type:          'tool_done',
        tool:          toolName,
        label:         TOOL_LABELS[toolName] || toolName,
        resultSummary: summarizeResult(toolName, result)
      });
    } catch (err) {
      result = { error: err.message };
      emit({ type: 'tool_error', tool: toolName, message: err.message });
    }

    messages.push({ role: 'assistant', content: response });
    messages.push({ role: 'user',      content: buildToolResultMessage(toolName, result) });
  }

  // Max iterations hit
  messages.push({
    role:    'user',
    content: 'Responde ahora con lo que tienes de forma clara y concisa.'
  });
  await doStreamAnswer(messages, emit, articleLinks);
}

async function runAgent({ userMessage, history = [], articleContext, articleTitle, maxIterations }) {
  const events = [];
  await runAgentStream({ userMessage, history, articleContext, articleTitle, maxIterations, emit: e => events.push(e) });
  const ans = events.find(e => e.type === 'answer');
  return {
    answer:       ans?.content      || 'No se pudo generar respuesta.',
    articleLinks: ans?.articleLinks || [],
    toolsUsed:    events.filter(e => e.type === 'tool_done').map(e => e.tool)
  };
}

// ─── Real streaming via OpenRouter ────────────────────────────────────────────

async function doStreamAnswer(messages, emit, articleLinks) {
  let fullText = '';

  try {
    await streamChat(
      messages,
      { maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1500, temperature: 0.65 },
      token => {
        fullText += token;
        emit({ type: 'chunk', content: token });
      }
    );
  } catch (err) {
    console.error('[Agent] streamChat failed:', err.message);
    if (!fullText) {
      fullText = 'Lo siento, hubo un error al generar la respuesta. Inténtalo de nuevo, miau.';
      emit({ type: 'chunk', content: fullText });
    }
  }

  emit({ type: 'answer', content: fullText, articleLinks: articleLinks.length ? articleLinks : [] });
}

// Fallback: simulate streaming for malformed-JSON case
async function simulateStream(text, emit, articleLinks) {
  const parts = text.split(/(\s+)/);
  let chunk   = '';
  for (let i = 0; i < parts.length; i++) {
    chunk += parts[i];
    if (i % 4 === 3 || i === parts.length - 1) {
      emit({ type: 'chunk', content: chunk });
      chunk = '';
      await new Promise(r => setTimeout(r, 6));
    }
  }
  emit({ type: 'answer', content: text, articleLinks: articleLinks.length ? articleLinks : [] });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProgressMessage(toolName, params) {
  switch (toolName) {
    case 'search_articles':      return `Buscando artículos sobre "${params.query || ''}"…`;
    case 'get_article_content':  return `Leyendo artículo "${params.slug || ''}"…`;
    case 'get_categories':       return 'Consultando categorías disponibles…';
    case 'get_recent_articles':  return `Obteniendo artículos ${params.sort === 'popular' ? 'populares' : 'recientes'}…`;
    default:                     return `Ejecutando ${toolName}…`;
  }
}

function summarizeResult(toolName, result) {
  if (result.error) return `Error: ${result.error}`;
  switch (toolName) {
    case 'search_articles':     return `${result.count ?? result.articles?.length ?? 0} artículo(s) encontrado(s)`;
    case 'get_article_content': return result.title ? `"${result.title}"` : 'Contenido obtenido';
    case 'get_categories':      return `${result.categories?.length ?? 0} categorías`;
    case 'get_recent_articles': return `${result.articles?.length ?? 0} artículo(s)`;
    default:                    return 'Completado';
  }
}

module.exports = { runAgent, runAgentStream };
