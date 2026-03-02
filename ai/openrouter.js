/**
 * ai/openrouter.js
 * OpenRouter API client — single responsibility: HTTP to OpenRouter.
 */

const DEFAULT_MODEL = process.env.AI_MODEL || 'arcee-ai/trinity-large-preview:free';
const API_KEY = () => process.env.OPENROUTER_API_KEY;
const BASE_URL = 'https://openrouter.ai/api/v1';

function headers() {
  return {
    'Authorization': `Bearer ${API_KEY()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.FRONTEND_URL || 'https://enciclopedia-universitaria.com',
    // Header values must be ByteString-compatible (0-255). Avoid Unicode punctuation like em-dash (U+2014).
    'X-Title': 'Enciclopedia Universitaria - Nanami AI'
  };
}

/**
 * Non-streaming chat completion.
 * @param {Array<{role,content}>} messages
 * @param {Object} opts
 * @returns {Promise<string>} assistant text
 */
async function chat(messages, opts = {}) {
  if (!API_KEY()) throw new Error('OPENROUTER_API_KEY no configurada');

  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages,
    max_tokens: opts.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 1500,
    temperature: opts.temperature ?? 0.65,
    stream: false
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Streaming chat — calls onChunk(text) for each token.
 * @param {Array} messages
 * @param {Object} opts
 * @param {function} onChunk - called with each text chunk
 * @returns {Promise<void>}
 */
async function streamChat(messages, opts = {}, onChunk) {
  if (!API_KEY()) throw new Error('OPENROUTER_API_KEY no configurada');

  const body = {
    model: opts.model || DEFAULT_MODEL,
    messages,
    max_tokens: opts.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 1500,
    temperature: opts.temperature ?? 0.65,
    stream: true
  };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
        if (content) onChunk(content);
      } catch { /* ignore parse errors on malformed chunks */ }
    }
  }
}

module.exports = { chat, streamChat, DEFAULT_MODEL };
