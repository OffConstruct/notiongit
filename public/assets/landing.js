// InkDrafts landing: the studio on /. The form works without this (it submits
// the chosen design and color scheme to /connect). This adds the live preview,
// the chosen theme's scheme pills, accent presets and other options with the
// theme pages' controls, a "Your name" field the preview reflects, carries the
// choice onto every CTA and theme link, remembers it for a returning visitor,
// and lets a gallery card pick its theme. Field names follow the worker's
// t_<key> conventions, so the submitted query carries every choice.
(function () {
  'use strict';
  var form = document.querySelector('form[data-landing-customizer]');
  var dataNode = document.getElementById('landing-data');
  var slot = document.getElementById('options-slot');
  var schemeBox = form && form.querySelector('[data-scheme]');
  var other = form && form.querySelector('[data-theme-other]');
  var otherNote = form && form.querySelector('[data-picked-other]');
  var nameInput = form && form.querySelector('[data-preview-name]');
  var status = document.getElementById('preview-status');
  var stage = document.querySelector('[data-preview-stage]');
  if (!form || !dataNode || !slot || !schemeBox || !other || !stage) return;
  var data;
  try { data = JSON.parse(dataNode.textContent); } catch (e) { return; }
  var STORE = 'inkdrafts:look';
  var shown = null;
  // Keys the visitor set by hand. Only these carry over to another theme;
  // an untouched pill is the old theme's default, not a choice.
  var touched = {};
  var fineOpen = false;
  var nameTimer = null;
  Array.prototype.forEach.call(document.querySelectorAll('[data-js-only]'), function (node) { node.hidden = false; });

  function frame() { return document.getElementById('theme-preview'); }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = props[k];
      else if (k in node) node[k] = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function themeId() {
    var radio = form.querySelector('input[name="theme"]:checked');
    if (radio && data.themes[radio.value]) return radio.value;
    return !other.disabled && data.themes[other.value] ? other.value : null;
  }

  // A featured design is its radio; any other comes through the hidden field.
  function setTheme(id) {
    var radio = form.querySelector('input[type="radio"][name="theme"][value="' + id + '"]');
    Array.prototype.forEach.call(form.querySelectorAll('input[type="radio"][name="theme"]'), function (r) { r.checked = r === radio; });
    other.disabled = !!radio;
    other.value = id;
    if (otherNote) {
      otherNote.hidden = !!radio;
      otherNote.textContent = radio ? '' : 'Chosen from all designs: ' + data.themes[id].name + ' ✓';
    }
  }

  // Every t_ field of the form, last value wins (a checkbox follows its
  // hidden "off"), minus the theme's defaults. A Custom accent is its hex.
  function tweaks(id) {
    var theme = data.themes[id], defaults = { mode: theme.mode }, out = {}, custom = {};
    if (theme.accent) defaults.accent = theme.accent.default;
    theme.more.forEach(function (t) { defaults[t[1]] = t[3]; });
    new FormData(form).forEach(function (value, name) {
      if (name.indexOf('t_') === 0) out[name.slice(2)] = String(value);
      if (name.indexOf('c_') === 0) custom[name.slice(2)] = String(value).toLowerCase();
    });
    Object.keys(out).forEach(function (key) {
      if (out[key] === 'custom' && custom[key]) out[key] = custom[key];
      if (!(key in defaults) || out[key] === defaults[key]) delete out[key];
    });
    return out;
  }

  function query(id, t) {
    var p = new URLSearchParams();
    p.set('theme', id);
    Object.keys(t).forEach(function (k) { p.set('t_' + k, t[k]); });
    return p.toString();
  }

  // The worker renders a non-default look itself (/preview/), so the first
  // paint is already right; the default look is the static export.
  function previewUrl(id, t, name) {
    var p = new URLSearchParams();
    Object.keys(t).forEach(function (k) { p.set('t_' + k, t[k]); });
    if (name) p.set('name', name);
    var s = p.toString();
    return s ? '/preview/' + id + '/?' + s : '/previews/' + id + '/';
  }

  function effectiveScheme(id, t) {
    var mode = t.mode || data.themes[id].mode;
    if (mode === 'auto') return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return mode;
  }

  // Pills up to data.pillLimit options, then a select: the theme pages' rule.
  function pills(name, idBase, list, current, swatch) {
    return list.map(function (option, index) {
      var id = idBase + '-' + index;
      var dot = swatch ? el('span', { className: 'swatch' }) : null;
      if (dot) dot.style.background = swatch(option);
      return el('span', { className: 'choice' }, [
        el('input', { type: 'radio', name: name, id: id, value: option[0], checked: option[0] === current }),
        el('label', { htmlFor: id }, [dot, document.createTextNode(option[1])]),
      ]);
    });
  }

  function choices(name, idBase, legend, list, current) {
    if (list.length > data.pillLimit) {
      return el('div', { className: 'option' }, [
        el('label', { htmlFor: idBase, className: 'head', text: legend }),
        el('select', { id: idBase, name: name }, list.map(function (option) {
          return el('option', { value: option[0], text: option[1], selected: option[0] === current });
        })),
      ]);
    }
    return el('fieldset', { className: 'option' }, [el('legend', { text: legend }), el('div', { className: 'choices' }, pills(name, idBase, list, current))]);
  }

  function field(t, index) {
    var type = t[0], key = t[1], label = t[2], value = t[3], id = 'opt-' + key + '-' + index;
    if (type === 'select') return choices('t_' + key, id, label, t[4], value);
    if (type === 'boolean') {
      return el('div', { className: 'option toggle' }, [
        el('input', { type: 'hidden', name: 't_' + key, value: 'off' }),
        el('input', { type: 'checkbox', name: 't_' + key, id: id, value: 'on', checked: value === 'on' }),
        el('label', { htmlFor: id, text: label }),
      ]);
    }
    var output = el('output', { htmlFor: id, text: value + t[7] });
    var range = el('input', { type: 'range', name: 't_' + key, id: id, min: t[4], max: t[5], step: t[6], value: value });
    range.addEventListener('input', function () { output.textContent = range.value + t[7]; });
    return el('div', { className: 'option range' }, [el('label', { htmlFor: id, text: label }), range, output]);
  }

  function renderScheme(id, current) {
    var theme = data.themes[id];
    schemeBox.textContent = '';
    pills('t_mode', 'mode', theme.modes, current || theme.mode).forEach(function (node) { schemeBox.appendChild(node); });
  }

  // Swatches show the value for the scheme the site will actually use.
  function renderAccent(id, current, scheme) {
    var theme = data.themes[id], accent = theme.accent, box = slot.querySelector('[data-accent]');
    if (box) box.remove();
    if (!accent) return;
    var list = accent.presets.slice();
    var isCustom = current && current.charAt(0) === '#';
    var nodes = pills('t_accent', 'accent', list, isCustom ? 'custom' : (current || accent.default), function (option) {
      return scheme === 'dark' ? option[3] : option[2];
    });
    if (accent.custom) {
      var hex = isCustom ? current : (list.filter(function (o) { return o[0] === accent.default; })[0] || list[0])[2];
      nodes.push(el('span', { className: 'choice' }, [
        el('input', { type: 'radio', name: 't_accent', id: 'accent-custom', value: 'custom', checked: !!isCustom }),
        el('label', { htmlFor: 'accent-custom', text: 'Custom' }),
        el('input', { type: 'color', name: 'c_accent', id: 'accent-hex', value: hex, 'aria-label': accent.label + ' custom color' }),
      ]));
    }
    box = el('fieldset', { className: 'option', 'data-accent': '' }, [el('legend', { text: accent.label }), el('div', { className: 'choices' }, nodes)]);
    slot.insertBefore(box, slot.firstChild);
  }

  function renderMore(id, t) {
    var theme = data.themes[id], details = slot.querySelector('details');
    if (details) { fineOpen = details.open; details.remove(); }
    var more = theme.more.map(function (opt, index) {
      var copy = opt.slice();
      if (t[opt[1]] !== undefined) copy[3] = t[opt[1]];
      return field(copy, index);
    });
    details = el('details', { className: 'fine-tune', open: fineOpen }, [
      el('summary', {}, [document.createTextNode('Fine-tune '), el('small', { text: more.length + ' more option' + (more.length === 1 ? '' : 's') + ', all optional' })]),
      el('div', { className: 'option-grid' }, more.concat([
        el('p', { className: 'fine' }, [
          document.createTextNode('Every choice is on '),
          el('a', { href: '/themes/' + id, 'data-theme-page': '' }, [el('span', { 'data-theme-name': '', text: theme.name }), document.createTextNode('’s page')]),
          document.createTextNode(' too, and in your site settings after setup.'),
        ]),
      ])),
    ]);
    details.addEventListener('toggle', function () { fineOpen = details.open; });
    slot.appendChild(details);
  }

  function renderOptions(id, t) {
    renderScheme(id, t.mode);
    renderAccent(id, t.accent, effectiveScheme(id, t));
    renderMore(id, t);
  }

  // Every CTA and theme link carries the current choice.
  function syncLinks(id, t) {
    var q = query(id, t);
    Array.prototype.forEach.call(document.querySelectorAll('[data-carry]'), function (a) { a.href = data.connect + '?' + q; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-page]'), function (a) { a.href = '/themes/' + id + (Object.keys(t).length ? '?' + query(id, t).replace(/^theme=[^&]*&?/, '') : ''); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-preview-full]'), function (a) { a.href = previewUrl(id, t, name()); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-name]'), function (n) { n.textContent = data.themes[id].name; });
  }

  function name() { return nameInput ? nameInput.value.trim().slice(0, 60) : ''; }

  function remember(id, t) {
    try { localStorage.setItem(STORE, JSON.stringify({ theme: id, tweaks: t })); } catch (e) { /* private window or blocked storage */ }
  }

  // Double-buffered by preview-stage.js when present; a plain swap otherwise.
  function show(url) {
    var event = new CustomEvent('inkdrafts:preview', { cancelable: true, detail: { src: url } });
    if (stage.dispatchEvent(event)) { var f = frame(); if (f) f.src = url; }
  }

  function post(id) {
    var f = frame();
    if (f && f.contentWindow) {
      f.contentWindow.postMessage({ type: 'inkdrafts:tweaks', v: 1, theme: id, tweaks: tweaks(id) }, location.origin);
    }
  }

  // A change made while the preview is scrolled away says where to see it.
  var peekLink = document.querySelector('[data-peek]'), peekTimer;
  function peek() {
    if (!peekLink || stage.getBoundingClientRect().bottom > 0) return;
    peekLink.hidden = false;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(function () { peekLink.hidden = true; }, 4000);
  }

  function update(event) {
    var id = themeId();
    if (!id) return;
    var t = tweaks(id);
    if (id !== shown) {
      var first = shown === null;
      shown = id;
      Object.keys(t).forEach(function (k) { if (!touched[k]) delete t[k]; });
      renderOptions(id, t);
      t = tweaks(id);
      var f = frame();
      if (!first || !f || f.getAttribute('src').indexOf('/previews/' + id + '/') !== 0 || name()) show(previewUrl(id, t, name()));
      if (status && event) status.textContent = 'Preview shows ' + data.themes[id].name + '. ' + data.themes[id].summary;
    } else {
      var target = event && event.target;
      if (target && target.name === 't_mode') renderAccent(id, t.accent, effectiveScheme(id, t));
      post(id);
      peek();
    }
    syncLinks(id, t);
    if (event) remember(id, t);
  }

  // A plain click on a gallery card tries that theme here; modified clicks
  // still open the theme's own page.
  Array.prototype.forEach.call(document.querySelectorAll('a[data-pick]'), function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('data-pick');
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !data.themes[id]) return;
      event.preventDefault();
      setTheme(id);
      update(event);
      var heading = document.getElementById('start-heading');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
        heading.focus({ preventScroll: true });
      }
    });
  });

  if (nameInput) {
    nameInput.addEventListener('input', function () {
      clearTimeout(nameTimer);
      nameTimer = setTimeout(function () {
        var id = themeId();
        if (!id) return;
        show(previewUrl(id, tweaks(id), name()));
        syncLinks(id, tweaks(id));
      }, 500);
    });
  }

  form.addEventListener('change', function (event) {
    var n = event.target.name || '';
    if (n.indexOf('t_') === 0 || n.indexOf('c_') === 0) touched[n.slice(2)] = true;
    if (n === 'theme') setTheme(event.target.value);
    if (event.target.name === 'c_accent') { var r = form.querySelector('#accent-custom'); if (r) r.checked = true; }
    if (event.target === nameInput) return;
    update(event);
  });
  form.addEventListener('input', function (event) {
    if (event.target.type === 'range' || event.target.type === 'color') update(event);
  });
  stage.addEventListener('inkdrafts:preview-shown', function () { if (shown) post(shown); });
  addEventListener('message', function (e) {
    var x = e.data, f = frame();
    if (e.origin !== location.origin || !f || e.source !== f.contentWindow) return;
    if (x && x.type === 'inkdrafts:ready' && x.v === 1 && x.theme === shown) post(shown);
  });

  // A visitor who comes back (from creating a GitHub account, or from the
  // connect page's "Pick another look") finds their look where they left it.
  function restore() {
    var params = new URLSearchParams(location.search), saved = null;
    if (!data.themes[params.get('theme')]) {
      try { saved = JSON.parse(localStorage.getItem(STORE)); } catch (e) { saved = null; }
      if (!saved || !data.themes[saved.theme]) return;
      params = new URLSearchParams();
      params.set('theme', saved.theme);
      Object.keys(saved.tweaks || {}).forEach(function (k) { params.set('t_' + k, saved.tweaks[k]); });
    }
    var id = params.get('theme'), t = {};
    params.forEach(function (v, k) { if (k.indexOf('t_') === 0) { t[k.slice(2)] = v; touched[k.slice(2)] = true; } });
    setTheme(id);
    shown = id;
    renderOptions(id, t);
    if (params.toString().replace(/^theme=[^&]*&?/, '')) show(previewUrl(id, tweaks(id), ''));
    else if (frame() && frame().getAttribute('src').indexOf('/previews/' + id + '/') !== 0) show(previewUrl(id, {}, ''));
  }
  // A link into a closed FAQ answer (the hero's "What's that?") opens it.
  function reveal() {
    var target = location.hash && document.getElementById(location.hash.slice(1));
    var details = target && target.closest('details');
    if (details) details.open = true;
  }
  addEventListener('hashchange', reveal);
  reveal();
  restore();
  update(null);
})();
