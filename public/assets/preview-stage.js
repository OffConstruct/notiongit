// InkDrafts preview stage: render each [data-preview-stage] iframe at a real
// device width and scale it down to its column, so a visitor sees the theme's
// own layout rather than the layout for the column's width. "Computer" is
// 1280x800; "Phone" is 390x737 inside a phone outline, and is the default on
// narrow screens, where a scaled desktop is unreadable. Without this script
// the iframe simply fills its column.
//
// A theme switch is double-buffered: the page dispatches a cancelable
// `inkdrafts:preview` event with `detail.src` on the stage; this script loads
// the new document in a second, transparent iframe and fades it in once it
// has loaded, so the old look never flashes blank. If the event is not
// cancelled (script missing), the page sets `src` itself.
(function () {
  'use strict';
  var SIZES = { desktop: [1280, 800], phone: [390, 737] };
  var narrow = window.matchMedia && matchMedia('(max-width: 44rem)').matches;

  Array.prototype.forEach.call(document.querySelectorAll('[data-preview-stage]'), function (stage) {
    var frame = stage.querySelector('iframe');
    if (!frame) return;
    var holder = frame.parentNode;
    var tools = stage.parentNode.querySelector('[data-device-toggle]');
    var device = narrow ? 'phone' : 'desktop';

    function fit() {
      var width = SIZES[device][0];
      stage.style.setProperty('--s', String(stage.clientWidth / width));
    }
    function setDevice(next) {
      device = next;
      stage.setAttribute('data-device', device);
      if (tools) {
        Array.prototype.forEach.call(tools.querySelectorAll('[data-device]'), function (button) {
          button.setAttribute('aria-pressed', String(button.getAttribute('data-device') === device));
        });
      }
      fit();
    }

    stage.setAttribute('data-scaled', '');
    setDevice(device);
    if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(stage);
    else addEventListener('resize', fit);

    if (tools) {
      tools.hidden = false;
      tools.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('[data-device]');
        if (button && SIZES[button.getAttribute('data-device')]) setDevice(button.getAttribute('data-device'));
      });
    }

    var pending = null;
    stage.addEventListener('inkdrafts:preview', function (event) {
      var src = event.detail && event.detail.src;
      if (!src) return;
      event.preventDefault();
      if (pending) { pending.remove(); pending = null; }
      var current = stage.querySelector('iframe');
      var next = document.createElement('iframe');
      next.setAttribute('data-next', '');
      next.setAttribute('title', current.getAttribute('title') || '');
      next.setAttribute('tabindex', '-1');
      pending = next;
      stage.setAttribute('data-loading', '');
      next.addEventListener('load', function () {
        if (pending !== next) return;
        pending = null;
        stage.removeAttribute('data-loading');
        // The id moves with the live document, so page scripts always find
        // the frame they should post to.
        current.removeAttribute('id');
        next.id = 'theme-preview';
        next.removeAttribute('data-next');
        var swap = function () { if (current.parentNode) current.remove(); };
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) swap();
        else setTimeout(swap, 340);
        stage.dispatchEvent(new CustomEvent('inkdrafts:preview-shown', { detail: { src: src } }));
      });
      next.src = src;
      holder.appendChild(next);
    });
  });
})();
