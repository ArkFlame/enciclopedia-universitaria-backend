/**
 * ai/agent.js
 * Agentic loop — orchestrates tool calls with streaming progress events.
 * Single responsibility: run the agent loop and emit SSE events.
 */

const { chat }                = require('./openrouter');
const { executeTool, TOOL_DEFINITIONS } = require('./tools');
const { NANAMI_SYSTEM_PROMPT, buildArticleContextBlock, buildToolResultMessage } = require('./prompts');

// Map tool name -> human label for progress events
const TOOL_LABELS = Object.fromEntries(
  TOOL_DEFINITIONS.map(t => [t.name, t.label])
);

/**
 * Run the agentic loop and stream progress + final answer via SSE.
 *
 * @param {Object} opts
 * @param {string}   opts.userMessage    - The user's query
 * @param {Array}    opts.history        - [{role, content}] last N exchanges
 * @param {string}   opts.articleContext - Raw article content if user is on article page
 * @param {string}   opts.articleTitle   - Article title for context block
 * @param {function} opts.emit           - SSE emitter: emit({ type, ... })
 * @param {number}   opts.maxIterations  - Max tool calls before forced answer
 */
async function runAgentStream({ userMessage, history = [], articleContext, articleTitle, emit, maxIterations }) {
  maxIterations = maxIterations || parseInt(process.env.AI_MAX_ITERATIONS) || 4;

  // Build message array
  const messages = [{ role: 'system', content: NANAMI_SYSTEM_PROMPT }];

  if (articleContext) {
    messages.push({
      role: 'system',
      content: buildArticleContextBlock(articleTitle || 'Artículo actual', articleContext)
    });
  }

  // Sanitize + add history (last 10 messages = 5 exchanges)
  const safeHistory = (Array.isArray(history) ? history : [])
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) }));

  messages.push(...safeHistory);
  messages.push({ role: 'user', content: String(userMessage).slice(0, 2000) });

  const toolsUsed = [];
  let iterations  = 0;

  emit({ type: 'thinking', message: 'Procesando tu pregunta…' });

  while (iterations < maxIterations) {
    iterations++;

    // Call the model
    const response = await chat(messages, { maxTokens: 900, temperature: 0.6 });

    // Check for tool call
    const toolMatch = response.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/);

    if (!toolMatch) {
      // Final answer — clean any stray tags
      const answer = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      emit({ type: 'answer', content: answer, toolsUsed });
      return;
    }

    // Parse tool call
    let toolCall;
    try {
      toolCall = JSON.parse(toolMatch[1]);
    } catch {
      // Malformed JSON → treat as final answer
      emit({ type: 'answer', content: response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(), toolsUsed });
      return;
    }

    const { tool: toolName, params = {} } = toolCall;
    const label = TOOL_LABELS[toolName] || toolName;

    // Emit progress to frontend
    const progressMsg = buildProgressMessage(toolName, params);
    emit({ type: 'tool_start', tool: toolName, label, message: progressMsg });

    // Execute the tool
    let result;
    try {
      result = await executeTool(toolName, params);
      emit({ type: 'tool_done', tool: toolName, label, resultSummary: summarizeResult(toolName, result) });
    } catch (err) {
      result = { error: err.message };
      emit({ type: 'tool_error', tool: toolName, message: err.message });
    }

    toolsUsed.push({ tool: toolName, params, result });

    // Add exchange to messages for context
    messages.push({ role: 'assistant', content: response });
    messages.push({ role: 'user', content: buildToolResultMessage(toolName, result) });
  }

  // Max iterations hit — force a final answer
  emit({ type: 'thinking', message: 'Sintetizando respuesta final…' });
  const finalAnswer = await chat(messages, { maxTokens: 700, temperature: 0.65 });
  emit({ type: 'answer', content: finalAnswer.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(), toolsUsed });
}

/**
 * Non-streaming version — returns { answer, toolsUsed }
 * Used for simple requests or fallback.
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
    answer:     answerEvent?.content || 'No se pudo generar respuesta.',
    toolsUsed:  answerEvent?.toolsUsed || []
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      return result.title ? `Artículo: "${result.title}"` : 'Contenido obtenido';
    case 'get_categories':
      return `${result.categories?.length ?? 0} categorías`;
    case 'get_recent_articles':
      return `${result.articles?.length ?? 0} artículo(s)`;
    default:
      return 'Completado';
  }
}

module.exports = { runAgent, runAgentStream };
