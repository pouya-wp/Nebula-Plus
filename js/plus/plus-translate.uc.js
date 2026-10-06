// Nebula Plus — translate the whole page into Persian (Gemini).
// Ctrl+Alt+X or the palette. The text is translated in place, block by
// block, starting with what's on screen; links, bold and the page layout
// stay as they were (only the words change, right-to-left, in Meem).
// The pill at the bottom shows progress and switches back to the original.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-translate"] = true;

  const SHEET = `
    [data-nplus-tr] { direction: rtl !important; unicode-bidi: plaintext !important; font-family: "Meem", "Vazirmatn", inherit !important; }
    :where(#nplus-tr-pill, #nplus-tr-pill *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-tr-pill { position: fixed !important; bottom: 18px !important; left: 50% !important; translate: -50% 0 !important; z-index: 2147483646 !important;
      display: flex !important; align-items: center !important; gap: 10px !important; margin: 0 !important; padding: 8px 8px 8px 16px !important; border-radius: 99px !important;
      background: rgb(18 18 26 / 90%) !important; backdrop-filter: blur(18px) !important; box-shadow: 0 0 0 1px rgb(255 255 255 / 12%), 0 14px 34px -12px rgb(0 0 0 / 70%) !important;
      font: 700 12.5px/1 "Meem", "Vazirmatn", system-ui, sans-serif !important; color: #fff !important; direction: rtl !important; }
    #nplus-tr-pill .tp-btn { display: inline-block !important; padding: 7px 12px !important; border-radius: 99px !important; cursor: pointer !important;
      background: rgb(255 255 255 / 10%) !important; color: #fff !important; font: inherit !important; }
    #nplus-tr-pill .tp-btn:hover { background: rgb(139 123 255 / 50%) !important; }
    #nplus-tr-pill .tp-bar { display: block !important; width: 70px !important; height: 4px !important; border-radius: 99px !important; overflow: hidden !important; background: rgb(255 255 255 / 15%) !important; }
    #nplus-tr-pill .tp-fill { display: block !important; height: 100% !important; width: var(--tp) !important; background: #b9b0ff !important; }
  `;

  // Content side (ASCII only).
  const TR = `(function(G){
    var ME = {}; G.__nplus_tr = ME;
    function stale() { return G.__nplus_tr !== ME; }
    var L = null, blocks = [], done = 0, total = 0, showing = 'tr', pill = null, reqId = 0, running = false;
    var BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,figcaption,dt,dd,summary,caption,label,legend';
    var INLINE = /^(A|B|I|EM|STRONG|SPAN|SMALL|MARK|SUB|SUP|U|S|CODE|KBD|ABBR|CITE|Q|TIME|BR)$/;
    function d() { return content.document; }
    function eligible(el) {
      if (el.closest('pre, code, script, style, textarea, [contenteditable], #nplus-tr-pill, nav[aria-hidden="true"]')) return false;
      if (el.querySelector(BLOCK)) return false;
      var t = (el.innerText || '').trim();
      if (t.length < 2 || t.length > 3000 || !/[A-Za-z]{2}/.test(t)) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0;
    }
    // inline children become <gN>...</gN> so links and bold survive
    function pack(el) {
      var map = [], n = 0;
      function walk(node) {
        var s = '';
        node.childNodes.forEach(function (c) {
          if (c.nodeType === 3) s += c.data.replace(/[<>]/g, ' ');
          else if (c.nodeType === 1 && INLINE.test(c.tagName)) { if (c.tagName === 'BR') { s += ' '; return; } var i = n++; map[i] = c; s += '<g' + i + '>' + walk(c) + '</g' + i + '>'; }
          else if (c.nodeType === 1) s += (c.innerText || '');
        });
        return s;
      }
      return { text: walk(el).replace(/\\s+/g, ' ').trim(), map: map };
    }
    function unpack(el, str, map) {
      var frag = d().createDocumentFragment(), stack = [frag], re = /<(\\/?)g(\\d+)>/g, last = 0, m;
      function top() { return stack[stack.length - 1]; }
      while ((m = re.exec(str))) {
        if (m.index > last) top().append(str.slice(last, m.index));
        var orig = map[Number(m[2])];
        if (!m[1] && orig) { var c = orig.cloneNode(false); top().append(c); stack.push(c); }
        else if (m[1] && stack.length > 1) stack.pop();
        last = re.lastIndex;
      }
      if (last < str.length) top().append(str.slice(last));
      el.replaceChildren(frag);
    }
    function ui() {
      if (!pill) {
        pill = d().createElement('div'); pill.id = 'nplus-tr-pill';
        var label = d().createElement('span'); label.className = 'tp-label';
        var bar = d().createElement('span'); bar.className = 'tp-bar';
        var fill = d().createElement('span'); fill.className = 'tp-fill'; bar.append(fill);
        var sw = d().createElement('span'); sw.className = 'tp-btn tp-sw';
        var x = d().createElement('span'); x.className = 'tp-btn'; x.textContent = 'x';
        sw.addEventListener('click', toggle); x.addEventListener('click', function () { revert(); pill.remove(); pill = null; });
        pill.append(label, bar, sw, x);
        d().documentElement.append(pill);
      }
      pill.querySelector('.tp-label').textContent = done < total && running ? L.working.replace('%1', done).replace('%2', total) : L.ready;
      pill.style.setProperty('--tp', (total ? Math.round(done / total * 100) : 0) + '%');
      pill.querySelector('.tp-bar').style.setProperty('display', done < total && running ? 'block' : 'none', 'important');
      pill.querySelector('.tp-sw').textContent = showing === 'tr' ? L.original : L.persian;
    }
    function apply(b, mode) {
      if (mode === 'tr' && b.tr != null) { unpack(b.el, b.tr, b.map); b.el.setAttribute('data-nplus-tr', '1'); }
      else if (mode === 'orig' && b.orig) { b.el.replaceChildren.apply(b.el, b.orig.map(function (n) { return n.cloneNode(true); })); b.el.removeAttribute('data-nplus-tr'); }
    }
    function toggle() { showing = showing === 'tr' ? 'orig' : 'tr'; blocks.forEach(function (b) { if (b.tr != null) apply(b, showing); }); ui(); }
    function revert() { showing = 'orig'; blocks.forEach(function (b) { if (b.tr != null) apply(b, 'orig'); }); running = false; }
    function start() {
      if (blocks.length) { if (showing !== 'tr') toggle(); return; }
      var vh = content.innerHeight;
      var els = Array.prototype.filter.call(d().querySelectorAll(BLOCK), eligible).slice(0, 600);
      els.sort(function (a, b) { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); var da = ra.top < 0 ? vh - ra.top : ra.top, db = rb.top < 0 ? vh - rb.top : rb.top; return da - db; });
      blocks = els.map(function (el) { var p = pack(el); return { el: el, text: p.text, map: p.map, orig: Array.prototype.slice.call(el.childNodes).map(function (n) { return n.cloneNode(true); }), tr: null }; }).filter(function (b) { return b.text; });
      total = blocks.length; done = 0; running = true; showing = 'tr'; ui(); next();
    }
    function next() {
      if (stale() || !running) return;
      var batch = [], size = 0;
      for (var i = 0; i < blocks.length && batch.length < 40; i++) {
        var b = blocks[i]; if (b.tr != null || b.sent) continue;
        if (size + b.text.length > 3500 && batch.length) break;
        b.sent = true; batch.push(i); size += b.text.length;
      }
      if (!batch.length) { running = false; ui(); return; }
      var id = ++reqId;
      ME.pending = { id: id, idx: batch };
      sendAsyncMessage('nplus:tr1:batch', { id: id, items: batch.map(function (i) { return blocks[i].text; }) });
    }
    addMessageListener('nplus:tr1:start', function (m) { if (stale()) return; L = m.data.labels; start(); });
    addMessageListener('nplus:tr1:out', function (m) {
      if (stale() || !ME.pending || m.data.id !== ME.pending.id) return;
      var idx = ME.pending.idx, out = m.data.out || [];
      idx.forEach(function (bi, k) {
        var b = blocks[bi];
        if (typeof out[k] === 'string' && out[k].trim()) { b.tr = out[k]; if (showing === 'tr') { try { apply(b, 'tr'); } catch (e) {} } }
        else b.tr = null;
        done++;
      });
      if (m.data.error) { running = false; }
      ui(); next();
    });
    addEventListener('pagehide', function () { blocks = []; running = false; pill = null; }, true);
  })(this);`;

  NP.feature({
    name: "PageTranslate",
    init() {
      if (!NP.prefs.get("nplus-translate")) return;
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.loaded = new WeakSet();
      this.onBatch = (m) => this.batch(m.target, m.data);
      window.messageManager.addMessageListener("nplus:tr1:batch", this.onBatch);
      this.offKey = NP.hotkey?.("ctrl+alt+x", () => this.start());
      NP.translatePage = () => this.start();
    },

    start(browser = gBrowser.selectedBrowser) {
      if (!/^https?:/.test(browser.currentURI.spec)) return;
      if (!this.loaded.has(browser)) {
        this.loaded.add(browser);
        browser.messageManager.loadFrameScript("data:," + encodeURIComponent(TR), false);
      }
      browser.messageManager.sendAsyncMessage("nplus:tr1:start", {
        labels: { working: "دارم ترجمه می‌کنم… %1 از %2", ready: "ترجمه شد ✓", original: "نمایش اصلی", persian: "نمایش فارسی" },
      });
      if (!NP.gemini?.hasKey()) NP.island?.show({ title: "ترجمه با جمنای وب شروع شد", subtitle: "بدون کلید API کندتره — با nplus-gemini-key خیلی سریع می‌شه", duration: 4000 });
    },

    async batch(browser, { id, items }) {
      const send = (data) => {
        try {
          browser.messageManager.sendAsyncMessage("nplus:tr1:out", { id, ...data });
        } catch {}
      };
      const prompt = `Translate each string in this JSON array into natural, fluent Persian (Farsi). Keep the <gN> and </gN> tags exactly where the corresponding words go (they mark links/bold). Keep numbers, code, product names and URLs as they are. Reply with a JSON array of the same length, same order, strings only.\n\n${JSON.stringify(items)}`;
      try {
        const out = await NP.gemini.json(prompt);
        send({ out: Array.isArray(out) ? out : [] });
      } catch (err) {
        NP.logger?.warn(`translate: ${err}`);
        send({ out: [], error: String(err.message || err) });
      }
    },

    destroy() {
      this.offKey?.();
      window.messageManager.removeMessageListener("nplus:tr1:batch", this.onBatch);
      try {
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      delete NP.translatePage;
    },
  });
})();
