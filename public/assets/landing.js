// InkDrafts landing: live preview for the "Make it yours" form on /.
// The form works without this (it submits the theme and color scheme to
// /connect/github). This adds the chosen theme's accent presets and its other
// options with the theme pages' controls, swaps the preview iframe when the
// theme changes and posts tweaks to it otherwise (read by the template's
// preview.js), names the theme on the button, and lets a gallery card pick
// its theme. Field names follow the worker's t_<key> conventions, so the
// submitted query carries every choice.
(function () {
  'use strict';
  var form = document.querySelector('form[data-landing-customizer]');
  var frame = document.getElementById('theme-preview');
  var dataNode = document.getElementById('landing-data');
  var slot = document.getElementById('options-slot');
  var picker = document.getElementById('theme-pick');
  var status = document.getElementById('preview-status');
  if (!form || !frame || !dataNode || !slot || !picker) return;
  var data;
  try { data = JSON.parse(dataNode.textContent); } catch (e) { return; }
  var stage = frame.parentNode;
  var shown = null;
  var moreOpen = false;
  var pageLink = form.querySelector('[data-theme-page]');
  Array.prototype.forEach.call(form.querySelectorAll('[data-js-hidden]'), function (node) { node.hidden = true; });
  if (pageLink) pageLink.hidden = false;

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
    return data.themes[picker.value] ? picker.value : null;
  }

  // Every t_ field of the form, last value wins (a checkbox follows its
  // hidden "off"), minus the theme's defaults.
  function tweaks(id) {
    var theme = data.themes[id], defaults = { mode: '' }, out = {};
    if (theme.accent) defaults.accent = theme.accent.default;
    theme.more.forEach(function (t) { defaults[t[1]] = t[3]; });
    new FormData(form).forEach(function (value, name) {
      if (name.indexOf('t_') === 0) out[name.slice(2)] = String(value);
    });
    Object.keys(out).forEach(function (key) {
      if (!(key in defaults) || out[key] === defaults[key]) delete out[key];
    });
    return out;
  }

  // The worker renders a non-default look itself (/preview/), so the first
  // paint is already right; the default look is the static export.
  function previewUrl(id, t) {
    var query = Object.keys(t).map(function (k) {
      return 't_' + k + '=' + encodeURIComponent(t[k]);
    }).join('&');
    return query ? '/preview/' + id + '/?' + query : '/previews/' + id + '/';
  }

  // Pills up to data.pillLimit options, then a select: the theme pages' rule.
  function choices(name, idBase, legend, list, current, dots) {
    if (!dots && list.length > data.pillLimit) {
      return el('div', { className: 'option' }, [
        el('label', { htmlFor: idBase, className: 'head', text: legend }),
        el('select', { id: idBase, name: name }, list.map(function (option) {
          return el('option', { value: option[0], text: option[1], selected: option[0] === current });
        })),
      ]);
    }
    return el('fieldset', { className: 'option' }, [
      el('legend', { text: legend }),
      el('div', { className: 'choices' }, list.map(function (option, index) {
        var id = idBase + '-' + index;
        var dot = dots ? el('span', { className: 'swatch' }) : null;
        if (dot) dot.style.background = option[2];
        return el('span', { className: 'choice' }, [
          el('input', { type: 'radio', name: name, id: id, value: option[0], checked: option[0] === current }),
          el('label', { htmlFor: id }, [dot, document.createTextNode(option[1])]),
        ]);
      })),
    ]);
  }

  function field(t, index) {
    var type = t[0], key = t[1], label = t[2], value = t[3], id = 'opt-' + key + '-' + index;
    if (type === 'select') return choices('t_' + key, id, label, t[4], value, false);
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

  function renderOptions(id) {
    var theme = data.themes[id];
    var details = slot.querySelector('details');
    if (details) moreOpen = details.open;
    slot.textContent = '';
    if (theme.accent) {
      slot.appendChild(choices('t_accent', 'accent', theme.accent.label, theme.accent.presets, theme.accent.default, true));
    }
    if (theme.more.length) {
      details = el('details', { className: 'more-options', open: moreOpen }, [
        el('summary', { text: 'More options for ' + theme.name }),
        el('div', { className: 'option-grid' }, theme.more.map(field)),
      ]);
      details.addEventListener('toggle', function () { moreOpen = details.open; });
      slot.appendChild(details);
    }
  }

  function post(id) {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'inkdrafts:tweaks', v: 1, theme: id, tweaks: tweaks(id) }, location.origin);
    }
  }

  function update(event) {
    var id = themeId();
    if (!id) return;
    if (id !== shown) {
      shown = id;
      renderOptions(id);
      Array.prototype.forEach.call(form.querySelectorAll('[data-theme-name]'), function (node) {
        node.textContent = data.themes[id].name;
      });
      if (pageLink) pageLink.setAttribute('href', '/themes/' + id);
      if (event || frame.getAttribute('src').indexOf('/previews/' + id + '/') !== 0) {
        stage.setAttribute('data-loading', '');
        frame.src = previewUrl(id, tweaks(id));
      }
      if (status && event) status.textContent = 'Preview shows ' + data.themes[id].name + '.';
    } else {
      post(id);
    }
  }

  // A plain click on a gallery card tries that theme here; modified clicks
  // still open the theme's own page.
  Array.prototype.forEach.call(document.querySelectorAll('a[data-pick]'), function (link) {
    link.addEventListener('click', function (event) {
      var id = link.getAttribute('data-pick');
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !data.themes[id]) return;
      event.preventDefault();
      picker.value = id;
      update(event);
      var motion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      form.scrollIntoView({ behavior: motion, block: 'start' });
      picker.focus({ preventScroll: true });
    });
  });

  frame.addEventListener('load', function () { stage.removeAttribute('data-loading'); });
  form.addEventListener('change', update);
  form.addEventListener('input', function (event) {
    if (event.target.type === 'range') update(event);
  });
  addEventListener('message', function (e) {
    var x = e.data;
    if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (x && x.type === 'inkdrafts:ready' && x.v === 1 && x.theme === shown) post(shown);
  });
  update(null);
})();
