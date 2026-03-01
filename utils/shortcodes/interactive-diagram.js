/**
 * [interactive-diagram] - DEPRECATED
 * Shows migration notice to use [mapa-sinoptico]
 */
module.exports = function interactiveDiagram(text) {
  return text.replace(/\[interactive-diagram(?:\s+[^\]]*)??\]([\s\S]*?)\[\/interactive-diagram\]/gi,
    () => {
      return `<div class="eu-alert alert alert-warning" style="font-size:.85rem">
        <strong>⚠️ Diagrama interactivo deprecado.</strong> Por favor reemplaza con <code>[mapa-sinoptico]</code>.<br>
        <small>Ejemplo:<br>
        <code>[mapa-sinoptico name="Células"]<br>Célula -> Eucariota<br>Eucariota -> Procariota<br>[/mapa-sinoptico]</code></small>
      </div>`;
    }
  );
};
