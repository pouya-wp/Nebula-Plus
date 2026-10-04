// ==UserScript==
// @name           plus-core.uc.js
// @description    Nebula Plus core: prefs, event bus, color tools, island, hotkeys
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  if (window.NebulaPlus) {
    try {
      window.NebulaPlus.destroy();
    } catch {}
  }

  const HTML_NS = "http://www.w3.org/1999/xhtml";

  // Every Nebula Plus pref with its default. Sine only writes defaults once the
  // settings page has been opened, so we seed missing prefs ourselves; CSS
  // `-moz-pref()` queries need the pref to exist to see a default of `true`.
  // Keep in sync with preferences.json (checked by scripts/check-prefs.mjs).
  const DEFAULTS = {
    // 🎵 Music
    "nplus-media-bridge": true,
    "nplus-desktop-card": true,
    "nplus-media-cover-bg": true,
    "nplus-media-vinyl": true,
    "nplus-media-eq": true,
    "nplus-media-ambient": 2,
    "nplus-media-pause-dim": true,
    "nplus-media-glow": true,
    "nplus-media-island": true,
    "nplus-media-shortcuts": true,
    // 🎤 Lyrics
    "nplus-lyrics": true,
    "nplus-lyrics-lines": 3,
    "nplus-lyrics-karaoke": true,
    "nplus-lyrics-seek": true,
    "nplus-lyrics-hover-only": false,
    "nplus-lyrics-offset": "0",
    "var-nplus-lyrics-font": "Meem",
    "var-nplus-lyrics-size": "11.5px",
    // ✨ Glow & motion
    "nplus-glow-tab": true,
    "nplus-glow-urlbar": true,
    "nplus-glow-color": 2,
    "var-nplus-glow-speed": "4s",
    "var-nplus-glow-width": "1.5px",
    "nplus-shimmer-hover": true,
    "nplus-shimmer-loading": true,
    "nplus-audible-pulse": true,
    "nplus-press-feedback": true,
    "nplus-glass-edge": true,
    "nplus-grain": false,
    "nplus-performance": false,
    // 🌊 Ambience
    "nplus-time-tint": true,
    "nplus-page-halo": false,
    "var-nplus-ui-font": "",
    "nplus-content-selection": true,
    "nplus-content-scrollbar": true,
    // 🧭 Sidebar & islands
    "nplus-clock": false,
    "nplus-clock-jalali": true,
    "nplus-download-island": true,
    "nplus-island-position": 1,
  };

  // String prefs mirrored into CSS custom properties on :root, so they update
  // live (Sine only rebuilds its own variables when its settings page saves).
  const CSS_VAR_PREFS = {
    "var-nplus-lyrics-font": "--nplus-lyrics-font",
    "var-nplus-lyrics-size": "--nplus-lyrics-size",
    "var-nplus-glow-speed": "--nplus-glow-speed",
    "var-nplus-glow-width": "--nplus-glow-width",
    "var-nplus-ui-font": "--nplus-ui-font",
  };

  const NP = (window.NebulaPlus = {
    HTML_NS,
    DEFAULTS,
    bus: new EventTarget(),
    _cleanups: [],
    _features: [],

    logger: {
      log: (msg) => console.log(`[Nebula+] ${msg}`),
      warn: (msg) => console.warn(`[Nebula+] ${msg}`),
      error: (msg, err) => console.error(`[Nebula+] ${msg}`, err ?? ""),
    },

    // ---------- events ----------
    emit(type, detail) {
      this.bus.dispatchEvent(new CustomEvent(type, { detail }));
    },
    on(type, fn) {
      const handler = (e) => fn(e.detail);
      this.bus.addEventListener(type, handler);
      return () => this.bus.removeEventListener(type, handler);
    },

    // ---------- prefs ----------
    prefs: {
      get(name) {
        const def = DEFAULTS[name];
        try {
          switch (Services.prefs.getPrefType(name)) {
            case Services.prefs.PREF_BOOL:
              return Services.prefs.getBoolPref(name);
            case Services.prefs.PREF_INT:
              return Services.prefs.getIntPref(name);
            case Services.prefs.PREF_STRING: {
              const v = Services.prefs.getStringPref(name);
              // Sine stores dropdown numbers as strings in some versions.
              return typeof def === "number" && v !== "" ? Number(v) : v;
            }
          }
        } catch {}
        return def;
      },
      set(name, value) {
        if (typeof value === "boolean") Services.prefs.setBoolPref(name, value);
        else if (typeof value === "number")
          Services.prefs.setIntPref(name, value);
        else Services.prefs.setStringPref(name, String(value));
      },
      // Calls fn(value) now and whenever the pref changes. Returns unsubscribe.
      watch(name, fn) {
        const observer = () => fn(NP.prefs.get(name));
        Services.prefs.addObserver(name, observer);
        fn(NP.prefs.get(name));
        const off = () => Services.prefs.removeObserver(name, observer);
        NP._cleanups.push(off);
        return off;
      },
      seedDefaults() {
        for (const [name, value] of Object.entries(DEFAULTS)) {
          if (Services.prefs.getPrefType(name) === 0) {
            try {
              NP.prefs.set(name, value);
            } catch (err) {
              NP.logger.error(`Could not seed pref ${name}`, err);
            }
          }
        }
      },
    },

    // ---------- DOM helpers ----------
    html(tag, props = {}, children = []) {
      const el = document.createElementNS(HTML_NS, tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
      for (const child of [].concat(children)) if (child) el.append(child);
      return el;
    },

    root: document.documentElement,

    setRootAttr(name, value) {
      if (value === null || value === undefined || value === false)
        this.root.removeAttribute(name);
      else this.root.setAttribute(name, value === true ? "true" : value);
    },

    formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
      const s = Math.floor(seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = String(s % 60).padStart(2, "0");
      return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
    },

    // ---------- features ----------
    // A feature is { name, init(), destroy() }. Errors are isolated per feature.
    feature(def) {
      this._features.push(def);
      if (this._started) this._startFeature(def);
    },
    _startFeature(def) {
      const fail = (err) => this.logger.error(`Feature "${def.name}" failed to init`, err);
      try {
        Promise.resolve(def.init?.()).then(() => this.logger.log(`✅ ${def.name}`), fail);
      } catch (err) {
        fail(err);
      }
    },

    start() {
      this._started = true;
      this.prefs.seedDefaults();
      for (const [pref, cssVar] of Object.entries(CSS_VAR_PREFS)) {
        this.prefs.watch(pref, (value) => {
          if (value) this.root.style.setProperty(cssVar, value);
          else this.root.style.removeProperty(cssVar);
          this.setRootAttr(`nplus-has${cssVar.slice(7)}`, !!value);
        });
      }
      for (const def of this._features) this._startFeature(def);
    },

    destroy() {
      for (const def of this._features) {
        try {
          def.destroy?.();
        } catch (err) {
          this.logger.error(`Feature "${def.name}" failed to destroy`, err);
        }
      }
      for (const off of this._cleanups.splice(0)) {
        try {
          off();
        } catch {}
      }
      delete window.NebulaPlus;
    },
  });

  // ================= Color tools =================
  // Extracts a vivid, readable accent color from an image (album art, favicon).
  NP.color = {
    _cache: new Map(),

    async _loadBitmap(url) {
      // Image element first (handles page-icon:, moz-anno:, data: and http).
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        return img;
      } catch {}
      const res = await fetch(url);
      return createImageBitmap(await res.blob());
    },

    async fromImage(url) {
      if (!url) return null;
      if (this._cache.has(url)) return this._cache.get(url);

      const size = 32;
      const source = await this._loadBitmap(url);
      const canvas = document.createElementNS(HTML_NS, "canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      // Weight hue buckets by saturation and mid-brightness so we pick the
      // color a human would call "the color of this cover", not gray/black.
      const buckets = new Array(36).fill(null).map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
      let avg = { r: 0, g: 0, b: 0, n: 0 };
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 128) continue;
        avg.r += r;
        avg.g += g;
        avg.b += b;
        avg.n++;
        const [h, s, l] = this.rgbToHsl(r, g, b);
        const weight = s * s * (1 - Math.abs(l - 0.55) * 1.6);
        if (weight <= 0.02) continue;
        const bucket = buckets[Math.floor(h / 10) % 36];
        bucket.w += weight;
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
      }

      const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
      let rgb;
      if (best.w > 0.5) {
        rgb = [best.r / best.w, best.g / best.w, best.b / best.w];
      } else if (avg.n) {
        rgb = [avg.r / avg.n, avg.g / avg.n, avg.b / avg.n];
      } else {
        return null;
      }

      // Normalize: keep hue, guarantee enough saturation and a glow-friendly lightness.
      let [h, s, l] = this.rgbToHsl(...rgb);
      s = Math.max(s, best.w > 0.5 ? 0.45 : s);
      l = Math.min(Math.max(l, 0.45), 0.7);
      const color = this.hslToRgb(h, s, l).map(Math.round);

      if (this._cache.size > 200) this._cache.clear();
      this._cache.set(url, color);
      return color;
    },

    rgbToHsl(r, g, b) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return [0, 0, l];
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h;
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return [h * 60, s, l];
    },

    hslToRgb(h, s, l) {
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [f(0) * 255, f(8) * 255, f(4) * 255];
    },
  };

  // ================= Island =================
  // A floating glass pill (like Dynamic Island) for short notices:
  // track changes, finished downloads, etc.
  NP.feature({
    name: "Island",
    init() {
      this.el = NP.html("div", { id: "nplus-island", hidden: "true" }, [
        NP.html("div", { class: "nplus-island-art" }),
        NP.html("div", { class: "nplus-island-text" }, [
          NP.html("div", { class: "nplus-island-title" }),
          NP.html("div", { class: "nplus-island-sub" }),
        ]),
      ]);
      document.body.append(this.el);
      this.el.addEventListener("click", () => {
        this.current?.onClick?.();
        this.hide();
      });

      NP.prefs.watch("nplus-island-position", (pos) =>
        this.el.setAttribute("position", pos === 2 ? "bottom" : "top"),
      );

      NP.island = {
        show: (opts) => this.show(opts),
        hide: () => this.hide(),
      };
    },

    // opts: { title, subtitle, art (url), icon (url), color [r,g,b], duration, onClick }
    show(opts) {
      clearTimeout(this.timer);
      this.current = opts;
      const art = this.el.querySelector(".nplus-island-art");
      const image = opts.art || opts.icon;
      art.style.backgroundImage = image ? `url("${image}")` : "none";
      art.toggleAttribute("icon", !opts.art && !!opts.icon);
      art.hidden = !image;
      this.el.querySelector(".nplus-island-title").textContent = opts.title ?? "";
      this.el.querySelector(".nplus-island-sub").textContent = opts.subtitle ?? "";
      if (opts.color) {
        this.el.style.setProperty("--nplus-island-color", `rgb(${opts.color.join(" ")})`);
      } else {
        this.el.style.removeProperty("--nplus-island-color");
      }

      this.el.removeAttribute("hidden");
      // Restart the entrance animation even if already visible.
      this.el.removeAttribute("open");
      this.el.getBoundingClientRect();
      this.el.setAttribute("open", "true");
      this.timer = setTimeout(() => this.hide(), opts.duration ?? 4000);
    },

    hide() {
      clearTimeout(this.timer);
      this.el?.removeAttribute("open");
    },

    destroy() {
      clearTimeout(this.timer);
      this.el?.remove();
      delete NP.island;
    },
  });

  // ================= Hotkeys =================
  // Small registry so features can add window-level shortcuts.
  // Combos look like "ctrl+alt+l" / "ctrl+alt+arrowright".
  NP.feature({
    name: "Hotkeys",
    init() {
      this.map = new Map();
      this.onKey = (e) => {
        if (e.repeat) return;
        const combo = [
          e.ctrlKey && "ctrl",
          e.altKey && "alt",
          e.shiftKey && "shift",
          e.metaKey && "meta",
          e.key.toLowerCase() === " " ? "space" : e.key.toLowerCase(),
        ]
          .filter(Boolean)
          .join("+");
        const entry = this.map.get(combo);
        if (entry && (!entry.enabled || entry.enabled())) {
          e.preventDefault();
          e.stopPropagation();
          entry.fn(e);
        }
      };
      window.addEventListener("keydown", this.onKey, true);
      NP.hotkey = (combo, fn, enabled) => {
        this.map.set(combo, { fn, enabled });
        return () => this.map.delete(combo);
      };
    },
    destroy() {
      window.removeEventListener("keydown", this.onKey, true);
      delete NP.hotkey;
    },
  });

  // Other Nebula Plus scripts register their features synchronously after this
  // file runs; start once the window is ready so they are all included.
  const boot = () => {
    if (!window.NebulaPlus) return;
    NP.start();
  };
  if (document.readyState === "complete") setTimeout(boot, 0);
  else window.addEventListener("load", () => setTimeout(boot, 0), { once: true });
  window.addEventListener("unload", () => window.NebulaPlus?.destroy(), {
    once: true,
  });
})();
