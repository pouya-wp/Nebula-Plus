// Nebula Plus — media memory.
// Any video or long audio (3+ minutes: YouTube, a course site, a podcast)
// remembers where you left it. Come back to it — same tab or weeks later —
// and a small pill on the video offers «ادامه از ۱۲:۳۴». Finished ones are
// forgotten.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-memo"] = true;

  const SHEET = `
    :where(#nplus-memo, #nplus-memo *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-memo {
      position: fixed !important; left: var(--mx) !important; top: var(--my) !important; z-index: 2147483646 !important;
      display: flex !important; align-items: center !important; gap: 8px !important; margin: 0 !important; padding: 8px 8px 8px 14px !important;
      border-radius: 99px !important; cursor: pointer !important;
      background: rgb(18 18 26 / 88%) !important; backdrop-filter: blur(18px) saturate(170%) !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 14%), 0 14px 36px -12px rgb(0 0 0 / 70%), 0 0 30px -12px #8b7bff !important;
      font: 700 13px/1 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #fff !important; direction: rtl !important;
      animation: nplus-memo-in .35s cubic-bezier(.34,1.56,.64,1) !important;
    }
    @keyframes nplus-memo-in { from { opacity: 0; translate: 0 10px; scale: .94; } }
    #nplus-memo:hover { background: rgb(139 123 255 / 85%) !important; }
    #nplus-memo .nm-bar { display: block !important; width: 54px !important; height: 4px !important; border-radius: 99px !important; overflow: hidden !important;
      background: rgb(255 255 255 / 20%) !important; }
    #nplus-memo .nm-fill { display: block !important; height: 100% !important; width: var(--mp) !important; background: #b9b0ff !important; border-radius: inherit !important; }
    #nplus-memo .nm-x { display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 22px !important; height: 22px !important;
      border-radius: 50% !important; color: rgb(255 255 255 / 60%) !important; font: 600 13px/1 system-ui !important; }
    #nplus-memo .nm-x:hover { background: rgb(255 255 255 / 15%) !important; color: #fff !important; }
  `;

  // Content side (ASCII only).
  const MEMO = `(function(G){
    var ME = {}; G.__nplus_memo = ME;
    function stale() { return G.__nplus_memo !== ME; }
    var lastSave = 0, asked = {}, pill = null, pillT = 0, L = null;
    function key() {
      var u = content.location;
      if (/(^|\\.)youtube\\.com$/.test(u.hostname)) { var v = new content.URLSearchParams(u.search).get('v'); return v ? 'yt:' + v : ''; }
      if (!/^https?:$/.test(u.protocol)) return '';
      return u.origin + u.pathname + u.search;
    }
    function media(e) { var v = e.target; if (!v || !v.localName || (v.localName !== 'video' && v.localName !== 'audio')) return null; if (v.closest && v.closest('.ad-showing, .ad-interrupting')) return null; return v; }
    function clock(s) { s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
    function hidePill() { content.clearTimeout(pillT); if (pill) { pill.remove(); pill = null; } }
    function offer(v, t, d) {
      hidePill();
      if (!L || !v.isConnected || v.currentTime > t - 20) return;
      var doc = content.document;
      pill = doc.createElement('div'); pill.id = 'nplus-memo';
      var label = doc.createElement('span'); label.textContent = L.resume + ' ' + clock(t);
      var bar = doc.createElement('span'); bar.className = 'nm-bar';
      var fill = doc.createElement('span'); fill.className = 'nm-fill'; bar.append(fill);
      pill.style.setProperty('--mp', Math.round(t / d * 100) + '%');
      var x = doc.createElement('span'); x.className = 'nm-x'; x.textContent = 'x';
      pill.append(label, bar, x);
      pill.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (e.target !== x) { v.currentTime = t; if (v.paused) v.play().catch(function () {}); }
        hidePill();
      }, true);
      doc.documentElement.append(pill);
      var r = v.getBoundingClientRect();
      var vis = r.width > 200 && r.bottom > 0 && r.top < content.innerHeight;
      var left = vis ? r.left + 16 : 16, top = vis ? Math.min(r.bottom, content.innerHeight) - 66 : content.innerHeight - 70;
      pill.style.setProperty('--mx', Math.max(8, left) + 'px'); pill.style.setProperty('--my', Math.max(8, top) + 'px');
      pillT = content.setTimeout(hidePill, 12000);
    }
    addEventListener('timeupdate', function (e) {
      if (stale()) return;
      var v = media(e); if (!v || !isFinite(v.duration) || v.duration < 180) return;
      var k = key(); if (!k) return;
      if (!asked[k]) { asked[k] = 1; ME.v = v; sendAsyncMessage('nplus:memo1:ask', { k: k }); }
      var now = Date.now();
      if (now - lastSave > 5000 && !v.paused) {
        lastSave = now;
        sendAsyncMessage('nplus:memo1:save', { k: k, t: v.currentTime, d: v.duration, title: content.document.title });
      }
    }, true);
    addEventListener('pause', function (e) { var v = media(e); if (!stale() && v && isFinite(v.duration) && v.duration >= 180 && key()) sendAsyncMessage('nplus:memo1:save', { k: key(), t: v.currentTime, d: v.duration, title: content.document.title }); }, true);
    addEventListener('ended', function (e) { if (!stale() && media(e) && key()) sendAsyncMessage('nplus:memo1:save', { k: key(), t: 0, d: 0 }); }, true);
    addEventListener('pagehide', function () { hidePill(); asked = {}; }, true);
    addMessageListener('nplus:memo1:pos', function (m) {
      if (stale()) return;
      L = m.data.labels;
      if (m.data.k !== key() || !ME.v) return;
      offer(ME.v, m.data.t, m.data.d);
    });
  })(this);`;

  NP.feature({
    name: "MediaMemory",
    async init() {
      if (!NP.prefs.get("nplus-memo")) return;
      await NP.store.load();
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.onAsk = (m) => this.ask(m.target, m.data.k);
      this.onSave = (m) => this.save(m.data);
      window.messageManager.addMessageListener("nplus:memo1:ask", this.onAsk);
      window.messageManager.addMessageListener("nplus:memo1:save", this.onSave);
      this.script = "data:," + encodeURIComponent(MEMO);
      window.messageManager.loadFrameScript(this.script, true);
    },

    memo() {
      return (NP.store.data.mediaMemo ??= {});
    },

    ask(browser, k) {
      const m = this.memo()[k];
      if (!m || m.t < 30 || m.t > m.d - 30) return;
      try {
        browser.messageManager.sendAsyncMessage("nplus:memo1:pos", { k, t: m.t, d: m.d, labels: { resume: "ادامه از" } });
      } catch {}
    },

    save({ k, t, d, title }) {
      const all = this.memo();
      if (!t || t < 30 || t > d - 30) delete all[k];
      else all[k] = { t: Math.round(t), d: Math.round(d), at: Date.now(), title: String(title || "").slice(0, 120) };
      const keys = Object.keys(all);
      if (keys.length > 300) for (const x of keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 300)) delete all[x];
      // the whole store is one file: write it at most once a minute
      this.saveT ??= setTimeout(() => {
        this.saveT = null;
        NP.store.set("mediaMemo", all);
      }, 60000);
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:memo1:ask", this.onAsk);
        window.messageManager.removeMessageListener("nplus:memo1:save", this.onSave);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      if (NP.store.data?.mediaMemo) NP.store.set("mediaMemo", NP.store.data.mediaMemo);
    },
  });
})();
