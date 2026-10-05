// Nebula Plus — a new PDF reader on top of Firefox's pdf.js.
// pdf.js's toolbar goes away; the page gets the whole window. A thin bar at
// the top shows how far you've read; a floating header carries the title,
// "page 3 of 15 · ~6 min left", dark pages, download and print; a floating
// dock at the bottom has thumbnails, page ‹ › , zoom − / + / fit, find and
// focus. Both fade while you read and come back when you move the mouse;
// focus mode clears everything (Esc brings it back). Dark pages use pdf.js's
// own page colours (text/background recoloured, images untouched).
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-pdf-skin"] = true;
  NP.DEFAULTS["nplus-pdf-dark"] = true;

  const PDF = 'html:has(> body > #outerContainer #viewerContainer)';
  const SHEET = `
    ${PDF} {
      --np-accent: #8b7bff; --np-glass: rgb(18 18 28 / 78%); --np-line: rgb(255 255 255 / 9%);
      color-scheme: dark !important;
    }
    ${PDF} body {
      background:
        radial-gradient(60% 40% at 85% 0%, rgb(139 123 255 / 14%), transparent 70%),
        radial-gradient(50% 40% at 0% 100%, rgb(95 180 255 / 9%), transparent 70%),
        #0c0c13 !important;
    }
    ${PDF} :is(#outerContainer, #mainContainer, #viewerContainer) { background: transparent !important; }

    /* pdf.js's own toolbar: out of sight (kept in the page for its menus) */
    ${PDF} #toolbarContainer { visibility: hidden !important; height: 0 !important; min-height: 0 !important; overflow: visible !important; }
    ${PDF} #outerContainer { --toolbar-height: 0px !important; }
    ${PDF} #viewerContainer { top: 0 !important; inset-block-start: 0 !important; }
    ${PDF} :is(#sidebarContainer, #viewsManager) {
      top: 70px !important; bottom: auto !important; height: calc(100vh - 160px) !important; inset-inline-start: 14px !important; width: 260px !important;
      border-radius: 18px !important; overflow: hidden !important;
      background: var(--np-glass) !important; backdrop-filter: blur(24px) saturate(160%) !important;
      box-shadow: 0 0 0 0.5px var(--np-line), 0 24px 60px -24px rgb(0 0 0 / 80%) !important;
    }
    ${PDF} :is(#sidebarContent, #thumbnailView, #viewsManagerContent, #toolbarSidebar, #viewsManagerHeader) { background: transparent !important; }
    ${PDF} #outerContainer:not(.viewsManagerOpen, .sidebarOpen) :is(#viewsManager, #sidebarContainer) { visibility: hidden !important; opacity: 0 !important; }

    /* pages: rounded sheets floating on the backdrop */
    ${PDF} .pdfViewer { padding: 76px 0 110px !important; }
    ${PDF} .pdfViewer .page {
      border: none !important; border-image: none !important; border-radius: 12px !important; overflow: hidden !important;
      margin: 18px auto !important; background-clip: padding-box !important;
      box-shadow: 0 0 0 0.5px rgb(255 255 255 / 6%), 0 26px 60px -28px rgb(0 0 0 / 95%) !important;
    }
    ${PDF} .thumbnailImage { border-radius: 6px !important; }
    ${PDF} #viewerContainer { scrollbar-color: rgb(255 255 255 / 16%) transparent !important; }

    /* ---- our UI ---- */
    #nplus-pdf, #nplus-pdf *:not(svg, svg *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-pdf { position: fixed !important; inset: 0 !important; pointer-events: none !important; z-index: 100000 !important;
      font: 500 13px/1.4 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #f2f2f8 !important; }
    #nplus-pdf .np-progress { position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important; height: 3px !important;
      background: rgb(255 255 255 / 6%) !important; }
    #nplus-pdf .np-progress-fill { display: block !important; height: 100% !important; width: var(--np-p, 0%) !important;
      background: linear-gradient(90deg, #5fb4ff, #8b7bff, #ff8ad8) !important; box-shadow: 0 0 12px #8b7bff !important;
      transition: width .2s ease !important; }
    #nplus-pdf .np-head, #nplus-pdf .np-dock {
      position: absolute !important; left: 50% !important; display: flex !important; align-items: center !important; gap: 4px !important;
      padding: 6px !important; border-radius: 18px !important; pointer-events: auto !important;
      background: rgb(18 18 28 / 80%) !important; backdrop-filter: blur(24px) saturate(170%) !important;
      box-shadow: 0 0 0 0.5px rgb(255 255 255 / 10%), 0 22px 50px -22px rgb(0 0 0 / 85%), 0 0 40px -24px #8b7bff !important;
      transition: opacity .35s ease, translate .45s cubic-bezier(.22,1,.36,1) !important;
    }
    #nplus-pdf .np-head { top: 14px !important; translate: -50% 0 !important; max-width: calc(100vw - 28px) !important; direction: rtl !important; }
    #nplus-pdf .np-dock { bottom: 18px !important; translate: -50% 0 !important; direction: ltr !important; }
    #nplus-pdf[data-idle] .np-head { opacity: 0 !important; translate: -50% -14px !important; pointer-events: none !important; }
    #nplus-pdf[data-idle] .np-dock { opacity: 0 !important; translate: -50% 14px !important; pointer-events: none !important; }
    #nplus-pdf[data-focus] :is(.np-head, .np-dock) { opacity: 0 !important; pointer-events: none !important; }
    #nplus-pdf .np-titlebox { display: flex !important; flex-direction: column !important; padding: 2px 12px 2px 8px !important; min-width: 0 !important; }
    #nplus-pdf .np-title { display: block !important; max-width: 46vw !important; overflow: hidden !important; text-overflow: ellipsis !important;
      white-space: nowrap !important; font: 700 14px/1.4 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; unicode-bidi: plaintext !important; }
    #nplus-pdf .np-sub { display: block !important; font: 500 11.5px/1.4 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #b9b0ff !important; }
    #nplus-pdf .np-sep { display: block !important; width: 1px !important; height: 22px !important; margin: 0 4px !important; background: rgb(255 255 255 / 10%) !important; }
    #nplus-pdf .np-btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
      min-width: 34px !important; height: 34px !important; padding: 0 9px !important; border-radius: 12px !important; cursor: pointer !important;
      color: #f2f2f8 !important; font: 600 12.5px/1 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; user-select: none !important;
      transition: background-color .12s ease !important; }
    #nplus-pdf .np-btn:hover { background: rgb(139 123 255 / 26%) !important; }
    #nplus-pdf .np-btn[data-on] { background: rgb(139 123 255 / 34%) !important; }
    #nplus-pdf .np-btn svg { display: block !important; width: 17px !important; height: 17px !important; flex: none !important; margin: 0 !important;
      position: static !important; translate: none !important; transform: none !important; fill: none !important; stroke: #d8d2ff !important;
      stroke-width: 2 !important; stroke-linecap: round !important; stroke-linejoin: round !important; }
    #nplus-pdf .np-btn svg * { fill: none !important; stroke: inherit !important; stroke-width: inherit !important; }
    #nplus-pdf .np-page { display: inline-flex !important; align-items: baseline !important; gap: 4px !important; padding: 0 8px !important;
      font: 700 13px/1 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; font-variant-numeric: tabular-nums !important; }
    #nplus-pdf .np-page input { width: 3.2em !important; padding: 5px 4px !important; border: none !important; border-radius: 8px !important;
      background: rgb(255 255 255 / 9%) !important; color: #fff !important; text-align: center !important; font: inherit !important; outline: none !important; }
    #nplus-pdf .np-zoom { display: inline-block !important; min-width: 3.4em !important; text-align: center !important;
      font: 600 12.5px/1 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; font-variant-numeric: tabular-nums !important; }
  `;

  // Content side (ASCII only; labels arrive with the config).
  const READER = `(function(G){
    var ME = {}; G.__nplus_pdf = ME;
    function stale() { return G.__nplus_pdf !== ME; }
    var cfg = null, ui = null, app = null, idleTimer = 0, built = false;
    var NS = 'http://www.w3.org/2000/svg';
    var IC = {
      side: ['M3 4h18v16H3z', 'M9 4v16'],
      prev: ['M15 18l-6-6 6-6'], next: ['M9 18l6-6-6-6'],
      minus: ['M5 12h14'], plus: ['M12 5v14', 'M5 12h14'],
      fit: ['M3 9V5h4', 'M21 9V5h-4', 'M3 15v4h4', 'M21 15v4h-4'],
      find: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
      focus: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
      moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
      down: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
      print: ['M6 9V3h12v6', 'M6 18H4v-7h16v7h-2', 'M6 14h12v7H6z']
    };
    function isPdf() { try { return content.document.nodePrincipal.origin === 'resource://pdf.js'; } catch (e) { return false; } }
    function btn(icon, title, fn, label) {
      var d = content.document, b = d.createElement('div');
      b.className = 'np-btn'; b.title = title || '';
      if (icon) { var s = d.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); IC[icon].forEach(function (p) { var e = d.createElementNS(NS, 'path'); e.setAttribute('d', p); s.append(e); }); b.append(s); }
      if (label) { var l = d.createElement('span'); l.textContent = label; b.append(l); }
      b.addEventListener('click', function (e) { e.preventDefault(); try { fn(b); } catch (err) {} });
      return b;
    }
    function sep() { var s = content.document.createElement('div'); s.className = 'np-sep'; return s; }
    function fa(n) { return Number(n).toLocaleString('fa-IR'); }
    function wake() {
      if (!ui) return;
      ui.removeAttribute('data-idle');
      content.clearTimeout(idleTimer);
      idleTimer = content.setTimeout(function () { if (ui && !ui.matches(':hover')) ui.setAttribute('data-idle', '1'); }, 2600);
    }
    function update() {
      if (!ui || !app) return;
      var vc = content.document.getElementById('viewerContainer');
      var max = vc.scrollHeight - vc.clientHeight;
      var p = max > 0 ? vc.scrollTop / max : 0;
      ui.style.setProperty('--np-p', (p * 100).toFixed(2) + '%');
      var page = app.page, total = app.pagesCount || 0;
      var input = ui.querySelector('.np-page input');
      if (input && content.document.activeElement !== input) input.value = page;
      ui.querySelector('.np-total').textContent = '/ ' + total;
      var left = Math.max(0, Math.round((total - page + 1) * cfg.minPerPage));
      ui.querySelector('.np-sub').textContent = cfg.labels.page.replace('%1', fa(page)).replace('%2', fa(total)) + (left ? ' \\u00b7 ' + cfg.labels.left.replace('%1', fa(left)) : '');
      ui.querySelector('.np-zoom').textContent = Math.round((app.pdfViewer.currentScale || 1) * 100) + '%';
    }
    function build() {
      var d = content.document;
      if (built || !d.body) return;
      built = true;
      var L = cfg.labels;
      ui = d.createElement('div'); ui.id = 'nplus-pdf';
      var prog = d.createElement('div'); prog.className = 'np-progress';
      var fill = d.createElement('div'); fill.className = 'np-progress-fill'; prog.append(fill);
      // header
      var head = d.createElement('div'); head.className = 'np-head';
      var tb = d.createElement('div'); tb.className = 'np-titlebox';
      var t = d.createElement('div'); t.className = 'np-title'; t.textContent = (d.title || '').replace(/\\.pdf$/i, '');
      var sub = d.createElement('div'); sub.className = 'np-sub';
      tb.append(t, sub);
      head.append(tb, sep(),
        btn('moon', L.dark, function () { sendAsyncMessage('nplus:pdf1:dark', {}); }),
        btn('down', L.download, function () { app.downloadOrSave(); }),
        btn('print', L.print, function () { app.triggerPrinting(); }));
      // dock
      var dock = d.createElement('div'); dock.className = 'np-dock';
      var pg = d.createElement('div'); pg.className = 'np-page';
      var inp = d.createElement('input'); inp.type = 'text'; inp.inputMode = 'numeric';
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var n = parseInt(String(inp.value).replace(/[\\u06f0-\\u06f9]/g, function (c) { return c.charCodeAt(0) - 0x6f0; }), 10); if (n) app.page = n; inp.blur(); } });
      var tot = d.createElement('span'); tot.className = 'np-total';
      pg.append(inp, tot);
      var zoom = d.createElement('span'); zoom.className = 'np-zoom';
      dock.append(
        btn('side', L.thumbs, function () { var tg = d.getElementById('viewsManagerToggleButton') || d.getElementById('sidebarToggleButton') || d.getElementById('sidebarToggle'); if (tg) tg.click(); }),
        sep(),
        btn('prev', L.prev, function () { if (app.page > 1) app.page = app.page - 1; }),
        pg,
        btn('next', L.next, function () { if (app.page < app.pagesCount) app.page = app.page + 1; }),
        sep(),
        btn('minus', L.zoomOut, function () { app.zoomOut(); }),
        zoom,
        btn('plus', L.zoomIn, function () { app.zoomIn(); }),
        btn('fit', L.fit, function () { app.pdfViewer.currentScaleValue = 'page-width'; }),
        sep(),
        btn('find', L.find, function () { sendAsyncMessage('nplus:pdf1:find', {}); }),
        btn('focus', L.focus, function (b) { var on = !ui.hasAttribute('data-focus'); ui.toggleAttribute('data-focus', on); b.toggleAttribute('data-on', on); })
      );
      ui.append(prog, head, dock);
      d.body.append(ui);
      var vc = d.getElementById('viewerContainer');
      vc.addEventListener('scroll', function () { update(); }, { passive: true });
      d.addEventListener('mousemove', wake, true);
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ui.hasAttribute('data-focus')) { ui.removeAttribute('data-focus'); var f = ui.querySelector('.np-dock .np-btn[data-on]'); if (f) f.removeAttribute('data-on'); } }, true);
      content.setInterval(function () { if (!stale()) update(); }, 1200);
      update(); wake();
    }
    function attach(tries) {
      if (stale() || !cfg || !cfg.on || !isPdf()) return;
      try { app = content.wrappedJSObject.PDFViewerApplication; } catch (e) { app = null; }
      if (app && app.pagesCount > 0 && content.document.getElementById('viewerContainer')) { build(); return; }
      if ((tries || 0) < 60) content.setTimeout(function () { attach((tries || 0) + 1); }, 300);
    }
    addMessageListener('nplus:pdf1:cfg', function (m) { if (stale()) return; cfg = m.data; if (!cfg.on && ui) { ui.remove(); ui = null; built = false; } else attach(0); });
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document) { built = false; ui = null; attach(0); } }, false);
    sendAsyncMessage('nplus:pdf1:hello', {});
  })(this);`;

  const PREFS = {
    "pdfjs.viewerCssTheme": ["int", 2],
    "pdfjs.forcePageColors": ["bool", true],
    "pdfjs.pageColorsBackground": ["string", "#16161f"],
    "pdfjs.pageColorsForeground": ["string", "#e6e6ef"],
  };

  NP.feature({
    name: "PdfSkin",
    init() {
      this.sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      this.onHello = (m) => this.sendCfg(m.target.messageManager);
      this.onFind = (m) => {
        const tab = gBrowser.getTabForBrowser(m.target);
        gBrowser.getFindBar(tab).then((fb) => fb.onFindCommand());
      };
      this.onDark = (m) => {
        NP.prefs.set("nplus-pdf-dark", !NP.prefs.get("nplus-pdf-dark"));
        setTimeout(() => m.target.reload(), 150); // page colours apply on load; pdf.js keeps your place
      };
      const mm = window.messageManager;
      mm.addMessageListener("nplus:pdf1:hello", this.onHello);
      mm.addMessageListener("nplus:pdf1:find", this.onFind);
      mm.addMessageListener("nplus:pdf1:dark", this.onDark);
      this.script = "data:," + encodeURIComponent(READER);
      mm.loadFrameScript(this.script, true);
      this.apply = () => {
        const skin = NP.prefs.get("nplus-pdf-skin");
        const has = this.sss.sheetRegistered(this.sheet, this.sss.USER_SHEET);
        if (skin && !has) this.sss.loadAndRegisterSheet(this.sheet, this.sss.USER_SHEET);
        if (!skin && has) this.sss.unregisterSheet(this.sheet, this.sss.USER_SHEET);
        const dark = NP.prefs.get("nplus-pdf-dark");
        for (const [name, [type, value]] of Object.entries(PREFS)) {
          const on = name === "pdfjs.viewerCssTheme" ? skin : skin && dark;
          if (!on) Services.prefs.clearUserPref(name);
          else if (type === "int") Services.prefs.setIntPref(name, value);
          else if (type === "bool") Services.prefs.setBoolPref(name, value);
          else Services.prefs.setStringPref(name, value);
        }
        try {
          mm.broadcastAsyncMessage("nplus:pdf1:cfg", this.cfg());
        } catch {}
      };
      NP.prefs.watch("nplus-pdf-skin", this.apply);
      NP.prefs.watch("nplus-pdf-dark", this.apply);
      this.apply();
    },

    cfg() {
      return {
        on: !!NP.prefs.get("nplus-pdf-skin"),
        minPerPage: 1.6,
        labels: {
          page: "صفحه‌ی %1 از %2",
          left: "حدود %1 دقیقه مونده",
          dark: "صفحه‌ی تیره / روشن",
          download: "دانلود",
          print: "چاپ",
          thumbs: "صفحه‌ها",
          prev: "صفحه‌ی قبل",
          next: "صفحه‌ی بعد",
          zoomOut: "کوچک‌تر",
          zoomIn: "بزرگ‌تر",
          fit: "هم‌اندازه‌ی عرض",
          find: "جستجو (Ctrl+F)",
          focus: "حالت تمرکز (Esc برای برگشت)",
        },
      };
    },

    sendCfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:pdf1:cfg", this.cfg());
      } catch {}
    },

    destroy() {
      try {
        const mm = window.messageManager;
        mm.removeDelayedFrameScript(this.script);
        mm.removeMessageListener("nplus:pdf1:hello", this.onHello);
        mm.removeMessageListener("nplus:pdf1:find", this.onFind);
        mm.removeMessageListener("nplus:pdf1:dark", this.onDark);
        if (this.sss.sheetRegistered(this.sheet, this.sss.USER_SHEET)) this.sss.unregisterSheet(this.sheet, this.sss.USER_SHEET);
      } catch {}
    },
  });
})();
