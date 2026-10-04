// ==UserScript==
// @name           plus-meet.uc.js
// @description    Nebula Plus: Google Meet docked in split view + a floating call pill
// ==/UserScript==

// - NP.meet.open() / Ctrl+Alt+G: open Meet (or the existing Meet tab) docked
//   next to the current tab with Zen's split view.
// - While a call is live (the tab is sharing camera / microphone) and you are
//   elsewhere, a glass pill shows the call time with mic / camera toggles;
//   click it to jump back. Works for any call site, styled for Meet.

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-meet-pill"] = true;
  NP.DEFAULTS["nplus-meet-style"] = true;

  const MEET = "https://meet.google.com/";
  const isMeet = (tab) => {
    try {
      return tab.linkedBrowser.currentURI.host === "meet.google.com";
    } catch {
      return false;
    }
  };
  // selected, or shown next to the selected tab in a split view
  const isVisible = (tab) => tab.selected || !!tab.linkedBrowser?.docShellIsActive;

  NP.feature({
    name: "Meet",
    init() {
      const btn = (cls, title, fn) =>
        NP.html("button", { class: `mt-btn ${cls}`, title, onclick: (e) => (e.stopPropagation(), fn()) });
      this.pill = NP.html("div", { id: "nplus-call", hidden: "true" }, [
        NP.html("div", { class: "mt-dot" }),
        NP.html("div", { class: "mt-icon" }),
        NP.html("div", { class: "mt-text" }, [
          NP.html("div", { class: "mt-name" }),
          NP.html("div", { class: "mt-time" }),
        ]),
        btn("mt-mic", "Microphone", () => this.toggleDevice("Microphone")),
        btn("mt-cam", "Camera", () => this.toggleDevice("Camera")),
      ]);
      this.pill.addEventListener("click", () => this.callTab && this.jump(this.callTab));
      document.body.append(this.pill);

      this.update = this.update.bind(this);
      this.onAttr = (e) => {
        if (e.detail.changed.some((a) => a === "sharing" || a === "label" || a === "image")) this.update();
      };
      window.addEventListener("TabAttrModified", this.onAttr);
      window.addEventListener("TabSelect", this.update);
      window.addEventListener("TabClose", this.update);
      this.timer = setInterval(() => this.tickTime(), 1000);
      this.offKey = NP.hotkey?.("ctrl+alt+g", () => this.open());
      NP.prefs.watch("nplus-meet-pill", this.update);

      NP.meet = { open: () => this.open() };
      this.update();
    },

    // ---------- docked Meet ----------
    open() {
      const current = gBrowser.selectedTab;
      let meet = gBrowser.tabs.find((t) => isMeet(t) && !t.closing);
      if (meet === current) return;
      if (meet && isVisible(meet)) return this.jump(meet);
      if (!meet) {
        meet = gBrowser.addTrustedTab(MEET, { inBackground: true });
      }
      try {
        if (!current.splitView && !current.pinned && !current.hasAttribute("zen-essential")) {
          gZenViewSplitter.splitTabs([current, meet], undefined, 1);
          return;
        }
      } catch (err) {
        NP.logger.warn(`Meet split failed: ${err}`);
      }
      this.jump(meet);
    },

    jump(tab) {
      if (window.gZenWorkspaces?.switchTabIfNeeded) gZenWorkspaces.switchTabIfNeeded(tab);
      else gBrowser.selectedTab = tab;
    },

    // ---------- call pill ----------
    update() {
      const calls = gBrowser.tabs.filter((t) => /camera|microphone|screen/.test(t.getAttribute("sharing") ?? ""));
      const tab = calls.find(isMeet) ?? calls[0] ?? null;
      if (tab !== this.callTab) {
        this.callTab = tab;
        this.since = tab ? Date.now() : 0;
        this.muted = { Microphone: false, Camera: false };
      }
      const show = !!tab && NP.prefs.get("nplus-meet-pill") && !isVisible(tab);
      if (!show) {
        this.pill.removeAttribute("open");
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => !this.pill.hasAttribute("open") && this.pill.setAttribute("hidden", "true"), 400);
        return;
      }
      clearTimeout(this.hideTimer);
      const sharing = tab.getAttribute("sharing") ?? "";
      this.pill.toggleAttribute("meet", isMeet(tab));
      this.pill.toggleAttribute("has-cam", sharing.includes("camera"));
      this.pill.querySelector(".mt-name").textContent = isMeet(tab)
        ? tab.label.replace(/^Meet\s*[-–]\s*/, "") || "Google Meet"
        : tab.label;
      this.pill.querySelector(".mt-icon").style.backgroundImage = tab.image ? `url("${tab.image}")` : "none";
      this.pill.querySelector(".mt-mic").toggleAttribute("off", this.muted.Microphone);
      this.pill.querySelector(".mt-cam").toggleAttribute("off", this.muted.Camera);
      this.pill.removeAttribute("hidden");
      this.pill.getBoundingClientRect();
      this.pill.setAttribute("open", "true");
      this.tickTime();
    },

    tickTime() {
      if (!this.callTab || !this.pill.hasAttribute("open")) return;
      const sec = Math.floor((Date.now() - this.since) / 1000);
      this.pill.querySelector(".mt-time").textContent = NP.formatTime(sec);
    },

    // Same messages Zen's own sharing card sends to the page.
    toggleDevice(kind) {
      const tab = this.callTab;
      const actor = tab?.linkedBrowser?.browsingContext?.currentWindowGlobal?.getActor("WebRTC");
      if (!actor) return;
      this.muted[kind] = !this.muted[kind];
      actor.sendAsyncMessage(`webrtc:${this.muted[kind] ? "Mute" : "Unmute"}${kind}`);
      this.update();
    },

    destroy() {
      clearInterval(this.timer);
      clearTimeout(this.hideTimer);
      window.removeEventListener("TabAttrModified", this.onAttr);
      window.removeEventListener("TabSelect", this.update);
      window.removeEventListener("TabClose", this.update);
      this.offKey?.();
      this.pill?.remove();
      delete NP.meet;
    },
  });
})();
