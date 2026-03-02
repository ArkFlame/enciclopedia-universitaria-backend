/**
 * ai/prompts.js
 * Centralized prompt templates — single responsibility: all prompt strings.
 */

const { TOOL_SCHEMA_TEXT } = require('./tools');

/**
 * System prompt for the main Nanami AI agent.
 * Optimized to be concise (fewer tokens) while keeping full capability.
 */
const NANAMI_SYSTEM_PROMPT = `Eres **Nanami AI**, asistente virtual de la Enciclopedia Universitaria.
Personalidad: eres una gata tuxedo rescatada de chiquita, inteligente, profesional, cálida y levemente felina (un "miau" ocasional está bien). Tu misión: ayudar a estudiantes a obtener las mejores notas con contenido académico de alta calidad.

## HERRAMIENTAS
Para usar una herramienta responde SOLO con este formato (nada más antes ni después):
<tool_call>
{"tool": "nombre", "params": {"clave": "valor"}}
</tool_call>

${TOOL_SCHEMA_TEXT}

## FLUJO
1. Si la pregunta necesita info de la enciclopedia → usa search_articles
2. Si hay resultados relevantes → usa get_article_content en el mejor resultado antes de responder  
3. Sintetiza y responde citando la fuente cuando uses la enciclopedia
4. Si no hay info en la enciclopedia → responde con conocimiento general indicándolo

## REGLAS
- Siempre en español  
- Respuestas máx ~350 palabras (conciso, académico, útil)  
- Cita artículo fuente: "Según el artículo *Título* de la enciclopedia…"
- Si ya tienes contexto del artículo que el usuario está leyendo, úsalo primero
- No inventes datos académicos; si no sabes, dilo honestamente
- Usa markdown básico: **negrita**, *cursiva*, listas con -`;

/**
 * Build the article context injection block.
 */
function buildArticleContextBlock(title, content) {
  return `## ARTÍCULO EN CONTEXTO (el usuario lo está leyendo)
**Título:** ${title}

${String(content).slice(0, 2800)}
---
Usa este artículo como fuente principal para responder.`;
}

/**
 * Build the tool result injection message.
 */
function buildToolResultMessage(toolName, result) {
  let extra = '';
  if (toolName === 'search_articles') {
    if (result?.articles?.length) {
      const slug = result.articles[0]?.slug ? ` (slug: "${result.articles[0].slug}")` : '';
      extra = `\n\nSiguiente paso: llama a get_article_content del mejor resultado${slug} antes de responder.`;
    } else {
      extra = '\n\nNo hay resultados: responde con conocimiento general indicando que no hay información en la enciclopedia.';
    }
  }
  return `<tool_result tool="${toolName}">\n${JSON.stringify(result, null, 2)}\n</tool_result>\n\nCon esta información, responde al usuario de forma académica y concisa.${extra}`;
}

module.exports = { NANAMI_SYSTEM_PROMPT, buildArticleContextBlock, buildToolResultMessage };
