// Nebula Plus — toman lens.
// Dollar / euro / pound prices on any page get the toman equivalent beside
// them at today's free-market rate (Nobitex USDT, other currencies through
// the global USD cross rate), and Gregorian dates show the Jalali date on
// hover. Pages are scanned once and then only what's added, with a cap.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-toman-lens"] = true;

  const store = {
    get: (k, f) => (NP.store.data && k in NP.store.data ? NP.store.data[k] : f),
    set: (k, v) => NP.store.set(k, v),
  };

  // Badge look: a user sheet (page CSP can't block it), only for our class.
  const SHEET = `
    .nplus-toman {
      display: inline-block !important; margin-inline-start: 4px !important; padding: 0 6px !important;
      border-radius: 99px !important; font: 600 clamp(10px, 0.78em, 13px)/1.6 "Meem", system-ui, sans-serif !important; vertical-align: middle !important;
      background: rgb(139 123 255 / 16%) !important; color: inherit !important; opacity: 0.9 !important;
      white-space: nowrap !important; vertical-align: baseline !important; direction: rtl !important;
      text-decoration: none !important; letter-spacing: 0 !important;
    }
    .nplus-jdate { text-decoration: underline dotted rgb(139 123 255 / 60%) !important; text-underline-offset: 3px !important; cursor: help !important; }
  `;

  // Content side (ASCII only; words come in through messages).
  const LENS = `(function(G){
    var ME = {}; G.__nplus_lens = ME;
    function stale() { return G.__nplus_lens !== ME; }
    var cfg = null, seen = new WeakSet(), timer = 0, observer = null;
    var SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE|KBD|SAMP|NOSCRIPT|SELECT|OPTION|svg)$/i;
    var NUM = '(\\\\d{1,3}(?:[,\\\\u066c]\\\\d{3})+(?:\\\\.\\\\d+)?|\\\\d+(?:\\\\.\\\\d+)?)';
    var MULT = '(?:\\\\s?(k|K|M|m|million|Million|billion|Billion|bn))?';
    var PRICE = new RegExp('(?:(US\\\\$|\\\\$|USD|EUR|GBP|\\\\u20ac|\\\\u00a3)\\\\s?' + NUM + MULT + ')|(?:' + NUM + MULT + '\\\\s?(USD|EUR|GBP|\\\\u20ac|\\\\$|dollars?|euros?)\\\\b)', 'g');
    var MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
    var DATE = new RegExp('\\\\b(?:(' + MONTHS + ')\\\\.?\\\\s+(\\\\d{1,2})(?:st|nd|rd|th)?,?\\\\s+(\\\\d{4})|(\\\\d{1,2})(?:st|nd|rd|th)?\\\\s+(' + MONTHS + ')\\\\.?,?\\\\s+(\\\\d{4})|(\\\\d{4})-(\\\\d{2})-(\\\\d{2}))\\\\b', 'g');

    function cur(sym) {
      sym = (sym || '').toLowerCase();
      if (sym === '\\u20ac' || sym === 'eur' || sym.indexOf('euro') === 0) return 'eur';
      if (sym === '\\u00a3' || sym === 'gbp') return 'gbp';
      return 'usd';
    }
    function mult(m) {
      if (!m) return 1;
      m = m.toLowerCase();
      if (m === 'k') return 1e3;
      if (m === 'm' || m === 'million') return 1e6;
      return 1e9;
    }
    function fmt(t) {
      var w = cfg.words, f = function (n, d) { return n.toLocaleString('fa-IR', { maximumFractionDigits: d }); };
      if (t >= 1e9) return f(t / 1e9, t >= 1e10 ? 0 : 1) + ' ' + w.b;
      if (t >= 1e6) return f(t / 1e6, t >= 1e8 ? 0 : 1) + ' ' + w.m;
      if (t >= 1e4) return f(Math.round(t / 1e3), 0) + ' ' + w.k;
      return f(Math.round(t), 0);
    }
    function jalali(y, mo, d) {
      var dt = new Date(y, mo, d);
      if (isNaN(dt)) return '';
      return dt.toLocaleDateString('fa-IR-u-ca-persian', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    var MI = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

    function process(node) {
      var text = node.data;
      if (text.length < 3 || text.length > 4000) return;
      var hits = [];
      var m;
      if (cfg && cfg.rates) {
        PRICE.lastIndex = 0;
        while ((m = PRICE.exec(text))) {
          var sym = m[1] || m[6], num = m[2] || m[4], mm = m[3] || m[5];
          var v = parseFloat(String(num).replace(/[,\\u066c]/g, '')) * mult(mm);
          var rate = cfg.rates[cur(sym)];
          if (!v || !rate || v > 1e12) continue;
          hits.push({ end: m.index + m[0].length, kind: 'price', label: '\\u2248 ' + fmt(v * rate) + ' ' + cfg.words.t });
        }
      }
      DATE.lastIndex = 0;
      while ((m = DATE.exec(text))) {
        var y, mo, d;
        if (m[1]) { mo = MI[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; }
        else if (m[5]) { mo = MI[m[5].slice(0, 3).toLowerCase()]; d = +m[4]; y = +m[6]; }
        else { y = +m[7]; mo = +m[8] - 1; d = +m[9]; }
        if (y < 1900 || y > 2200) continue;
        var j = jalali(y, mo, d);
        if (j) hits.push({ start: m.index, end: m.index + m[0].length, kind: 'date', label: j });
      }
      if (!hits.length) return;
      hits.sort(function (a, b) { return b.end - a.end; });
      var doc = node.ownerDocument;
      hits.forEach(function (h) {
        if (h.kind === 'price') {
          var tail = node.splitText(h.end);
          var b = doc.createElement('span');
          b.className = 'nplus-toman';
          b.textContent = h.label;
          tail.parentNode.insertBefore(b, tail);
          seen.add(tail);
        } else {
          var after = node.splitText(h.end);
          var mid = node.splitText(h.start);
          var s = doc.createElement('span');
          s.className = 'nplus-jdate';
          s.title = h.label;
          mid.parentNode.insertBefore(s, mid);
          s.appendChild(mid);
          seen.add(after); seen.add(mid);
        }
      });
    }

    function scan(root) {
      if (stale() || !cfg || !root) return;
      var d = content.document;
      var w = d.createTreeWalker(root, 4, { acceptNode: function (n) {
        if (seen.has(n)) return 2;
        for (var p = n.parentNode, i = 0; p && i < 6; p = p.parentNode, i++) {
          if (p.nodeType !== 1) continue;
          if (SKIP.test(p.tagName) || p.isContentEditable || (p.classList && (p.classList.contains('nplus-toman') || p.classList.contains('nplus-jdate')))) return 2;
        }
        return 1;
      } });
      var list = [], n, max = 3000;
      while ((n = w.nextNode()) && list.length < max) list.push(n);
      list.forEach(function (t) {
        seen.add(t);
        if (!/[$\\u20ac\\u00a3]|USD|EUR|GBP|dollar|euro|\\d{4}/.test(t.data)) return;
        var parent = t.parentNode;
        process(t);
        // a lone "$" or "USD" whose number sits in a sibling element: try the
        // few elements above it as one price
        if (/^[\\s$\\u20ac\\u00a3]*(US\\$|USD|EUR|GBP)?[\\s$\\u20ac\\u00a3]*$/.test(t.data) && /[$\\u20ac\\u00a3A-Z]/.test(t.data)) {
          for (var up = parent, i = 0; up && up.nodeType === 1 && i < 3; up = up.parentNode, i++) splitPrices(up, true);
        }
      });
    }

    // Prices split across elements (<sup>$</sup><b>4</b> USD): a short
    // element whose whole text is one price gets the badge at its end.
    var seenEl = new WeakSet();
    function splitPrices(root, onlyRoot) {
      if (stale() || !cfg || !cfg.rates || !root || root.nodeType !== 1) return;
      var els = onlyRoot ? [root] : [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'), 0, 4000)), count = 0;
      for (var i = 0; i < els.length && count < 300; i++) {
        var el = els[i];
        if (seenEl.has(el) || !el.childElementCount || el.childElementCount > 5 || SKIP.test(el.tagName)) continue;
        var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (t.length > 28 || !/[$\\u20ac\\u00a3]|USD|EUR|GBP/.test(t)) continue;
        // (not marked seen until badged: numbers are often filled in later)
        if (el.querySelector('.nplus-toman')) { seenEl.add(el); continue; }
        PRICE.lastIndex = 0;
        var m = PRICE.exec(t.replace(/([$\\u20ac\\u00a3])\\s+/, '$1'));
        if (!m || m.index > 2) continue;
        var sym = m[1] || m[6], num = m[2] || m[4], mm = m[3] || m[5];
        var v = parseFloat(String(num).replace(/[,\\u066c]/g, '')) * mult(mm);
        var rate = cfg.rates[cur(sym)];
        if (!v || !rate) continue;
        // only the innermost element holding the whole price
        var inner = false;
        for (var k = 0; k < el.children.length; k++) {
          var ct = el.children[k].textContent || '';
          if (/[$\\u20ac\\u00a3]/.test(ct) && /\\d/.test(ct)) inner = true;
        }
        if (inner) continue;
        seenEl.add(el);
        var b = el.ownerDocument.createElement('span');
        b.className = 'nplus-toman';
        b.textContent = '\\u2248 ' + fmt(v * rate) + ' ' + cfg.words.t;
        el.appendChild(b);
        count++;
      }
    }

    function start() {
      var d = content.document;
      if (!cfg || !d || !d.body || !/^https?:/.test(content.location.href)) return;
      scan(d.body);
      try { if (observer) observer.disconnect(); } catch (e) {} observer = null;
      // Busy pages (YouTube, a streaming AI answer) change all the time:
      // collect changed spots in a capped set, ignore long streaming text,
      // and look at them only when the page is idle.
      var pending = new Set(), overflow = false;
      observer = new content.MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'characterData') {
            var t = m.target;
            if (t.data.length > 120 || !/\\d/.test(t.data)) continue;
            seen.delete(t); pending.add(t); continue;
          }
          var added = m.addedNodes;
          for (var j = 0; j < added.length; j++) {
            var x = added[j];
            if (x.nodeType === 1 && x.classList && (x.classList.contains('nplus-toman') || x.classList.contains('nplus-jdate'))) continue;
            if (x.nodeType === 1 || x.nodeType === 3) pending.add(x);
          }
        }
        if (pending.size > 1500) { pending.clear(); overflow = true; }
        if (timer) return;
        timer = content.setTimeout(function () {
          var idle = content.requestIdleCallback ? function (f) { content.requestIdleCallback(f, { timeout: 3000 }); } : function (f) { content.setTimeout(f, 0); };
          idle(function () {
            timer = 0;
            if (stale() || !cfg) return;
            if (overflow) { overflow = false; pending.clear(); scan(d.body); return; }
            var batch = Array.from(pending); pending.clear();
            batch.forEach(function (a) {
              if (!a.isConnected) return;
              var el = a.nodeType === 3 ? a.parentNode : a;
              if (a.nodeType === 3) seen.delete(a);
              scan(el);
              // a number filled into <span>4</span> completes "$ 4 USD" a level or two up
              for (var up = el && el.parentNode, k = 0; up && up.nodeType === 1 && k < 2; up = up.parentNode, k++) splitPrices(up, true);
            });
          });
        }, 1200);
      });
      observer.observe(d.body, { childList: true, characterData: true, subtree: true });
    }

    addMessageListener('nplus:lens3:cfg', function (m) { if (stale()) { cfg = null; try { if (observer) observer.disconnect(); } catch (e) {} observer = null; return; } cfg = m.data; if (cfg.on) start(); });
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document && cfg && cfg.on) content.setTimeout(start, 600); }, false);
    sendAsyncMessage('nplus:lens3:hello', {});
  })(this);`;

  NP.feature({
    name: "TomanLens",
    async init() {
      if (!NP.prefs.get("nplus-toman-lens")) return;
      await NP.store.load();
      this.rates = store.get("tomanRates", null);
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.onHello = (m) => this.sendCfg(m.target.messageManager);
      window.messageManager.addMessageListener("nplus:lens3:hello", this.onHello);
      // every tab in this window, now and later
      this.script = "data:," + encodeURIComponent(LENS);
      window.messageManager.loadFrameScript(this.script, true);
      window.messageManager.broadcastAsyncMessage("nplus:lens:cfg", { on: false }); // pre-versioned copies
      window.messageManager.broadcastAsyncMessage("nplus:lens2:cfg", { on: false }); // copies before the idle queue
      await this.refresh();
      this.timer = setInterval(() => this.refresh(), 30 * 60 * 1000);
    },

    cfg() {
      return {
        on: true,
        rates: this.rates?.usd ? this.rates : null,
        words: { t: "تومان", k: "هزار", m: "میلیون", b: "میلیارد" },
      };
    },

    sendCfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:lens3:cfg", this.cfg());
      } catch {}
    },

    async refresh() {
      try {
        const nb = await (await fetch("https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls", { cache: "no-store" })).json();
        const usd = Number(nb?.stats?.["usdt-rls"]?.latest) / 10; // rial -> toman
        if (!usd) throw new Error("no usdt rate");
        let eur = null;
        let gbp = null;
        try {
          const fx = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
          if (fx?.rates?.EUR) eur = usd / fx.rates.EUR;
          if (fx?.rates?.GBP) gbp = usd / fx.rates.GBP;
        } catch {}
        this.rates = { usd, eur: eur ?? this.rates?.eur ?? usd * 1.08, gbp: gbp ?? this.rates?.gbp ?? usd * 1.27, at: Date.now() };
        store.set("tomanRates", this.rates);
        NP.tomanRate = this.rates;
      } catch (err) {
        NP.logger?.warn(`toman lens: ${err}`);
      }
      // tell every page the latest rate
      try {
        window.messageManager.broadcastAsyncMessage("nplus:lens3:cfg", this.cfg());
      } catch {}
    },

    destroy() {
      clearInterval(this.timer);
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:lens3:cfg", { on: false });
        window.messageManager.removeMessageListener("nplus:lens3:hello", this.onHello);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
    },
  });
})();
