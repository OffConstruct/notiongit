// InkDrafts preview tweaks, copied into preview builds only. Applies
// ?t_<key>=<value> and same-origin inkdrafts:tweaks messages with the rules of
// _includes/ink/tweaks.html, and ?name= / inkdrafts:name messages.
(function () {
  'use strict';
  var d = document, root = d.documentElement, node = d.getElementById('ink-manifest'), m;
  if (!node) return;
  try { m = JSON.parse(node.textContent); } catch (e) { return; }
  var state = {};
  function find(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i];
    return null;
  }
  function valid(tw, v) {
    var t = tw.type;
    if (t === 'select') return typeof v === 'string' && find(tw.options, v) ? v : undefined;
    if (t === 'boolean') {
      if (v === true || v === 'true' || v === 'on') return true;
      if (v === false || v === 'false' || v === 'off') return false;
    }
    if (t === 'color' && typeof v === 'string') {
      if (find(tw.presets, v)) return v;
      v = v.toLowerCase();
      if (tw.custom && /^#[0-9a-f]{6}$/.test(v)) return v;
    }
    if (t === 'range') {
      var n = typeof v === 'number' ? v : (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN), k = (n - tw.min) / tw.step;
      if (n >= tw.min && n <= tw.max && Math.abs(k - Math.round(k)) < 1e-6) return n;
    }
    if (t === 'font' && find(m.fonts, v)) return v;
  }
  function apply(input) {
    var vars = '', pairing = m.fonts[0], fonts = true, scheme = 'light dark';
    state = {};
    m.tweaks.forEach(function (tw) {
      var v = valid(tw, input[tw.key]);
      if (v === undefined) v = tw.default;
      else if (v !== tw.default) state[tw.key] = v;
      var n = tw.key.replace(/_/g, '-'), attr = 'data-ink-' + n, p;
      if (tw.type === 'select') {
        root.setAttribute(attr, v);
        if (tw.key === 'mode' && v !== 'auto') scheme = v;
      } else if (tw.type === 'boolean') {
        root.setAttribute(attr, v ? 'on' : 'off');
        if (tw.key === 'webfonts') fonts = v;
      } else if (tw.type === 'color') {
        p = find(tw.presets, v);
        root.setAttribute(attr, p ? v : 'custom');
        vars += '--tw-' + n + ':' + (p ? p.light + ';--tw-' + n + '-dark:' + p.dark : v) + ';';
        if (p && p.on) vars += '--tw-' + n + '-on:' + p.on + ';';
      } else if (tw.type === 'range') {
        vars += '--tw-' + n + ':' + v + tw.unit + ';';
      } else if (tw.type === 'font') {
        root.setAttribute('data-ink-font', v);
        pairing = find(m.fonts, v);
      }
    });
    var s = pairing.stacks;
    vars += '--tw-font-body:' + s.body + ';--tw-font-display:' + s.display + ';--tw-font-mono:' + s.mono + ';';
    var style = d.getElementById('ink-tweaks'), meta = d.querySelector('meta[name="color-scheme"]'),
      link = d.getElementById('ink-fonts');
    if (style) style.textContent = ':root{' + vars + '}';
    if (meta) meta.setAttribute('content', scheme);
    if (fonts && pairing.google) {
      if (!link) {
        link = d.createElement('link');
        link.id = 'ink-fonts';
        link.rel = 'stylesheet';
        d.head.appendChild(link);
      }
      var href = 'https://fonts.googleapis.com/css2?' + pairing.google + '&display=swap';
      if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    } else if (link) {
      link.remove();
    }
  }

  // The visitor's own name in place of the sample name (?name=, or an
  // inkdrafts:name message), so a preview reads as their site. Text only.
  var sample = (d.querySelector('meta[property="og:site_name"]') || {}).content || 'Rowan Vale', shown = sample;
  function rename(value) {
    var next = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    next = next || sample;
    if (next === shown) return;
    var from = shown, done = [];
    shown = next;
    d.title = d.title.split(from).join(next);
    // A name split across spans (a styled first word, say) becomes one text node.
    d.body.querySelectorAll('*').forEach(function (el) {
      if (!el.children.length || el.querySelector('img, svg, picture') || done.some(function (p) { return p.contains(el); })) return;
      if (el.textContent.replace(/\s+/g, ' ').trim() === from) { el.textContent = next; done.push(el); }
    });
    var walk = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT), node;
    while ((node = walk.nextNode())) {
      if (node.nodeValue.indexOf(from) !== -1) node.nodeValue = node.nodeValue.split(from).join(next);
    }
  }

  var initial = {}, query = new URLSearchParams(location.search);
  query.forEach(function (v, k) {
    if (k.indexOf('t_') === 0) initial[k.slice(2)] = v;
  });
  apply(initial);
  if (query.has('name')) rename(query.get('name'));

  addEventListener('message', function (e) {
    var x = e.data;
    if (e.origin !== location.origin || e.source !== parent) return;
    if (!x || x.v !== 1) return;
    if (x.type === 'inkdrafts:name') return rename(x.name);
    if (x.type !== 'inkdrafts:tweaks' || x.theme !== m.id) return;
    if (x.tweaks && typeof x.tweaks === 'object') apply(x.tweaks);
  });

  // Keep the current tweaks on same-origin navigation inside the preview.
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.origin !== location.origin) return;
    var url = new URL(a.href);
    Array.from(url.searchParams.keys()).forEach(function (k) {
      if (k.indexOf('t_') === 0) url.searchParams.delete(k);
    });
    Object.keys(state).forEach(function (k) { url.searchParams.set('t_' + k, String(state[k])); });
    if (shown !== sample) url.searchParams.set('name', shown); else url.searchParams.delete('name');
    a.href = url.href;
  });

  if (parent !== window) parent.postMessage({ type: 'inkdrafts:ready', v: 1, theme: m.id }, location.origin);
})();
