/* Shifter Punkz — tiny template runtime.
 * Renders a <template id="dc-tpl"> with {{holes}}, <sc-for list as>, <sc-if value>,
 * on* event attributes, and a Component class (state + renderVals), patching the DOM
 * in place so CSS animations and input focus survive re-renders. */
(function () {
  'use strict';
  var HOLE = /\{\{([^}]*)\}\}/g;
  var EVENTS = ['click', 'input', 'change', 'submit', 'keydown'];
  var handlers = [];
  var scheduled = false;
  var renderFn = null;

  function schedule() {
    if (scheduled || !renderFn) return;
    scheduled = true;
    var run = function () { scheduled = false; renderFn(); };
    if (window.queueMicrotask) queueMicrotask(run); else setTimeout(run, 0);
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (u) {
    var patch = typeof u === 'function' ? u(this.state, this.props) : u;
    this.state = Object.assign({}, this.state, patch || {});
    schedule();
  };
  DCLogic.prototype.componentDidMount = function () {};
  DCLogic.prototype.componentWillUnmount = function () {};
  window.DCLogic = DCLogic;

  function lookup(scope, expr) {
    var path = expr.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    var v = scope;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function wholeHole(s) { var m = /^\s*\{\{([^}]*)\}\}\s*$/.exec(s); return m ? m[1] : null; }
  function fill(s, scope) {
    return s.replace(HOLE, function (_, e) { var v = lookup(scope, e); return v == null ? '' : String(v); });
  }

  function renderNode(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(fill(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var list = lookup(scope, wholeHole(node.getAttribute('list')) || '') || [];
      var as = node.getAttribute('as') || 'item';
      for (var i = 0; i < list.length; i++) {
        var child = Object.create(scope);
        child[as] = list[i];
        renderKids(node, child, out);
      }
      return;
    }
    if (tag === 'sc-if') {
      var h = wholeHole(node.getAttribute('value') || '');
      if (h != null && lookup(scope, h)) renderKids(node, scope, out);
      return;
    }
    var el = node.cloneNode(false);
    var attrs = Array.prototype.slice.call(node.attributes);
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name, val = attrs[a].value;
      if (val.indexOf('{{') === -1) continue;
      var whole = wholeHole(val);
      if (/^on[a-z]+$/i.test(name)) {
        el.removeAttribute(name);
        var fn = whole != null ? lookup(scope, whole) : null;
        if (typeof fn === 'function') {
          handlers.push(fn);
          el.setAttribute('data-dc-' + name.slice(2).toLowerCase(), String(handlers.length - 1));
        }
        continue;
      }
      if (whole != null) {
        var v = lookup(scope, whole);
        if (v === false || v == null) el.removeAttribute(name);
        else el.setAttribute(name, v === true ? '' : String(v));
      } else {
        el.setAttribute(name, fill(val, scope));
      }
    }
    var kids = [];
    renderKids(node, scope, kids);
    for (var k = 0; k < kids.length; k++) el.appendChild(kids[k]);
    // a textarea ignores its value attribute: give a freshly built one its text so it shows saved content
    if (tag === 'textarea' && el.hasAttribute('value')) el.textContent = el.getAttribute('value');
    out.push(el);
  }
  function renderKids(node, scope, out) {
    var src = node.content || node; // <template> support
    for (var c = src.firstChild; c; c = c.nextSibling) renderNode(c, scope, out);
  }

  function same(a, b) { return a.nodeType === b.nodeType && a.nodeName === b.nodeName; }
  function morph(a, b) {
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var i, at;
    var olds = Array.prototype.slice.call(a.attributes);
    for (i = 0; i < olds.length; i++) if (!b.hasAttribute(olds[i].name)) a.removeAttribute(olds[i].name);
    for (i = 0; i < b.attributes.length; i++) {
      at = b.attributes[i];
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
    if ((a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && b.hasAttribute('value')) {
      var nv = b.getAttribute('value');
      if (a.value !== nv) a.value = nv;
    }
    morphKids(a, b);
  }
  function morphKids(a, b) {
    var an = Array.prototype.slice.call(a.childNodes);
    var bn = Array.prototype.slice.call(b.childNodes);
    for (var i = 0; i < bn.length; i++) {
      var x = an[i], y = bn[i];
      if (!x) a.appendChild(y);
      else if (same(x, y)) morph(x, y);
      else a.replaceChild(y, x);
    }
    for (var j = bn.length; j < an.length; j++) a.removeChild(an[j]);
  }

  function readLang() { try { return localStorage.getItem('sp-lang'); } catch (e) { return null; } }
  function saveLang(l) { try { localStorage.setItem('sp-lang', l); } catch (e) {} }

  window.DC = {
    mount: function (Component, root) {
      var tpl = document.getElementById('dc-tpl');
      var inst = new Component({});
      var saved = readLang();
      if ('lang' in inst.state && (saved === 'th' || saved === 'en')) inst.state.lang = saved;
      EVENTS.forEach(function (type) {
        root.addEventListener(type, function (e) {
          var t = e.target && e.target.closest ? e.target.closest('[data-dc-' + type + ']') : null;
          if (!t || !root.contains(t)) return;
          var fn = handlers[+t.getAttribute('data-dc-' + type)];
          if (typeof fn === 'function') fn(e);
        });
      });
      var first = true;
      renderFn = function () {
        handlers = [];
        var vals = inst.renderVals();
        var box = document.createElement('div');
        var out = [];
        renderKids(tpl, vals, out);
        for (var i = 0; i < out.length; i++) box.appendChild(out[i]);
        if (first) { while (box.firstChild) root.appendChild(box.firstChild); first = false; }
        else morphKids(root, box);
        if (inst.state.lang) { document.documentElement.lang = inst.state.lang; saveLang(inst.state.lang); }
      };
      renderFn();
      inst.componentDidMount();
      if (location.hash) {
        var target = document.getElementById(location.hash.slice(1));
        if (target) setTimeout(function () { target.scrollIntoView(); }, 0);
      }
      window.addEventListener('pagehide', function () { inst.componentWillUnmount(); });
      return inst;
    }
  };
})();
