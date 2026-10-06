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

  // Cover art for tracks whose player does not share one (many desktop apps,
  // some web players). Looked up once per track on the iTunes Search API.
  const artCache = new Map();
  const norm = (t) => (t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  async function lookupArtwork(title, artist) {
    const key = `${title}|${artist}`;
    if (artCache.has(key)) return artCache.get(key);
    artCache.set(key, null);
    try {
      const term = encodeURIComponent(`${artist} ${title}`.trim());
      const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=8`, {
        signal: AbortSignal.timeout(6000),
      });
      const { results = [] } = await res.json();
      const a = norm(artist.split(/[,&]| feat/i)[0]);
      const hit =
        results.find((r) => a && norm(r.artistName).includes(a) && norm(r.trackName) === norm(title)) ??
        results.find((r) => a && norm(r.artistName).includes(a));
      const url = hit?.artworkUrl100?.replace(/100x100bb/, "600x600bb") ?? null;
      artCache.set(key, url);
      return url;
    } catch {
      artCache.delete(key); // retry on the next track change
      return null;
    }
  }

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
        play: () => self.command("play"),
        pause: () => self.command("pause"),
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
          const sameTrack = prev?.title === data.title && prev?.artist === data.artist;
          this.systemSrc = {
            title: data.title,
            artist: data.artist,
            album: data.album,
            artwork: data.artId ? `${BRIDGE}/art/${data.artId}` : sameTrack ? prev.artwork : null,
            artLookup: !data.artId && sameTrack ? prev.artLookup : false,
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
      if (!st.artwork && st.title && !st.artLookup) {
        st.artLookup = true;
        lookupArtwork(st.title, st.artist).then((url) => {
          if (url && this.stateOf(source) === st && !st.artwork) {
            st.artwork = url;
            this.publish();
          }
        });
      }
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
          else if (action === "play") c.play();
          else if (action === "pause") c.pause();
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
  // A dock floating right above Zen's media stack. It hosts the desktop-app
  // card (Spotify etc. through Nebula Bridge) and the lyrics panel.
  // It floats (position: absolute) instead of joining the sidebar's flow:
  // mods like SuperPins pin #tabbrowser-tabs to a fixed height, which would
  // push anything added below it out of the window.
  NP.feature({
    name: "MediaDock",
    init() {
      const toolbar = document.getElementById("zen-media-controls-toolbar");
      if (!toolbar) return;

      const btn = (cls, icon, onclick, label) => {
        const b = NP.html("button", { class: `nplus-btn ${cls}`, title: label, onclick });
        b.style.setProperty("--nplus-icon", `var(--nplus-i-${icon})`);
        return b;
      };

      this.card = NP.html("div", { id: "nplus-desktop-card", hidden: "true" }, [
        NP.html("div", { class: "nplus-dc-bg" }),
        NP.html("div", { class: "nplus-card-ring" }),
        NP.html("div", { class: "nplus-dc-row" }, [
          NP.html("div", { class: "nplus-dc-art" }, [NP.html("div", { class: "nplus-dc-art-empty" })]),
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
          btn("nplus-dc-prev", "prev", () => NP.media.prev(), "Previous"),
          btn("nplus-dc-toggle", "play", () => NP.media.toggle(), "Play / Pause"),
          btn("nplus-dc-next", "next", () => NP.media.next(), "Next"),
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

      this.toolbar = toolbar;
      this.layout = this.layout.bind(this);
      this.resizeObserver = new ResizeObserver(this.layout);
      this.resizeObserver.observe(this.dock);
      this.resizeObserver.observe(toolbar);
      this.resizeObserver.observe(document.getElementById("tabbrowser-tabs"));
      this.resizeObserver.observe(toolbar);
      this.attrObserver = new MutationObserver(this.layout);
      this.attrObserver.observe(toolbar, { attributes: true, attributeFilter: ["hidden"] });
      this.attrObserver.observe(this.dock, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
      window.addEventListener("resize", this.layout);
      NP.prefs.watch("nplus-media-full-card", () => this.layout());
      this.layout();
    },

    // Anchor the dock above Zen's media cards (or the end of the tab list)
    // and reserve its height at the bottom of the tab list.
    layout() {
      const dock = this.dock;
      const visible = [...dock.children].some((c) => !c.hidden);
      dock.toggleAttribute("empty", !visible);
      const parent = dock.parentElement;
      if (!parent) return;
      const parentRect = parent.getBoundingClientRect();
      const foot = document.getElementById("zen-sidebar-foot-buttons")?.getBoundingClientRect();
      // the floor: just above the footer buttons (mods move these around)
      const floor = foot?.height ? foot.top : parentRect.bottom;
      let reserve = 0;
      let anchorTop = floor;

      // Zen's own player card (browser media) — kept unfolded in full-card
      // mode, so it is anchored here too and unfolds upward from the floor
      const zmc = this.toolbar;
      const full = NP.prefs.get("nplus-media-full-card");
      NP.setRootAttr("nplus-zmc-docked", full);
      if (full) {
        NP.setRootVar("--nplus-zmc-bottom", `${Math.max(0, parentRect.bottom - floor) + 6}px`);
        const r = zmc.getBoundingClientRect();
        if (!zmc.hidden && r.height > 0) {
          anchorTop = r.top;
          reserve += Math.ceil(r.height) + 10;
        }
      } else {
        const tabs = document.getElementById("tabbrowser-tabs").getBoundingClientRect();
        const r = zmc.getBoundingClientRect();
        anchorTop = Math.min(floor, tabs.bottom, !zmc.hidden && r.height > 0 ? r.top : Infinity);
      }

      if (visible) {
        dock.style.bottom = `${Math.max(0, parentRect.bottom - anchorTop) + 6}px`;
        reserve += Math.ceil(dock.getBoundingClientRect().height) + 10;
      }
      NP.setRootVar("--nplus-dock-h", `${reserve}px`);
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
      q(".nplus-dc-art").toggleAttribute("empty", !m.artwork);
      q(".nplus-dc-bg").style.backgroundImage = art;
      this.card.toggleAttribute("playing", m.playing);
      q(".nplus-dc-toggle").style.setProperty(
        "--nplus-icon",
        `var(--nplus-i-${m.playing ? "pause" : "play"})`,
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
      this.resizeObserver?.disconnect();
      this.attrObserver?.disconnect();
      window.removeEventListener("resize", this.layout);
      NP.root.style.removeProperty("--nplus-dock-h");
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

  // ================= Visualizer =================
  // A faint outline of the live spectrum (system audio via Nebula Bridge)
  // drawn behind the players: sidebar card, Zen's media card, mini player
  // and the lyrics stage. Polls only while music plays and a player shows.
  NP.DEFAULTS["nplus-visualizer"] = true;
  NP.DEFAULTS["nplus-beat-pulse"] = true;

  NP.feature({
    name: "Visualizer",
    init() {
      this.bands = new Array(28).fill(0);
      this.shown = new Array(28).fill(0);
      this.loop = this.loop.bind(this);
      this.off = NP.on("media", () => this.wake());
      NP.prefs.watch("nplus-visualizer", () => this.wake());
      this.wake();
    },

    targets() {
      const list = [];
      const add = (el, cls) => {
        if (!el) return;
        let c = el.querySelector(":scope > canvas.nplus-viz");
        if (!c) {
          c = NP.html("canvas", { class: `nplus-viz ${cls}` });
          el.prepend(c);
        }
        list.push(c);
      };
      const card = document.getElementById("nplus-desktop-card");
      if (card && !card.hidden) add(card, "viz-card");
      const front = window.gZenMediaController?.frontCard?.element;
      if (front && !front.hidden) add(front, "viz-card");
      const mini = document.getElementById("nplus-mini");
      if (mini?.hasAttribute("active") && mini.getBoundingClientRect().width) add(mini, "viz-mini");
      const stage = document.getElementById("nplus-stage");
      if (stage?.hasAttribute("open")) add(stage, "viz-stage");
      return list;
    },

    wake() {
      const on = NP.prefs.get("nplus-visualizer") && NP.media?.current?.playing;
      NP.setRootAttr("nplus-viz", !!on);
      if (on && !this.raf) this.raf = requestAnimationFrame(this.loop);
    },

    async poll() {
      if (this.inflight) return;
      this.inflight = true;
      try {
        const res = await fetch("http://127.0.0.1:47321/bands", { cache: "no-store" });
        const { b } = await res.json();
        if (Array.isArray(b)) this.bands = b;
      } catch {
        this.bands = this.bands.map((v) => v * 0.8);
      }
      this.inflight = false;
    },

    loop(now) {
      const on = NP.prefs.get("nplus-visualizer") && NP.media?.current?.playing && !document.hidden;
      const lean = NP.prefs.get("nplus-lean");
      // lean: ~30 fps (a faint outline doesn't need more), frozen while the
      // window isn't in use; targets and colour are re-read every half second
      if (lean && on && this.raf && (now - (this.lastFrame ?? 0) < 31 || !document.hasFocus())) {
        this.raf = requestAnimationFrame(this.loop);
        return;
      }
      this.lastFrame = now;
      if (!lean || !this.cached || now - this.cachedAt > 500) {
        this.cached = on ? this.targets() : [];
        this.cachedAt = now;
        this.color = null;
      }
      const targets = on ? this.cached : [];
      if (!targets.length) {
        // fade out, then sleep until music plays again
        let alive = false;
        for (const c of document.querySelectorAll("canvas.nplus-viz")) c.getContext("2d").clearRect(0, 0, c.width, c.height);
        this.shown.fill(0);
        this.raf = alive ? requestAnimationFrame(this.loop) : null;
        return;
      }
      if (!this.lastPoll || now - this.lastPoll > (lean ? 70 : 55)) {
        this.lastPoll = now;
        this.poll();
      }
      // ease toward the latest values for a fluid line
      // (same feel at 30 fps: a stronger step per frame)
      const ease = lean ? 0.43 : 0.25;
      for (let i = 0; i < this.shown.length; i++) this.shown[i] += ((this.bands[i] ?? 0) - this.shown[i]) * ease;

      // beat: bass jumps clearly above its running average -> a soft pulse
      // that decays; CSS reads --nplus-beat (0..1) for the tab glow etc.
      if (NP.prefs.get("nplus-beat-pulse")) {
        const bass = (this.bands[0] + this.bands[1] + this.bands[2] + this.bands[3]) / 4;
        this.bassAvg = (this.bassAvg ?? bass) * 0.92 + bass * 0.08;
        // the beat is an event: the lights answer it with a short GPU
        // animation (a root variable would restyle the whole window)
        if (bass > this.bassAvg * 1.25 && bass > 0.35 && now - (this.lastBeat ?? 0) > 260) {
          this.lastBeat = now;
          NP.emit("beat", Math.min(1, bass));
        }
      }
      const color = (this.color ??= getComputedStyle(NP.root).getPropertyValue("--nplus-accent").trim() || "rgb(140 160 255)");
      for (const c of targets) this.draw(c, color);
      this.raf = requestAnimationFrame(this.loop);
    },

    draw(canvas, color) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(rect.width * dpr));
      const H = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const v = this.shown;
      const n = v.length;
      const amp = H * (canvas.classList.contains("viz-stage") ? 0.28 : 0.62);
      const pts = v.map((val, i) => [(i / (n - 1)) * W, H - Math.pow(val, 1.3) * amp - dpr]);

      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2;
        const my = (pts[i][1] + pts[i + 1][1]) / 2;
        path.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      path.lineTo(pts[n - 1][0], pts[n - 1][1]);

      // faint fill under the line
      const fill = new Path2D(path);
      fill.lineTo(W, H);
      fill.lineTo(0, H);
      fill.closePath();
      const g = ctx.createLinearGradient(0, H - amp, 0, H);
      g.addColorStop(0, color);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = g;
      ctx.fill(fill);

      // the outline itself
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2 * dpr;
      ctx.lineJoin = "round";
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    },

    destroy() {
      cancelAnimationFrame(this.raf);
      this.off?.();
      for (const c of document.querySelectorAll("canvas.nplus-viz")) c.remove();
      NP.root.removeAttribute("nplus-viz");
    },
  });
})();
