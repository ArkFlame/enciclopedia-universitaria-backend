/**
 * ai/agent.js
 * Agentic loop with real OpenRouter streaming for the final answer.
 *
 * Flow:
 *   1. "Tool discovery" turn: a dedicated non-streaming call asks the model
 *      ONLY whether it wants to use tools. If it outputs a <tool_call>, that
 *      tool is executed. Then we ask again (up to maxIterations) if it wants
 *      another tool. Only when the model stops calling tools do we move on.
 *   2. "Answer" turn: a real streaming call generates the final answer so the
 *      user sees genuine token-by-token output.
 *
 *   This two-phase design prevents the model from ever sending raw <tool_call>
 *   JSON to the user as chat text — tool calls are consumed before the answer
 *   stream starts.
 *
 * SSE events: tool_start | tool_done | tool_skip | tool_error | chunk | answer | error
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

  // Build base message list
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

  // ── Phase 1: Tool-call loop ─────────────────────────────────────────────────
  // Each iteration: ask the model if it wants a tool. If yes → execute → repeat.
  // If no tool call → break out and stream the final answer.

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`[Agent] Tool-discovery iteration ${iteration + 1}/${maxIterations}`);

    let response;
    try {
      response = await chat(messages, { maxTokens: 900, temperature: 0.6 });
    } catch (err) {
      console.error(`[Agent] chat() failed on iteration ${iteration + 1}:`, err.message);
      emit({ type: 'error', message: 'Error al consultar el modelo de IA.' });
      // Fall through to stream whatever we have so far
      break;
    }

    const toolMatch = response.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);

    if (!toolMatch) {
      // ── No tool call: model is done with tools ────────────────────────────
      // Add the planning turn to context so the streamed answer can use it.
      console.log(`[Agent] No tool call on iteration ${iteration + 1} — proceeding to stream answer`);

      // Only add the planning response if it has real content (not just empty)
      const planningContent = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      if (planningContent) {
        messages.push({ role: 'assistant', content: planningContent });
      }

      messages.push({
        role:    'user',
        content: 'Ahora responde al usuario de forma clara, amigable y académica.'
      });

      await doStreamAnswer(messages, emit, articleLinks);
      return;
    }

    // ── Tool call found ───────────────────────────────────────────────────────
    let toolCall;
    try {
      toolCall = JSON.parse(toolMatch[1]);
    } catch (parseErr) {
      // Malformed JSON in tool call — log it and stream the text directly
      console.error('[Agent] Malformed tool_call JSON:', toolMatch[1]);
      console.error('[Agent] Parse error:', parseErr.message);
      const cleanResponse = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      if (cleanResponse) {
        await simulateStream(cleanResponse, emit, articleLinks);
      } else {
        await doStreamAnswer(messages, emit, articleLinks);
      }
      return;
    }

    const { tool: toolName, params = {} } = toolCall;

    // Dedup: get_article_content
    if (toolName === 'get_article_content') {
      const slug = String(params.slug || '').trim();
      if (readSlugs.has(slug)) {
        console.log(`[Agent] Skipping duplicate get_article_content for slug: ${slug}`);
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
        console.log(`[Agent] Skipping duplicate search_articles for query: ${q}`);
        emit({ type: 'tool_skip', tool: toolName, message: `Ya busqué "${params.query}", usando resultados previos` });
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: `La búsqueda "${params.query}" ya fue realizada. Usa esos resultados.` });
        continue;
      }
      searchQueries.add(q);
    }

    console.log(`[Agent] Executing tool: ${toolName}`, params);
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
      console.log(`[Agent] Tool ${toolName} succeeded:`, summarizeResult(toolName, result));
      emit({
        type:          'tool_done',
        tool:          toolName,
        label:         TOOL_LABELS[toolName] || toolName,
        resultSummary: summarizeResult(toolName, result)
      });
    } catch (toolErr) {
      console.error(`[Agent] Tool ${toolName} failed:`, toolErr.message);
      console.error('[Agent] Tool error stack:', toolErr.stack);
      result = { error: toolErr.message };
      emit({ type: 'tool_error', tool: toolName, message: toolErr.message });
    }

    messages.push({ role: 'assistant', content: response });
    messages.push({ role: 'user',      content: buildToolResultMessage(toolName, result) });

    // Auto-read best article after a search to guarantee content is used
    if (toolName === 'search_articles' && result?.articles?.length) {
      const best = result.articles[0];
      const slug = String(best?.slug || '').trim();
      if (slug && !readSlugs.has(slug)) {
        readSlugs.add(slug);
        console.log(`[Agent] Auto-reading top search result: ${slug}`);

        emit({
          type: 'tool_start',
          tool: 'get_article_content',
          label: TOOL_LABELS.get_article_content || 'get_article_content',
          message: buildProgressMessage('get_article_content', { slug })
        });

        let readResult;
        try {
          readResult = await executeTool('get_article_content', { slug });
          if (readResult?.slug && readResult?.title) {
            articleLinks.push({ slug: readResult.slug, title: readResult.title });
          }
          console.log(`[Agent] Auto-read ${slug} succeeded:`, summarizeResult('get_article_content', readResult));
          emit({
            type:          'tool_done',
            tool:          'get_article_content',
            label:         TOOL_LABELS.get_article_content || 'get_article_content',
            resultSummary: summarizeResult('get_article_content', readResult)
          });
        } catch (readErr) {
          console.error(`[Agent] Auto-read of ${slug} failed:`, readErr.message);
          readResult = { error: readErr.message };
          emit({ type: 'tool_error', tool: 'get_article_content', message: readErr.message });
        }

        const syntheticCall = `<tool_call>\n${JSON.stringify({ tool: 'get_article_content', params: { slug } })}\n</tool_call>`;
        messages.push({ role: 'assistant', content: syntheticCall });
        messages.push({ role: 'user', content: buildToolResultMessage('get_article_content', readResult) });
      }
    }
  }

  // ── Phase 2 (fallback): Max iterations hit — stream with what we have ───────
  console.log(`[Agent] Max iterations (${maxIterations}) reached — streaming final answer`);
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
    console.log(`[Agent] Stream answer completed — ${fullText.length} chars`);
  } catch (err) {
    console.error('[Agent] streamChat failed:', err.message);
    console.error('[Agent] streamChat stack:', err.stack);
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
