/**
 * [tabs]
 *   [tab title="Tab 1"]Contenido 1[/tab]
 *   [tab title="Tab 2"]Contenido 2[/tab]
 * [/tabs]
 */
const { escapeHtml } = require('./index').utils;

module.exports = function tabs(text) {
  return text.replace(/\[tabs\]([\s\S]*?)\[\/tabs\]/gi,
    (_, tabsContent) => {
      const tabRegex = /\[tab\s+title="([^"]+)"\]([\s\S]*?)\[\/tab\]/gi;
      let tabs = [];
      let match;
      const tabsId = `eu-tabs-${Date.now()}`;
      while ((match = tabRegex.exec(tabsContent)) !== null) {
        tabs.push({ title: match[1], content: match[2].trim() });
      }
      if (!tabs.length) return tabsContent;
      const navItems = tabs.map((t, i) => `
        <li class="nav-item" role="presentation">
          <button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#${tabsId}-tab${i}" type="button" role="tab">${escapeHtml(t.title)}</button>
        </li>`).join('');
      const panes = tabs.map((t, i) => `
        <div class="tab-pane fade ${i === 0 ? 'show active' : ''}" id="${tabsId}-tab${i}" role="tabpanel">${t.content}</div>`).join('');
      return `<div class="eu-tabs my-3">
        <ul class="nav nav-tabs" role="tablist">${navItems}</ul>
        <div class="tab-content p-3 border border-top-0 rounded-bottom">${panes}</div>
      </div>`;
    }
  );
};
