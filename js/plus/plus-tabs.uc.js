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
  NP.DEFAULTS["nplus-focus-done"] = "";
  NP.DEFAULTS["nplus-weather-fx"] = 1;
  NP.DEFAULTS["nplus-weather-city"] = "Tehran";
  NP.DEFAULTS["nplus-weather-mood"] = true;

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

  // ================= Pomodoro / focus mode =================
  // A timer button next to the URL bar. Click it for presets, start/pause and
  // reset. A focus session tucks the sidebar away (Zen compact mode) and
  // slowly fills the active tab like an hourglass; when it ends a 5-minute
  // break starts by itself. Ctrl+Alt+F starts/pauses.
  NP.DEFAULTS["nplus-focus-compact"] = true;
  NP.DEFAULTS["nplus-focus-music"] = true;

  NP.feature({
    name: "FocusMode",
    init() {
      this.phase = "idle"; // idle | focus | break
      this.running = false;
      this.done = this.loadDone();

      // ---- button next to the URL bar ----
      this.button = NP.html("div", { id: "nplus-pomo", role: "button", title: "Pomodoro (Ctrl+Alt+F)" }, [
        NP.html("div", { class: "pm-ring" }),
        NP.html("span", { class: "pm-time" }),
      ]);
      this.button.addEventListener("click", () => this.togglePanel());
      const anchor = document.getElementById("urlbar-container");
      if (anchor) anchor.after(this.button);
      else document.getElementById("nav-bar-customization-target")?.append(this.button);

      // ---- panel ----
      const preset = (min) =>
        NP.html("button", { class: "pm-preset", "data-min": min, text: this.fa(min), onclick: () => this.setMinutes(min) });
      this.panel = NP.html("div", { id: "nplus-pomo-panel", hidden: "true" }, [
        NP.html("div", { class: "pm-head" }, [
          NP.html("div", { class: "pm-phase" }),
          NP.html("div", { class: "pm-done" }),
        ]),
        NP.html("div", { class: "pm-big" }, [NP.html("div", { class: "pm-big-ring" }), NP.html("div", { class: "pm-big-time" })]),
        NP.html("div", { class: "pm-presets" }, [preset(15), preset(25), preset(50), NP.html("span", { class: "pm-unit", text: "دقیقه" })]),
        NP.html("div", { class: "pm-actions" }, [
          NP.html("button", { class: "pm-main", onclick: () => this.main() }),
          NP.html("button", { class: "pm-reset", title: "Reset", text: "↺", onclick: () => this.reset() }),
        ]),
        NP.html("label", { class: "pm-opt" }, [
          NP.html("input", { type: "checkbox", class: "pm-compact" }),
          NP.html("span", { text: "جمع کردن sidebar موقع تمرکز" }),
        ]),
      ]);
      document.body.append(this.panel);
      const compact = this.panel.querySelector(".pm-compact");
      compact.checked = NP.prefs.get("nplus-focus-compact");
      compact.addEventListener("change", () => NP.prefs.set("nplus-focus-compact", compact.checked));

      this.onDocDown = (e) => {
        if (!this.panel.hidden && !e.target.closest?.("#nplus-pomo-panel, #nplus-pomo")) this.closePanel();
      };
      window.addEventListener("mousedown", this.onDocDown, true);

      this.minutes = Math.max(1, Number.parseFloat(NP.prefs.get("nplus-focus-minutes")) || 25);
      this.offKey = NP.hotkey?.("ctrl+alt+f", () => this.main());
      NP.focus = { toggle: () => this.main(), get active() { return NP.root.hasAttribute("nplus-focus"); } };
      this.timer = setInterval(() => this.tick(), 1000);
      // a call pauses the session; it resumes when the call ends
      this.offCall = NP.on("call", (live) => {
        if (live && this.phase === "focus" && this.running) {
          this.pausedByCall = true;
          this.pause();
          NP.island?.show({ title: "تمرکز متوقف شد", subtitle: "به‌خاطر تماس · بعدش ادامه می‌دم", duration: 3000 });
        } else if (!live && this.pausedByCall) {
          this.pausedByCall = false;
          this.resume();
          NP.island?.show({ title: "تمرکز ادامه پیدا کرد", duration: 2000 });
        }
      });
      this.render();
    },

    fa(n, pad = 0) {
      return new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: pad || 1, useGrouping: false }).format(n);
    },

    loadDone() {
      const [day, n] = String(NP.prefs.get("nplus-focus-done") ?? "").split("|");
      return day === new Date().toDateString() ? Number(n) || 0 : 0;
    },

    saveDone() {
      NP.prefs.set("nplus-focus-done", `${new Date().toDateString()}|${this.done}`);
    },

    // ---- actions ----
    setMinutes(min) {
      this.minutes = min;
      NP.prefs.set("nplus-focus-minutes", String(min));
      if (this.phase === "idle") this.render();
    },

    main() {
      if (this.phase === "idle") return this.startPhase("focus", this.minutes);
      this.running ? this.pause() : this.resume();
    },

    startPhase(phase, minutes) {
      this.phase = phase;
      this.total = minutes * 60_000;
      this.end = Date.now() + this.total;
      this.running = true;
      if (NP.prefs.get("nplus-focus-music") && NP.media?.current) {
        if (phase === "focus") NP.media.play();
        else NP.media.pause();
      }
      if (phase === "focus") {
        NP.setRootAttr("nplus-focus", true);
        if (NP.prefs.get("nplus-focus-compact") && window.gZenCompactModeManager) {
          this.wasCompact = !!gZenCompactModeManager.preference;
          gZenCompactModeManager.preference = true;
        }
        NP.island?.show({ title: "تمرکز شروع شد", subtitle: `${this.fa(minutes)} دقیقه`, duration: 2000 });
      } else {
        this.leaveFocus();
        NP.root.setAttribute("nplus-break", "true");
      }
      this.render();
    },

    pause() {
      this.remaining = Math.max(0, this.end - Date.now());
      this.running = false;
      this.render();
    },

    resume() {
      this.end = Date.now() + (this.remaining ?? 0);
      this.running = true;
      this.render();
    },

    reset() {
      this.leaveFocus();
      NP.root.removeAttribute("nplus-break");
      this.phase = "idle";
      this.running = false;
      this.render();
    },

    leaveFocus() {
      NP.root.removeAttribute("nplus-focus");
      NP.root.style.removeProperty("--nplus-focus-p");
      if (window.gZenCompactModeManager && this.wasCompact === false) gZenCompactModeManager.preference = false;
      this.wasCompact = undefined;
    },

    tick() {
      if (this.phase === "idle" || !this.running) return;
      if (Date.now() >= this.end) {
        if (this.phase === "focus") {
          this.done += 1;
          this.saveDone();
          NP.sound?.("done");
          NP.island?.show({ title: "وقت استراحته ☕", subtitle: `جلسه‌ی ${this.fa(this.done)}ام امروز تموم شد · ۵ دقیقه استراحت`, duration: 6000 });
          this.startPhase("break", 5);
        } else {
          NP.root.removeAttribute("nplus-break");
          NP.sound?.("island");
          NP.island?.show({ title: "استراحت تموم شد", subtitle: "بریم سراغ یه جلسه‌ی دیگه؟ کلیک کن", duration: 8000, onClick: () => this.startPhase("focus", this.minutes) });
          this.phase = "idle";
          this.running = false;
        }
      }
      this.render();
    },

    render() {
      const left = this.phase === "idle" ? this.minutes * 60_000 : this.running ? Math.max(0, this.end - Date.now()) : this.remaining ?? 0;
      const p = this.phase === "idle" ? 0 : 1 - left / this.total;
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const time = `${this.fa(m, 2)}:${this.fa(s, 2)}`;

      this.button.setAttribute("phase", this.phase);
      this.button.toggleAttribute("running", this.running);
      this.button.style.setProperty("--pm-p", p);
      this.button.querySelector(".pm-time").textContent = this.phase === "idle" ? "" : time;
      if (this.phase === "focus") NP.root.style.setProperty("--nplus-focus-p", p.toFixed(4));

      const q = (sel) => this.panel.querySelector(sel);
      this.panel.setAttribute("phase", this.phase);
      this.panel.style.setProperty("--pm-p", p);
      q(".pm-phase").textContent = { idle: "پومودورو", focus: "تمرکز", break: "استراحت" }[this.phase];
      q(".pm-done").textContent = this.done ? `امروز: ${this.fa(this.done)} جلسه` : "";
      q(".pm-big-time").textContent = time;
      q(".pm-main").textContent = this.phase === "idle" ? "شروع" : this.running ? "مکث" : "ادامه";
      q(".pm-reset").hidden = this.phase === "idle";
      for (const b of this.panel.querySelectorAll(".pm-preset")) b.toggleAttribute("active", Number(b.dataset.min) === this.minutes);
    },

    togglePanel() {
      this.panel.hidden ? this.openPanel() : this.closePanel();
    },

    openPanel() {
      const r = this.button.getBoundingClientRect();
      this.panel.hidden = false;
      const w = this.panel.getBoundingClientRect().width;
      this.panel.style.left = `${Math.round(Math.min(window.innerWidth - w - 10, Math.max(10, r.left + r.width / 2 - w / 2)))}px`;
      this.panel.style.top = `${Math.round(r.bottom + 8)}px`;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.render();
    },

    closePanel() {
      this.panel.removeAttribute("open");
      setTimeout(() => !this.panel.hasAttribute("open") && (this.panel.hidden = true), 220);
    },

    destroy() {
      clearInterval(this.timer);
      this.offKey?.();
      this.offCall?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.leaveFocus();
      NP.root.removeAttribute("nplus-break");
      this.button?.remove();
      this.panel?.remove();
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
          NP.html("div", { class: "mn-lyric", dir: "auto" }),
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
      const pos = NP.media.position();
      this.el.querySelector(".mn-fill").style.setProperty("--p", m.duration ? pos / m.duration : 0);
      // the current lyric line, in place of the artist while it plays
      const st = NP.lyricsState;
      let line = "";
      if (st?.key === `${m.title}|${m.artist}` && st.lines?.length) {
        const t = pos + (Number.parseFloat(NP.prefs.get("nplus-lyrics-offset")) || 0) / 1000;
        for (const l of st.lines) if (l.time <= t) line = l.text;
      }
      const el = this.el.querySelector(".mn-lyric");
      if (el.textContent !== line) el.textContent = line;
      this.el.toggleAttribute("has-lyric", !!line);
    },

    destroy() {
      clearInterval(this.timer);
      this.off?.();
      this.el?.remove();
    },
  });

  // ================= Weather sky =================
  // On rainy or snowy days a handful of faint drops / flakes drift over the
  // browser's own UI (sidebar, toolbar, margins), never over web pages.
  // nplus-weather-fx: 0 off · 1 follow the real weather · 2 rain · 3 snow
  const RAIN = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  const SNOW = [71, 73, 75, 77, 85, 86];

  NP.feature({
    name: "WeatherSky",
    init() {
      this.canvas = NP.html("canvas", { id: "nplus-sky" });
      document.body.append(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.resize = () => {
        this.canvas.width = window.innerWidth * devicePixelRatio;
        this.canvas.height = window.innerHeight * devicePixelRatio;
      };
      window.addEventListener("resize", this.resize);
      this.resize();
      this.real = "clear";
      NP.prefs.watch("nplus-weather-fx", () => this.apply());
      NP.prefs.watch("nplus-weather-city", () => this.fetchWeather());
      NP.prefs.watch("nplus-performance", () => this.apply());
      this.poll = setInterval(() => this.fetchWeather(), 30 * 60 * 1000);
      this.onVis = () => this.apply();
      document.addEventListener("visibilitychange", this.onVis);
      NP.sky = { set: (kind) => this.start(kind) };
    },

    async fetchWeather() {
      try {
        const city = NP.prefs.get("nplus-weather-city") || "Tehran";
        const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)).json();
        const p = geo.results?.[0];
        if (p) {
          const w = await (
            await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
                `&current=weather_code,cloud_cover,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1`,
            )
          ).json();
          const code = w.current?.weather_code;
          this.real = SNOW.includes(code) ? "snow" : RAIN.includes(code) ? "rain" : "clear";
          NP.setRootAttr("nplus-weather", this.real);

          // mood for the theme tint: sunny | cloudy | rain | snow | fog
          const cloud = w.current?.cloud_cover ?? 0;
          const mood =
            this.real !== "clear" ? this.real : code === 45 || code === 48 ? "fog" : code >= 3 || cloud >= 70 ? "cloudy" : "sunny";
          NP.setRootAttr("nplus-mood", mood);

          // real sunrise / sunset (local time strings like "2026-10-04T06:41")
          const rise = w.daily?.sunrise?.[0];
          const set = w.daily?.sunset?.[0];
          if (rise && set) {
            NP.sunTimes = { sunrise: new Date(rise), sunset: new Date(set) };
            NP.emit("sun", NP.sunTimes);
          }
        }
      } catch {}
      this.apply();
    },

    apply() {
      const mode = NP.prefs.get("nplus-weather-fx");
      let kind = mode === 2 ? "rain" : mode === 3 ? "snow" : mode === 1 ? this.real : "clear";
      if (
        NP.prefs.get("nplus-performance") ||
        document.hidden ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        kind = "clear";
      }
      this.start(kind);
    },

    spawn(kind, anywhere) {
      const W = this.canvas.width;
      const H = this.canvas.height;
      const p = { x: Math.random() * W, y: anywhere ? Math.random() * H : -20, ph: Math.random() * 6.28, f: 0.4 + Math.random() * 0.6 };
      if (kind === "rain") Object.assign(p, { vx: -0.8, vy: 9 + Math.random() * 5, len: 12 + Math.random() * 12, a: 0.2 + Math.random() * 0.14 });
      else Object.assign(p, { vx: -0.15, vy: 0.45 + Math.random() * 0.6, r: 1.1 + Math.random() * 1.6, a: 0.4 + Math.random() * 0.3 });
      return p;
    },

    start(kind) {
      if (kind === this.kind) return;
      this.kind = kind;
      cancelAnimationFrame(this.raf);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.toggleAttribute("active", kind !== "clear");
      if (kind === "clear") return;

      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const rainColor = dark ? "200, 215, 235" : "90, 110, 140";
      const snowColor = dark ? "255, 255, 255" : "250, 252, 255";
      const particles = Array.from({ length: kind === "rain" ? 34 : 26 }, () => this.spawn(kind, true));
      const tabbox = document.getElementById("tabbrowser-tabbox");
      let last = performance.now();
      let skip = false;

      const frame = (now) => {
        this.raf = requestAnimationFrame(frame);
        // ~30 fps is plenty for this and halves the cost
        skip = !skip;
        if (skip) return;
        const dt = Math.min(80, now - last) / 16.7;
        last = now;
        const { ctx, canvas } = this;
        const dpr = devicePixelRatio;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        // keep web pages clear
        const r = tabbox?.getBoundingClientRect();
        if (r && r.width) {
          ctx.beginPath();
          ctx.rect(0, 0, canvas.width, canvas.height);
          ctx.rect(r.x * dpr, r.y * dpr, r.width * dpr, r.height * dpr);
          ctx.clip("evenodd");
        }
        for (const p of particles) {
          p.y += p.vy * dt * dpr;
          p.x += (p.vx + (kind === "snow" ? Math.sin((now / 1000) * p.f + p.ph) * 0.3 : 0)) * dt * dpr;
          if (p.y > canvas.height + 20 || p.x < -20 || p.x > canvas.width + 20) Object.assign(p, this.spawn(kind, false));
          if (kind === "rain") {
            ctx.strokeStyle = `rgba(${rainColor}, ${p.a})`;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 2 * dpr, p.y - p.len * dpr);
            ctx.stroke();
          } else {
            ctx.fillStyle = `rgba(${snowColor}, ${p.a})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      };
      this.raf = requestAnimationFrame(frame);
    },

    destroy() {
      cancelAnimationFrame(this.raf);
      clearInterval(this.poll);
      window.removeEventListener("resize", this.resize);
      document.removeEventListener("visibilitychange", this.onVis);
      this.canvas?.remove();
      delete NP.sky;
    },
  });
})();
