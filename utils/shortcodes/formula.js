/**
 * [formula]E = mc^2[/formula]
 */
module.exports = function formula(text) {
  return text.replace(/\[formula\]([\s\S]*?)\[\/formula\]/gi,
    (_, math) => {
      return `<div class="eu-formula" style="text-align:center;font-family:'Times New Roman',serif;font-size:1.2em;padding:12px;background:var(--eu-code-bg);border-radius:8px;margin:12px 0">\\(${math.trim()}\\)</div>`;
    }
  );
};
