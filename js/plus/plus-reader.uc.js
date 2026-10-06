// Nebula Plus — reader mode in the Nebula look.
// Firefox's reader view (the book icon in the URL bar, F9, or "Reader view"
// in the palette) gets a deep glass backdrop, the text on a soft card, Meem
// for Persian, a reading progress line, and a "۳ خط خلاصه" button that asks
// the assistant for a three-line summary right above the article.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-reader"] = true;

  const SHEET = `
  @-moz-document url-prefix("about:reader") {
    body.dark, body.light, body.sepia {
      --nr-accent: #8b7bff;
      --main-background: transparent !important;
      background:
        radial-gradient(90% 60% at 15% -10%, color-mix(in srgb, var(--nr-accent) 22%, transparent), transparent 60%),
        radial-gradient(70% 50% at 100% 0%, rgb(110 200 255 / 12%), transparent 60%),
        var(--nr-bg) !important;
      background-attachment: fixed !important;
    }
    body.dark { --nr-bg: #0e0e15; --nr-card: rgb(255 255 255 / 4%); --nr-line: rgb(255 255 255 / 8%); --main-foreground: #e9e9f1 !important; }
    body.light { --nr-bg: #f4f3f8; --nr-card: rgb(255 255 255 / 80%); --nr-line: rgb(0 0 0 / 6%); --main-foreground: #1d1d26 !important; }
    body.sepia { --nr-bg: #efe6d5; --nr-card: rgb(255 252 244 / 70%); --nr-line: rgb(90 60 20 / 10%); }

    .container {
      margin-block: 40px 80px !important; padding: 44px 56px 56px !important; border-radius: 28px !important;
      background: var(--nr-card) !important;
      box-shadow: 0 0 0 1px var(--nr-line), 0 40px 100px -50px rgb(0 0 0 / 60%) !important;
      backdrop-filter: blur(30px) !important;
    }
    .reader-title { font-weight: 800 !important; letter-spacing: -0.01em !important; line-height: 1.3 !important; }
    .reader-domain { color: var(--nr-accent) !important; font-weight: 700 !important; text-decoration: none !important; }
    .domain-border { display: none !important; }
    .container > hr { border: none !important; height: 1px !important; background: var(--nr-line) !important; }
    .moz-reader-content a { color: var(--nr-accent) !important; text-decoration-color: color-mix(in srgb, var(--nr-accent) 40%, transparent) !important; }
    .moz-reader-content img { border-radius: 14px !important; }
    .moz-reader-content blockquote { border-inline-start: 3px solid var(--nr-accent) !important; padding-inline-start: 16px !important; border-radius: 2px !important; }
    .moz-reader-content pre, .moz-reader-content code { border-radius: 10px !important; }
    .container:is([dir="rtl"], [lang^="fa"]) .moz-reader-content,
    .container:is([dir="rtl"], [lang^="fa"]) .reader-title,
    .container:is([dir="rtl"], [lang^="fa"]) .meta-data { font-family: "Meem", "Vazirmatn", sans-serif !important; }
    .container:is([dir="rtl"], [lang^="fa"]) .moz-reader-content { line-height: 2 !important; }

    .toolbar { border-radius: 18px !important; background: color-mix(in srgb, var(--nr-bg) 70%, transparent) !important;
      backdrop-filter: blur(20px) !important; box-shadow: 0 0 0 1px var(--nr-line), 0 16px 40px -20px rgb(0 0 0 / 50%) !important; }

    #nplus-reader-progress { position: fixed !important; inset: 0 0 auto 0 !important; height: 3px !important; z-index: 10 !important; pointer-events: none !important;
      background: linear-gradient(90deg, var(--nr-accent), #6ee7ff) !important; transform-origin: left !important;
      transform: scaleX(var(--nr-p, 0)) !important; box-shadow: 0 0 12px var(--nr-accent) !important; }
    #nplus-reader-sum { display: block !important; margin: 18px 0 0 !important; }
    #nplus-reader-sum button { all: unset; display: inline-flex !important; align-items: center !important; gap: 8px !important; padding: 8px 16px !important; border-radius: 99px !important;
      cursor: pointer !important; font: 700 13px/1 "Meem", "Vazirmatn", system-ui, sans-serif !important; color: white !important;
      background: linear-gradient(135deg, var(--nr-accent), #6e9bff) !important; box-shadow: 0 10px 24px -12px var(--nr-accent) !important; }
    #nplus-reader-sum button:hover { filter: brightness(1.12) !important; }
    #nplus-reader-sum button[disabled] { opacity: .6 !important; cursor: default !important; }
    #nplus-reader-sum .nr-out { display: block !important; margin-top: 14px !important; padding: 16px 18px !important; border-radius: 18px !important;
      background: color-mix(in srgb, var(--nr-accent) 10%, transparent) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--nr-accent) 30%, transparent) !important;
      font: 500 15px/2 "Meem", "Vazirmatn", system-ui, sans-serif !important; direction: rtl !important; text-align: right !important; white-space: pre-wrap !important; }
    #nplus-reader-sum .nr-out:empty { display: none !important; }
  }`;

  // Content side (ASCII only).
  const READER = `(function(G){
    var ME = {}; G.__nplus_reader = ME;
    function stale() { return G.__nplus_reader !== ME; }
    var labels = null;
    function setup() {
      if (stale() || !labels) return;
      var d = content.document;
      if (!/^about:reader/.test(d.URL)) return;
      var head = d.querySelector('.reader-header'), body = d.querySelector('.moz-reader-content');
      if (!head || !body || !body.textContent.trim()) { content.setTimeout(setup, 500); return; }
      if (d.getElementById('nplus-reader-sum')) return;
      var bar = d.createElement('div'); bar.id = 'nplus-reader-progress'; d.body.append(bar);
      function prog() { var h = d.documentElement.scrollHeight - content.innerHeight; bar.style.setProperty('--nr-p', h > 0 ? Math.min(1, content.scrollY / h) : 0); }
      content.addEventListener('scroll', prog, { passive: true }); prog();
      var box = d.createElement('div'); box.id = 'nplus-reader-sum';
      var btn = d.createElement('button'); btn.textContent = labels.sum;
      var out = d.createElement('div'); out.className = 'nr-out';
      box.append(btn, out); head.append(box);
      btn.addEventListener('click', function () {
        btn.disabled = true; out.textContent = labels.wait;
        sendAsyncMessage('nplus:reader1:sum', { title: (d.querySelector('.reader-title') || {}).textContent || '', text: body.innerText.slice(0, 14000) });
      });
      addMessageListener('nplus:reader1:answer', function (m) { out.textContent = m.data.text; if (m.data.done) btn.disabled = false; });
    }
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document) content.setTimeout(setup, 300); }, true);
    addMessageListener('nplus:reader1:cfg', function (m) { labels = m.data; setup(); });
    sendAsyncMessage('nplus:reader1:hello', {});
  })(this);`;

  const strip = (t) => String(t ?? "").replace(/\*\*|__|`/g, "").replace(/^#+\s*/gm, "").trim();

  NP.feature({
    name: "Reader",
    init() {
      if (!NP.prefs.get("nplus-reader")) return;
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.labels = { sum: "✦ خلاصه در ۳ خط", wait: "دارم می‌خونمش…" };
      this.onHello = (m) => m.target.messageManager.sendAsyncMessage("nplus:reader1:cfg", this.labels);
      this.onSum = (m) => this.summarize(m.target, m.data);
      window.messageManager.addMessageListener("nplus:reader1:hello", this.onHello);
      window.messageManager.addMessageListener("nplus:reader1:sum", this.onSum);
      this.script = "data:," + encodeURIComponent(READER);
      window.messageManager.loadFrameScript(this.script, true);
    },

    async summarize(browser, { title, text }) {
      const reply = (t, done) => {
        try {
          browser.messageManager.sendAsyncMessage("nplus:reader1:answer", { text: t, done });
        } catch {}
      };
      const prompt = `Summarize this article in Persian (Farsi) in exactly 3 short lines, each starting with "• ". Plain text, no headings, no intro.\n\nTitle: ${title}\n\n${text}`;
      try {
        const a = await NP.assistant?.ask?.(prompt, (t) => reply(strip(t), false), { fast: true });
        reply(strip(a) || "جوابی نیومد", true);
      } catch (err) {
        reply(`نشد: ${err.message}`, true);
      }
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:reader1:hello", this.onHello);
        window.messageManager.removeMessageListener("nplus:reader1:sum", this.onSum);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
    },
  });
})();
