/* Shifter Punkz dice roller: a roll tray for the sheet / GM Monitor and pop-up cards for other people's rolls.
 *
 *   SPDice.tray({ th, who, color, label, base, cosmic: [{ name, n }], ex, adv, enervated, free, secretOk,
 *                 onRoll(payload, spend), onDone(payload, spend), post(payload) })
 *   SPDice.show(payload, th)      // someone else's roll: a card that tumbles, then shows the result
 *   SPDice.score(dice)            // { r, from, k } — highest die; each matching die adds +1, capped at that die's top face
 *
 * A roll is D8s (D4s once Exhaustion turns them), plus Cosmic Dice. The result is the highest die;
 * when several dice show the same number that number goes up by 1 per extra die, never past the die's top face.
 * A natural pair of [8] gives +1 Surge Energy. After the roll, Advance pts move faces up or down by 1 each.
 */
(function () {
  'use strict';
  if (window.SPDice) return;

  var C = { bg: '#0B0A12', panel: '#151225', head: '#1D1930', line: '#2A2740', line2: '#3A3655', text: '#D8D6E8', dim: '#8C88A6',
    cyan: '#2EE6F0', pink: '#FF2E88', yellow: '#FFD400', purple: '#C084FC', grey: '#A9A5C2', green: '#4ADE80' };
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var css = '' +
    '.spd-back{position:fixed;inset:0;z-index:2147483647;background:rgba(6,5,12,.78);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"IBM Plex Sans Thai",system-ui,sans-serif;color:' + C.text + '}' +
    '.spd-card{width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:' + C.panel + ';border:1px solid ' + C.line + ';border-top:3px solid var(--acc);box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '.spd-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:' + C.head + ';border-bottom:1px solid ' + C.line + '}' +
    '.spd-t{margin:0;font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:16px;letter-spacing:.08em;color:#fff;text-transform:uppercase}' +
    '.spd-sub{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.06em;color:' + C.dim + '}' +
    '.spd-x{width:34px;height:34px;border:1px solid ' + C.line2 + ';background:transparent;color:' + C.text + ';cursor:pointer;font-size:14px}' +
    '.spd-b{padding:14px;display:flex;flex-direction:column;gap:12px}' +
    '.spd-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}' +
    '.spd-lbl{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:' + C.dim + ';min-width:92px}' +
    '.spd-step{display:inline-flex;align-items:center;gap:6px}' +
    '.spd-step button{width:30px;height:30px;border:1px solid ' + C.line2 + ';background:' + C.bg + ';color:' + C.text + ';cursor:pointer;font-weight:700}' +
    '.spd-step button:disabled{opacity:.35;cursor:default}' +
    '.spd-step b{min-width:22px;text-align:center;font-family:"Chakra Petch",sans-serif;font-size:17px;color:#fff}' +
    '.spd-chip{min-height:32px;padding:0 10px;border:1px solid ' + C.line2 + ';background:transparent;color:' + C.text + ';cursor:pointer;font-family:"Chakra Petch",sans-serif;font-weight:600;font-size:13px}' +
    '.spd-chip[aria-pressed="true"]{background:' + C.purple + ';border-color:' + C.purple + ';color:' + C.bg + '}' +
    '.spd-note{margin:0;font-size:12.5px;line-height:1.6;color:' + C.dim + '}' +
    '.spd-warn{margin:0;font-size:12.5px;line-height:1.6;color:' + C.yellow + '}' +
    '.spd-tray{position:relative;min-height:150px;padding:18px 10px;background:' + C.bg + ';border:1px solid ' + C.line + ';display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;gap:14px 12px;overflow:hidden;' +
      'background-image:linear-gradient(rgba(46,230,240,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,240,.05) 1px,transparent 1px);background-size:24px 24px}' +
    '.spd-die{display:flex;flex-direction:column;align-items:center;gap:4px}' +
    '.spd-shape{position:relative;width:62px;height:62px}' +
    '.spd-shape svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}' +
    '.spd-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:22px;color:#fff;text-shadow:0 0 6px rgba(0,0,0,.8)}' +
    '.spd-d4 .spd-num{padding-top:16px;font-size:19px}' +
    '.spd-die.is-rolling .spd-shape{animation:spd-tumble var(--t,1s) cubic-bezier(.2,.7,.25,1) both}' +
    '.spd-die.is-best .spd-shape{filter:drop-shadow(0 0 10px var(--dc))}' +
    '.spd-die.is-best .spd-cap{color:' + C.yellow + '}' +
    '.spd-die.is-dim{opacity:.45}' +
    '.spd-cap{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.06em;color:' + C.dim + '}' +
    '.spd-adj{display:flex;gap:3px}.spd-adj button{width:28px;height:24px;border:1px solid ' + C.line2 + ';background:' + C.panel + ';color:' + C.cyan + ';cursor:pointer;font-size:11px;padding:0}' +
    '.spd-adj button:disabled{opacity:.3;cursor:default}' +
    '.spd-moved{color:' + C.cyan + '}' +
    '@keyframes spd-tumble{0%{transform:translate(var(--fx),var(--fy)) rotate(var(--r0)) scale(.6);opacity:0}15%{opacity:1}55%{transform:translate(calc(var(--fx) * -.12),calc(var(--fy) * -.1)) rotate(var(--r1)) scale(1.06)}78%{transform:translate(0,-5px) rotate(var(--r2))}100%{transform:none}}' +
    '.spd-res{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 14px;padding:10px 12px;border:1px solid ' + C.line + ';background:' + C.bg + '}' +
    '.spd-big{font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:40px;line-height:1;color:' + C.yellow + ';text-shadow:0 0 16px rgba(255,212,0,.35)}' +
    '.spd-why{font-family:"JetBrains Mono",monospace;font-size:12px;line-height:1.6;color:' + C.text + '}' +
    '.spd-se{font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:13px;color:' + C.purple + '}' +
    '.spd-f{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:0 14px 14px}' +
    '.spd-btn{min-height:44px;padding:0 18px;border:1px solid ' + C.line2 + ';background:transparent;color:' + C.text + ';cursor:pointer;font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:14px;letter-spacing:.05em;text-transform:uppercase}' +
    '.spd-btn.go{background:var(--acc);border-color:var(--acc);color:' + C.bg + '}' +
    '.spd-btn:disabled{opacity:.4;cursor:default}' +
    '.spd-feed{position:fixed;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:2147482000;display:flex;flex-direction:column-reverse;gap:8px;width:min(340px,calc(100vw - 32px));pointer-events:none;font-family:"IBM Plex Sans Thai",system-ui,sans-serif}' +
    '.spd-pop.spd-on{position:absolute;box-sizing:border-box;max-width:none;z-index:2147482000;pointer-events:auto;box-shadow:0 14px 40px rgba(0,0,0,.65);border-top:3px solid var(--acc);border-left:1px solid ' + C.line + ';transform-origin:center top;animation:spd-pop .38s cubic-bezier(.2,1.3,.4,1) both}' +
    '.spd-pop.spd-on.out{animation:spd-pop-out .28s ease-in both}' +
    '.spd-feed.tr{left:auto;bottom:auto;right:max(16px,env(safe-area-inset-right,0px));top:calc(128px + env(safe-area-inset-top,0px));flex-direction:column}' +
    '.spd-feed.tr .spd-pop{border-left:1px solid ' + C.line + ';border-top:3px solid var(--acc);transform-origin:top right;animation:spd-pop .38s cubic-bezier(.2,1.3,.4,1) both}' +
    '.spd-feed.tr .spd-pop.out{animation:spd-pop-out .28s ease-in both}' +
    '@keyframes spd-pop{0%{opacity:0;transform:translateY(-14px) scale(.82)}100%{opacity:1;transform:none}}' +
    '@keyframes spd-pop-out{to{opacity:0;transform:translateY(-10px) scale(.92)}}' +
    '.spd-pop{pointer-events:auto;background:' + C.panel + ';border:1px solid ' + C.line + ';border-left:3px solid var(--acc);box-shadow:0 10px 30px rgba(0,0,0,.55);padding:8px 10px;animation:spd-in .25s ease-out both}' +
    '.spd-pop .spd-tray{min-height:0;padding:8px 4px;gap:8px 6px;border:0;background:transparent}' +
    '.spd-pop .spd-shape{width:40px;height:40px}.spd-pop .spd-num{font-size:15px}.spd-pop .spd-d4 .spd-num{padding-top:10px;font-size:13px}' +
    '.spd-pop-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;color:' + C.text + ';font-size:13px}' +
    '.spd-pop-h b{font-family:"Chakra Petch",sans-serif;color:var(--acc)}' +
    '.spd-pop-r{font-family:"Chakra Petch",sans-serif;font-weight:700;font-size:24px;color:' + C.yellow + '}' +
    '.spd-pop.out{animation:spd-out .3s ease-in both}' +
    '@keyframes spd-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '@keyframes spd-out{to{opacity:0;transform:translateX(-20px)}}' +
    '@media (prefers-reduced-motion: reduce){.spd-die.is-rolling .spd-shape{animation-duration:.01s}.spd-pop,.spd-pop.out{animation:none}}';

  function injectCss() {
    if (document.getElementById('spd-css')) return;
    var st = document.createElement('style'); st.id = 'spd-css'; st.textContent = css; document.head.appendChild(st);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var rnd = function (n) {
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); return 1 + (a[0] % n); } catch (e) { return 1 + Math.floor(Math.random() * n); }
  };

  /* the dice's own colour: cosmic purple, D4 grey, D8 cyan */
  function dieColor(d) { return d.c ? C.purple : d.s === 4 ? C.grey : C.cyan; }
  function shapeSvg(d) {
    var col = dieColor(d);
    if (d.s === 4) {
      return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,6 96,90 4,90" fill="#151225" stroke="' + col + '" stroke-width="4" stroke-linejoin="round"/>' +
        '<polyline points="50,6 50,62 4,90 M50,62 96,90" fill="none" stroke="' + col + '" stroke-opacity=".35" stroke-width="2"/></svg>';
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,3 95,50 50,97 5,50" fill="#151225" stroke="' + col + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<polygon points="50,18 80,62 20,62" fill="' + col + '" fill-opacity=".12" stroke="' + col + '" stroke-opacity=".45" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M5,50 L20,62 M95,50 L80,62 M50,97 L20,62 M50,97 L80,62 M50,3 L50,18" stroke="' + col + '" stroke-opacity=".35" stroke-width="2" fill="none"/></svg>';
  }

  /* highest die; matching dice add +1 each, capped at the group's top face */
  /* every [1] takes 1 off the highest die (never below 1); then matching dice add +1 each, capped at the group's top face */
  function score(dice) {
    var ones = [], rest = [];
    dice.forEach(function (d, i) { (d.v === 1 ? ones : rest).push(i); });
    if (!rest.length) return { r: dice.length ? 1 : 0, from: ones.slice(0, 1), k: 1, v: 1, n1: ones.length, cut: null };
    var top = rest[0];
    rest.forEach(function (i) { if (dice[i].v > dice[top].v) top = i; });
    var val = {}; rest.forEach(function (i) { val[i] = dice[i].v; });
    var cut = null;
    if (ones.length) { val[top] = Math.max(1, dice[top].v - ones.length); cut = { i: top, from: dice[top].v, to: val[top] }; }
    // matching dice merge into one die worth +1 per extra die (capped at the top face); a merged die that
    // then matches another die merges again, e.g. 5,5,6 → 6,6 → 7
    var ents = rest.map(function (i) { return { v: val[i], cap: dice[i].s, idx: [i] }; });
    var steps = [];
    for (;;) {
      var by = {};
      ents.forEach(function (e) { (by[e.v] = by[e.v] || []).push(e); });
      var dup = Object.keys(by).map(Number).filter(function (v) { return by[v].length > 1; }).sort(function (a, b) { return a - b; })[0];
      if (dup === undefined) break;
      var grp = by[dup], cap = Math.max.apply(null, grp.map(function (e) { return e.cap; }));
      var m = { v: Math.min(dup + grp.length - 1, cap), cap: cap, idx: [].concat.apply([], grp.map(function (e) { return e.idx; })) };
      steps.push({ v: dup, k: grp.length, r: m.v, capped: m.v < dup + grp.length - 1 });
      ents = ents.filter(function (e) { return grp.indexOf(e) === -1; }).concat([m]);
    }
    var top2 = ents.reduce(function (a, e) { return !a || e.v > a.v || (e.v === a.v && e.idx.length > a.idx.length) ? e : a; }, null);
    var used = steps.filter(function (st) { return top2.idx.length > 1; });
    var best = { r: top2.v, from: top2.idx, k: top2.idx.length, v: top2.idx.length > 1 && used.length ? used[0].v : top2.v, steps: top2.idx.length > 1 ? steps : [] };
    best.n1 = ones.length; best.cut = cut; best.all = steps;
    return best;
  }
  /* pair of [8]: two D8s showing 8, or matching dice that merge up into a pair of 8s (7,7,8) */
  function pair8(dice) {
    if (dice.filter(function (d) { return d.s === 8 && d.v === 8; }).length >= 2) return true;
    return (score(dice).all || []).some(function (x) { return x.v === 8; });
  }
  /* pair of [1] counts only when no die shows anything higher (every die is a 1) */
  function pair1(dice) { return dice.length >= 2 && dice.every(function (d) { return d.v === 1; }); }
  function why(dice, sc, th) {
    if (!dice.length) return '';
    if (sc.n1 && !sc.cut) return th ? 'ออก [1] ทุกลูก → 1' : 'All [1]s → 1';
    var pre = sc.cut ? (th ? '[1] ×' + sc.n1 + ': ' : '[1] ×' + sc.n1 + ': ') + sc.cut.from + '→' + sc.cut.to + ' · ' : '';
    if (sc.steps && sc.steps.length) return pre + (th ? 'เลขซ้ำ ' : 'Matching ') + sc.steps.map(function (x) { return x.v + '×' + x.k + '→' + x.r + (x.capped ? (th ? ' (เต็มหน้า)' : ' (top)') : ''); }).join(' · ');
    return pre + (th ? 'ลูกสูงสุด ' : 'Highest die ') + sc.r;
  }
  function poolText(dice) {
    var n8 = 0, n4 = 0, nc = 0;
    dice.forEach(function (d) { if (d.c) nc++; else if (d.s === 4) n4++; else n8++; });
    return [n8 ? n8 + 'D8' : '', n4 ? n4 + 'D4' : '', nc ? nc + 'D4✦' : ''].filter(Boolean).join(' + ');
  }

  /* draws dice into a tray box; `rolling` makes them tumble and flicker before landing on their faces */
  function drawDice(box, dice, opts) {
    opts = opts || {};
    box.innerHTML = '';
    var sc = score(dice), nodes = [];
    dice.forEach(function (d, i) {
      var num = el('span', { class: 'spd-num', text: String(d.v) });
      var shape = el('span', { class: 'spd-shape' }); shape.innerHTML = shapeSvg(d); shape.appendChild(num);
      var cap = el('span', { class: 'spd-cap' + (d.m ? ' spd-moved' : ''), text: (d.c ? 'D4✦' : 'D' + d.s) + (d.m ? (d.m > 0 ? ' +' : ' ') + d.m : '') });
      var die = el('div', { class: 'spd-die' + (d.s === 4 ? ' spd-d4' : ''), style: '--dc:' + dieColor(d) }, [shape, cap]);
      if (opts.adjust) {
        die.appendChild(el('div', { class: 'spd-adj' }, [
          el('button', { type: 'button', 'aria-label': (opts.th ? 'ลดหน้าเต๋า ' : 'Lower die ') + (i + 1), disabled: !opts.canDown(i), onclick: function () { opts.adjust(i, -1); } }, ['▼']),
          el('button', { type: 'button', 'aria-label': (opts.th ? 'เพิ่มหน้าเต๋า ' : 'Raise die ') + (i + 1), disabled: !opts.canUp(i), onclick: function () { opts.adjust(i, 1); } }, ['▲'])
        ]));
      }
      box.appendChild(die);
      nodes.push({ die: die, num: num, d: d });
    });
    var mark = function () {
      if (sc.cut && nodes[sc.cut.i]) { var cp = nodes[sc.cut.i].die.querySelector('.spd-cap'); cp.textContent += ' →' + sc.cut.to; cp.style.color = '#FF3D6E'; }
      nodes.forEach(function (n, i) {
        n.die.classList.toggle('is-best', sc.from.indexOf(i) !== -1 && sc.r > 0);
        n.die.classList.toggle('is-dim', sc.from.indexOf(i) === -1);
      });
    };
    if (!opts.rolling || reduce) { mark(); return Promise.resolve(); }
    return new Promise(function (done) {
      var longest = 0;
      nodes.forEach(function (n, i) {
        var t = 750 + Math.random() * 450 + i * 70; longest = Math.max(longest, t);
        var s = n.die.style;
        s.setProperty('--t', t + 'ms');
        s.setProperty('--fx', (Math.random() < .5 ? -1 : 1) * (120 + Math.random() * 160) + 'px');
        s.setProperty('--fy', (-60 - Math.random() * 80) + 'px');
        s.setProperty('--r0', (Math.random() * 720 - 360) + 'deg');
        s.setProperty('--r1', (Math.random() * 360 - 180) + 'deg');
        s.setProperty('--r2', (Math.random() * 40 - 20) + 'deg');
        n.die.classList.add('is-rolling');
        n.die.classList.add('is-dim');
        var iv = setInterval(function () { n.num.textContent = String(rnd(n.d.s)); }, 55);
        setTimeout(function () { clearInterval(iv); n.num.textContent = String(n.d.v); n.die.classList.remove('is-dim'); }, t * 0.82);
      });
      setTimeout(function () { nodes.forEach(function (n) { n.die.classList.remove('is-rolling'); }); mark(); done(); }, longest + 40);
    });
  }

  /* ---------- the roll tray ---------- */
  function tray(o) {
    injectCss();
    var th = o.th !== false, L = function (a, b) { return th ? a : b; };
    var acc = o.color || C.cyan;
    var st = { extra: 0, se: 0, d8: o.free ? 2 : 0, d4: 0, cos: -1, ex: 0, secret: false, dice: null, base: null, used: 0, rolling: false };
    var prevFocus = document.activeElement;
    var back = el('div', { class: 'spd-back', role: 'presentation' });
    var card = el('div', { class: 'spd-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'spd-title', tabindex: '-1', style: '--acc:' + acc });
    back.appendChild(card);
    var close = function () {
      if (st.rolling) return;
      finish();
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
    };
    var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });

    var count8 = function () {
      if (o.free) return st.d8;
      if (o.enervated) return 1;
      return Math.max(0, (o.base || 0) + st.extra) + st.se;
    };
    var cosN = function () { return !o.free && !o.enervated && st.cos >= 0 ? (o.cosmic[st.cos].n || 0) : 0; };
    var exMax = function () { return Math.min(o.ex || 0, count8()); };
    var build = function () {
      var n8 = count8(), dice = [];
      var ex = Math.min(st.ex, exMax());
      for (var i = 0; i < n8; i++) dice.push({ s: i < ex ? 4 : 8 });
      for (var j = 0; j < (o.free ? st.d4 : 0); j++) dice.push({ s: 4 });
      for (var k = 0; k < cosN(); k++) dice.push({ s: 4, c: 1 });
      return dice;
    };
    var payload = function (ph) {
      var dice = st.dice || [], sc = score(dice);
      return { ph: ph, who: o.who || '', col: acc, lab: o.label || '', dice: dice.map(function (d) { var x = { s: d.s, v: d.v }; if (d.c) x.c = 1; if (d.m) x.m = d.m; return x; }),
        r: sc.r, k: sc.k, p8: pair8(st.base || dice), p1: ph === 'adj' ? pair1(dice) : pair1(st.base || dice), p1was: pair1(st.base || dice), ex: st.exUsed || 0, adv: st.used, cos: st.cosName || '',
        id: st.rid || null, rid: ph === 'adj' ? st.rid || null : null, srv: !!st.rid || !!st.srv, mv: dice.map(function (d) { return d.m || 0; }) };
    };

    var render = function () {
      card.innerHTML = '';
      card.appendChild(el('div', { class: 'spd-h' }, [
        el('div', {}, [el('h2', { class: 'spd-t', id: 'spd-title', text: (o.free ? L('ทอยเต๋า', 'Roll dice') : L('ทอย ', 'Roll ') + o.label) }),
          el('div', { class: 'spd-sub', text: o.who ? o.who : '' })]),
        el('button', { type: 'button', class: 'spd-x', 'aria-label': L('ปิด', 'Close'), title: L('ปิด', 'Close'), onclick: close }, ['✕'])
      ]));
      var b = el('div', { class: 'spd-b' }); card.appendChild(b);

      if (!st.dice) {
        // ---- setup ----
        if (o.free) {
          b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: 'D8' }), stepper(st.d8, 0, 12, function (v) { st.d8 = v; render(); })]));
          b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: 'D4' }), stepper(st.d4, 0, 12, function (v) { st.d4 = v; render(); })]));
          if (o.secretOk) b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: L('ทอยลับ', 'Secret') }),
            el('button', { type: 'button', class: 'spd-chip', 'aria-pressed': st.secret ? 'true' : 'false', onclick: function () { st.secret = !st.secret; render(); } }, [st.secret ? L('เห็นแค่ GM', 'GM only') : L('ทุกคนเห็น', 'Everyone sees')])]));
        } else {
          b.appendChild(el('p', { class: 'spd-note' }, [L('เต๋าพื้นฐาน ', 'Base dice ') , el('b', { style: 'color:#fff', text: String(o.base || 0) + 'D8' }), ' ' + (o.baseNote || '')]));
          if (o.enervated) b.appendChild(el('p', { class: 'spd-warn', text: L('Enervated: ทอยได้เพียง 1D8', 'Enervated: you roll only 1D8') }));
          else {
            b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: L('เต๋า +/−', 'Dice +/−') }),
              stepper(st.extra, -(o.base || 0), 6, function (v) { st.extra = v; render(); })]));
            if ((o.se || 0) > 0 || st.se) {
              b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', style: 'color:' + C.purple, text: L('SE → เต๋า', 'SE → dice') }),
                stepper(st.se, 0, o.seLock ? 0 : (o.se || 0), function (v) { st.se = v; render(); }),
                el('span', { class: 'spd-note', text: o.seLock ? L('เทิร์นนี้ใช้ SE เพิ่มอย่างอื่นไปแล้ว', 'SE already boosts something else this turn') : L('ใช้ SE เพิ่ม D8 (มี ' + o.se + ') · แต้มที่ใช้กลายเป็น EX', 'Spend SE for extra D8s (' + o.se + ' left) · spent points become EX') })]));
            }
            var cos = (o.cosmic || []).filter(function (c) { return c.n > 0; });
            if (cos.length) {
              var row = el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: 'Cosmic' })]);
              (o.cosmic || []).forEach(function (c, i) {
                if (!(c.n > 0)) return;
                row.appendChild(el('button', { type: 'button', class: 'spd-chip', 'aria-pressed': st.cos === i ? 'true' : 'false', onclick: function () { st.cos = st.cos === i ? -1 : i; render(); } }, [(c.name || 'Cosmic') + ' +' + c.n + 'D4']));
              });
              b.appendChild(row);
            }
          }
          if ((o.ex || 0) > 0) {
            b.appendChild(el('div', { class: 'spd-row' }, [el('span', { class: 'spd-lbl', text: 'Exhaustion' }),
              stepper(Math.min(st.ex, exMax()), 0, exMax(), function (v) { st.ex = v; render(); }),
              el('span', { class: 'spd-note', text: L('ใช้แต้มเปลี่ยน D8 เป็น D4 (มี ' + o.ex + ')', 'Turn a D8 into a D4 per point (' + o.ex + ' left)') })]));
          }
        }
        var pre = build();
        var tr = el('div', { class: 'spd-tray', 'aria-label': L('กองเต๋า', 'Dice pool') }); b.appendChild(tr);
        pre.forEach(function (d) { d.v = d.s; });
        drawDice(tr, pre, {});
        Array.prototype.forEach.call(tr.children, function (n) { n.classList.remove('is-dim'); n.classList.remove('is-best'); n.querySelector('.spd-num').textContent = '?'; });
        b.appendChild(el('p', { class: 'spd-note', text: pre.length ? poolText(pre) : L('ยังไม่มีเต๋า', 'No dice yet') }));
        var f = el('div', { class: 'spd-f' }); card.appendChild(f);
        f.appendChild(el('button', { type: 'button', class: 'spd-btn', onclick: close }, [L('ยกเลิก', 'Cancel')]));
        if (st.err) b.appendChild(el('p', { class: 'spd-warn', role: 'alert', text: L('ทอยไม่สำเร็จ ลองอีกครั้ง', 'Roll failed, try again') + ' (' + st.err + ')' }));
        f.appendChild(el('button', { type: 'button', class: 'spd-btn go', disabled: !pre.length || st.waiting, onclick: roll }, [st.waiting ? L('กำลังทอย…', 'Rolling…') : '🎲 ' + L('ทอย', 'Roll')]));
        if (st.waiting) Array.prototype.forEach.call(tr.children, function (n) { n.classList.add('is-rolling'); n.style.setProperty('--t', '900ms'); n.style.setProperty('--fx', '0px'); n.style.setProperty('--fy', '-20px'); n.style.setProperty('--r0', '180deg'); n.style.setProperty('--r1', '-90deg'); n.style.setProperty('--r2', '10deg'); });
        return;
      }

      // ---- rolled ----
      var tray2 = el('div', { class: 'spd-tray', 'aria-label': L('ผลเต๋า', 'Dice') }); b.appendChild(tray2);
      var advLeft = (o.adv || 0) - st.used;
      var p = drawDice(tray2, st.dice, {
        rolling: st.rolling, th: th,
        adjust: !st.rolling && !o.free && (o.adv || 0) > 0 ? adjust : null,
        canUp: function (i) { return advLeft > 0 || (st.dice[i].m || 0) < 0 ? st.dice[i].v < st.dice[i].s : false; },
        canDown: function (i) { return advLeft > 0 || (st.dice[i].m || 0) > 0 ? st.dice[i].v > 1 : false; }
      });
      var res = el('div', { class: 'spd-res', 'aria-live': 'polite' }); b.appendChild(res);
      var f2 = el('div', { class: 'spd-f' }); card.appendChild(f2);
      var again = el('button', { type: 'button', class: 'spd-btn', onclick: function () { finish(); o.adv = (o.adv || 0) - st.used; o.ex = (o.ex || 0) - (st.exUsed || 0); st.dice = null; st.used = 0; st.rid = null; st.ex = Math.min(st.ex, o.ex || 0); render(); } }, [L('ทอยใหม่', 'New roll')]);
      var done = el('button', { type: 'button', class: 'spd-btn go', onclick: close }, [L('เสร็จ', 'Done')]);
      f2.appendChild(again); f2.appendChild(done);
      var fill = function () {
        var sc = score(st.dice);
        res.innerHTML = '';
        res.appendChild(el('div', {}, [el('div', { class: 'spd-sub', text: L('ผลทอย', 'RESULT') }), el('div', { class: 'spd-big', text: String(sc.r) })]));
        var side = el('div', { style: 'display:flex;flex-direction:column;gap:4px;align-items:flex-end;text-align:right' }, [el('div', { class: 'spd-why', text: why(st.dice, sc, th) })]);
        if (pair8(st.base)) side.appendChild(el('div', { class: 'spd-se', text: L('คู่ [8]! +1 Surge Energy', 'Pair of [8]! +1 Surge Energy') }));
        if (!o.free && pair1(st.dice)) side.appendChild(el('div', { class: 'spd-se', style: 'color:#FF3D6E', text: L('คู่ [1]! +1 EX · +1 Advance pts (ได้เมื่อกดเสร็จ)', 'Pair of [1]! +1 EX · +1 Advance pts (on Done)') }));
        else if (!o.free && pair1(st.base)) side.appendChild(el('div', { class: 'spd-note', text: L('ปรับหน้าเต๋าแล้ว คู่ [1] จึงไม่นับ', 'Faces moved, so the pair of [1] no longer counts') }));
        if (!o.free && (o.adv || 0) > 0) side.appendChild(el('div', { class: 'spd-note', text: L('▲▼ ใช้ Advance pts ปรับหน้าเต๋า (เหลือ ' + advLeft + ')', '▲▼ spend Advance pts to move faces (' + advLeft + ' left)') }));
        if (st.secret) side.appendChild(el('div', { class: 'spd-note', text: L('ทอยลับ ผู้เล่นไม่เห็น', 'Secret roll: players don\'t see it') }));
        res.appendChild(side);
      };
      if (st.rolling) { again.disabled = true; done.disabled = true; res.appendChild(el('div', { class: 'spd-sub', text: L('กำลังทอย…', 'ROLLING…') })); p.then(function () { st.rolling = false; render(); }); }
      else fill();
    };

    /* a roll is finished on Done / New roll / closing: Advance pts spent, and a pair of [1] still standing pays out */
    function finish() {
      if (!st.dice || st.finished) return;
      st.finished = true;
      var p1 = !o.free && pair1(st.dice) ? 1 : 0;
      if ((st.used || p1) && o.onDone) o.onDone(payload('adj'), { adv: st.used, p1: p1 });
    }
    function stepper(v, min, max, set) {
      return el('span', { class: 'spd-step' }, [
        el('button', { type: 'button', 'aria-label': '−', disabled: v <= min, onclick: function () { set(Math.max(min, v - 1)); } }, ['−']),
        el('b', { text: String(v) }),
        el('button', { type: 'button', 'aria-label': '+', disabled: v >= max, onclick: function () { set(Math.min(max, v + 1)); } }, ['+'])
      ]);
    }
    function adjust(i, dir) {
      var d = st.dice[i], m = d.m || 0;
      var nv = d.v + dir; if (nv < 1 || nv > d.s) return;
      var back = (m > 0 && dir < 0) || (m < 0 && dir > 0);
      if (!back && st.used >= (o.adv || 0)) return;
      d.v = nv; d.m = m + dir; if (!d.m) delete d.m;
      st.used += back ? -1 : 1;
      render();
    }
    /* the faces come from o.source (the server) when there is one, otherwise from this browser */
    function roll() {
      if (st.waiting) return;
      var dice = build();
      st.exUsed = dice.filter(function (d) { return d.s === 4 && !o.free; }).length;
      st.cosName = cosN() ? o.cosmic[st.cos].name : '';
      if (!o.source) { dice.forEach(function (d) { d.v = rnd(d.s); }); return landed(dice, null, false); }
      st.waiting = true; st.err = ''; render();
      var meta = { who: o.who || '', col: acc, lab: o.label || '', cos: st.cosName, ex: st.exUsed };
      Promise.resolve(o.source(dice.map(function (d) { return d.s; }), dice.map(function (d) { return d.c ? 1 : 0; }), meta, { secret: st.secret }))
        .then(function (res) {
          st.waiting = false;
          var got = (res && res.dice) || [];
          if (got.length !== dice.length) throw new Error('bad roll');
          landed(got.map(function (d) { return { s: d.s === 4 ? 4 : 8, v: d.v | 0, c: d.c ? 1 : undefined }; }), res.id || null, true);
        })
        .catch(function (e) { st.waiting = false; st.err = (e && e.message) || 'error'; render(); });
    }
    function landed(dice, rid, srv) {
      st.dice = dice; st.base = dice.map(function (d) { return { s: d.s, v: d.v, c: d.c }; });
      st.rid = rid; st.srv = srv; st.finished = false;
      st.rolling = true;
      var pl = payload('roll');
      if (o.onRoll) o.onRoll(pl, { ex: st.exUsed, se: pl.p8 ? 1 : 0, seUse: o.enervated ? 0 : st.se, secret: st.secret });
      o.se = Math.max(0, (o.se || 0) - (o.enervated ? 0 : st.se)) + (pl.p8 ? 1 : 0); st.se = 0;
      render();
    }
    render();
    document.body.appendChild(back);
    setTimeout(function () { try { card.focus(); } catch (e) {} }, 20);
    return { close: close };
  }

  /* ---------- other people's rolls ---------- */
  var feedBox = null;
  /* opts.pos 'tr' = pop up at the top right (the character sheet, like the Scene picture); default bottom left */
  function show(p, th, opts) {
    if (!p || !p.dice) return;
    injectCss();
    th = th !== false;
    if (!feedBox || !document.body.contains(feedBox)) { feedBox = el('div', { class: 'spd-feed', 'aria-live': 'polite' }); document.body.appendChild(feedBox); }
    var anchor = opts && opts.anchor && opts.anchor.getBoundingClientRect ? opts.anchor : null;
    if (!anchor) {
      feedBox.classList.toggle('tr', !!(opts && opts.pos === 'tr'));
      while (feedBox.children.length >= 3) feedBox.lastChild.remove();
    }
    var adj = p.ph === 'adj';
    var head = el('div', { class: 'spd-pop-h' }, [el('span', {}, [el('b', { text: p.who || '?' }), ' ' + (adj ? (th ? 'ใช้ Advance ' + p.adv + ' แต้ม' : 'used ' + p.adv + ' Advance') : (th ? 'ทอย ' : 'rolls ') + (p.lab || ''))]),
      el('span', { class: 'spd-pop-r', text: '…' })]);
    var tr = el('div', { class: 'spd-tray' });
    var foot = el('div', { class: 'spd-sub' });
    var pop = el('div', { class: 'spd-pop', role: 'status', style: '--acc:' + (p.col || C.cyan) }, [head, tr, foot]);
    if (anchor) {
      // sits on the lower part of the roller's card (GM Monitor); a newer roll on the same card replaces it
      var prev = document.querySelector('.spd-on[data-for="' + anchor.id + '"]'); if (prev) prev.remove();
      pop.setAttribute('data-for', anchor.id);
      anchor._spdPop = pop;
      // pinned to the lower part of the card; follows it every frame (the card can move or be re-rendered)
      var aid = anchor.id;
      pop.classList.add('spd-on');
      pop.style.transformOrigin = 'center bottom';
      document.body.appendChild(pop);
      var follow = function () {
        if (!pop.isConnected) return;
        var a = (aid && document.getElementById(aid)) || anchor;
        if (a && a.isConnected) {
          var rc = a.getBoundingClientRect(), w = Math.min(340, rc.width - 16);
          pop.style.width = w + 'px';
          pop.style.left = (rc.left + window.scrollX + (rc.width - w) / 2) + 'px';
          pop.style.top = (rc.bottom + window.scrollY - pop.offsetHeight - 12) + 'px';
        }
        requestAnimationFrame(follow);
      };
      follow();
      anchor._spdPlace = function () {};
    } else feedBox.insertBefore(pop, feedBox.firstChild);
    var dice = p.dice.map(function (d) { return { s: d.s === 4 ? 4 : 8, v: Math.max(1, Math.min(d.s === 4 ? 4 : 8, d.v | 0)), c: d.c, m: d.m }; });
    var drawn = drawDice(tr, dice, { rolling: !adj });
    if (anchor && anchor._spdPop === pop) anchor._spdPlace();
    drawn.then(function () {
      var sc = score(dice);
      head.lastChild.textContent = String(sc.r);
      foot.textContent = why(dice, sc, th) + (p.p8 && !adj ? (th ? ' · คู่ [8] +1 SE' : ' · pair of [8] +1 SE') : '') + (p.lab && p.p1 ? (th ? ' · คู่ [1] +1 EX +1 ADV' : ' · pair of [1] +1 EX +1 ADV') : p.lab && adj && p.p1was ? (th ? ' · คู่ [1] ไม่นับแล้ว' : ' · pair of [1] lost') : '') + (p.cos ? ' · ' + p.cos : '');
      if (anchor && anchor._spdPop === pop) anchor._spdPlace();
    });
    var t; var go = function () { pop.classList.add('out'); setTimeout(function () { pop.remove(); }, 320); };
    var arm = function () { clearTimeout(t); t = setTimeout(go, 9000); };
    pop.addEventListener('mouseenter', function () { clearTimeout(t); });
    pop.addEventListener('mouseleave', arm);
    pop.addEventListener('click', go);
    arm();
  }

  /* one line for a feed: "Force 3D8 → 7" */
  function line(p, th) {
    if (!p || !p.dice) return '';
    if (p.ph === 'adj') return (th ? 'ใช้ Advance ' + p.adv + ' แต้ม → ผล ' : 'used ' + p.adv + ' Advance → ') + p.r + (p.p1was && !p.p1 ? (th ? ' · คู่ [1] ไม่นับแล้ว' : ' · pair of [1] lost') : '');
    var dice = p.dice.map(function (d) { return { s: d.s, v: d.v, c: d.c }; });
    var faces = p.dice.map(function (d) { return (d.s === 4 ? 'd4:' : '') + d.v; }).join(',');
    return (th ? 'ทอย ' : 'rolled ') + (p.lab ? p.lab + ' ' : '') + poolText(dice) + ' [' + faces + '] → ' + p.r + (p.p8 ? (th ? ' · คู่ [8] +1 SE' : ' · pair of [8] +1 SE') : '') + (p.p1 && p.lab ? (th ? ' · คู่ [1]' : ' · pair of [1]') : '');
  }

  window.SPDice = { tray: tray, show: show, score: score, line: line, pair8: pair8, pair1: pair1 };
})();
