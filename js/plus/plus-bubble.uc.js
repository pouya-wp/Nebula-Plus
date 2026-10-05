// Nebula Plus — selection bubble.
// Select text on any page and a small glass bar appears above it:
// translate (fa ⇄ en) and explain answer right inside the bubble; search,
// copy, send to your phone (wormhole) and watch (watcher) are one click.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-bubble"] = true;

  // Look: a user sheet (beats any page CSS, and page CSP can't block it).
  const SHEET = `
    #nplus-bubble, #nplus-bubble *:not(svg, svg *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-bubble {
      position: fixed !important; left: var(--nb-x) !important; top: var(--nb-y) !important; z-index: 2147483647 !important;
      display: flex !important; flex-direction: column !important; gap: 6px !important;
      width: max-content !important; max-width: min(540px, calc(100vw - 16px)) !important; margin: 0 !important; padding: 5px !important;
      border-radius: 18px !important; border: none !important;
      background: rgb(22 22 32 / 92%) !important; backdrop-filter: blur(20px) saturate(170%) !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 10%), 0 18px 44px -14px rgb(0 0 0 / 70%), 0 0 34px -16px #8b7bff !important;
      font: 500 13px/1.5 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #f2f2f8 !important;
      direction: rtl !important; text-align: right !important; cursor: default !important;
      opacity: 0 !important; translate: 0 6px !important; scale: 0.96 !important;
      transition: opacity .15s ease, translate .25s cubic-bezier(.34,1.56,.64,1), scale .25s cubic-bezier(.34,1.56,.64,1) !important;
    }
    #nplus-bubble[data-open] { opacity: 1 !important; translate: 0 0 !important; scale: 1 !important; }
    #nplus-bubble .nb-row { display: flex !important; flex-wrap: wrap !important; gap: 2px !important; margin: 0 !important; }
    #nplus-bubble .nb-btn {
      display: inline-flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important;
      padding: 7px 10px !important; border-radius: 13px !important; cursor: pointer !important;
      color: #f2f2f8 !important; background: transparent !important;
      font: 600 13px/1 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; white-space: nowrap !important; user-select: none !important;
      transition: background-color .12s ease !important;
    }
    #nplus-bubble .nb-btn:hover { background: rgb(139 123 255 / 30%) !important; }
    #nplus-bubble .nb-btn svg { display: block !important; width: 16px !important; height: 16px !important; flex: none !important;
      margin: 0 !important; padding: 0 !important; position: static !important; inset: auto !important; translate: none !important;
      transform: none !important; scale: none !important; rotate: none !important; align-self: center !important; overflow: visible !important;
      fill: none !important; stroke: #b9b0ff !important; stroke-width: 2 !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
    #nplus-bubble .nb-btn svg * { fill: none !important; stroke: inherit !important; stroke-width: inherit !important; }
    #nplus-bubble .nb-btn:hover svg { stroke: #ffffff !important; }
    #nplus-bubble .nb-card { display: block !important; margin: 0 !important; padding: 10px 12px !important; border-radius: 13px !important;
      background: rgb(255 255 255 / 7%) !important; }
    #nplus-bubble .nb-card:has(.nb-out:empty) { display: none !important; }
    #nplus-bubble .nb-out {
      display: block !important; margin: 0 !important; max-height: 280px !important; overflow: auto !important;
      white-space: pre-wrap !important; font: 500 14.5px/1.85 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important;
      color: #ffffff !important; unicode-bidi: plaintext !important; user-select: text !important; scrollbar-width: thin !important;
    }
    #nplus-bubble .nb-out[data-wait] { color: #b9b0ff !important; }
  `;

  // Content side (ASCII only; labels arrive in the config message).
  const BUBBLE = `(function(G){
    var ME = {}; G.__nplus_bubble = ME;
    function stale() { return G.__nplus_bubble !== ME; }
    var cfg = null, el = null, out = null, current = '', timer = 0, reqId = 0;
    function doc() { return content.document; }
    function hide() {
      if (el) { el.removeAttribute('data-open'); var e = el; content.setTimeout(function () { if (!e.hasAttribute('data-open')) e.remove(); }, 180); el = null; out = null; }
    }
    function selector(node) {
      var d = doc(), n = node && node.nodeType === 3 ? node.parentNode : node;
      while (n && n !== d.body && n.nodeType === 1 && (n.textContent || '').length < 12) n = n.parentNode;
      var parts = [];
      while (n && n.nodeType === 1 && n !== d.body && parts.length < 8) {
        if (n.id) { parts.unshift('#' + content.CSS.escape(n.id)); break; }
        var p = n.parentNode, t = n.localName;
        if (p) { var same = Array.prototype.filter.call(p.children, function (c) { return c.localName === t; }); if (same.length > 1) t += ':nth-of-type(' + (same.indexOf(n) + 1) + ')'; }
        parts.unshift(t); n = p;
      }
      return parts.join(' > ');
    }
    function act(action) {
      var sel = content.getSelection();
      var anchor = sel && sel.rangeCount ? sel.getRangeAt(0).commonAncestorContainer : null;
      if (action === 'copy') {
        content.navigator.clipboard.writeText(current).catch(function () {});
        flash(cfg.labels.copied); return;
      }
      if (action === 'translate' || action === 'explain') {
        reqId++;
        out.setAttribute('data-wait', '1');
        out.textContent = cfg.labels.wait;
      }
      sendAsyncMessage('nplus:bubble2:act', { action: action, text: current, id: reqId, selector: action === 'watch' ? selector(anchor) : '', url: content.location.href, title: doc().title });
      if (action === 'search' || action === 'phone' || action === 'watch') hide();
    }
    function flash(t) { if (out) { out.removeAttribute('data-wait'); out.textContent = t; content.setTimeout(hide, 900); } }
    function show(rect) {
      var d = doc();
      hide();
      el = d.createElement('div'); el.id = 'nplus-bubble';
      var row = d.createElement('div'); row.className = 'nb-row';
      cfg.buttons.forEach(function (b) {
        var x = d.createElement('div'); x.className = 'nb-btn'; x.setAttribute('role', 'button');
        var NS = 'http://www.w3.org/2000/svg', svg = d.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        b.icon.forEach(function (pd) { var p = d.createElementNS(NS, 'path'); p.setAttribute('d', pd); svg.append(p); });
        var l = d.createElement('span'); l.textContent = b.label;
        x.append(svg, l);
        x.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
        x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); act(b.id); });
        row.append(x);
      });
      out = d.createElement('div'); out.className = 'nb-out';
      var card = d.createElement('div'); card.className = 'nb-card';
      card.append(out);
      el.append(row, card);
      el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      d.documentElement.append(el);
      var w = el.offsetWidth, h = el.offsetHeight, vw = content.innerWidth;
      var left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), vw - w - 8);
      var top = rect.top - h - 10;
      if (top < 8) top = rect.bottom + 10;
      // custom properties survive the sheet's all: initial
      el.style.setProperty('--nb-x', left + 'px');
      el.style.setProperty('--nb-y', top + 'px');
      content.requestAnimationFrame(function () { if (el) el.setAttribute('data-open', '1'); });
    }
    function check(e) {
      if (stale() || !cfg || !cfg.on) return;
      if (el && e && el.contains(e.target)) return;
      content.clearTimeout(timer);
      timer = content.setTimeout(function () {
        var sel = content.getSelection();
        var t = sel ? String(sel).trim() : '';
        var a = doc().activeElement;
        if (!t || t.length < 2 || t.length > 3000 || (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))) { if (!el || !out || !out.textContent) hide(); return; }
        if (t === current && el) return;
        current = t;
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (!r.width && !r.height) return;
        show(r);
      }, 60);
    }
    addEventListener('mouseup', check, true);
    addEventListener('keyup', function (e) { if (e.shiftKey || e.key === 'Shift') check(e); }, true);
    addEventListener('mousedown', function (e) { if (el && !el.contains(e.target)) { current = ''; hide(); } }, true);
    addEventListener('scroll', function () { if (el && !(out && out.textContent)) hide(); }, true);
    addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); }, true);
    addMessageListener('nplus:bubble2:cfg', function (m) { if (stale()) { cfg = null; hide(); return; } cfg = m.data; if (!cfg.on) hide(); });
    addMessageListener('nplus:bubble2:answer', function (m) {
      if (!out || m.data.id !== reqId) return;
      out.textContent = m.data.text;
      if (m.data.done) out.removeAttribute('data-wait');
    });
    sendAsyncMessage('nplus:bubble2:hello', {});
  })(this);`;

  const strip = (t) => String(t ?? "").replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "").trim();

  NP.feature({
    name: "SelectionBubble",
    init() {
      if (!NP.prefs.get("nplus-bubble")) return;
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.onHello = (m) => this.sendCfg(m.target.messageManager);
      this.onAct = (m) => this.act(m.target, m.data);
      window.messageManager.addMessageListener("nplus:bubble2:hello", this.onHello);
      window.messageManager.addMessageListener("nplus:bubble2:act", this.onAct);
      this.script = "data:," + encodeURIComponent(BUBBLE);
      window.messageManager.loadFrameScript(this.script, true);
      window.messageManager.broadcastAsyncMessage("nplus:bubble2:cfg", this.cfg());
      // copies from before the versioned messages: switch them off
      window.messageManager.broadcastAsyncMessage("nplus:bubble:cfg", { on: false });
    },

    cfg() {
      const I = {
        translate: ["M5 8l6 6", "M4 14l6-6 2-3", "M2 5h12", "M7 2h1", "M22 22l-5-10-5 10", "M14 18h6"],
        explain: ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"],
        search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
        copy: ["M8 8h12v12H8z", "M4 16V4h12"],
        phone: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M12 18h.01"],
        watch: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
      };
      const buttons = [
        { id: "translate", icon: I.translate, label: "ترجمه" },
        { id: "explain", icon: I.explain, label: "توضیح" },
        { id: "search", icon: I.search, label: "جستجو" },
        { id: "copy", icon: I.copy, label: "کپی" },
      ];
      if (NP.wormhole) buttons.push({ id: "phone", icon: I.phone, label: "گوشی" });
      if (NP.watch) buttons.push({ id: "watch", icon: I.watch, label: "زیر نظر" });
      return { on: true, buttons, labels: { wait: "یه لحظه…", copied: "کپی شد ✓" } };
    },

    sendCfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:bubble2:cfg", this.cfg());
      } catch {}
    },

    async act(browser, d) {
      const reply = (text, done) => {
        try {
          browser.messageManager.sendAsyncMessage("nplus:bubble2:answer", { id: d.id, text, done });
        } catch {}
      };
      switch (d.action) {
        case "search": {
          const url = `https://www.google.com/search?q=${encodeURIComponent(d.text.slice(0, 300))}`;
          gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), relatedToCurrent: true });
          return;
        }
        case "phone":
          NP.wormhole?.send(`${d.text}\n\n— ${d.title}\n${d.url}`);
          return;
        case "watch":
          NP.watch?.add({ selector: d.selector, text: d.text, url: d.url, title: d.title });
          return;
        case "translate":
        case "explain": {
          const fa = /[؀-ۿ]/.test(d.text);
          const prompt =
            d.action === "translate"
              ? `Translate the following text ${fa ? "into natural, fluent English" : "into natural, fluent Persian (Farsi)"}. Reply with the translation only, no notes.\n\n${d.text}`
              : `In Persian (Farsi), explain the following briefly and simply — 2 to 4 sentences, like to a smart friend. If it's a term, say what it means; if it's code, what it does. No headings.\n\n${d.text}`;
          try {
            const answer = await NP.assistant?.ask?.(prompt, (t) => reply(strip(t), false), { fast: true });
            reply(strip(answer) || "جوابی نیومد", true);
          } catch (err) {
            reply(`نشد: ${err.message}`, true);
          }
          return;
        }
      }
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:bubble2:cfg", { on: false });
        window.messageManager.removeMessageListener("nplus:bubble2:hello", this.onHello);
        window.messageManager.removeMessageListener("nplus:bubble2:act", this.onAct);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
    },
  });
})();
