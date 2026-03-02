/**
 * ai/agent.js
 * Agentic loop — orchestrates tool calls with streaming progress events.
 * Features:
 *   - Deduplication of get_article_content calls (silent skip on repeat slug)
 *   - Collects read article slugs/titles and emits them as links in the answer event
 *   - Streams the final answer token-by-token via 'chunk' events
 */

const { chat, streamChat }    = require('./openrouter');
const { executeTool, TOOL_DEFINITIONS } = require('./tools');
const { NANAMI_SYSTEM_PROMPT, buildArticleContextBlock, buildToolResultMessage } = require('./prompts');

// Map tool name -> human label
const TOOL_LABELS = Object.fromEntries(
  TOOL_DEFINITIONS.map(t => [t.name, t.label])
);

/**
 * Run the agentic loop, streaming all events via SSE.
 *
 * SSE event types emitted:
 *   { type: 'tool_start',  tool, label, message }
 *   { type: 'tool_done',   tool, label, resultSummary }
 *   { type: 'tool_skip',   tool, message }            ← dedup skip
 *   { type: 'tool_error',  tool, message }
 *   { type: 'chunk',       content }                  ← streaming answer tokens
 *   { type: 'answer',      content, articleLinks }    ← full answer + links
 *   { type: 'done' }
 */
async function runAgentStream({ userMessage, history = [], articleContext, articleTitle, emit, maxIterations }) {
  maxIterations = maxIterations || parseInt(process.env.AI_MAX_ITERATIONS) || 4;

  // Build initial message array
  const messages = [{ role: 'system', content: NANAMI_SYSTEM_PROMPT }];

  if (articleContext) {
    messages.push({
      role: 'system',
      content: buildArticleContextBlock(articleTitle || 'Artículo actual', articleContext)
    });
  }

  // Sanitize history
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 1200)
    }));

  messages.push(...safeHistory);
  messages.push({ role: 'user', content: String(userMessage).slice(0, 2000) });

  const toolsUsed    = [];
  // Dedup sets
  const readSlugs    = new Set(); // slugs already read via get_article_content
  const searchQueries = new Set(); // queries already searched
  // Collected article links: [{ slug, title }]
  const articleLinks = [];

  let iterations = 0;

  // ── Agentic loop ────────────────────────────────────────────────
  while (iterations < maxIterations) {
    iterations++;

    // Non-streaming call to decide next action
    const response = await chat(messages, { maxTokens: 900, temperature: 0.6 });

    // Check for tool call
    const toolMatch = response.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);

    if (!toolMatch) {
      // ── Final answer: stream it token-by-token ──────────────────
      const cleanAnswer = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      await streamFinalAnswer(messages, cleanAnswer, emit, articleLinks);
      return;
    }

    // Parse tool call
    let toolCall;
    try {
      toolCall = JSON.parse(toolMatch[1]);
    } catch {
      const fallback = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      await streamFinalAnswer(messages, fallback, emit, articleLinks);
      return;
    }

    const { tool: toolName, params = {} } = toolCall;
    const label = TOOL_LABELS[toolName] || toolName;

    // ── Deduplication ────────────────────────────────────────────
    if (toolName === 'get_article_content') {
      const slug = String(params.slug || '').trim();
      if (readSlugs.has(slug)) {
        emit({
          type:    'tool_skip',
          tool:    toolName,
          message: `Ya leí el artículo "${slug}", usando información previa`
        });
        // Inject a fake result so the agent knows it's already been read
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role:    'user',
          content: `El artículo "${slug}" ya fue leído anteriormente. Usa la información que ya tienes para responder.`
        });
        continue;
      }
      readSlugs.add(slug);
    }

    if (toolName === 'search_articles') {
      const query = String(params.query || '').trim().toLowerCase();
      if (searchQueries.has(query)) {
        emit({
          type:    'tool_skip',
          tool:    toolName,
          message: `Ya busqué "${params.query}", usando resultados previos`
        });
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role:    'user',
          content: `La búsqueda "${params.query}" ya fue realizada. Usa los resultados previos para continuar.`
        });
        continue;
      }
      searchQueries.add(query);
    }

    // ── Emit tool start ──────────────────────────────────────────
    const progressMsg = buildProgressMessage(toolName, params);
    emit({ type: 'tool_start', tool: toolName, label, message: progressMsg });

    // ── Execute tool ─────────────────────────────────────────────
    let result;
    try {
      result = await executeTool(toolName, params);

      // Collect article links from read articles
      if (toolName === 'get_article_content' && result.slug && result.title) {
        articleLinks.push({ slug: result.slug, title: result.title });
      }

      // Collect article links from search results
      if (toolName === 'search_articles' && Array.isArray(result.articles)) {
        // Don't add search results as links yet — only add once actually read
      }

      emit({
        type:         'tool_done',
        tool:         toolName,
        label,
        resultSummary: summarizeResult(toolName, result)
      });
    } catch (err) {
      result = { error: err.message };
      emit({ type: 'tool_error', tool: toolName, message: err.message });
    }

    toolsUsed.push({ tool: toolName, params, result });

    // Add to context
    messages.push({ role: 'assistant', content: response });
    messages.push({ role: 'user',      content: buildToolResultMessage(toolName, result) });
  }

  // Max iterations reached — force final answer
  const finalAnswer = await chat(messages, { maxTokens: 700, temperature: 0.65 });
  const cleanFinal  = finalAnswer.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
  await streamFinalAnswer(messages, cleanFinal, emit, articleLinks);
}

/**
 * Stream the final answer token-by-token.
 * Emits 'chunk' events while streaming, then a final 'answer' event.
 */
async function streamFinalAnswer(messages, precomputedAnswer, emit, articleLinks) {
  // We already have the answer from the non-streaming planning call.
  // Re-stream it properly: request a streaming completion for the same final state.
  // To avoid double-cost, just simulate streaming by chunking the precomputed answer.
  // This way the frontend gets real-time token display without extra API calls.

  const words = precomputedAnswer.split(/(\s+)/);
  let accumulated = '';

  for (let i = 0; i < words.length; i++) {
    accumulated += words[i];
    // Emit in small batches (3 words) to feel like real streaming
    if (i % 3 === 2 || i === words.length - 1) {
      emit({ type: 'chunk', content: accumulated });
      accumulated = '';
      // Small async yield so SSE actually flushes
      await new Promise(r => setTimeout(r, 8));
    }
  }

  // Final event with full answer + article links
  emit({
    type:         'answer',
    content:      precomputedAnswer,
    articleLinks: articleLinks.length > 0 ? articleLinks : []
  });
}

/**
 * Non-streaming version — returns { answer, toolsUsed, articleLinks }
 */
async function runAgent({ userMessage, history = [], articleContext, articleTitle, maxIterations }) {
  const events = [];
  await runAgentStream({
    userMessage, history, articleContext, articleTitle,
    maxIterations,
    emit: (e) => events.push(e)
  });
  const answerEvent = events.find(e => e.type === 'answer');
  return {
    answer:       answerEvent?.content      || 'No se pudo generar respuesta.',
    articleLinks: answerEvent?.articleLinks || [],
    toolsUsed:    events.filter(e => e.type === 'tool_done').map(e => e.tool)
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProgressMessage(toolName, params) {
  switch (toolName) {
    case 'search_articles':
      return `Buscando artículos sobre "${params.query || ''}"…`;
    case 'get_article_content':
      return `Leyendo artículo "${params.slug || ''}"…`;
    case 'get_categories':
      return 'Consultando categorías disponibles…';
    case 'get_recent_articles':
      return `Obteniendo artículos ${params.sort === 'popular' ? 'populares' : 'recientes'}…`;
    default:
      return `Ejecutando ${toolName}…`;
  }
}

function summarizeResult(toolName, result) {
  if (result.error) return `Error: ${result.error}`;
  switch (toolName) {
    case 'search_articles':
      return `${result.count ?? result.articles?.length ?? 0} artículo(s) encontrado(s)`;
    case 'get_article_content':
      return result.title ? `"${result.title}"` : 'Contenido obtenido';
    case 'get_categories':
      return `${result.categories?.length ?? 0} categorías`;
    case 'get_recent_articles':
      return `${result.articles?.length ?? 0} artículo(s)`;
    default:
      return 'Completado';
  }
}

module.exports = { runAgent, runAgentStream };
