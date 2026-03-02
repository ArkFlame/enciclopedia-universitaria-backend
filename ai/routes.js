/**
 * ai/routes.js
 * Express router for all AI endpoints — mounted at /api/ai.
 * Single responsibility: HTTP request handling + SSE streaming.
 */

const express       = require('express');
const router        = express.Router();
const rateLimit     = require('express-rate-limit');
const { runAgentStream, runAgent } = require('./agent');
const { chat }      = require('./openrouter');
const { optionalAuth } = require('../middleware/auth');

// AI-specific rate limit (separate from global)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT) || 20,
  message: { error: 'Nanami está descansando… demasiadas consultas. Intenta en unos minutos, miau.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + (req.user?.id || 'anon')
});

// ─── POST /api/ai/chat/stream ─────────────────────────────────────────────────
// Server-Sent Events streaming endpoint. Frontend connects here.
// Body: { message, history?, articleContext?, articleTitle? }
router.post('/chat/stream', aiLimiter, optionalAuth, async (req, res) => {
  const { message, history, articleContext, articleTitle } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Se requiere un mensaje' });
  }

  // Setup SSE
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) {
      const jsonString = JSON.stringify(data);
      const payload = `data: ${jsonString}\n\n`;
      res.write(Buffer.from(payload, 'utf8'));
    }
  };

  // Handle client disconnect
  req.on('close', () => { /* agent will finish naturally */ });

  try {
    await runAgentStream({
      userMessage:    message.trim(),
      history:        Array.isArray(history) ? history : [],
      articleContext: typeof articleContext === 'string' ? articleContext : null,
      articleTitle:   typeof articleTitle   === 'string' ? articleTitle   : null,
      emit: send
    });
  } catch (err) {
    console.error('[AI stream error]', err.message);
    send({ type: 'error', message: 'Error interno de Nanami AI. Inténtalo de nuevo.' });
  }

  send({ type: 'done' });
  res.end();
});

// ─── POST /api/ai/chat ────────────────────────────────────────────────────────
// Non-streaming fallback endpoint.
// Body: { message, history?, articleContext?, articleTitle? }
router.post('/chat', aiLimiter, optionalAuth, async (req, res) => {
  const { message, history, articleContext, articleTitle } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Se requiere un mensaje' });
  }

  try {
    const result = await runAgent({
      userMessage:    message.trim(),
      history:        Array.isArray(history) ? history : [],
      articleContext: typeof articleContext === 'string' ? articleContext : null,
      articleTitle:   typeof articleTitle   === 'string' ? articleTitle   : null
    });

    res.json({
      answer:    result.answer,
      toolsUsed: result.toolsUsed?.map(t => ({ tool: t.tool, summary: t.params })) || []
    });
  } catch (err) {
    console.error('[AI chat error]', err.message);
    res.status(500).json({ error: 'Error interno de Nanami AI. Inténtalo de nuevo.' });
  }
});

// ─── POST /api/ai/simple ──────────────────────────────────────────────────────
// Direct model call without agent (for quick completions).
// Body: { prompt, context?, maxTokens? }
router.post('/simple', aiLimiter, optionalAuth, async (req, res) => {
  const { prompt, context, maxTokens = 600 } = req.body || {};

  if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

  try {
    const messages = [];
    if (context) messages.push({ role: 'system', content: String(context).slice(0, 2000) });
    messages.push({ role: 'user', content: String(prompt).slice(0, 2000) });

    const answer = await chat(messages, { maxTokens: Math.min(parseInt(maxTokens) || 600, 2000) });
    res.json({ answer });
  } catch (err) {
    console.error('[AI simple error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ai/health ───────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    configured: !!process.env.OPENROUTER_API_KEY,
    model:      process.env.AI_MODEL || 'arcee-ai/trinity-large-preview:free',
    status:     'ok'
  });
});

module.exports = router;
