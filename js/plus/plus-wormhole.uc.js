// Nebula Plus — wormhole to your phone (through Rubika's Saved Messages).
// Right-click a link / selection / image / page → "بفرست به گوشی", press
// Ctrl+Alt+P for the current page (or the selection), or drag a link or
// text toward the sidebar and drop it into the portal that opens. A hidden
// web.rubika.ir tab (your own session) opens Saved Messages, sends it,
// checks it went out, and closes.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-wormhole"] = true;
  NP.DEFAULTS["nplus-wormhole-pull"] = true;

  // Return trip: the last messages in Saved Messages, with their links.
  const PULL = `(function(){
    var d = content.document, out = [];
    var bubbles = d.querySelectorAll('.chat .bubble:not(.service)');
    Array.prototype.slice.call(bubbles, -25).forEach(function (b) {
      var m = b.querySelector('.message'); if (!m) return;
      var c = m.cloneNode(true);
      c.querySelectorAll('.time, .reactions, .reactions-block').forEach(function (x) { x.remove(); });
      var text = c.innerText.trim();
      var links = [];
      m.querySelectorAll('a[href]').forEach(function (a) { if (/^https?:/.test(a.href) && links.indexOf(a.href) < 0) links.push(a.href); });
      (text.match(/https?:[^\\s<>"]+/g) || []).forEach(function (u) { if (links.indexOf(u) < 0) links.push(u); });
      var tm = ((b.querySelector('.time') || {}).innerText || '').trim();
      out.push({ id: b.getAttribute('data-mid') || '', text: text.slice(0, 500), links: links.slice(0, 5), time: tm });
    });
    sendAsyncMessage('nplus:wh:pulled', { ready: bubbles.length > 0, items: out });
  })();`;

  const store = {
    get: (k, f) => (NP.store.data && k in NP.store.data ? NP.store.data[k] : f),
    set: (k, v) => NP.store.set(k, v),
  };

  // ---- content side (ASCII only) ----
  // The open chat's title and address (to recognise Saved Messages).
  const TITLE = `(function(){
    var t = content.document.querySelector('.chat .top .peer-title, .chat-info .peer-title');
    sendAsyncMessage('nplus:wh:title', { title: t ? t.textContent : '', hash: content.location.hash });
  })();`;
  // Type into the open chat and press send; report the last outgoing bubble.
  const SEND = `(function(){
    addMessageListener('nplus:wh:send', function (m) {
      var d = content.document;
      var input = d.querySelector('.chat .input-message-input[contenteditable], .chat [contenteditable="true"]');
      if (!input) { sendAsyncMessage('nplus:wh:sent', { ok: false, why: 'no-input' }); return; }
      input.focus();
      d.execCommand('selectAll', false, null);
      d.execCommand('insertText', false, m.data.text);
      // Enter first; the send button only if the text is still waiting
      content.setTimeout(function () {
        var ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new content.KeyboardEvent('keydown', ev));
        input.dispatchEvent(new content.KeyboardEvent('keyup', ev));
        content.setTimeout(function () {
          if ((input.innerText || '').trim()) {
            var btn = d.querySelector('.chat .btn-send-container button, .chat .btn-send');
            if (btn) btn.click();
          }
          content.setTimeout(function () {
            var outs = d.querySelectorAll('.chat .bubble.is-out .message');
            var last = outs.length ? outs[outs.length - 1].innerText : '';
            sendAsyncMessage('nplus:wh:sent', { ok: true, last: last.slice(0, 300), left: (input.innerText || '').trim().length });
          }, 1800);
        }, 700);
      }, 400);
    });
  })();`;
  const PROBE = `(function(){
    var d = content.document;
    sendAsyncMessage('nplus:wh:probe', { input: !!d.querySelector('.chat .input-message-input[contenteditable], .chat [contenteditable="true"]'),
      button: !!d.querySelector('.chat .btn-send-container button, .chat .btn-send'), hash: content.location.hash });
  })();`;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function ask(browser, script, reply, tries = 10, every = 1500, accept = () => true) {
    return new Promise((resolve) => {
      const mm = browser.messageManager;
      let last = null;
      let n = 0;
      const on = (m) => (last = m.data);
      mm.addMessageListener(reply, on);
      const step = () => {
        if ((last && accept(last)) || n++ >= tries) {
          try {
            mm.removeMessageListener(reply, on);
          } catch {}
          return resolve(last);
        }
        last = null;
        try {
          browser.messageManager.loadFrameScript("data:," + encodeURIComponent(script), false);
        } catch {}
        setTimeout(step, every);
      };
      step();
    });
  }

  NP.feature({
    name: "Wormhole",
    async init() {
      if (!NP.prefs.get("nplus-wormhole")) return;
      await NP.store.load();
      this.queue = [];
      this.offKey = NP.hotkey?.("ctrl+alt+p", () => this.sendCurrent());
      this.menu();
      this.portal();
      this.progress = {
        onLocationChange: (browser, progress, req, uri) => {
          if (progress.isTopLevel && uri.host === "web.rubika.ir" && /#c=/.test(uri.spec) && !gBrowser.getTabForBrowser(browser)?.hasAttribute("nplus-worker")) this.learn(browser);
        },
      };
      gBrowser.addTabsProgressListener(this.progress);
      NP.wormhole = { send: (t) => this.send(t), sendCurrent: () => this.sendCurrent(), dryRun: () => this.dryRun(), pull: () => this.pull(true) };
      this.idle = Cc["@mozilla.org/widget/useridleservice;1"].getService(Ci.nsIUserIdleService);
      this.pullTimer = setInterval(() => this.pull(), 10 * 60 * 1000);
      this.firstPull = setTimeout(() => this.pull(), 90 * 1000);
    },

    // ---------- entry points ----------
    menu() {
      const ctx = document.getElementById("contentAreaContextMenu");
      if (!ctx) return;
      this.item = document.createXULElement("menuitem");
      this.item.id = "nplus-wormhole-item";
      this.item.setAttribute("label", "📱 بفرست به گوشی (روبیکا)");
      this.item.addEventListener("command", () => {
        const c = window.gContextMenu;
        if (!c) return;
        let text = "";
        if (c.isTextSelected) text = c.selectionInfo?.fullText || c.selectedText || "";
        else if (c.onLink) text = c.linkURL;
        else if (c.onImage) text = c.mediaURL || c.imageInfo?.currentSrc || "";
        else text = `${gBrowser.selectedBrowser.contentTitle}\n${gBrowser.currentURI.spec}`;
        this.send(text);
      });
      ctx.append(this.item);
      this.onShowing = () => (this.item.hidden = !/^https?:/.test(gBrowser.currentURI.spec) && !window.gContextMenu?.isTextSelected);
      ctx.addEventListener("popupshowing", this.onShowing);
    },

    async sendCurrent() {
      // the selection if there is one, otherwise the page
      let text = "";
      const b = gBrowser.selectedBrowser;
      if (/^https?:/.test(b.currentURI.spec)) {
        const r = await ask(b, "(function(){ sendAsyncMessage('nplus:wh:sel', { t: String(content.getSelection() || '') }); })();", "nplus:wh:sel", 1, 300);
        text = r?.t?.trim() ?? "";
      }
      if (!text) text = `${gBrowser.selectedBrowser.contentTitle}\n${gBrowser.currentURI.spec}`;
      this.send(text);
    },

    // The portal: appears when something is dragged over the browser's UI.
    portal() {
      this.portalEl = NP.html("div", { id: "nplus-portal", hidden: "true" }, [
        NP.html("div", { class: "pt-ring" }),
        NP.html("div", { class: "pt-core" }),
        NP.html("div", { class: "pt-label", text: "بنداز تو کرم‌چاله · میره به گوشیت" }),
      ]);
      document.body.append(this.portalEl);
      const textOf = (dt) => dt.getData("text/x-moz-url").split("\n")[0] || dt.getData("text/uri-list").split("\n")[0] || dt.getData("text/plain");
      const has = (dt) => dt && [...dt.types].some((t) => /text\/(plain|uri-list|x-moz-url)/.test(t));
      this.onDragEnter = (e) => {
        if (!has(e.dataTransfer)) return;
        clearTimeout(this.hideTimer);
        this.portalEl.hidden = false;
        requestAnimationFrame(() => this.portalEl.setAttribute("open", "true"));
      };
      this.onDragOverWin = () => {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.hidePortal(), 900);
      };
      this.onEnd = () => this.hidePortal();
      window.addEventListener("dragenter", this.onDragEnter, true);
      window.addEventListener("dragover", this.onDragOverWin, true);
      window.addEventListener("dragend", this.onEnd, true);
      window.addEventListener("drop", this.onEnd, false);
      this.portalEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this.portalEl.setAttribute("hot", "true");
      });
      this.portalEl.addEventListener("dragleave", () => this.portalEl.removeAttribute("hot"));
      this.portalEl.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = textOf(e.dataTransfer);
        this.portalEl.setAttribute("swallow", "true");
        setTimeout(() => this.hidePortal(), 650);
        if (text) this.send(text);
      });
    },

    hidePortal() {
      clearTimeout(this.hideTimer);
      this.portalEl.removeAttribute("open");
      this.portalEl.removeAttribute("hot");
      setTimeout(() => {
        if (!this.portalEl.hasAttribute("open")) {
          this.portalEl.hidden = true;
          this.portalEl.removeAttribute("swallow");
        }
      }, 300);
    },

    // ---------- sending ----------
    send(text) {
      text = String(text ?? "").trim().slice(0, 3500);
      if (!text) return;
      this.queue.push(text);
      NP.island?.show({ id: "wormhole", title: "🌀 داره میره به گوشیت…", subtitle: text.replace(/\s+/g, " ").slice(0, 70), duration: 20000 });
      this.pump();
    },

    async pump() {
      if (this.busy) return;
      this.busy = true;
      try {
        while (this.queue.length) {
          const text = this.queue.shift();
          const ok = await this.deliver(text);
          if (ok === null) continue; // waiting for the one-time setup
          NP.island?.show({
            id: "wormhole",
            title: ok ? "📱 رسید به گوشیت" : "نرسید 😕",
            subtitle: ok ? "توی پیام‌های ذخیره‌شده‌ی روبیکا" : "روبیکا وب باز نشد یا لاگین نیستی",
            duration: 3500,
          });
        }
      } finally {
        this.busy = false;
      }
    },

    // Opens Saved Messages in a hidden worker tab; returns its browser.
    async openSaved() {
      const saved = store.get("rubikaSaved");
      if (!saved) return { ok: false, needsSetup: true };
      const tab = gBrowser.addTab(`https://web.rubika.ir/${saved}`, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        inBackground: true,
        skipAnimation: true,
      });
      tab.setAttribute("nplus-worker", "true");
      gBrowser.hideTab(tab);
      const browser = tab.linkedBrowser;
      browser.docShellIsActive = true;
      const probe = await ask(browser, PROBE, "nplus:wh:probe", 16, 1500, (d) => d.input && d.button);
      return { tab, browser, ok: !!(probe?.input && probe?.button), probe };
    },

    // One-time setup: open Rubika; when you open Saved Messages there,
    // its address is remembered (Rubika ignores scripted clicks, so we let
    // you do the one click).
    setup() {
      if (this.setupTab?.isConnected) {
        gBrowser.selectedTab = this.setupTab;
        return;
      }
      this.setupTab = gBrowser.addTab("https://web.rubika.ir/", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      gBrowser.selectedTab = this.setupTab;
      NP.island?.show({
        id: "wormhole",
        title: "🌀 یه بار «پیام‌های ذخیره‌شده» رو باز کن",
        subtitle: "توی همین روبیکا رو بزن، از این به بعد خودم می‌فرستم",
        duration: 12000,
      });
    },

    // Learn the Saved Messages address whenever it's opened in Rubika Web.
    learn(browser) {
      const mm = browser.messageManager;
      const on = (m) => {
        mm.removeMessageListener("nplus:wh:title", on);
        const { title, hash } = m.data ?? {};
        if (hash && /ذخیره|ذخيره|Saved Messages/i.test(title ?? "")) {
          const isNew = store.get("rubikaSaved") !== hash;
          store.set("rubikaSaved", hash);
          if (isNew) {
            NP.island?.show({ id: "wormhole", title: "🌀 کرم‌چاله وصل شد", subtitle: "از این به بعد مستقیم می‌ره به گوشیت", duration: 3500 });
            if (this.queue.length || this.pending?.length) {
              this.queue.push(...(this.pending ?? []));
              this.pending = [];
              this.pump();
            }
          }
        }
      };
      mm.addMessageListener("nplus:wh:title", on);
      setTimeout(() => {
        try {
          mm.loadFrameScript("data:," + encodeURIComponent(TITLE), false);
        } catch {}
      }, 1800);
      setTimeout(() => {
        try {
          mm.removeMessageListener("nplus:wh:title", on);
        } catch {}
      }, 5000);
    },

    async deliver(text) {
      let opened;
      try {
        opened = await this.openSaved();
        if (opened.needsSetup) {
          (this.pending ??= []).push(text);
          this.setup();
          return null;
        }
        if (!opened.ok) return false;
        const { browser } = opened;
        browser.messageManager.loadFrameScript("data:," + encodeURIComponent(SEND), false);
        const result = await new Promise((resolve) => {
          const mm = browser.messageManager;
          const on = (m) => {
            mm.removeMessageListener("nplus:wh:sent", on);
            resolve(m.data);
          };
          mm.addMessageListener("nplus:wh:sent", on);
          mm.sendAsyncMessage("nplus:wh:send", { text });
          setTimeout(() => resolve(null), 9000);
        });
        // went out if the last message we sent starts like what we sent
        const norm = (s) => String(s ?? "").replace(/\s+/g, "").slice(0, 40);
        const ok = !!result?.ok && norm(result.last).startsWith(norm(text).slice(0, 20));
        if (ok) store.set("whSent", [...store.get("whSent", []), norm(text)].slice(-60));
        return ok;
      } catch (err) {
        NP.logger?.warn(`wormhole: ${err}`);
        return false;
      } finally {
        if (opened?.tab && !opened.tab.closing) {
          await wait(300);
          gBrowser.removeTab(opened.tab, { animate: false });
        }
      }
    },

    // ---------- phone → browser ----------
    // Links you put in Saved Messages from your phone open here. Checked
    // every 10 minutes while you're at the computer (Rubika opens hidden
    // for a few seconds, then closes).
    async pull(manual) {
      if (!manual && (!NP.prefs.get("nplus-wormhole-pull") || this.busy || this.pulling)) return;
      if (!manual && (this.idle.idleTime > 5 * 60000 || Services.wm.getMostRecentWindow("navigator:browser") !== window)) return;
      if (!store.get("rubikaSaved")) return;
      this.pulling = true;
      let opened;
      try {
        opened = await this.openSaved();
        if (!opened.ok) return;
        const res = await ask(opened.browser, PULL, "nplus:wh:pulled", 8, 1500, (d) => d.ready && d.items.length);
        if (!res?.ready) return;
        const norm = (s) => String(s ?? "").replace(/\s+/g, "").slice(0, 40);
        const sent = new Set(store.get("whSent", []));
        const seen = new Set(store.get("whSeen", []));
        const key = (it) => it.id || norm(`${it.time}${it.text}`);
        const first = !store.get("whPulledOnce");
        const fresh = res.items.filter((it) => !seen.has(key(it)) && it.links.length && !sent.has(norm(it.text)));
        store.set("whSeen", [...seen, ...res.items.map(key)].slice(-200));
        store.set("whPulledOnce", true);
        if (first) return; // the history isn't news
        for (const it of fresh) {
          for (const url of it.links) gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true });
        }
        if (fresh.length) {
          const n = fresh.reduce((a, it) => a + it.links.length, 0);
          let host = "";
          try {
            host = new URL(fresh[0].links[0]).hostname.replace(/^www\./, "");
          } catch {}
          NP.island?.show({ id: "wormhole-in", title: `🌀 از گوشی رسید: ${n > 1 ? `${n} لینک` : host}`, subtitle: fresh[0].text.replace(/\s+/g, " ").slice(0, 90), duration: 7000 });
        }
      } catch (err) {
        NP.logger?.warn(`wormhole pull: ${err}`);
      } finally {
        this.pulling = false;
        if (opened?.tab && !opened.tab.closing) gBrowser.removeTab(opened.tab, { animate: false });
      }
    },

    // Everything except pressing send: is Saved Messages reachable?
    async dryRun() {
      const opened = await this.openSaved();
      if (opened.tab && !opened.tab.closing) gBrowser.removeTab(opened.tab, { animate: false });
      return { ok: opened.ok, probe: opened.probe, saved: store.get("rubikaSaved") };
    },

    destroy() {
      clearInterval(this.pullTimer);
      clearTimeout(this.firstPull);
      this.offKey?.();
      gBrowser.removeTabsProgressListener(this.progress);
      window.removeEventListener("dragenter", this.onDragEnter, true);
      window.removeEventListener("dragover", this.onDragOverWin, true);
      window.removeEventListener("dragend", this.onEnd, true);
      window.removeEventListener("drop", this.onEnd, false);
      document.getElementById("contentAreaContextMenu")?.removeEventListener("popupshowing", this.onShowing);
      this.item?.remove();
      this.portalEl?.remove();
      delete NP.wormhole;
    },
  });
})();
