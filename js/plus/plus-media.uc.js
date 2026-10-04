// ==UserScript==
// @name           plus-media.uc.js
// @description    Nebula Plus media: unified hub (browser + desktop apps), ambient color, desktop card, media island
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  const BRIDGE = "http://127.0.0.1:47321";
  const ZEN_ICONS = "chrome://browser/skin/zen-icons";

  // ================= Media Hub =================
  // One source of truth for "what is playing", whether it comes from a tab
  // (MediaController API) or a desktop app like Spotify (via Nebula Bridge).
  //
  // Emits "media" with the current track snapshot whenever it changes:
  //   { source: "browser"|"system", key, title, artist, album, artwork,
  //     playing, duration, app, browser }
  // Position is read on demand with NP.media.position() (interpolated).
  NP.feature({
    name: "MediaHub",

    init() {
      this.browserSrc = null; // { controller, browser, state, listeners }
      this.systemSrc = null; // last bridge snapshot
      this.current = null;
      this.lastKey = null;

      const self = this;
      NP.media = {
        get current() {
          return self.current;
        },
        position: () => self.position(),
        toggle: () => self.command("toggle"),
        next: () => self.command("next"),
        prev: () => self.command("prev"),
        seek: (sec) => self.seek(sec),
      };

      this.onTabAttr = (e) => {
        if (!e.detail.changed.includes("soundplaying")) return;
        const tab = e.target;
        if (tab.hasAttribute("soundplaying")) this.trackBrowser(tab.linkedBrowser);
        else this.refreshBrowser();
      };
      this.onTabClose = (e) => {
        if (e.target.linkedBrowser === this.browserSrc?.browser) {
          this.untrackBrowser();
        }
      };
      window.addEventListener("TabAttrModified", this.onTabAttr);
      window.addEventListener("TabClose", this.onTabClose);

      for (const tab of gBrowser.tabs) {
        if (tab.hasAttribute("soundplaying")) this.trackBrowser(tab.linkedBrowser);
      }

      NP.prefs.watch("nplus-media-bridge", (on) => {
        clearTimeout(this.pollTimer);
        this.systemSrc = null;
        if (on) this.poll();
        else this.publish();
      });
    },

    // ---------- browser source ----------
    trackBrowser(browser) {
      const controller = browser?.browsingContext?.mediaController;
      if (!controller) return;
      if (this.browserSrc?.controller === controller) {
        this.refreshBrowser();
        return;
      }
      this.untrackBrowser(false);

      const src = { controller, browser, state: {}, listeners: {} };
      const update = () => {
        this.readBrowserState(src);
        this.publish();
      };
      src.listeners = {
        metadatachange: update,
        playbackstatechange: update,
        positionstatechange: (e) => {
          src.state.position = e.position;
          src.state.duration = e.duration;
          src.state.rate = e.playbackRate || 1;
          src.state.stamp = performance.now();
          this.publish(true);
        },
        deactivated: () => this.untrackBrowser(),
      };
      for (const [type, fn] of Object.entries(src.listeners)) {
        controller.addEventListener(type, fn);
      }
      this.browserSrc = src;

      try {
        const pos = controller.getPositionState();
        src.state.position = pos.position;
        src.state.duration = pos.duration;
        src.state.rate = pos.playbackRate || 1;
        src.state.stamp = performance.now();
      } catch {}
      update();
    },

    refreshBrowser() {
      if (!this.browserSrc) return;
      this.readBrowserState(this.browserSrc);
      this.publish();
    },

    readBrowserState(src) {
      const { controller, browser, state } = src;
      let meta = {};
      try {
        meta = controller.getMetadata() ?? {};
      } catch {}
      const artwork = [...(meta.artwork ?? [])].sort((a, b) => {
        const area = (x) =>
          (x.sizes || "0x0").split("x").map(Number).reduce((p, n) => p * n, 1);
        return area(b) - area(a);
      })[0]?.src;

      const wasPlaying = state.playing;
      state.playing = !!controller.isPlaying;
      // Keep the clock honest when play/pause flips without a position event.
      if (wasPlaying && !state.playing) {
        state.position = this.interpolate(state);
        state.stamp = performance.now();
      } else if (!wasPlaying && state.playing) {
        state.stamp = performance.now();
      }
      state.title = meta.title || browser.contentTitle || "";
      state.artist = meta.artist || "";
      state.album = meta.album || "";
      state.artwork = artwork || null;
      state.app = gBrowser.getTabForBrowser(browser)?.label || "";
      if (state.playing) src.lastPlayed = Date.now();
    },

    untrackBrowser(publish = true) {
      const src = this.browserSrc;
      if (!src) return;
      for (const [type, fn] of Object.entries(src.listeners)) {
        try {
          src.controller.removeEventListener(type, fn);
        } catch {}
      }
      this.browserSrc = null;
      if (publish) this.publish();
    },

    // ---------- system source (Nebula Bridge) ----------
    async poll() {
      let delay = 1000;
      try {
        const res = await fetch(`${BRIDGE}/state`, {
          signal: AbortSignal.timeout(1500),
          cache: "no-store",
        });
        const data = await res.json();
        if (data.active) {
          const prev = this.systemSrc;
          this.systemSrc = {
            title: data.title,
            artist: data.artist,
            album: data.album,
            artwork: data.artId ? `${BRIDGE}/art/${data.artId}` : null,
            app: data.app,
            playing: data.playing,
            position: data.position,
            duration: data.duration,
            rate: 1,
            stamp: performance.now(),
            canSeek: data.canSeek,
            lastPlayed: data.playing ? Date.now() : prev?.lastPlayed ?? 0,
          };
        } else {
          this.systemSrc = null;
        }
        NP.setRootAttr("nplus-bridge", "online");
      } catch {
        // Bridge not running: back off quietly.
        this.systemSrc = null;
        NP.setRootAttr("nplus-bridge", "offline");
        delay = 5000;
      }
      this.publish();
      if (NP.prefs.get("nplus-media-bridge")) {
        this.pollTimer = setTimeout(() => this.poll(), delay);
      }
    },

    // ---------- arbitration ----------
    pick() {
      const b = this.browserSrc && this.browserSrc.state.title ? this.browserSrc : null;
      const s = this.systemSrc;
      if (b?.state.playing) return "browser";
      if (s?.playing) return "system";
      if (b && s) return (b.lastPlayed ?? 0) >= (s.lastPlayed ?? 0) ? "browser" : "system";
      if (b) return "browser";
      if (s) return "system";
      return null;
    },

    stateOf(source) {
      if (source === "browser") return this.browserSrc.state;
      if (source === "system") return this.systemSrc;
      return null;
    },

    publish(positionOnly = false) {
      const source = this.pick();
      const st = this.stateOf(source);
      if (!st) {
        if (this.current) {
          this.current = null;
          this.lastKey = null;
          NP.emit("media", null);
        }
        return;
      }

      const key = `${source}|${st.title}|${st.artist}`;
      const next = {
        source,
        key,
        title: st.title,
        artist: st.artist,
        album: st.album,
        artwork: st.artwork,
        playing: !!st.playing,
        duration: st.duration || 0,
        app: st.app,
        canSeek: source === "browser" ? true : !!st.canSeek,
        browser: source === "browser" ? this.browserSrc.browser : null,
      };
      const c = this.current;
      const changed =
        !c ||
        c.key !== next.key ||
        c.playing !== next.playing ||
        c.artwork !== next.artwork ||
        Math.abs((c.duration || 0) - next.duration) > 1;
      this.current = next;
      if (changed) {
        NP.emit("media", next);
        if (c?.key !== key) NP.emit("trackchange", next);
      } else if (positionOnly) {
        NP.emit("mediaposition", next);
      }
    },

    interpolate(st) {
      if (!st || !Number.isFinite(st.position)) return 0;
      let pos = st.position;
      if (st.playing && st.stamp) {
        pos += ((performance.now() - st.stamp) / 1000) * (st.rate || 1);
      }
      return st.duration ? Math.min(pos, st.duration) : pos;
    },

    position() {
      return this.interpolate(this.stateOf(this.current?.source));
    },

    // ---------- commands ----------
    async command(action) {
      const source = this.current?.source;
      if (source === "browser") {
        const c = this.browserSrc.controller;
        try {
          if (action === "toggle") c.isPlaying ? c.pause() : c.play();
          else if (action === "next") c.nextTrack();
          else if (action === "prev") c.prevTrack();
        } catch (err) {
          NP.logger.error(`Media command ${action} failed`, err);
        }
      } else if (source === "system") {
        try {
          await fetch(`${BRIDGE}/cmd/${action}`, { method: "POST" });
          if (action === "toggle" && this.systemSrc) {
            this.systemSrc.position = this.interpolate(this.systemSrc);
            this.systemSrc.stamp = performance.now();
            this.systemSrc.playing = !this.systemSrc.playing;
            this.publish();
          }
        } catch {}
      }
    },

    async seek(sec) {
      const source = this.current?.source;
      const st = this.stateOf(source);
      if (!st) return;
      if (source === "browser") {
        try {
          this.browserSrc.controller.seekTo(sec);
        } catch (err) {
          NP.logger.error("Seek failed", err);
          return;
        }
      } else {
        try {
          await fetch(`${BRIDGE}/seek?pos=${sec}`, { method: "POST" });
        } catch {
          return;
        }
      }
      st.position = sec;
      st.stamp = performance.now();
      NP.emit("mediaposition", this.current);
    },

    destroy() {
      clearTimeout(this.pollTimer);
      window.removeEventListener("TabAttrModified", this.onTabAttr);
      window.removeEventListener("TabClose", this.onTabClose);
      this.untrackBrowser(false);
      delete NP.media;
    },
  });

  // ================= Ambient color =================
  // Album-art color drives --nplus-ambient on :root. Glows, tints and the
  // player all read it, so the whole browser breathes with the music.
  NP.feature({
    name: "AmbientColor",
    init() {
      this.off = NP.on("media", (m) => this.update(m));
      NP.prefs.watch("nplus-media-ambient", (mode) => {
        NP.setRootAttr("nplus-ambient-mode", String(mode));
      });
    },
    async update(m) {
      NP.setRootAttr("nplus-media-playing", !!m?.playing);
      NP.setRootAttr("nplus-media-source", m?.source ?? null);
      const art = m?.artwork;
      if (art === this.lastArt) return;
      this.lastArt = art;

      let color = null;
      if (art) {
        try {
          color = await NP.color.fromImage(art);
        } catch (err) {
          NP.logger.warn(`Could not read album colors: ${err}`);
        }
      }
      if (art !== this.lastArt) return; // a newer track won the race

      if (color) {
        NP.root.style.setProperty("--nplus-ambient", `rgb(${color.join(" ")})`);
        NP.root.style.setProperty("--nplus-ambient-rgb", color.join(" "));
        NP.root.style.setProperty(
          "--nplus-art",
          `url("${art.replace(/"/g, '\\"')}")`,
        );
        NP.setRootAttr("nplus-has-ambient", true);
      } else {
        NP.root.style.removeProperty("--nplus-ambient");
        NP.root.style.removeProperty("--nplus-ambient-rgb");
        NP.root.style.removeProperty("--nplus-art");
        NP.setRootAttr("nplus-has-ambient", null);
      }
      this.color = color;
      NP.emit("ambient", color);
    },
    destroy() {
      this.off?.();
      for (const prop of ["--nplus-ambient", "--nplus-ambient-rgb", "--nplus-art"]) {
        NP.root.style.removeProperty(prop);
      }
      for (const attr of [
        "nplus-has-ambient",
        "nplus-media-playing",
        "nplus-media-source",
        "nplus-ambient-mode",
      ]) {
        NP.root.removeAttribute(attr);
      }
    },
  });

  // ================= Zen media card decoration =================
  // Zen 1.23 renders tab media as a stack of cards. We decorate the card that
  // belongs to the tracked browser with album art (cover background, vinyl)
  // and a live equalizer.
  NP.feature({
    name: "MediaCardDecor",
    init() {
      this.toolbar = document.getElementById("zen-media-controls-toolbar");
      if (!this.toolbar) return;

      this.decorate = this.decorate.bind(this);
      this.off = NP.on("media", this.decorate);
      this.observer = new MutationObserver(() => this.decorate(NP.media?.current));
      this.observer.observe(this.toolbar, {
        childList: true,
        subtree: true,
        attributeFilter: ["hidden"],
      });
    },

    decorate(m) {
      const front = window.gZenMediaController?.frontCard;
      for (const card of this.toolbar.querySelectorAll(".zen-media-card")) {
        const mine =
          m?.source === "browser" &&
          front?.element === card &&
          front.browser === m.browser;
        if (mine && m.artwork) {
          card.setAttribute("nplus-art", "true");
          card.style.setProperty("--nplus-card-art", `url("${m.artwork.replace(/"/g, '\\"')}")`);
        } else if (!mine) {
          card.removeAttribute("nplus-art");
          card.style.removeProperty("--nplus-card-art");
        }

        if (!card.querySelector(":scope > .nplus-card-ring")) {
          card.append(NP.html("div", { class: "nplus-card-ring" }));
        }

        let eq = card.querySelector(".nplus-eq");
        if (!eq) {
          eq = NP.html("div", { class: "nplus-eq" }, [
            NP.html("span"),
            NP.html("span"),
            NP.html("span"),
            NP.html("span"),
          ]);
          card.querySelector(".zen-media-focus-button")?.after(eq);
        }
      }
    },

    destroy() {
      this.off?.();
      this.observer?.disconnect();
      for (const card of this.toolbar?.querySelectorAll(".zen-media-card") ?? []) {
        card.removeAttribute("nplus-art");
        card.style.removeProperty("--nplus-card-art");
        card.querySelector(".nplus-eq")?.remove();
        card.querySelector(":scope > .nplus-card-ring")?.remove();
      }
    },
  });

  // ================= Media dock + desktop player card =================
  // A dock right above Zen's media stack. It hosts the desktop-app card
  // (Spotify etc. through Nebula Bridge) and the lyrics panel.
  NP.feature({
    name: "MediaDock",
    init() {
      const toolbar = document.getElementById("zen-media-controls-toolbar");
      if (!toolbar) return;

      const btn = (cls, icon, onclick, label) => {
        const b = NP.html("button", { class: `nplus-btn ${cls}`, title: label, onclick });
        b.style.setProperty("--nplus-icon", `url("${ZEN_ICONS}/${icon}.svg")`);
        return b;
      };

      this.card = NP.html("div", { id: "nplus-desktop-card", hidden: "true" }, [
        NP.html("div", { class: "nplus-dc-bg" }),
        NP.html("div", { class: "nplus-card-ring" }),
        NP.html("div", { class: "nplus-dc-row" }, [
          NP.html("div", { class: "nplus-dc-art" }),
          NP.html("div", { class: "nplus-dc-info" }, [
            NP.html("div", { class: "nplus-dc-title" }),
            NP.html("div", { class: "nplus-dc-artist" }),
          ]),
        ]),
        NP.html("div", { class: "nplus-dc-progress" }, [
          NP.html("span", { class: "nplus-dc-time" }),
          NP.html("div", { class: "nplus-dc-bar" }, [NP.html("div", { class: "nplus-dc-fill" })]),
          NP.html("span", { class: "nplus-dc-duration" }),
        ]),
        NP.html("div", { class: "nplus-dc-controls" }, [
          NP.html("span", { class: "nplus-dc-app" }),
          btn("nplus-dc-prev", "media-previous", () => NP.media.prev(), "Previous"),
          btn("nplus-dc-toggle", "media-play", () => NP.media.toggle(), "Play / Pause"),
          btn("nplus-dc-next", "media-next", () => NP.media.next(), "Next"),
        ]),
      ]);

      this.card.querySelector(".nplus-dc-bar").addEventListener("click", (e) => {
        const m = NP.media.current;
        if (!m?.duration || !m.canSeek) return;
        const rect = e.currentTarget.getBoundingClientRect();
        NP.media.seek(((e.clientX - rect.left) / rect.width) * m.duration);
      });

      this.dock = NP.html("div", { id: "nplus-media-dock" }, [this.card]);
      toolbar.before(this.dock);
      NP.dock = this.dock;

      this.off = NP.on("media", (m) => this.render(m));
      this.offPos = NP.on("mediaposition", () => this.tick());
      NP.prefs.watch("nplus-desktop-card", () => this.render(NP.media?.current));
      this.timer = setInterval(() => this.tick(), 500);
    },

    render(m) {
      const show = m?.source === "system" && NP.prefs.get("nplus-desktop-card");
      this.card.hidden = !show;
      if (!show) return;
      const q = (s) => this.card.querySelector(s);
      q(".nplus-dc-title").textContent = m.title;
      q(".nplus-dc-artist").textContent = m.artist;
      q(".nplus-dc-app").textContent = m.app;
      const art = m.artwork ? `url("${m.artwork}")` : "none";
      q(".nplus-dc-art").style.backgroundImage = art;
      q(".nplus-dc-bg").style.backgroundImage = art;
      this.card.toggleAttribute("playing", m.playing);
      q(".nplus-dc-toggle").style.setProperty(
        "--nplus-icon",
        `url("${ZEN_ICONS}/${m.playing ? "media-pause" : "media-play"}.svg")`,
      );
      this.card.toggleAttribute("can-seek", m.canSeek);
      this.tick();
    },

    tick() {
      const m = NP.media?.current;
      if (this.card.hidden || !m) return;
      const pos = NP.media.position();
      this.card.querySelector(".nplus-dc-time").textContent = NP.formatTime(pos);
      this.card.querySelector(".nplus-dc-duration").textContent = NP.formatTime(m.duration);
      this.card
        .querySelector(".nplus-dc-fill")
        .style.setProperty("--p", m.duration ? pos / m.duration : 0);
    },

    destroy() {
      this.off?.();
      this.offPos?.();
      clearInterval(this.timer);
      this.dock?.remove();
      delete NP.dock;
    },
  });

  // ================= Track-change island =================
  NP.feature({
    name: "MediaIsland",
    init() {
      this.off = NP.on("trackchange", (m) => this.onTrack(m));
    },
    async onTrack(m) {
      if (!m?.title || !m.playing || !NP.prefs.get("nplus-media-island")) return;
      // Skip the island when the track's own tab is in front of you.
      if (m.browser && m.browser === gBrowser.selectedBrowser) return;
      clearTimeout(this.pending);
      // Wait for the ambient color so the island glows in the album's color.
      this.pending = setTimeout(async () => {
        let color = null;
        try {
          color = m.artwork ? await NP.color.fromImage(m.artwork) : null;
        } catch {}
        NP.island?.show({
          title: m.title,
          subtitle: [m.artist, m.app].filter(Boolean).join(" · "),
          art: m.artwork,
          color,
          onClick: () => {
            const tab = m.browser && gBrowser.getTabForBrowser(m.browser);
            if (tab) {
              if (window.gZenWorkspaces?.switchTabIfNeeded) gZenWorkspaces.switchTabIfNeeded(tab);
              else gBrowser.selectedTab = tab;
            }
          },
        });
      }, 400);
    },
    destroy() {
      clearTimeout(this.pending);
      this.off?.();
    },
  });

  // ================= Media shortcuts =================
  NP.feature({
    name: "MediaShortcuts",
    init() {
      const enabled = () => NP.prefs.get("nplus-media-shortcuts") && !!NP.media?.current;
      this.offs = [
        NP.hotkey("ctrl+alt+space", () => NP.media.toggle(), enabled),
        NP.hotkey("ctrl+alt+arrowright", () => NP.media.next(), enabled),
        NP.hotkey("ctrl+alt+arrowleft", () => NP.media.prev(), enabled),
        NP.hotkey(
          "ctrl+alt+.",
          () => NP.media.seek(NP.media.position() + 10),
          enabled,
        ),
        NP.hotkey(
          "ctrl+alt+,",
          () => NP.media.seek(Math.max(0, NP.media.position() - 10)),
          enabled,
        ),
      ];
    },
    destroy() {
      this.offs?.forEach((off) => off());
    },
  });
})();
