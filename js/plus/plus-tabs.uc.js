// ==UserScript==
// @name           plus-tabs.uc.js
// @description    Nebula Plus: tab hover preview, focus mode (pomodoro), floating mini player
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-tab-preview"] = true;
  NP.DEFAULTS["nplus-mini-player"] = true;
  NP.DEFAULTS["nplus-focus-minutes"] = "25";

  // ================= Tab hover preview =================
  NP.feature({
    name: "TabPreview",
    init() {
      this.cache = new WeakMap();
      this.el = NP.html("div", { id: "nplus-preview", hidden: "true" }, [
        NP.html("canvas", { class: "pv-shot" }),
        NP.html("div", { class: "pv-meta" }, [
          NP.html("div", { class: "pv-title", dir: "auto" }),
          NP.html("div", { class: "pv-url" }),
        ]),
      ]);
      document.body.append(this.el);

      const tabs = document.getElementById("tabbrowser-tabs");
      this.onOver = (e) => {
        const tab = e.target.closest?.(".tabbrowser-tab");
        if (!tab || tab === this.tab) return;
        this.schedule(tab);
      };
      this.onOut = (e) => {
        if (!e.relatedTarget?.closest?.("#tabbrowser-tabs")) this.hide();
      };
      this.hideNow = () => this.hide();
      // Background tabs aren't painted, so they can't be snapshotted on
      // hover. Capture each tab while it's on screen instead: shortly after
      // it's selected, then every 15 s while it stays selected.
      this.onSelect = () => {
        clearTimeout(this.captureTimer);
        this.captureTimer = setTimeout(() => this.capture(gBrowser.selectedTab), 1500);
      };
      window.addEventListener("TabSelect", this.onSelect);
      this.captureInterval = setInterval(() => this.capture(gBrowser.selectedTab), 15_000);
      this.onSelect();

      tabs.addEventListener("mouseover", this.onOver);
      tabs.addEventListener("mouseout", this.onOut);
      tabs.addEventListener("mousedown", this.hideNow, true);
      window.addEventListener("TabSelect", this.hideNow);
      window.addEventListener("wheel", this.hideNow, true);
      this.tabs = tabs;
    },

    schedule(tab) {
      clearTimeout(this.timer);
      this.tab = tab;
      if (!NP.prefs.get("nplus-tab-preview") || tab.selected || tab.hasAttribute("zen-empty-tab")) {
        this.hide(false);
        return;
      }
      // once a preview is showing, moving between tabs swaps it quickly
      const delay = this.el.hasAttribute("open") ? 90 : 650;
      this.timer = setTimeout(() => this.show(tab), delay);
    },

    async show(tab) {
      if (tab !== this.tab || !tab.isConnected) return;
      this.el.querySelector(".pv-title").textContent = tab.label;
      const uri = tab.linkedBrowser?.currentURI;
      this.el.querySelector(".pv-url").textContent = uri ? uri.displaySpec.replace(/^https?:\/\//, "") : "";

      const canvas = this.el.querySelector(".pv-shot");
      const bitmap = await this.snapshot(tab);
      if (tab !== this.tab) return;
      if (bitmap) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        canvas.hidden = false;
      } else {
        canvas.hidden = true;
      }

      const sidebar = document.getElementById("navigator-toolbox").getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      this.el.removeAttribute("hidden");
      const h = this.el.getBoundingClientRect().height;
      const top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), window.innerHeight - h - 8);
      this.el.style.left = `${Math.round(sidebar.right + 10)}px`;
      this.el.style.top = `${Math.round(top)}px`;
      this.el.setAttribute("open", "true");
    },

    async capture(tab) {
      const browser = tab?.linkedBrowser;
      const wg = browser?.browsingContext?.currentWindowGlobal;
      if (!wg || !tab.selected) return;
      try {
        const scale = 300 / Math.max(1, browser.clientWidth || window.innerWidth);
        const bitmap = await Promise.race([
          wg.drawSnapshot(null, scale, "white"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500)),
        ]);
        this.cache.get(tab)?.bitmap?.close?.();
        this.cache.set(tab, { bitmap, url: browser.currentURI.spec });
      } catch {}
    },

    async snapshot(tab) {
      const cached = this.cache.get(tab);
      // a capture from another page of this tab would be misleading
      if (cached && cached.url === tab.linkedBrowser?.currentURI?.spec) return cached.bitmap;
      return null;
    },

    hide(clear = true) {
      clearTimeout(this.timer);
      if (clear) this.tab = null;
      this.el?.removeAttribute("open");
    },

    destroy() {
      clearTimeout(this.timer);
      clearTimeout(this.captureTimer);
      clearInterval(this.captureInterval);
      window.removeEventListener("TabSelect", this.onSelect);
      this.tabs?.removeEventListener("mouseover", this.onOver);
      this.tabs?.removeEventListener("mouseout", this.onOut);
      this.tabs?.removeEventListener("mousedown", this.hideNow, true);
      window.removeEventListener("TabSelect", this.hideNow);
      window.removeEventListener("wheel", this.hideNow, true);
      this.el?.remove();
    },
  });

  // ================= Focus mode =================
  // Ctrl+Alt+F: the sidebar steps back (Zen compact mode), a calm timer
  // counts down a focus session, and an island says when it is break time.
  NP.feature({
    name: "FocusMode",
    init() {
      this.pill = NP.html("div", { id: "nplus-focus", hidden: "true" }, [
        NP.html("div", { class: "fc-ring" }),
        NP.html("div", { class: "fc-text" }, [
          NP.html("div", { class: "fc-label", text: "تمرکز" }),
          NP.html("div", { class: "fc-time" }),
        ]),
        NP.html("button", { class: "fc-stop", title: "End focus", text: "✕", onclick: () => this.stop() }),
      ]);
      document.body.append(this.pill);
      this.offKey = NP.hotkey?.("ctrl+alt+f", () => this.toggle());
      NP.focus = { toggle: () => this.toggle(), get active() { return !!NP.root.hasAttribute("nplus-focus"); } };
    },

    toggle() {
      NP.root.hasAttribute("nplus-focus") ? this.stop() : this.start();
    },

    start() {
      const minutes = Math.max(1, Number.parseFloat(NP.prefs.get("nplus-focus-minutes")) || 25);
      this.total = minutes * 60_000;
      this.end = Date.now() + this.total;
      this.wasCompact = !!gZenCompactModeManager?.preference;
      if (window.gZenCompactModeManager) gZenCompactModeManager.preference = true;
      NP.setRootAttr("nplus-focus", true);
      this.pill.removeAttribute("hidden");
      this.pill.getBoundingClientRect();
      this.pill.setAttribute("open", "true");
      NP.island?.show({ title: "حالت تمرکز", subtitle: `${minutes} دقیقه، شروع شد`, duration: 2200 });
      this.tick();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 1000);
    },

    tick() {
      const left = Math.max(0, this.end - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const fa = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, useGrouping: false });
      this.pill.querySelector(".fc-time").textContent = `${fa.format(m)}:${fa.format(s)}`;
      this.pill.style.setProperty("--fc-p", 1 - left / this.total);
      if (!left) {
        this.stop(false);
        NP.island?.show({ title: "وقت استراحته ☕", subtitle: "یه جلسه‌ی تمرکز تموم شد", duration: 6000 });
      }
    },

    stop(announce = true) {
      clearInterval(this.timer);
      NP.root.removeAttribute("nplus-focus");
      this.pill.removeAttribute("open");
      setTimeout(() => !NP.root.hasAttribute("nplus-focus") && this.pill.setAttribute("hidden", "true"), 400);
      if (window.gZenCompactModeManager && this.wasCompact === false) gZenCompactModeManager.preference = false;
      if (announce) NP.island?.show({ title: "تمرکز تموم شد", duration: 1600 });
    },

    destroy() {
      clearInterval(this.timer);
      this.offKey?.();
      NP.root.removeAttribute("nplus-focus");
      this.pill?.remove();
      delete NP.focus;
    },
  });

  // ================= Mini player =================
  // When the sidebar is collapsed or hidden (compact mode), a small glass
  // pill keeps the music within reach. Double-click it for the lyrics stage.
  NP.feature({
    name: "MiniPlayer",
    init() {
      const btn = (cls, icon, fn) => {
        const b = NP.html("button", { class: `nplus-btn ${cls}`, onclick: (e) => (e.stopPropagation(), fn()) });
        b.style.setProperty("--nplus-icon", `var(--nplus-i-${icon})`);
        return b;
      };
      this.el = NP.html("div", { id: "nplus-mini" }, [
        NP.html("div", { class: "mn-art" }),
        NP.html("div", { class: "mn-text" }, [
          NP.html("div", { class: "mn-title", dir: "auto" }),
          NP.html("div", { class: "mn-artist", dir: "auto" }),
        ]),
        btn("mn-prev", "prev", () => NP.media?.prev()),
        btn("mn-toggle", "play", () => NP.media?.toggle()),
        btn("mn-next", "next", () => NP.media?.next()),
        NP.html("div", { class: "mn-bar" }, [NP.html("div", { class: "mn-fill" })]),
      ]);
      this.el.addEventListener("dblclick", () => NP.stage?.open());
      document.body.append(this.el);
      this.off = NP.on("media", (m) => this.render(m));
      NP.prefs.watch("nplus-mini-player", () => this.render(NP.media?.current));
      this.timer = setInterval(() => this.tick(), 500);
      this.render(NP.media?.current);
    },

    render(m) {
      const on = !!m && NP.prefs.get("nplus-mini-player");
      this.el.toggleAttribute("active", on);
      if (!on) return;
      const q = (s) => this.el.querySelector(s);
      q(".mn-art").style.backgroundImage = m.artwork ? `url("${m.artwork.replace(/"/g, '\\"')}")` : "none";
      q(".mn-title").textContent = m.title;
      q(".mn-artist").textContent = m.artist;
      q(".mn-toggle").style.setProperty("--nplus-icon", `var(--nplus-i-${m.playing ? "pause" : "play"})`);
      this.el.toggleAttribute("playing", m.playing);
    },

    tick() {
      const m = NP.media?.current;
      if (!m || !this.el.hasAttribute("active")) return;
      this.el.querySelector(".mn-fill").style.setProperty("--p", m.duration ? NP.media.position() / m.duration : 0);
    },

    destroy() {
      clearInterval(this.timer);
      this.off?.();
      this.el?.remove();
    },
  });
})();
