// Nebula Plus — GPU lights.
// The travelling glows (active tab, URL bar, media card, island) and the
// breathing light on the tab that plays music are small real elements
// rather than ::after pseudo-elements: Firefox only animates real elements
// on the compositor, so these cost the main thread nothing per frame.
// One light per place, moved to wherever it is needed.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.feature({
    name: "Lights",
    init() {
      const make = (cls) => NP.html("div", { class: `nplus-light ${cls}` });
      this.tabLight = make("nplus-light-tab");
      this.pulse = make("nplus-light-pulse");
      this.urlLight = make("nplus-light-url");
      this.focusBar = make("nplus-light-focus");
      // the pomodoro fills the active tab like an hourglass: one long GPU
      // animation per session, paused and resumed with the timer
      NP.lights = {
        // set from the pomodoro's once-a-second tick (no endless animation)
        focus: (st) => {
          const p = st?.phase === "focus" ? Math.min(1, Math.max(0, 1 - Math.max(0, st.running ? st.end - Date.now() : st.remaining) / st.total)) : 0;
          const v = `scaleX(${p.toFixed(4)})`;
          if (this.focusBar.style.transform !== v) this.focusBar.style.transform = v;
        },
      };
      document.querySelector("#urlbar > .urlbar-background")?.append(this.urlLight);

      this.place = () => {
        const tab = gBrowser.selectedTab;
        const bg = tab?.querySelector(":scope > .tab-stack > .tab-background");
        if (bg && this.tabLight.parentNode !== bg) bg.append(this.tabLight);
        if (bg && this.focusBar.parentNode !== bg) bg.append(this.focusBar);
        // the music pulse sits on the playing tab you're not looking at
        const playing = gBrowser.tabs.find((t) => t.hasAttribute("soundplaying") && !t.selected && !t.muted && !t.hasAttribute("zen-essential"));
        const pbg = playing?.querySelector(":scope > .tab-stack > .tab-background");
        if (pbg) {
          if (this.pulse.parentNode !== pbg) pbg.append(this.pulse);
        } else this.pulse.remove();
      };
      this.onAttr = (e) => {
        const ch = e.detail?.changed ?? [];
        if (ch.includes("soundplaying") || ch.includes("muted")) this.place();
        if (ch.includes("busy")) this.loading(e.target);
      };
      // the lights move for a few seconds after something happens (tab
      // switch, hover, URL bar, a new song), then rest as a still glow: an
      // idle window then needs no frames at all
      this.wake = () => {
        NP.setRootAttr("nplus-glow-awake", true);
        clearTimeout(this.sleepT);
        this.sleepT = setTimeout(() => NP.setRootAttr("nplus-glow-awake", false), 8000);
      };
      this.onHover = (e) => e.target.closest?.(".tabbrowser-tab[selected], #urlbar, #nplus-desktop-card, .zen-media-card, #nplus-island") && this.wake();
      document.addEventListener("mouseover", this.onHover, { passive: true });
      gBrowser.tabContainer.addEventListener("TabSelect", this.wake);
      this.offTrack = NP.on("trackchange", this.wake);
      this.wake();
      gBrowser.tabContainer.addEventListener("TabSelect", this.place);
      gBrowser.tabContainer.addEventListener("TabAttrModified", this.onAttr);
      this.onClose = () => setTimeout(this.place, 0);
      gBrowser.tabContainer.addEventListener("TabClose", this.onClose);
      this.place();

      // media cards and the island get theirs when they appear
      this.cards = new MutationObserver((muts) => {
        if (!muts.some((m) => m.addedNodes.length)) return;
        clearTimeout(this.decT);
        this.decT = setTimeout(() => this.decorate(), 400);
      });
      const toolbar = document.getElementById("zen-media-controls-toolbar");
      if (toolbar) this.cards.observe(toolbar, { childList: true, subtree: true });
      this.decorate();
      setTimeout(() => this.decorate(), 3000);

      // on the beat: the tab light swells, the ambience breathes once
      this.offBeat = NP.on("beat", (k) => {
        if (!NP.prefs.get("nplus-beat-pulse") || document.hidden) return;
        if (this.tabLight.isConnected) this.tabLight.animate([{ scale: 1 + 0.5 * k }, { scale: 1 }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)", composite: "add" });
        const wrap = NP.root.hasAttribute("nplus-has-ambient") && document.getElementById("zen-main-app-wrapper");
        if (wrap) wrap.animate([{ opacity: 0.45 + 0.12 * k }, { opacity: 0.45 }], { duration: 360, easing: "ease-out", pseudoElement: "::after" });
      });
    },

    // loading shimmer: an element on each busy tab, removed when it's done
    loading(tab) {
      const bg = tab?.querySelector(":scope > .tab-stack > .tab-background");
      if (!bg) return;
      const el = bg.querySelector(":scope > .nplus-light-load");
      if (tab.hasAttribute("busy")) {
        if (!el) bg.append(NP.html("div", { class: "nplus-light nplus-light-load" }));
      } else el?.remove();
    },

    decorate() {
      for (const ring of document.querySelectorAll(".nplus-card-ring:not(:has(> .nplus-light))")) ring.append(NP.html("div", { class: "nplus-light nplus-light-card" }));
      const island = document.getElementById("nplus-island");
      if (island && !island.querySelector(":scope > .nplus-light")) island.append(NP.html("div", { class: "nplus-light nplus-light-island" }));
    },

    destroy() {
      clearTimeout(this.sleepT);
      NP.setRootAttr("nplus-glow-awake", false);
      document.removeEventListener("mouseover", this.onHover);
      gBrowser.tabContainer.removeEventListener("TabSelect", this.wake);
      this.offTrack?.();
      delete NP.lights;
      this.offBeat?.();
      gBrowser.tabContainer.removeEventListener("TabSelect", this.place);
      gBrowser.tabContainer.removeEventListener("TabAttrModified", this.onAttr);
      gBrowser.tabContainer.removeEventListener("TabClose", this.onClose);
      clearTimeout(this.decT);
      this.cards?.disconnect();
      for (const el of document.querySelectorAll(".nplus-light")) el.remove();
    },
  });
})();
