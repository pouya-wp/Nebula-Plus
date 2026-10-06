// Nebula Plus — sticky notes and lasting highlights.
// Highlights stay on the page: next visit they come back on the same words
// (anchored on the text and its surroundings, not on positions, so layout
// changes don't lose them). A note can sit on a highlight, or on the whole
// page as a small sticky you can drag around.
//   selection bubble   "هایلایت" / "یادداشت"
//   Ctrl+Alt+H         highlight the selection
//   Ctrl+Alt+N         sticky note for this page
//   Ctrl+Alt+B         notebook: every note on every site, searchable
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-notes"] = true;

  const COLORS = { y: "#ffd84d", g: "#5be3a0", b: "#6ec8ff", p: "#ff7ab6" };
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  // Same page = same notes: no #hash, no tracking parameters, no trailing /.
  function pageKey(url) {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return "";
      for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|yclid|mc_|ref$|si$)/.test(k)) u.searchParams.delete(k);
      const search = u.searchParams.toString();
      return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${search ? `?${search}` : ""}`;
    } catch {
      return "";
    }
  }

  const SHEET = `
    nplus-mark { display: inline !important; color: inherit !important; border-radius: 3px !important; cursor: pointer !important;
      box-decoration-break: clone !important; -webkit-box-decoration-break: clone !important; padding: 0 1px !important;
      background: color-mix(in srgb, var(--nm) 42%, transparent) !important; transition: background-color .2s ease !important; }
    nplus-mark:hover { background: color-mix(in srgb, var(--nm) 62%, transparent) !important; }
    nplus-mark[data-c="y"] { --nm: ${COLORS.y}; } nplus-mark[data-c="g"] { --nm: ${COLORS.g}; }
    nplus-mark[data-c="b"] { --nm: ${COLORS.b}; } nplus-mark[data-c="p"] { --nm: ${COLORS.p}; }
    nplus-mark[data-note] { box-shadow: inset 0 -2px 0 var(--nm) !important; }
    nplus-mark[data-flash] { animation: nplus-mark-flash 1.4s ease 2 !important; }
    @keyframes nplus-mark-flash { 50% { background: var(--nm); box-shadow: 0 0 0 4px color-mix(in srgb, var(--nm) 40%, transparent); } }

    :where(nplus-npin, nplus-npin *) { all: revert !important; }
    nplus-npin { display: inline-flex !important; align-items: center !important; justify-content: center !important;
      width: 17px !important; height: 17px !important; margin: 0 3px !important; vertical-align: -3px !important; border-radius: 6px !important;
      background: var(--nm) !important; color: #1b1b22 !important; font: 700 11px/1 system-ui, sans-serif !important; cursor: pointer !important;
      box-shadow: 0 3px 10px -3px var(--nm) !important; user-select: none !important; }
    nplus-npin[data-c="y"] { --nm: ${COLORS.y}; } nplus-npin[data-c="g"] { --nm: ${COLORS.g}; }
    nplus-npin[data-c="b"] { --nm: ${COLORS.b}; } nplus-npin[data-c="p"] { --nm: ${COLORS.p}; }

    :where(#nplus-note-card, #nplus-note-card *, .nplus-sticky, .nplus-sticky *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-note-card, .nplus-sticky {
      position: fixed !important; z-index: 2147483646 !important; left: var(--nx) !important; top: var(--ny) !important;
      display: flex !important; flex-direction: column !important; gap: 6px !important; width: 270px !important; margin: 0 !important; padding: 8px !important;
      border-radius: 16px !important; border: none !important;
      background: rgb(22 22 32 / 94%) !important; backdrop-filter: blur(20px) saturate(170%) !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 10%), inset 0 3px 0 -1px var(--nm), 0 18px 44px -14px rgb(0 0 0 / 70%) !important;
      font: 500 13px/1.5 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #f2f2f8 !important;
      direction: rtl !important; text-align: right !important;
      animation: nplus-note-in .22s cubic-bezier(.34,1.56,.64,1) !important;
    }
    @keyframes nplus-note-in { from { opacity: 0; translate: 0 6px; scale: .96; } }
    #nplus-note-card[data-c="y"], .nplus-sticky[data-c="y"] { --nm: ${COLORS.y}; } #nplus-note-card[data-c="g"], .nplus-sticky[data-c="g"] { --nm: ${COLORS.g}; }
    #nplus-note-card[data-c="b"], .nplus-sticky[data-c="b"] { --nm: ${COLORS.b}; } #nplus-note-card[data-c="p"], .nplus-sticky[data-c="p"] { --nm: ${COLORS.p}; }
    .nplus-sticky[data-min] { width: auto !important; }
    .nplus-sticky[data-min] .nn-text { display: none !important; }
    .nn-top { display: flex !important; align-items: center !important; gap: 5px !important; margin: 0 !important; padding: 0 2px !important; }
    .nplus-sticky .nn-top { cursor: grab !important; user-select: none !important; }
    .nn-dot { display: block !important; width: 15px !important; height: 15px !important; margin: 0 !important; border-radius: 50% !important; cursor: pointer !important;
      box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 25%) !important; transition: scale .12s ease !important; }
    .nn-dot:hover { scale: 1.15 !important; }
    .nn-dot[data-c="y"] { background: ${COLORS.y} !important; } .nn-dot[data-c="g"] { background: ${COLORS.g} !important; }
    .nn-dot[data-c="b"] { background: ${COLORS.b} !important; } .nn-dot[data-c="p"] { background: ${COLORS.p} !important; }
    .nn-dots { display: inline-flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important; }
    .nn-dot[data-on] { box-shadow: 0 0 0 2px rgb(22 22 32), 0 0 0 3.5px #fff !important; }
    .nn-sp { display: block !important; flex: 1 !important; }
    .nn-label { display: block !important; flex: 1 !important; font: 700 11.5px/1 "Meem", "Vazirmatn", system-ui, sans-serif !important; color: rgb(242 242 248 / 60%) !important; padding: 0 6px !important; white-space: nowrap !important; }
    .nn-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; min-width: 24px !important; height: 24px !important;
      margin: 0 !important; padding: 0 7px !important; border-radius: 9px !important; cursor: pointer !important; color: rgb(242 242 248 / 70%) !important;
      font: 600 12px/1 "Meem", "Vazirmatn", system-ui, sans-serif !important; user-select: none !important; }
    .nn-btn:hover { background: rgb(255 255 255 / 10%) !important; color: #fff !important; }
    .nn-del:hover { background: rgb(229 72 77 / 25%) !important; color: #ff9b9e !important; }
    .nn-text { display: block !important; width: 100% !important; min-height: 74px !important; max-height: 260px !important; margin: 0 !important; padding: 9px 11px !important;
      border: none !important; border-radius: 11px !important; outline: none !important; resize: vertical !important; appearance: none !important;
      background: rgb(255 255 255 / 7%) !important; color: #fff !important;
      font: 500 14px/1.8 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; unicode-bidi: plaintext !important; text-align: start !important; }
    .nn-text:focus { box-shadow: 0 0 0 1.5px var(--nm) !important; }
    .nn-text::placeholder { color: rgb(242 242 248 / 40%) !important; }
  `;

  // Content side (ASCII only; labels arrive with the items).
  const NOTES = `(function(G){
    var ME = {}; G.__nplus_notes = ME;
    function stale() { return G.__nplus_notes !== ME; }
    var items = [], L = {}, url = '', poll = 0, obs = null, obsT = 0, until = 0, card = null, cardId = '', saveT = 0, focusId = '';
    var COLORS = ['y', 'g', 'b', 'p'];
    function d() { return content.document; }
    function norm(s) { return String(s).replace(/[\\s\\u00a0]+/g, ' '); }

    // ---- text index: every text node, its raw offset, a whitespace-collapsed copy ----
    function index() {
      var root = d().body; if (!root) return null;
      var w = d().createTreeWalker(root, 4, { acceptNode: function (n) {
        var p = n.parentNode; if (!p || p.nodeType !== 1) return 2;
        var t = p.localName; if (t === 'script' || t === 'style' || t === 'noscript' || t === 'textarea' || t === 'nplus-npin') return 2;
        if (p.closest && p.closest('#nplus-note-card,.nplus-sticky,#nplus-bubble')) return 2;
        return 1; } });
      var nodes = [], starts = [], parts = [], len = 0, n;
      while ((n = w.nextNode())) { nodes.push(n); starts.push(len); parts.push(n.data); len += n.data.length; }
      var text = parts.join(''), out = [], map = [], ws = false;
      for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i), isw = c === 32 || c === 9 || c === 10 || c === 13 || c === 160 || c === 12;
        if (isw) { if (ws) continue; ws = true; out.push(' '); } else { ws = false; out.push(text[i]); }
        map.push(i);
      }
      return { nodes: nodes, starts: starts, text: text, norm: out.join(''), map: map };
    }
    function at(ix, raw) {
      var lo = 0, hi = ix.starts.length - 1;
      while (lo < hi) { var m = (lo + hi + 1) >> 1; if (ix.starts[m] <= raw) lo = m; else hi = m - 1; }
      return lo;
    }
    function rawOf(ix, node, off) {
      if (node.nodeType === 3) { var i = ix.nodes.indexOf(node); if (i >= 0) return ix.starts[i] + off; }
      var r = d().createRange(); r.setStart(node, off); r.collapse(true);
      for (var j = 0; j < ix.nodes.length; j++) if (r.comparePoint(ix.nodes[j], 0) >= 0) return ix.starts[j];
      return ix.text.length;
    }
    function tailMatch(a, b) { var n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; }
    function headMatch(a, b) { var n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }

    // ---- find + wrap ----
    function locate(ix, it) {
      if (!it.exact) return null;
      var best = -1, score = -1, from = 0, i;
      while ((i = ix.norm.indexOf(it.exact, from)) >= 0) {
        var s = tailMatch(ix.norm.slice(Math.max(0, i - 40), i), it.prefix || '') + headMatch(ix.norm.slice(i + it.exact.length, i + it.exact.length + 40), it.suffix || '');
        if (s > score) { score = s; best = i; }
        from = i + 1;
      }
      if (best < 0) return null;
      return { a: ix.map[best], b: ix.map[best + it.exact.length - 1] + 1 };
    }
    function wrap(ix, a, b, it) {
      var first = at(ix, a), last = at(ix, Math.max(a, b - 1)), marks = [];
      for (var i = first; i <= last; i++) {
        var node = ix.nodes[i], s = Math.max(0, a - ix.starts[i]), e = Math.min(node.data.length, b - ix.starts[i]);
        if (e <= s || !node.data.slice(s, e).trim() && i !== first) continue;
        if (s > 0) node = node.splitText(s);
        if (e - s < node.data.length) node.splitText(e - s);
        var m = d().createElement('nplus-mark');
        m.setAttribute('data-id', it.id); m.setAttribute('data-c', it.color || 'y');
        node.parentNode.insertBefore(m, node); m.append(node);
        marks.push(m);
      }
      return marks;
    }
    function marksOf(id) { return d().querySelectorAll('nplus-mark[data-id="' + id + '"]'); }
    function decorate(it) {
      var ms = marksOf(it.id);
      for (var i = 0; i < ms.length; i++) { ms[i].setAttribute('data-c', it.color || 'y'); ms[i].toggleAttribute('data-note', !!it.note); ms[i].title = it.note || ''; }
      var old = d().querySelector('nplus-npin[data-id="' + it.id + '"]');
      if (it.note && ms.length) {
        var pin = old || d().createElement('nplus-npin');
        pin.setAttribute('data-id', it.id); pin.setAttribute('data-c', it.color || 'y'); pin.textContent = L.pin || '*';
        pin.setAttribute('contenteditable', 'false');
        if (!old) ms[ms.length - 1].after(pin);
      } else if (old) old.remove();
    }
    function apply() {
      if (!d().body) return 0;
      var missing = 0, ix = null;
      items.forEach(function (it) {
        if (it.kind === 'page') { sticky(it); return; }
        if (marksOf(it.id).length) { decorate(it); return; }
        ix = index(); if (!ix) return;
        var r = locate(ix, it);
        if (!r) { missing++; return; }
        wrap(ix, r.a, r.b, it); decorate(it);
        if (focusId === it.id) focus(it.id);
      });
      return missing;
    }
    function unwrap(id) {
      var ms = marksOf(id);
      for (var i = 0; i < ms.length; i++) { var m = ms[i], p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); m.remove(); p.normalize(); }
      var pin = d().querySelector('nplus-npin[data-id="' + id + '"]'); if (pin) pin.remove();
      var st = d().querySelector('.nplus-sticky[data-id="' + id + '"]'); if (st) st.remove();
    }
    // dynamic pages: keep trying for a while as content arrives
    function watch() {
      if (obs) obs.disconnect(); obs = null;
      if (!items.some(function (it) { return it.kind !== 'page'; })) return;
      until = Date.now() + 30000;
      obs = new content.MutationObserver(function () {
        content.clearTimeout(obsT);
        obsT = content.setTimeout(function () { if (apply() === 0 || Date.now() > until) { if (obs) obs.disconnect(); obs = null; } }, 700);
      });
      obs.observe(d().body, { childList: true, subtree: true });
    }

    // ---- saving ----
    function send(it) { sendAsyncMessage('nplus:notes2:save', { url: content.location.href, title: d().title, item: it }); }
    function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
    function create(kind, color) {
      var sel = content.getSelection();
      if (kind === 'page' || !sel || !sel.rangeCount || sel.isCollapsed) {
        if (kind !== 'page') return;
        var p = { id: 'n' + Date.now().toString(36), kind: 'page', color: color || 'y', note: '', x: 0.72, y: 0.18 };
        items.push(p); send(p); sticky(p, true); return;
      }
      var range = sel.getRangeAt(0), ix = index(); if (!ix) return;
      var a = rawOf(ix, range.startContainer, range.startOffset), b = rawOf(ix, range.endContainer, range.endOffset);
      while (a < b && /\\s/.test(ix.text[a])) a++;
      while (b > a && /\\s/.test(ix.text[b - 1])) b--;
      if (b <= a) return;
      var it = { id: 'n' + Date.now().toString(36), kind: 'hl', color: color || 'y', note: '',
        exact: norm(ix.text.slice(a, b)), prefix: norm(ix.text.slice(Math.max(0, a - 80), a)).slice(-40), suffix: norm(ix.text.slice(b, b + 80)).slice(0, 40) };
      items.push(it);
      wrap(ix, a, b, it); decorate(it);
      sel.removeAllRanges();
      send(it);
      if (kind === 'note') open(it);
    }
    function remove(id) {
      items = items.filter(function (x) { return x.id !== id; });
      unwrap(id); closeCard();
      sendAsyncMessage('nplus:notes2:remove', { url: content.location.href, id: id });
    }

    // ---- UI pieces ----
    function el(tag, cls, text) { var e = d().createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function dots(it, host, onPick) {
      COLORS.forEach(function (c) {
        var x = el('span', 'nn-dot'); x.setAttribute('data-c', c);
        if ((it.color || 'y') === c) x.setAttribute('data-on', '1');
        x.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        x.addEventListener('click', function (e) { e.stopPropagation(); it.color = c; onPick(); });
        host.append(x);
      });
    }
    function textarea(it) {
      var t = el('textarea', 'nn-text'); t.value = it.note || ''; t.placeholder = L.placeholder || ''; t.dir = 'auto';
      t.addEventListener('input', function () { it.note = t.value; content.clearTimeout(saveT); saveT = content.setTimeout(function () { send(it); if (it.kind !== 'page') decorate(it); }, 400); });
      t.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') { t.blur(); closeCard(); } });
      t.addEventListener('keyup', function (e) { e.stopPropagation(); });
      t.addEventListener('keypress', function (e) { e.stopPropagation(); });
      return t;
    }
    function closeCard() { if (card) { card.remove(); card = null; cardId = ''; } }
    function open(it, anchor) {
      closeCard();
      var ms = marksOf(it.id); anchor = anchor || ms[ms.length - 1]; if (!anchor) return;
      card = el('div'); card.id = 'nplus-note-card'; card.setAttribute('data-c', it.color || 'y'); cardId = it.id;
      var top = el('div', 'nn-top'), dh = el('span', 'nn-dots');
      dots(it, dh, function () { send(it); decorate(it); open(it, anchor); });
      top.append(dh);
      top.append(el('span', 'nn-sp'));
      var del = el('span', 'nn-btn nn-del', L.del || 'x'); del.addEventListener('click', function () { remove(it.id); });
      var x = el('span', 'nn-btn', '\\u00d7'); x.addEventListener('click', closeCard);
      top.append(del, x);
      var t = textarea(it);
      card.append(top, t);
      card.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      d().documentElement.append(card);
      var r = anchor.getBoundingClientRect(), vw = content.innerWidth, vh = content.innerHeight;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - 135), vw - 278), y = r.bottom + 8;
      if (y + card.offsetHeight > vh - 8) y = Math.max(8, r.top - card.offsetHeight - 8);
      card.style.setProperty('--nx', left + 'px'); card.style.setProperty('--ny', y + 'px');
      if (!it.note) t.focus();
    }
    function sticky(it, fresh) {
      var s = d().querySelector('.nplus-sticky[data-id="' + it.id + '"]');
      if (s) { s.setAttribute('data-c', it.color || 'y'); return; }
      if (!d().documentElement) return;
      s = el('div', 'nplus-sticky'); s.setAttribute('data-id', it.id); s.setAttribute('data-c', it.color || 'y');
      if (it.min) s.setAttribute('data-min', '1');
      var top = el('div', 'nn-top');
      var lab = el('span', 'nn-label', L.page || '');
      top.append(lab);
      var dhost = el('span', 'nn-dots');
      dots(it, dhost, function () { send(it); s.remove(); sticky(it); });
      top.append(dhost);
      var mn = el('span', 'nn-btn', '\\u2013'); mn.addEventListener('click', function () { it.min = !it.min; s.toggleAttribute('data-min', !!it.min); send(it); });
      var del = el('span', 'nn-btn nn-del', L.del || 'x'); del.addEventListener('click', function () { remove(it.id); });
      top.append(mn, del);
      var t = textarea(it);
      s.append(top, t);
      function place() {
        var vw = content.innerWidth, vh = content.innerHeight;
        s.style.setProperty('--nx', Math.round(Math.min(Math.max(8, it.x * vw), vw - 120)) + 'px');
        s.style.setProperty('--ny', Math.round(Math.min(Math.max(8, it.y * vh), vh - 50)) + 'px');
      }
      place();
      top.addEventListener('mousedown', function (e) {
        if (e.target !== top && e.target !== lab) return;
        e.preventDefault();
        var r = s.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        function mv(ev) { it.x = (ev.clientX - dx) / content.innerWidth; it.y = (ev.clientY - dy) / content.innerHeight; place(); }
        function up() { d().removeEventListener('mousemove', mv, true); d().removeEventListener('mouseup', up, true); send(it); }
        d().addEventListener('mousemove', mv, true); d().addEventListener('mouseup', up, true);
      });
      s.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      d().documentElement.append(s);
      if (fresh) t.focus();
    }
    function focus(id) {
      var it = find(id); focusId = '';
      if (it && it.kind === 'page') { var s = d().querySelector('.nplus-sticky[data-id="' + id + '"]'); if (s) { s.removeAttribute('data-min'); var tt = s.querySelector('textarea'); if (tt) tt.focus(); } return; }
      var ms = marksOf(id); if (!ms.length) { focusId = id; return; }
      ms[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      for (var i = 0; i < ms.length; i++) { ms[i].removeAttribute('data-flash'); void ms[i].offsetWidth; ms[i].setAttribute('data-flash', '1'); }
    }

    // ---- wiring ----
    addEventListener('click', function (e) {
      if (stale()) return;
      var t = e.target, pin = t && t.closest && t.closest('nplus-npin');
      var m = pin ? marksOf(pin.getAttribute('data-id'))[0] : (t && t.closest && t.closest('nplus-mark'));
      if (!m) return;
      var sel = content.getSelection(); if (sel && !sel.isCollapsed && !pin) return;
      var it = find(m.getAttribute('data-id')); if (!it) return;
      if (t.closest('a') && !pin) return;
      e.preventDefault(); e.stopPropagation();
      if (cardId === it.id) closeCard(); else open(it, pin || m);
    }, true);
    addEventListener('mousedown', function (e) { if (card && !card.contains(e.target)) closeCard(); }, true);
    addEventListener('scroll', function () { if (card && content.document.activeElement !== card.querySelector('textarea')) closeCard(); }, true);
    function hello() {
      if (stale()) return;
      url = content.location.href; items = []; closeCard();
      if (!/^https?:/.test(url)) return;
      sendAsyncMessage('nplus:notes2:hello', { url: url });
    }
    // same-page navigations (YouTube, GitHub...): the browser tells us
    addMessageListener('nplus:notes2:nav', function () { if (!stale() && content.location.href !== url) hello(); });
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document) hello(); }, true);
    addMessageListener('nplus:notes2:items', function (m) {
      if (stale()) return;
      if (m.data.off) { items.slice().forEach(function (it) { unwrap(it.id); }); items = []; return; }
      if (m.data.url !== url) return;
      L = m.data.labels || L;
      var fresh = m.data.items || [];
      items.forEach(function (it) { if (!fresh.some(function (f) { return f.id === it.id; })) unwrap(it.id); });
      items = fresh;
      if (m.data.focus) focusId = m.data.focus;
      apply(); watch();
      if (focusId) focus(focusId);
    });
    addMessageListener('nplus:notes2:create', function (m) { if (!stale()) create(m.data.kind, m.data.color); });
    addMessageListener('nplus:notes2:focus', function (m) { if (!stale()) focus(m.data.id); });
    if (content.document && content.document.readyState !== 'loading') hello();
  })(this);`;

  NP.feature({
    name: "Notes",
    async init() {
      if (!NP.prefs.get("nplus-notes")) return;
      // set before the await: the selection bubble reads it when it starts
      NP.notes = {
        create: (kind, color, browser) => this.create(kind, color, browser),
        open: () => this.open(),
        exportMd: () => this.exportMd(),
      };
      await NP.store.load();
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.pending = new WeakMap();
      this.listeners = {
        "nplus:notes2:hello": (m) => this.hello(m.target, m.data.url),
        "nplus:notes2:save": (m) => this.save(m.target, m.data),
        "nplus:notes2:remove": (m) => this.remove(m.target, m.data),
      };
      for (const [k, fn] of Object.entries(this.listeners)) window.messageManager.addMessageListener(k, fn);
      this.script = "data:," + encodeURIComponent(NOTES);
      window.messageManager.loadFrameScript(this.script, true);
      this.nav = {
        onLocationChange: (browser, webProgress, request, location, flags) => {
          if (webProgress?.isTopLevel && flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT) {
            try {
              browser.messageManager.sendAsyncMessage("nplus:notes2:nav", {});
            } catch {}
          }
        },
      };
      gBrowser.addTabsProgressListener(this.nav);
      this.offs = [
        NP.hotkey?.("ctrl+alt+h", () => this.create("hl")),
        NP.hotkey?.("ctrl+alt+n", () => this.create("page")),
        NP.hotkey?.("ctrl+alt+b", () => (this.panel.hidden ? this.open() : this.close())),
      ];
      this.build();
      this.markTabs();
    },

    all() {
      return NP.store.data.notes ?? [];
    },
    setAll(list) {
      NP.store.data.notes = list;
      NP.store.set("notes", list);
      this.markTabs();
      if (!this.panel?.hidden) this.render();
    },
    labels() {
      return { pin: "✎", del: "حذف", placeholder: "یادداشت…", page: "یادداشت این صفحه" };
    },

    hello(browser, url, focus) {
      const key = pageKey(url);
      const items = key ? this.all().filter((n) => n.key === key) : [];
      const f = focus ?? this.pending.get(browser);
      if (f) this.pending.delete(browser);
      try {
        browser.messageManager.sendAsyncMessage("nplus:notes2:items", { url, items, labels: this.labels(), focus: f });
      } catch {}
      const tab = gBrowser.getTabForBrowser(browser);
      tab?.toggleAttribute("nplus-noted", items.length > 0);
    },

    save(browser, { url, title, item }) {
      const key = pageKey(url);
      if (!key) return;
      const list = this.all();
      const i = list.findIndex((n) => n.id === item.id);
      const now = Date.now();
      const rec = { ...(i >= 0 ? list[i] : { created: now }), ...item, key, url: url.split("#")[0], title: title || "", updated: now };
      if (i >= 0) list[i] = rec;
      else list.push(rec);
      this.setAll(list);
    },

    remove(browser, { id }) {
      this.setAll(this.all().filter((n) => n.id !== id));
    },

    create(kind, color = "y", browser = gBrowser.selectedBrowser) {
      if (!/^https?:/.test(browser.currentURI.spec)) {
        NP.island?.show({ title: "یادداشت فقط روی صفحه‌های وب", duration: 1800 });
        return;
      }
      browser.messageManager.sendAsyncMessage("nplus:notes2:create", { kind, color });
    },

    markTabs() {
      const keys = new Set(this.all().map((n) => n.key));
      for (const t of gBrowser.tabs) t.toggleAttribute("nplus-noted", keys.has(pageKey(t.linkedBrowser.currentURI.spec)));
    },

    // ---------- notebook ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-notes-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "📒 دفترچه" }),
          NP.html("button", { class: "wt-btn", text: "خروجی Markdown", onclick: () => this.exportMd() }),
          NP.html("button", { class: "wt-btn wt-primary", text: "+ یادداشت این صفحه", onclick: () => (this.close(), this.create("page")) }),
        ]),
        NP.html("input", { class: "np-search", type: "text", dir: "auto", placeholder: "جستجو در یادداشت‌ها…" }),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "متن رو انتخاب کن ← هایلایت / یادداشت  ·  Ctrl+Alt+H هایلایت  ·  Ctrl+Alt+N یادداشت صفحه" }),
      ]);
      document.body.append(this.panel);
      this.search = this.panel.querySelector(".np-search");
      this.search.addEventListener("input", () => this.render());
      this.search.addEventListener("keydown", (e) => e.key === "Escape" && this.close());
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-notes-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
      this.onLoc = () => this.markTabs();
      gBrowser.tabContainer.addEventListener("TabSelect", this.onLoc);
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.search.focus();
    },

    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    render() {
      const list = this.panel.querySelector(".wt-list");
      const q = this.search.value.trim().toLowerCase();
      const notes = this.all()
        .filter((n) => !q || `${n.note} ${n.exact ?? ""} ${n.title} ${n.key}`.toLowerCase().includes(q))
        .sort((a, b) => b.updated - a.updated);
      if (!notes.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: q ? "چیزی پیدا نشد." : "هنوز یادداشتی نیست. روی هر صفحه‌ای متنی رو انتخاب کن و «هایلایت» یا «یادداشت» رو بزن." }));
        return;
      }
      const groups = new Map();
      for (const n of notes) {
        const host = n.key.split("/")[0];
        if (!groups.has(host)) groups.set(host, []);
        groups.get(host).push(n);
      }
      const rows = [];
      for (const [host, ns] of groups) {
        rows.push(NP.html("div", { class: "np-group", text: `${host} · ${fa(ns.length)}` }));
        for (const n of ns) {
          const row = NP.html("div", { class: "wt-row np-clickable" }, [
            NP.html("div", { class: "np-swatch" }),
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "wt-name", text: n.title || n.key, dir: "auto" }),
              n.exact ? NP.html("div", { class: "np-quote", text: n.exact, dir: "auto" }) : null,
              n.note ? NP.html("div", { class: "wt-value", text: n.note, dir: "auto" }) : null,
              NP.html("div", { class: "wt-meta", text: n.kind === "page" ? "یادداشت صفحه" : n.note ? "هایلایت + یادداشت" : "هایلایت" }),
            ].filter(Boolean)),
            NP.html("div", { class: "wt-actions" }, [
              NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: (e) => (e.stopPropagation(), this.drop(n)) }),
            ]),
          ]);
          row.style.setProperty("--np-c", COLORS[n.color] ?? COLORS.y);
          row.querySelector(".np-swatch").style.background = COLORS[n.color] ?? COLORS.y;
          row.addEventListener("click", () => this.goto(n));
          rows.push(row);
        }
      }
      list.replaceChildren(...rows);
    },

    drop(n) {
      this.setAll(this.all().filter((x) => x.id !== n.id));
      for (const t of gBrowser.tabs) if (pageKey(t.linkedBrowser.currentURI.spec) === n.key) this.hello(t.linkedBrowser, t.linkedBrowser.currentURI.spec);
    },

    goto(n) {
      this.close();
      const tab = gBrowser.tabs.find((t) => !t.hasAttribute("nplus-worker") && pageKey(t.linkedBrowser.currentURI.spec) === n.key);
      if (tab) {
        gBrowser.selectedTab = tab;
        tab.linkedBrowser.messageManager.sendAsyncMessage("nplus:notes2:focus", { id: n.id });
        return;
      }
      const t = gBrowser.addTab(n.url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      this.pending.set(t.linkedBrowser, n.id);
      gBrowser.selectedTab = t;
    },

    exportMd() {
      const notes = [...this.all()].sort((a, b) => a.key.localeCompare(b.key) || a.created - b.created);
      let md = "# Nebula notes\n";
      let last = "";
      for (const n of notes) {
        if (n.key !== last) {
          md += `\n## ${n.title || n.key}\n${n.url}\n\n`;
          last = n.key;
        }
        if (n.exact) md += `> ${n.exact}\n\n`;
        if (n.note) md += `${n.note}\n\n`;
      }
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(md);
      NP.island?.show({ title: "دفترچه کپی شد", subtitle: `${fa(notes.length)} مورد به‌صورت Markdown`, duration: 2200 });
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:notes2:items", { off: true });
        for (const [k, fn] of Object.entries(this.listeners ?? {})) window.messageManager.removeMessageListener(k, fn);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      if (this.nav) gBrowser.removeTabsProgressListener(this.nav);
      for (const off of this.offs ?? []) off?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      gBrowser.tabContainer.removeEventListener("TabSelect", this.onLoc);
      this.panel?.remove();
      for (const t of gBrowser.tabs) t.removeAttribute("nplus-noted");
      delete NP.notes;
    },
  });
})();
