// InkDrafts customizer: live preview for /themes/<id> and /status/appearance.
// The pages work without it; this posts the tweak form's values to the
// same-origin preview iframe (read by the template's preview.js), keeps the
// address bar in step, hides the no-JS buttons, switches the design as soon
// as the design <select> changes (the page reloads with the choice carried
// over), and keeps the "Unsaved changes" cue in step with the form. Values
// are validated with the worker's rules (src/theme-catalog.ts), so the
// preview shows what a save would store.
(function () {
  'use strict';
  var form = document.querySelector('form[data-customizer]');
  var frame = function () { return document.getElementById('theme-preview'); };
  var dataNode = document.getElementById('customizer-data');
  if (!form || !frame() || !dataNode) return;
  var data;
  try { data = JSON.parse(dataNode.textContent); } catch (e) { return; }
  Array.prototype.forEach.call(document.querySelectorAll('[data-js-hidden], [data-theme-switch-submit]'), function (node) { node.hidden = true; });
  var SWITCHED = 'inkdrafts:switched';

  function linear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function rgb(hex) { return [1, 3, 5].map(function (i) { return linear(parseInt(hex.slice(i, i + 2), 16) / 255); }); }
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // The theme's dark-mode lift of a custom color, oklch(from c max(l, 0.74) c h);
  // the same math as darkLifted in src/theme-catalog.ts.
  function lifted(c) {
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    if (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s >= 0.74) return c;
    var a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    var l2 = Math.pow(0.74 + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m2 = Math.pow(0.74 - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s2 = Math.pow(0.74 - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
      -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
      -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
    ].map(function (v) {
      // Round-trip through 8-bit sRGB, as the worker's hex result does.
      v = Math.min(Math.max(v, 0), 1);
      v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      return linear(Math.round(v * 255) / 255);
    });
  }
  // The worst ratio over the grounds the chosen color scheme shows.
  function verdict(tw, hex, mode) {
    var c = rgb(hex), worst = null;
    if (mode !== 'dark') worst = { ground: 'light', ratio: contrast(c, rgb(data.lightBg)) };
    if (mode !== 'light') {
      var dark = contrast(lifted(c), rgb(data.darkBg));
      if (!worst || dark < worst.ratio) worst = { ground: 'dark', ratio: dark };
    }
    worst.needed = tw.role === 'large' ? 3 : 4.5;
    worst.ok = worst.ratio >= worst.needed;
    return worst;
  }
  function last(fd, name) { var all = fd.getAll(name); return all.length ? String(all[all.length - 1]) : undefined; }
  function has(list, v) { return list.some(function (x) { return x.value === v; }); }
  function onStep(tw, n) { var k = (n - tw.min) / tw.step; return Math.abs(k - Math.round(k)) < 1e-6; }
  function modeOf(fd) {
    var tw = data.tweaks.filter(function (t) { return t.key === 'mode'; })[0];
    if (!tw) return undefined;
    var v = last(fd, 't_mode');
    return v !== undefined && has(tw.options, v) ? v : tw.default;
  }

  function valid(tw, v, mode) {
    if (v === undefined) return undefined;
    if (tw.type === 'select') return has(tw.options, v) ? v : undefined;
    if (tw.type === 'boolean') {
      if (v === 'on' || v === 'true') return true;
      if (v === 'off' || v === 'false') return false;
      return undefined;
    }
    if (tw.type === 'color') {
      if (has(tw.presets, v)) return v;
      v = v.toLowerCase();
      if (tw.custom && tw.role !== 'surface' && /^#[0-9a-f]{6}$/.test(v) && verdict(tw, v, mode).ok) return v;
      return undefined;
    }
    if (tw.type === 'range') {
      var n = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
      return n >= tw.min && n <= tw.max && onStep(tw, n) ? n : undefined;
    }
    if (tw.type === 'font') return data.fonts.indexOf(v) >= 0 ? v : undefined;
  }

  function read() {
    var fd = new FormData(form), out = {}, mode = modeOf(fd);
    data.tweaks.forEach(function (tw) {
      var raw = last(fd, 't_' + tw.key);
      if (raw === 'custom' && tw.type === 'color') raw = last(fd, 'c_' + tw.key);
      var v = valid(tw, raw, mode);
      if (v !== undefined && v !== tw.default) out[tw.key] = v;
    });
    if (out.font === 'device') { delete out.font; out.webfonts = false; }
    return out;
  }

  function verdicts() {
    var mode = modeOf(new FormData(form));
    data.tweaks.forEach(function (tw) {
      if (tw.type !== 'color' || !tw.custom) return;
      var out = form.querySelector('output[data-contrast-for="' + tw.key + '"]');
      var input = form.querySelector('input[name="c_' + tw.key + '"]');
      var radio = form.querySelector('input[name="t_' + tw.key + '"][value="custom"]');
      if (!out || !input) return;
      if (!radio || !radio.checked) { out.textContent = ''; return; }
      var r = verdict(tw, input.value.toLowerCase(), mode);
      out.textContent = r.ok
        ? 'Contrast ' + r.ratio.toFixed(1) + ':1, readable.'
        : (r.ground === 'light' ? 'Too light on the light background' : 'Too dark on the dark background') +
          ' (' + r.ratio.toFixed(1) + ':1, needs ' + r.needed + ':1), so this color will not be saved.';
    });
    Array.prototype.forEach.call(form.querySelectorAll('input[type="range"]'), function (input) {
      var out = form.querySelector('output[for="' + input.id + '"]');
      var tw = data.tweaks.filter(function (t) { return 't_' + t.key === input.name; })[0];
      if (out && tw) out.textContent = input.value + tw.unit;
    });
  }

  function post() {
    var f = frame();
    if (!f || !f.contentWindow) return;
    f.contentWindow.postMessage({ type: 'inkdrafts:tweaks', v: 1, theme: data.theme, tweaks: read() }, location.origin);
  }

  // The cue the server set (selected differs from saved) stays; on top of it,
  // any edit since the page loaded counts as unsaved until it is undone.
  var cues = document.querySelectorAll('[data-unsaved-cue]');
  var serverDirty = cues.length ? !cues[0].hidden : false;
  var loaded = JSON.stringify(read());
  function dirty() {
    var now = serverDirty || JSON.stringify(read()) !== loaded;
    Array.prototype.forEach.call(cues, function (cue) { cue.hidden = !now; });
    form.dispatchEvent(new CustomEvent('inkdrafts:dirty', { detail: { dirty: now } }));
    return now;
  }

  function syncUrl() {
    var url = new URL(location.href), tweaks = read();
    Array.from(url.searchParams.keys()).forEach(function (k) {
      if (/^(t_|c_)/.test(k) || k === 'token' || k === 'saved') url.searchParams.delete(k);
    });
    if (location.pathname.indexOf('/status/') === 0) url.searchParams.set('theme', data.theme);
    Object.keys(tweaks).forEach(function (k) { url.searchParams.set('t_' + k, String(tweaks[k])); });
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  }

  function update(event) {
    var t = event && event.target;
    if (t && t.type === 'color' && /^c_/.test(t.name)) {
      var radio = form.querySelector('input[name="t_' + t.name.slice(2) + '"][value="custom"]');
      if (radio) radio.checked = true;
    }
    verdicts();
    post();
    syncUrl();
    dirty();
  }

  // Changing the design is a navigation: the worker renders the new theme's
  // controls and keeps whichever t_* it declares. Focus returns to the select.
  var switcher = document.getElementById('theme-switch');
  if (switcher) {
    switcher.addEventListener('change', function () {
      var url = new URL(switcher.form ? switcher.form.action : location.href);
      url.search = '';
      url.searchParams.set('theme', switcher.value);
      var tweaks = read();
      Object.keys(tweaks).forEach(function (k) { url.searchParams.set('t_' + k, String(tweaks[k])); });
      var href = url.pathname + url.search;
      // Cancelable, so a page script (the unsaved-changes bar) can hold the navigation.
      if (!form.dispatchEvent(new CustomEvent('inkdrafts:switch', { cancelable: true, detail: { href: href, theme: switcher.value } }))) return;
      try { sessionStorage.setItem(SWITCHED, '1'); } catch (e) { /* storage blocked */ }
      location.assign(href);
    });
    try {
      if (sessionStorage.getItem(SWITCHED)) {
        sessionStorage.removeItem(SWITCHED);
        switcher.focus({ preventScroll: true });
      }
    } catch (e) { /* storage blocked */ }
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  addEventListener('message', function (e) {
    var x = e.data, f = frame();
    if (e.origin !== location.origin || !f || e.source !== f.contentWindow) return;
    if (x && x.type === 'inkdrafts:ready' && x.v === 1 && x.theme === data.theme) post();
  });
  verdicts();
})();
