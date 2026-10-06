// Nebula Plus — developer mode for local sites.
// On localhost / 127.0.0.1 / *.localhost / *.test a small pill sits at the
// bottom of the page: the port, live count of JavaScript errors (click to
// see them), hard reload, console, responsive mode, and "on phone" — the
// same page over your Wi-Fi address, sent to your phone through the
// wormhole (or copied).
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-devmode"] = true;

  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|.+\.localhost|.+\.test)$/i;
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  // Content side (ASCII only): report page errors of local pages.
  const SPY = `(function(G){
    var ME = {}; G.__nplus_devspy = ME;
    function stale() { return G.__nplus_devspy !== ME; }
    function local() { try { return /^(localhost|127\\.0\\.0\\.1|\\[::1\\]|0\\.0\\.0\\.0|.+\\.localhost|.+\\.test)$/i.test(content.location.hostname); } catch (e) { return false; } }
    function report(msg, where) { if (stale() || !local()) return; sendAsyncMessage('nplus:dev1:error', { msg: String(msg).slice(0, 400), where: String(where || '').slice(0, 200), url: content.location.href }); }
    addEventListener('error', function (e) {
      if (e.target && e.target !== content && e.target.localName) { report('Failed to load ' + e.target.localName + ': ' + (e.target.src || e.target.href || ''), ''); return; }
      report(e.message || e.error, (e.filename || '').replace(/^.*\\//, '') + ':' + (e.lineno || 0));
    }, true);
    addEventListener('unhandledrejection', function (e) { var r = e.reason; report('Unhandled promise: ' + (r && r.message ? r.message : r), ''); }, true);
    addEventListener('DOMContentLoaded', function (e) { if (e.target === content.document && local()) sendAsyncMessage('nplus:dev1:load', { url: content.location.href }); }, true);
  })(this);`;

  NP.feature({
    name: "DevMode",
    init() {
      if (!NP.prefs.get("nplus-devmode")) return;
      this.errors = new WeakMap();
      this.pill = NP.html("div", { id: "nplus-devpill", hidden: "true" }, [
        NP.html("span", { class: "dv-dot" }),
        NP.html("span", { class: "dv-port" }),
        NP.html("button", { class: "dv-err", onclick: () => this.toggleList() }),
        NP.html("span", { class: "dv-sep" }),
        NP.html("button", { class: "dv-btn", title: "Hard reload (no cache)", text: "↻", onclick: () => BrowserCommands.reloadSkipCache() }),
        NP.html("button", { class: "dv-btn", title: "Console", text: "›_", onclick: () => document.getElementById("key_webconsole")?.doCommand() }),
        NP.html("button", { class: "dv-btn", title: "Responsive mode", text: "▯", onclick: () => document.getElementById("key_responsiveDesignMode")?.doCommand() }),
        NP.html("button", { class: "dv-btn dv-phone", title: "Open on phone", text: "📱", onclick: () => this.phone() }),
      ]);
      this.list = NP.html("div", { id: "nplus-devlist", hidden: "true" });
      document.getElementById("tabbrowser-tabbox")?.append(this.pill, this.list);

      this.onErr = (m) => this.addError(m.target, m.data);
      this.onLoad = (m) => {
        this.errors.set(m.target, []);
        if (m.target === gBrowser.selectedBrowser) this.update();
      };
      window.messageManager.addMessageListener("nplus:dev1:error", this.onErr);
      window.messageManager.addMessageListener("nplus:dev1:load", this.onLoad);
      this.script = "data:," + encodeURIComponent(SPY);
      window.messageManager.loadFrameScript(this.script, true);

      this.progress = { onLocationChange: (b) => b === gBrowser.selectedBrowser && this.update() };
      gBrowser.addTabsProgressListener(this.progress);
      this.onSelect = () => this.update();
      gBrowser.tabContainer.addEventListener("TabSelect", this.onSelect);
      this.update();
      this.lanIp();
    },

    isLocal(uri) {
      try {
        return /^https?$/.test(uri.scheme) && LOCAL.test(uri.host);
      } catch {
        return false;
      }
    },

    update() {
      const uri = gBrowser.selectedBrowser.currentURI;
      const local = this.isLocal(uri);
      this.pill.hidden = !local;
      if (!local) {
        this.list.hidden = true;
        return;
      }
      const port = uri.port > 0 ? uri.port : uri.scheme === "https" ? 443 : 80;
      this.pill.querySelector(".dv-port").textContent = `${uri.host === "localhost" ? "" : `${uri.host} `}:${port}`;
      const errs = this.errors.get(gBrowser.selectedBrowser) ?? [];
      const b = this.pill.querySelector(".dv-err");
      b.textContent = errs.length ? `${fa(errs.length)} خطا` : "بدون خطا";
      this.pill.toggleAttribute("bad", errs.length > 0);
      if (!this.list.hidden) this.renderList();
    },

    addError(browser, e) {
      const list = this.errors.get(browser) ?? [];
      const last = list.at(-1);
      if (last && last.msg === e.msg) last.n++;
      else list.push({ ...e, n: 1, at: Date.now() });
      if (list.length > 50) list.shift();
      this.errors.set(browser, list);
      if (browser === gBrowser.selectedBrowser) {
        this.update();
        this.pill.removeAttribute("pulse");
        this.pill.getBoundingClientRect();
        this.pill.setAttribute("pulse", "true");
      }
    },

    toggleList() {
      this.list.hidden = !this.list.hidden;
      if (!this.list.hidden) this.renderList();
    },

    renderList() {
      const errs = this.errors.get(gBrowser.selectedBrowser) ?? [];
      this.list.replaceChildren(
        ...(errs.length
          ? [...errs].reverse().map((e) =>
              NP.html("div", { class: "dv-row" }, [
                NP.html("div", { class: "dv-msg", text: e.n > 1 ? `${e.msg}  ×${e.n}` : e.msg }),
                e.where ? NP.html("div", { class: "dv-where", text: e.where }) : null,
              ].filter(Boolean)),
            )
          : [NP.html("div", { class: "dv-row dv-ok", text: "این صفحه تا الان هیچ خطای جاوااسکریپتی نداده ✓" })]),
        NP.html("div", { class: "dv-foot" }, [
          NP.html("button", { class: "dv-btn", text: "پاک کردن", onclick: () => (this.errors.set(gBrowser.selectedBrowser, []), this.update()) }),
          NP.html("button", { class: "dv-btn", text: "کنسول", onclick: () => document.getElementById("key_webconsole")?.doCommand() }),
        ]),
      );
    },

    lanIp() {
      try {
        const dns = Cc["@mozilla.org/network/dns-service;1"].getService(Ci.nsIDNSService);
        dns.asyncResolve(
          dns.myHostName,
          Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT,
          Ci.nsIDNSService.RESOLVE_DISABLE_IPV6,
          null,
          {
            onLookupComplete: (req, rec) => {
              try {
                rec.QueryInterface(Ci.nsIDNSAddrRecord);
                const all = [];
                while (rec.hasMore()) all.push(rec.getNextAddrAsString());
                this.ip = all.find((a) => /^192\.168\./.test(a)) ?? all.find((a) => /^(10\.|172\.)/.test(a)) ?? all[0];
              } catch {}
            },
          },
          Services.tm.mainThread,
          {},
        );
      } catch {}
    },

    phone() {
      const uri = gBrowser.selectedBrowser.currentURI;
      if (!this.ip) return NP.island?.show({ title: "آدرس شبکه‌ات پیدا نشد", duration: 1800 });
      const url = uri.spec.replace(uri.hostPort, `${this.ip}${uri.port > 0 ? `:${uri.port}` : ""}`);
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(url);
      if (NP.wormhole) NP.wormhole.send(`${url}\n(Wi-Fi — dev server must listen on 0.0.0.0)`);
      else NP.island?.show({ title: "آدرس روی Wi-Fi کپی شد", subtitle: url, duration: 3000 });
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:dev1:error", this.onErr);
        window.messageManager.removeMessageListener("nplus:dev1:load", this.onLoad);
      } catch {}
      if (this.progress) gBrowser.removeTabsProgressListener(this.progress);
      gBrowser.tabContainer.removeEventListener("TabSelect", this.onSelect);
      this.pill?.remove();
      this.list?.remove();
    },
  });
})();
