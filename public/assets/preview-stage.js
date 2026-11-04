// InkDrafts preview stage: render each [data-preview-stage] iframe at a real
// desktop width (1280x800) and scale it down to its column, so a visitor sees
// the theme's desktop layout rather than the layout for the column's width.
// Without this script the iframe simply fills its column.
(function () {
  'use strict';
  var WIDTH = 1280;
  Array.prototype.forEach.call(document.querySelectorAll('[data-preview-stage]'), function (stage) {
    function fit() { stage.style.setProperty('--s', String(stage.clientWidth / WIDTH)); }
    stage.setAttribute('data-scaled', '');
    fit();
    if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(stage);
    else addEventListener('resize', fit);
  });
})();
