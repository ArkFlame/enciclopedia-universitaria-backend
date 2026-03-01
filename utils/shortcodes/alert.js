/**
 * [alert type="info|warning|danger|success"]Mensaje[/alert]
 */
module.exports = function alert(text) {
  return text.replace(/\[alert\s+type="([^"]+)"\]([\s\S]*?)\[\/alert\]/gi,
    (_, type, content) => {
      const types = { info: 'info', warning: 'warning', danger: 'danger', success: 'success' };
      const t = types[type] || 'info';
      return `<div class="alert alert-${t} eu-alert" role="alert">${content.trim()}</div>`;
    }
  );
};
