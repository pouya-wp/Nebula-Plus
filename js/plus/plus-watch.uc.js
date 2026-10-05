// Nebula Plus — watcher ("چشم مراقب").
// Point at any part of any page (a grade, a price, "in stock", a notice
// board) and it keeps an eye on it: every few minutes the page is read —
// from its tab if it's open, otherwise in a hidden tab that closes right
// after — and when that part changes you get it on the island (old → new)
// and as a Windows notification.
//   Ctrl+Alt+W        pick a part of the current page
//   palette           "Watch a part of this page" · "Watched items"
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-watch"] = true;
  NP.DEFAULTS["nplus-watch-every-min"] = 15;

  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const store = {
    get: (k, f) => (NP.store.data && k in NP.store.data ? NP.store.data[k] : f),
    set: (k, v) => NP.store.set(k, v),
  };
  const ago = (t) => {
    if (!t) return "هنوز نه";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "همین الان";
    if (m < 60) return `${fa(m)} دقیقه پیش`;
    const h = Math.round(m / 60);
    if (h < 24) return `${fa(h)} ساعت پیش`;
    return `${fa(Math.round(h / 24))} روز پیش`;
  };
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 400);

  // ---- content side (ASCII only) ----
  // Picker: highlight under the mouse, click to choose, Esc to cancel.
  const PICKER = `(function(){
    var d = content.document;
    if (d.getElementById('nplus-watch-pick')) return;
    var box = d.createElement('div');
    box.id = 'nplus-watch-pick';
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border-radius:10px;outline:2px solid #8b7bff;background:rgba(139,123,255,.14);box-shadow:0 0 0 4000px rgba(10,10,20,.35),0 0 24px rgba(139,123,255,.6);transition:all .08s ease;';
    var tag = d.createElement('div');
    tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;padding:4px 10px;border-radius:99px;background:#8b7bff;color:#fff;font:600 12px system-ui;white-space:nowrap;';
    tag.textContent = 'Click to watch  -  Esc to cancel';
    d.documentElement.append(box, tag);
    var cur = null;
    function sel(el) {
      if (el.id && d.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
      var parts = [];
      while (el && el.nodeType === 1 && el !== d.body && parts.length < 8) {
        if (el.id && d.querySelectorAll('#' + CSS.escape(el.id)).length === 1) { parts.unshift('#' + CSS.escape(el.id)); break; }
        var p = el.parentElement, t = el.localName;
        if (p) {
          var same = Array.prototype.filter.call(p.children, function (c) { return c.localName === t; });
          if (same.length > 1) t += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
        }
        parts.unshift(t);
        el = p;
      }
      return parts.join(' > ');
    }
    function move(e) {
      var el = e.target;
      if (!el || el === box || el === tag) return;
      cur = el;
      var r = el.getBoundingClientRect();
      box.style.left = (r.left - 4) + 'px'; box.style.top = (r.top - 4) + 'px';
      box.style.width = (r.width + 8) + 'px'; box.style.height = (r.height + 8) + 'px';
      tag.style.left = Math.max(8, r.left) + 'px'; tag.style.top = Math.max(8, r.top - 30) + 'px';
    }
    function done(result) {
      d.removeEventListener('mousemove', move, true);
      d.removeEventListener('click', click, true);
      d.removeEventListener('keydown', key, true);
      box.remove(); tag.remove();
      sendAsyncMessage('nplus:watch:picked', result);
    }
    function click(e) {
      e.preventDefault(); e.stopPropagation();
      if (!cur) return;
      var s = sel(cur);
      done({ selector: s, text: (cur.innerText || cur.textContent || '').trim(), url: content.location.href, title: d.title });
    }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); done(null); } }
    d.addEventListener('mousemove', move, true);
    d.addEventListener('click', click, true);
    d.addEventListener('keydown', key, true);
  })();`;

  const READER = (selector, id) => `(function(){
    var el = null;
    try { el = content.document.querySelector(${JSON.stringify(selector)}); } catch (e) {}
    sendAsyncMessage('nplus:watch:read', { id: ${JSON.stringify(id)}, found: !!el, text: el ? (el.innerText || el.textContent || '').trim() : '', ready: content.document.readyState });
  })();`;

  NP.feature({
    name: "Watcher",
    async init() {
      if (!NP.prefs.get("nplus-watch")) return;
      await NP.store.load();
      this.offKey = NP.hotkey?.("ctrl+alt+w", () => this.pick());
      this.onPicked = (m) => this.picked(m);
      window.messageManager.addMessageListener("nplus:watch:picked", this.onPicked);
      this.build();
      this.timer = setInterval(() => this.checkDue(), 60 * 1000);
      this.first = setTimeout(() => this.checkDue(), 45 * 1000);
      NP.watch = { pick: () => this.pick(), open: () => this.open() };
    },

    watches() {
      return store.get("watches", []);
    },

    save(list) {
      store.set("watches", list);
      this.render();
    },

    // ---------- picking ----------
    pick() {
      const b = gBrowser.selectedBrowser;
      if (!/^https?:/.test(b.currentURI.spec)) {
        NP.island?.show({ title: "این صفحه رو نمی‌شه زیر نظر گرفت", duration: 2200 });
        return;
      }
      b.messageManager.loadFrameScript("data:," + encodeURIComponent(PICKER), false);
    },

    picked(m) {
      const r = m.data;
      if (!r?.selector) return;
      const list = this.watches();
      const w = {
        id: `w${Date.now()}`,
        url: r.url,
        selector: r.selector,
        title: clean(r.title).slice(0, 80),
        last: clean(r.text),
        checked: Date.now(),
        changed: null,
        unseen: false,
      };
      list.push(w);
      this.save(list);
      NP.island?.show({
        title: "👁 زیر نظره",
        subtitle: w.last ? `«${w.last.slice(0, 60)}» — هر تغییری بده خبرت می‌کنم` : "هر تغییری بده خبرت می‌کنم",
        duration: 3500,
      });
    },

    // ---------- checking ----------
    async checkDue(force = false) {
      if (this.busy) return;
      const every = Math.max(3, Number(NP.prefs.get("nplus-watch-every-min")) || 15) * 60 * 1000;
      const due = this.watches().filter((w) => force || Date.now() - (w.checked ?? 0) > every);
      if (!due.length) return;
      this.busy = true;
      this.render();
      try {
        for (const w of due) await this.check(w);
      } finally {
        this.busy = false;
        this.render();
      }
    },

    async check(w) {
      // an open tab with that page: read it there, no extra load
      const open = gBrowser.tabs.find((t) => !t.hasAttribute("nplus-worker") && t.linkedBrowser.currentURI.spec === w.url && !t.hasAttribute("pending"));
      let tab = null;
      let browser = open?.linkedBrowser;
      if (!browser) {
        tab = gBrowser.addTab(w.url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true });
        tab.setAttribute("nplus-worker", "true");
        gBrowser.hideTab(tab);
        browser = tab.linkedBrowser;
        browser.docShellIsActive = true;
      }
      let result = null;
      try {
        result = await this.read(browser, w, tab ? 30 : 2);
      } finally {
        if (tab && !tab.closing) gBrowser.removeTab(tab, { animate: false });
      }
      const list = this.watches();
      const cur = list.find((x) => x.id === w.id);
      if (!cur) return;
      cur.checked = Date.now();
      if (result?.found) {
        const text = clean(result.text);
        cur.missing = false;
        if (text && text !== cur.last) {
          const before = cur.last;
          cur.last = text;
          cur.changed = Date.now();
          cur.unseen = true;
          this.announce(cur, before);
        }
      } else cur.missing = true;
      this.save(list);
    },

    read(browser, w, tries) {
      return new Promise((resolve) => {
        const mm = browser.messageManager;
        let last = null;
        let prevText;
        let n = 0;
        const on = (m) => {
          if (m.data.id === w.id) last = m.data;
        };
        mm.addMessageListener("nplus:watch:read", on);
        const script = "data:," + encodeURIComponent(READER(w.selector, w.id));
        const finish = () => {
          try {
            mm.removeMessageListener("nplus:watch:read", on);
          } catch {}
          resolve(last);
        };
        const step = () => {
          n++;
          // found and settled (same text twice), or out of tries
          if (last?.found && last.ready === "complete" && (tries <= 2 || last.text === prevText)) return finish();
          prevText = last?.text;
          if (n > tries) return finish();
          try {
            browser.messageManager.loadFrameScript(script, false);
          } catch {}
          setTimeout(step, 1500);
        };
        setTimeout(step, tries > 2 ? 3000 : 0);
      });
    },

    announce(w, before) {
      const msg = `${before ? `«${before.slice(0, 40)}» ← ` : ""}«${w.last.slice(0, 60)}»`;
      NP.island?.show({
        id: `watch-${w.id}`,
        title: `👁 تغییر کرد · ${w.title || new URL(w.url).hostname}`,
        subtitle: msg,
        duration: 10000,
        onClick: () => this.openPage(w),
      });
      try {
        const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
        alert.init(`nplus-watch-${w.id}`, "chrome://branding/content/icon64.png", `تغییر کرد: ${w.title || new URL(w.url).hostname}`, w.last.slice(0, 140), true);
        Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).showAlert(alert, {
          observe: (s, topic) => topic === "alertclickcallback" && (window.focus(), this.openPage(w)),
        });
      } catch {}
    },

    openPage(w) {
      const t = gBrowser.tabs.find((x) => !x.hasAttribute("nplus-worker") && x.linkedBrowser.currentURI.spec === w.url);
      gBrowser.selectedTab = t ?? gBrowser.addTab(w.url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      const list = this.watches();
      const cur = list.find((x) => x.id === w.id);
      if (cur) {
        cur.unseen = false;
        this.save(list);
      }
      this.close();
    },

    // ---------- panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-watch-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "👁 چشم مراقب" }),
          NP.html("button", { class: "wt-btn", text: "بررسی همه", onclick: () => this.checkDue(true) }),
          NP.html("button", { class: "wt-btn wt-primary", text: "+ این صفحه", onclick: () => (this.close(), this.pick()) }),
        ]),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "Ctrl+Alt+W روی هر صفحه‌ای: یه قسمتش رو انتخاب کن" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-watch-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
    },

    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    render() {
      if (!this.panel) return;
      const list = this.panel.querySelector(".wt-list");
      const ws = this.watches();
      this.panel.toggleAttribute("busy", !!this.busy);
      if (!ws.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: "هنوز چیزی زیر نظر نیست." }));
        return;
      }
      list.replaceChildren(
        ...[...ws].reverse().map((w) => {
          let host = "";
          try {
            host = new URL(w.url).hostname.replace(/^www\./, "");
          } catch {}
          const row = NP.html("div", { class: "wt-row" }, [
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "wt-name", text: w.title || host, dir: "auto" }),
              NP.html("div", { class: "wt-value", text: w.missing ? "این قسمت دیگه پیدا نمی‌شه" : w.last || "—", dir: "auto" }),
              NP.html("div", { class: "wt-meta", text: `${host} · ${w.changed ? `تغییر: ${ago(w.changed)}` : "بدون تغییر"} · بررسی: ${ago(w.checked)}` }),
            ]),
            NP.html("div", { class: "wt-actions" }, [
              NP.html("button", { class: "wt-icon", title: "باز کردن", text: "↗", onclick: () => this.openPage(w) }),
              NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: () => this.save(this.watches().filter((x) => x.id !== w.id)) }),
            ]),
          ]);
          row.toggleAttribute("unseen", !!w.unseen);
          row.toggleAttribute("missing", !!w.missing);
          return row;
        }),
      );
    },

    destroy() {
      clearInterval(this.timer);
      clearTimeout(this.first);
      this.offKey?.();
      window.messageManager.removeMessageListener("nplus:watch:picked", this.onPicked);
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.watch;
    },
  });
})();
