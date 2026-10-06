// Nebula Plus — focus shield.
// While a focus session runs, distracting sites (YouTube, Instagram, X…,
// set in nplus-focus-shield-sites) get a calm overlay: what you're focusing
// on and how long is left. "۵ دقیقه اجازه" lets you through for five
// minutes; a page that is already playing music is left alone.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-focus-shield"] = true;
  NP.DEFAULTS["nplus-focus-shield-sites"] = "youtube.com, instagram.com, x.com, twitter.com, reddit.com, aparat.com, tiktok.com, facebook.com";

  const SHEET = `
    :where(#nplus-shield, #nplus-shield *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-shield {
      position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
      display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 14px !important;
      margin: 0 !important; padding: 24px !important;
      background: radial-gradient(70% 60% at 50% 40%, rgb(60 50 120 / 55%), transparent 70%), rgb(10 10 18 / 82%) !important;
      backdrop-filter: blur(18px) saturate(120%) !important;
      font: 500 14px/1.7 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #f2f2f8 !important;
      direction: rtl !important; text-align: center !important;
      animation: nplus-shield-in .45s ease both !important;
    }
    @keyframes nplus-shield-in { from { opacity: 0; } }
    #nplus-shield .ns-ico { display: block !important; font-size: 42px !important; line-height: 1 !important; }
    #nplus-shield .ns-title { display: block !important; font-size: 24px !important; font-weight: 800 !important; }
    #nplus-shield .ns-task { display: block !important; max-width: 520px !important; padding: 8px 18px !important; border-radius: 99px !important;
      background: rgb(139 123 255 / 22%) !important; font-weight: 700 !important; unicode-bidi: plaintext !important; }
    #nplus-shield .ns-left { display: block !important; color: rgb(242 242 248 / 65%) !important; }
    #nplus-shield .ns-row { display: flex !important; gap: 10px !important; margin-top: 8px !important; }
    #nplus-shield .ns-btn { display: inline-block !important; padding: 10px 20px !important; border-radius: 99px !important; cursor: pointer !important;
      background: rgb(255 255 255 / 10%) !important; color: #fff !important; font: 700 13px/1 "Meem", "Vazirmatn", system-ui, sans-serif !important; user-select: none !important; }
    #nplus-shield .ns-btn:hover { background: rgb(255 255 255 / 18%) !important; }
    #nplus-shield .ns-primary { background: #8b7bff !important; }
    #nplus-shield .ns-primary:hover { background: #9d8fff !important; }
  `;

  // Content side (ASCII only).
  const SHIELD = `(function(G){
    var ME = {}; G.__nplus_shield = ME;
    function stale() { return G.__nplus_shield !== ME; }
    var cfg = null, el = null, tick = 0;
    function d() { return content.document; }
    function matches() {
      if (!cfg || !cfg.on) return false;
      var h = content.location.hostname.replace(/^www\\./, '');
      if (cfg.allow && cfg.allow[h] && cfg.allow[h] > Date.now()) return false;
      return cfg.sites.some(function (s) { return h === s || h.slice(-(s.length + 1)) === '.' + s; });
    }
    function playing() { var m = d().querySelectorAll('video, audio'); for (var i = 0; i < m.length; i++) if (!m[i].paused && !m[i].muted) return true; return false; }
    function hide() { content.clearInterval(tick); if (el) { el.remove(); el = null; } }
    function left() { if (cfg.mode) return cfg.labels.mode; var s = Math.max(0, Math.round((cfg.end - Date.now()) / 1000)); var m = Math.floor(s / 60); return cfg.labels.left.replace('%1', m).replace('%2', ('0' + (s % 60)).slice(-2)); }
    function show() {
      if (stale() || el || !d().documentElement || !matches() || playing()) return;
      var L = cfg.labels;
      el = d().createElement('div'); el.id = 'nplus-shield';
      function span(cls, text) { var s = d().createElement('span'); s.className = cls; s.textContent = text; return s; }
      var t = span('ns-left', left());
      el.append(span('ns-ico', '\\u{1F3AF}'), span('ns-title', L.title));
      if (cfg.task) el.append(span('ns-task', cfg.task));
      el.append(t);
      var row = d().createElement('div'); row.className = 'ns-row';
      var back = span('ns-btn ns-primary', L.back), allow = span('ns-btn', L.allow);
      back.addEventListener('click', function () { if (content.history.length > 1) content.history.back(); else sendAsyncMessage('nplus:shield1:close', {}); });
      allow.addEventListener('click', function () { sendAsyncMessage('nplus:shield1:allow', { host: content.location.hostname.replace(/^www\\./, '') }); hide(); });
      row.append(back, allow); el.append(row);
      d().documentElement.append(el);
      tick = content.setInterval(function () { if (!cfg || !cfg.on || Date.now() > cfg.end) return hide(); t.textContent = left(); }, 1000);
    }
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document) content.setTimeout(show, 400); }, true);
    addMessageListener('nplus:shield1:cfg', function (m) { if (stale()) return; cfg = m.data; if (cfg.on) show(); else hide(); });
    sendAsyncMessage('nplus:shield1:hello', {});
  })(this);`;

  NP.feature({
    name: "FocusShield",
    init() {
      if (!NP.prefs.get("nplus-focus-shield")) return;
      this.state = { on: false };
      this.allow = {};
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.onHello = (m) => this.send(m.target.messageManager);
      this.onAllow = (m) => {
        this.allow[m.data.host] = Date.now() + 5 * 60000;
        this.broadcast();
        NP.island?.show({ title: "۵ دقیقه، بعد برمی‌گردیم سر کار 😉", duration: 2200 });
      };
      this.onClose = (m) => {
        const tab = gBrowser.getTabForBrowser(m.target);
        if (tab) gBrowser.removeTab(tab);
      };
      for (const [k, fn] of [["hello", this.onHello], ["allow", this.onAllow], ["close", this.onClose]]) window.messageManager.addMessageListener(`nplus:shield1:${k}`, fn);
      this.script = "data:," + encodeURIComponent(SHIELD);
      window.messageManager.loadFrameScript(this.script, true);
      this.offFocus = NP.on?.("focus", (d) => {
        if (d.on) {
          this.state = { on: true, end: d.end, task: d.task, mode: !!d.mode };
          if (d.mode) this.modeState = this.state;
        } else {
          // a pomodoro ending inside a study/work mode goes back to the mode's shield
          this.state = !d.mode && this.modeState && NP.store.data?.mode ? this.modeState : { on: false };
          if (!this.state.on) this.modeState = null;
          this.allow = {};
        }
        this.broadcast();
      });
    },

    cfg() {
      return {
        ...this.state,
        allow: this.allow,
        sites: String(NP.prefs.get("nplus-focus-shield-sites") || "")
          .split(/[,\s]+/)
          .map((x) => x.trim().replace(/^www\./, ""))
          .filter(Boolean),
        labels: { title: "الان وقت تمرکزه", left: "%1:%2 تا پایان جلسه", mode: "تا وقتی توی این حالتی", back: "برگرد سر کار", allow: "۵ دقیقه اجازه" },
      };
    },

    send(mm) {
      try {
        mm.sendAsyncMessage("nplus:shield1:cfg", this.cfg());
      } catch {}
    },

    broadcast() {
      window.messageManager.broadcastAsyncMessage("nplus:shield1:cfg", this.cfg());
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:shield1:cfg", { on: false });
        for (const [k, fn] of [["hello", this.onHello], ["allow", this.onAllow], ["close", this.onClose]]) window.messageManager.removeMessageListener(`nplus:shield1:${k}`, fn);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      this.offFocus?.();
    },
  });
})();
