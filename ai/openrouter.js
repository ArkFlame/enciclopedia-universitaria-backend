/**
 * ai/openrouter.js
 * OpenRouter API client — single responsibility: HTTP to OpenRouter.
 *
 * Changes:
 *   - Global request queue: all API calls are serialized with a 100ms gap,
 *     so concurrent requests from multiple users are processed one at a time.
 *   - Full error logging with body/status details on every failure.
 */

const DEFAULT_MODEL = process.env.AI_MODEL || 'arcee-ai/trinity-large-preview:free';
const API_KEY = () => process.env.OPENROUTER_API_KEY;
const BASE_URL = 'https://openrouter.ai/api/v1';

function headers() {
  return {
    'Authorization': `Bearer ${API_KEY()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.FRONTEND_URL || 'https://enciclopedia-universitaria.com',
    'X-Title': 'Enciclopedia Universitaria - Nanami AI'
  };
}

// ─── Global API Queue ─────────────────────────────────────────────────────────
// Serializes all OpenRouter calls with a 100ms gap between them.
// When many users send messages simultaneously, requests are processed
// one by one, each 100ms apart, preventing API overload.

let _queuePromise = Promise.resolve();
const QUEUE_GAP_MS = parseInt(process.env.AI_QUEUE_GAP_MS) || 100;
let _queueDepth = 0;

function enqueue(fn) {
  _queueDepth++;
  const depth = _queueDepth;
  if (depth > 1) {
    console.log(`[OpenRouter Queue] Request queued — position ${depth} in queue`);
  }

  const result = _queuePromise.then(() => {
    if (depth > 1) {
      console.log(`[OpenRouter Queue] Processing queued request (was position ${depth})`);
    }
    return fn();
  });

  // Chain: after this call finishes (success or error), wait QUEUE_GAP_MS before next
  _queuePromise = result
    .catch(() => {})
    .then(() => {
      _queueDepth = Math.max(0, _queueDepth - 1);
      return new Promise(r => setTimeout(r, QUEUE_GAP_MS));
    });

  return result;
}

// ─── Non-streaming chat completion ────────────────────────────────────────────

async function chat(messages, opts = {}) {
  return enqueue(() => _chat(messages, opts));
}

async function _chat(messages, opts = {}) {
  if (!API_KEY()) throw new Error('OPENROUTER_API_KEY no configurada');

  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages,
    max_tokens: opts.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 1500,
    temperature: opts.temperature ?? 0.65,
    stream: false
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    console.error('[OpenRouter] Network error on chat():', networkErr.message);
    console.error('[OpenRouter] Stack:', networkErr.stack);
    throw new Error(`OpenRouter network error: ${networkErr.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(could not read body)');
    console.error(`[OpenRouter] chat() HTTP ${res.status} error`);
    console.error(`[OpenRouter] Response body: ${errBody}`);
    throw new Error(`OpenRouter ${res.status}: ${errBody}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error('[OpenRouter] chat() failed to parse JSON response:', parseErr.message);
    throw new Error(`OpenRouter response parse error: ${parseErr.message}`);
  }

  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    console.warn('[OpenRouter] chat() returned empty content. Full response:', JSON.stringify(data));
  }
  return content;
}

// ─── Streaming chat ───────────────────────────────────────────────────────────

async function streamChat(messages, opts = {}, onChunk) {
  return enqueue(() => _streamChat(messages, opts, onChunk));
}

async function _streamChat(messages, opts = {}, onChunk) {
  if (!API_KEY()) throw new Error('OPENROUTER_API_KEY no configurada');

  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages,
    max_tokens: opts.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 1500,
    temperature: opts.temperature ?? 0.65,
    stream: true
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    console.error('[OpenRouter] Network error on streamChat():', networkErr.message);
    console.error('[OpenRouter] Stack:', networkErr.stack);
    throw new Error(`OpenRouter network error: ${networkErr.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(could not read body)');
    console.error(`[OpenRouter] streamChat() HTTP ${res.status} error`);
    console.error(`[OpenRouter] Response body: ${errBody}`);
    throw new Error(`OpenRouter ${res.status}: ${errBody}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try {
          const parsed = JSON.parse(raw);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            chunkCount++;
            onChunk(content);
          }
        } catch (parseErr) {
          if (raw && raw !== '[DONE]') {
            console.warn('[OpenRouter] streamChat() failed to parse SSE chunk:', raw.slice(0, 200));
          }
        }
      }
    }
  } catch (readErr) {
    console.error('[OpenRouter] streamChat() stream read error:', readErr.message);
    console.error('[OpenRouter] Stack:', readErr.stack);
    throw readErr;
  }

  if (chunkCount === 0) {
    console.warn('[OpenRouter] streamChat() completed with 0 chunks — stream may have been empty or failed silently');
  }
}

module.exports = { chat, streamChat, DEFAULT_MODEL };
