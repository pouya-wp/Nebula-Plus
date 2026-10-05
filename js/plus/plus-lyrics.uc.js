// ==UserScript==
// @name           plus-lyrics.uc.js
// @description    Nebula Plus lyrics: time-synced lyrics from LRCLIB under the player
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  const API = "https://lrclib.net/api";
  const CLIENT = "Nebula Plus (https://github.com/JustAdumbPrsn/Zen-Nebula)";

  // ---------- query cleanup ----------
  // Web players report messy metadata ("Artist - Title (Official Video)",
  // "Artist - Topic"). Normalize it before asking LRCLIB.
  const NOISE =
    /\s*[([](official|music|lyric|lyrics|audio|video|visualizer|hd|hq|4k|remaster(ed)?|live|explicit|clean|mv|m\/v)[^)\]]*[)\]]/gi;

  function cleanQuery({ title = "", artist = "", album = "" }) {
    let t = title.replace(NOISE, "").replace(/\s*[|｜].*$/, "").trim();
    let a = artist.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
    // "Artist - Title" packed into the title (YouTube, SoundCloud)
    const split = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (split && (!a || split[1].toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(split[1].toLowerCase()))) {
      a = split[1].trim();
      t = split[2].trim();
    }
    t = t.replace(/\s*[([]?(feat\.?|ft\.?)\s[^)\]]*[)\]]?/i, "").trim();
    return { title: t, artist: a, album: album.trim() };
  }

  function parseLRC(text) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) continue;
      const words = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const s of stamps) {
        lines.push({ time: Number(s[1]) * 60 + Number(s[2]), text: words });
      }
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  async function lrclib(path, params) {
    const url = `${API}/${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: { "Lrclib-Client": CLIENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
    return res.json();
  }

  async function findLyrics(track) {
    const q = cleanQuery(track);
    if (!q.title) return null;

    // 0) a version you picked by hand for this track
    const picked = (await NP.store.get("lyricsPicks", {}))[`${track.title}|${track.artist}`];
    if (picked) {
      try {
        const hit = await (await fetch(`${API}/get/${picked}`, { headers: { "Lrclib-Client": CLIENT } })).json();
        if (hit?.syncedLyrics || hit?.plainLyrics) return hit;
      } catch {}
    }

    // 1) exact match (fast path, uses duration to pick the right version)
    if (q.artist) {
      const params = { track_name: q.title, artist_name: q.artist };
      if (q.album) params.album_name = q.album;
      if (track.duration) params.duration = Math.round(track.duration);
      try {
        const hit = await lrclib("get", params);
        if (hit?.syncedLyrics) return hit;
      } catch {}
    }

    // 2) fuzzy search, prefer synced lyrics with the closest duration
    const results =
      (await lrclib("search", q.artist ? { track_name: q.title, artist_name: q.artist } : { q: q.title })) ?? [];
    let synced = results.filter((r) => r.syncedLyrics);
    // 3) free-text search (catches transliterated / reordered titles)
    if (!synced.length) {
      const loose = (await lrclib("search", { q: `${q.artist} ${q.title}`.trim() })) ?? [];
      results.push(...loose);
      synced = loose.filter((r) => r.syncedLyrics);
    }
    if (!synced.length) return results.find((r) => r.plainLyrics) ?? null;
    if (!track.duration) return synced[0];
    return synced.reduce((best, r) =>
      Math.abs(r.duration - track.duration) < Math.abs(best.duration - track.duration) ? r : best,
    );
  }

  // ================= Lyrics panel =================
  NP.feature({
    name: "Lyrics",
    init() {
      this.cache = new Map();
      this.lines = [];
      this.active = -1;

      const tool = (cls, text, title, fn) =>
        NP.html("button", { class: `nplus-ly-tool ${cls}`, text, title, onclick: (e) => (e.stopPropagation(), fn()) });
      this.panel = NP.html("div", { id: "nplus-lyrics", hidden: "true" }, [
        // the window clips and fades the lines; the tools sit outside it
        NP.html("div", { class: "nplus-lyrics-window" }, [NP.html("div", { class: "nplus-lyrics-track" })]),
        NP.html("div", { class: "nplus-ly-tools" }, [
          tool("ly-earlier", "−", "Lyrics earlier (0.5 s)", () => this.nudge(-0.5)),
          NP.html("span", { class: "ly-offset" }),
          tool("ly-later", "+", "Lyrics later (0.5 s)", () => this.nudge(0.5)),
          tool("ly-pick", "⇄", "Choose another version", () => this.openPicker()),
        ]),
      ]);
      this.track = this.panel.querySelector(".nplus-lyrics-track");
      this.panel.addEventListener("click", (e) => {
        if (e.target.closest(".nplus-lyric-status")) return this.openPicker();
        const line = e.target.closest(".nplus-lyric");
        if (!line || !NP.prefs.get("nplus-lyrics-seek")) return;
        NP.media?.seek(Number(line.dataset.time) + 0.01);
      });
      this.picker = NP.html("div", { id: "nplus-ly-picker", hidden: "true" }, [
        NP.html("div", { class: "lp-head" }, [
          NP.html("input", { class: "lp-q", type: "text", dir: "auto", placeholder: "اسم آهنگ و خواننده…" }),
          NP.html("button", { class: "lp-close", text: "✕", onclick: () => this.closePicker() }),
        ]),
        NP.html("div", { class: "lp-list" }),
      ]);
      document.body.append(this.picker);
      this.picker.querySelector(".lp-q").addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.searchPicker(e.target.value);
        if (e.key === "Escape") this.closePicker();
      });

      const mount = () => {
        if (NP.dock) NP.dock.append(this.panel);
        else setTimeout(mount, 300);
      };
      mount();

      this.offMedia = NP.on("media", (m) => this.onMedia(m));
      this.offPos = NP.on("mediaposition", () => this.sync(true));
      NP.prefs.watch("nplus-lyrics", (on) => {
        this.enabled = on;
        if (on) this.onMedia(NP.media?.current, true);
        else this.hide();
      });
      NP.prefs.watch("nplus-lyrics-lines", (n) => this.panel.setAttribute("lines", n));
      NP.prefs.watch("nplus-lyrics-hover-only", (on) =>
        this.panel.toggleAttribute("hover-only", on),
      );
      NP.prefs.watch("nplus-lyrics-offset", (ms) => {
        this.offset = (Number.parseFloat(ms) || 0) / 1000;
      });

      this.offKey = NP.hotkey?.("ctrl+alt+l", () =>
        NP.prefs.set("nplus-lyrics", !NP.prefs.get("nplus-lyrics")),
      );
    },

    async onMedia(m, force = false) {
      if (!this.enabled) return;
      const key = m ? `${m.title}|${m.artist}` : null;
      if (key !== this.key || force) {
        this.key = key;
        this.trackOffset = key ? ((await NP.store.get("lyricsOffsets", {}))[key] ?? 0) : 0;
        this.showOffset();
        this.lines = [];
        this.active = -1;
        this.render();
        if (m?.title) await this.load(m, key);
      }
      this.startTicking(m?.playing);
    },

    async load(m, key, attempt = 0) {
      let lines = this.cache.get(key);
      if (!lines) {
        this.setStatus("loading");
        try {
          const hit = await findLyrics(m);
          if (hit?.instrumental) lines = [{ time: 0, text: "♪ ♪ ♪" }];
          else lines = hit?.syncedLyrics ? parseLRC(hit.syncedLyrics) : [];
        } catch (err) {
          // LRCLIB is often busy (503): retry a few times, don't cache errors.
          NP.logger.warn(`Lyrics lookup failed (try ${attempt + 1}): ${err}`);
          if (attempt < 3 && key === this.key) {
            clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => this.load(m, key, attempt + 1), [2000, 6000, 15000][attempt]);
          } else if (key === this.key) {
            this.setStatus("error");
          }
          return;
        }
        if (this.cache.size > 100) this.cache.clear();
        this.cache.set(key, lines);
      }
      if (key !== this.key) return; // track changed while loading
      this.lines = lines;
      this.render();
      if (!lines.length) this.setStatus("missing");
    },

    // ---- per-track timing ----
    async nudge(sec) {
      if (!this.key) return;
      this.trackOffset = Math.round(((this.trackOffset || 0) + sec) * 10) / 10;
      const all = await NP.store.get("lyricsOffsets", {});
      if (this.trackOffset) all[this.key] = this.trackOffset;
      else delete all[this.key];
      NP.store.set("lyricsOffsets", all);
      this.showOffset();
      this.sync(true);
    },

    showOffset() {
      const o = this.trackOffset || 0;
      const el = this.panel.querySelector(".ly-offset");
      el.textContent = o ? `${o > 0 ? "+" : ""}${o.toFixed(1)}s` : "";
      this.panel.toggleAttribute("has-offset", !!o);
    },

    // ---- choose another version ----
    openPicker() {
      const m = NP.media?.current;
      if (!m) return;
      const r = this.panel.getBoundingClientRect();
      this.picker.hidden = false;
      this.picker.style.left = `${Math.round(r.right + 10)}px`;
      this.picker.style.top = `${Math.round(Math.max(10, Math.min(r.top - 40, window.innerHeight - 380)))}px`;
      const q = this.picker.querySelector(".lp-q");
      q.value = `${cleanQuery(m).artist} ${cleanQuery(m).title}`.trim();
      this.picker.getBoundingClientRect();
      this.picker.setAttribute("open", "true");
      this.searchPicker(q.value);
      q.focus();
    },

    closePicker() {
      this.picker.removeAttribute("open");
      setTimeout(() => !this.picker.hasAttribute("open") && (this.picker.hidden = true), 200);
    },

    async searchPicker(text) {
      const list = this.picker.querySelector(".lp-list");
      list.replaceChildren(NP.html("div", { class: "lp-empty", text: "در حال جستجو…" }));
      let results = [];
      try {
        results = (await lrclib("search", { q: text })) ?? [];
      } catch {}
      const m = NP.media?.current;
      results.sort((a, b) => !!b.syncedLyrics - !!a.syncedLyrics || Math.abs(a.duration - (m?.duration ?? 0)) - Math.abs(b.duration - (m?.duration ?? 0)));
      if (!results.length) {
        list.replaceChildren(NP.html("div", { class: "lp-empty", text: "چیزی پیدا نشد؛ اسم رو عوض کن و Enter بزن" }));
        return;
      }
      list.replaceChildren(
        ...results.slice(0, 12).map((r) => {
          const first = (r.syncedLyrics || r.plainLyrics || "").replace(/\[[^\]]*\]/g, "").trim().split("\n").find(Boolean) ?? "";
          const row = NP.html("button", { class: "lp-row" }, [
            NP.html("div", { class: "lp-title", dir: "auto", text: `${r.trackName} — ${r.artistName}` }),
            NP.html("div", { class: "lp-meta", dir: "auto", text: `${NP.formatTime(r.duration)} · ${r.syncedLyrics ? "هم‌زمان" : "بدون زمان"} · ${first.slice(0, 40)}` }),
          ]);
          row.toggleAttribute("synced", !!r.syncedLyrics);
          row.addEventListener("click", () => this.choose(r));
          return row;
        }),
      );
    },

    async choose(r) {
      const m = NP.media?.current;
      if (!m) return;
      const key = `${m.title}|${m.artist}`;
      const picks = await NP.store.get("lyricsPicks", {});
      picks[key] = r.id;
      NP.store.set("lyricsPicks", picks);
      const lines = r.syncedLyrics ? parseLRC(r.syncedLyrics) : [];
      this.cache.set(key, lines);
      this.closePicker();
      if (key === this.key) {
        this.lines = lines;
        this.render();
        if (!lines.length) this.setStatus("missing");
      }
      NP.island?.show({ title: "لیریک انتخاب شد", subtitle: `${r.trackName} — ${r.artistName}`, duration: 2000 });
    },

    // A short muted line instead of silently showing nothing.
    setStatus(status) {
      NP.lyricsState = { key: this.key, lines: this.lines, status };
      NP.emit("lyrics", NP.lyricsState);
      clearTimeout(this.statusTimer);
      this.panel.setAttribute("status", status);
      // a video in a tab usually isn't a song: no "not found" line for it
      this.panel.toggleAttribute("quiet", status !== "ok" && NP.media?.current?.source === "browser");
      if (status === "loading") return;
      const text = { missing: "لیریک پیدا نشد · کلیک کن تا انتخاب کنی", error: "سرور لیریک فعلاً در دسترس نیست" }[status];
      this.track.replaceChildren(NP.html("div", { class: "nplus-lyric nplus-lyric-status", text, dir: "auto" }));
      this.track.style.transform = "none";
      this.panel.removeAttribute("hidden");
      this.statusTimer = setTimeout(() => {
        if (!this.lines.length) this.panel.setAttribute("hidden", "true");
      }, 4000);
    },

    render() {
      if (this.lines.length) this.panel.removeAttribute("quiet");
      // shared with the lyrics stage
      NP.lyricsState = { key: this.key, lines: this.lines, status: this.lines.length ? "ok" : this.panel.getAttribute("status") };
      NP.emit("lyrics", NP.lyricsState);
      this.track.replaceChildren(
        ...this.lines.map((l, i) =>
          NP.html("div", {
            class: l.text ? "nplus-lyric" : "nplus-lyric nplus-lyric-gap",
            dir: "auto",
            "data-time": l.time,
            "data-i": i,
            text: l.text || "♪",
          }),
        ),
      );
      this.active = -1;
      if (this.lines.length) {
        this.panel.removeAttribute("status");
        this.panel.removeAttribute("hidden");
        this.sync(true);
      } else {
        this.hide();
      }
    },

    hide() {
      if (this.panel.getAttribute("status") === "missing" || this.panel.getAttribute("status") === "error") return;
      this.panel.setAttribute("hidden", "true");
      this.startTicking(false);
    },

    startTicking(on) {
      clearInterval(this.timer);
      this.timer = null;
      if (on && this.lines.length && this.enabled) {
        this.timer = setInterval(() => this.sync(), 100);
      }
    },

    sync(force = false) {
      if (!this.lines.length || !NP.media?.current) return;
      const pos = NP.media.position() + (this.offset || 0) + (this.trackOffset || 0);

      // Binary search for the last line that started.
      let lo = 0;
      let hi = this.lines.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.lines[mid].time <= pos) {
          idx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }

      const nodes = this.track.children;
      if (idx !== this.active || force) {
        nodes[this.active]?.removeAttribute("active");
        nodes[this.active]?.style.removeProperty("--nplus-line-progress");
        this.active = idx;
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].toggleAttribute("past", i < idx);
          nodes[i].style.setProperty("--d", Math.min(Math.abs(i - idx), 4));
        }
        const node = nodes[idx];
        node?.setAttribute("active", "true");
        // Center the active line in the window.
        const target = node ? node.offsetTop + node.offsetHeight / 2 : 0;
        this.track.style.transform = `translateY(calc(var(--nplus-lyrics-window) / 2 - ${target}px))`;
      }

      // Karaoke fill for the active line.
      const line = this.lines[idx];
      if (line && NP.prefs.get("nplus-lyrics-karaoke")) {
        const end = this.lines[idx + 1]?.time ?? line.time + 5;
        const p = Math.min(1, Math.max(0, (pos - line.time) / Math.max(0.3, end - line.time)));
        nodes[idx]?.style.setProperty("--nplus-line-progress", p.toFixed(3));
      }
    },

    destroy() {
      clearInterval(this.timer);
      clearTimeout(this.retryTimer);
      clearTimeout(this.statusTimer);
      this.offMedia?.();
      this.offPos?.();
      this.offKey?.();
      this.panel?.remove();
      this.picker?.remove();
    },
  });
  // ================= Lyrics stage =================
  // Full-window "now playing": drifting blurred cover, the record and its
  // controls on one side, big synced lyrics in Meem on the other.
  // Open: Ctrl+Alt+M, or double-click the player. Close: Esc / ✕.
  NP.feature({
    name: "LyricsStage",
    init() {
      const btn = (cls, icon, fn, title) => {
        const b = NP.html("button", { class: `nplus-btn ${cls}`, title, onclick: fn });
        b.style.setProperty("--nplus-icon", `var(--nplus-i-${icon})`);
        return b;
      };
      this.el = NP.html("div", { id: "nplus-stage", hidden: "true" }, [
        NP.html("div", { class: "st-bg" }),
        NP.html("div", { class: "st-shade" }),
        NP.html("button", { class: "st-close", title: "Close (Esc)", text: "✕", onclick: () => this.close() }),
        NP.html("div", { class: "st-side" }, [
          NP.html("div", { class: "st-art" }),
          NP.html("div", { class: "st-title", dir: "auto" }),
          NP.html("div", { class: "st-artist", dir: "auto" }),
          NP.html("div", { class: "st-progress" }, [
            NP.html("span", { class: "st-time" }),
            NP.html("div", { class: "st-bar" }, [NP.html("div", { class: "st-fill" })]),
            NP.html("span", { class: "st-dur" }),
          ]),
          NP.html("div", { class: "st-controls" }, [
            btn("st-prev", "prev", () => NP.media?.prev(), "Previous"),
            btn("st-toggle", "play", () => NP.media?.toggle(), "Play / Pause"),
            btn("st-next", "next", () => NP.media?.next(), "Next"),
          ]),
        ]),
        NP.html("div", { class: "st-lyrics" }, [NP.html("div", { class: "st-track" })]),
      ]);
      document.body.append(this.el);
      this.track = this.el.querySelector(".st-track");

      this.el.querySelector(".st-bar").addEventListener("click", (e) => {
        const m = NP.media?.current;
        if (!m?.duration || !m.canSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        NP.media.seek(((e.clientX - r.left) / r.width) * m.duration);
      });
      this.track.addEventListener("click", (e) => {
        const line = e.target.closest(".st-line");
        if (line?.dataset.time) NP.media?.seek(Number(line.dataset.time) + 0.01);
      });

      this.onKey = (e) => {
        if (e.key === "Escape" && this.isOpen) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
      };
      window.addEventListener("keydown", this.onKey, true);
      this.offKey = NP.hotkey?.("ctrl+alt+m", () => (this.isOpen ? this.close() : this.open()));
      this.onDbl = (e) => {
        if (e.target.closest("#nplus-desktop-card, #nplus-lyrics, .zen-media-card")) this.open();
      };
      document.addEventListener("dblclick", this.onDbl);

      this.offMedia = NP.on("media", (m) => this.isOpen && this.renderMedia(m));
      this.offLyrics = NP.on("lyrics", () => this.isOpen && this.renderLyrics());
      NP.stage = { open: () => this.open(), close: () => this.close() };
    },

    open() {
      if (!NP.media?.current) {
        NP.island?.show({ title: "Nothing is playing", subtitle: "Play something to open the stage", duration: 2000 });
        return;
      }
      this.isOpen = true;
      this.el.removeAttribute("hidden");
      this.el.getBoundingClientRect();
      this.el.setAttribute("open", "true");
      this.renderMedia(NP.media.current);
      this.renderLyrics();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 100);
    },

    close() {
      this.isOpen = false;
      clearInterval(this.timer);
      this.el.removeAttribute("open");
      setTimeout(() => !this.isOpen && this.el.setAttribute("hidden", "true"), 500);
    },

    renderMedia(m) {
      if (!m) return this.close();
      const q = (s) => this.el.querySelector(s);
      const art = m.artwork ? `url("${m.artwork.replace(/"/g, '\\"')}")` : "none";
      q(".st-art").style.backgroundImage = art;
      q(".st-bg").style.backgroundImage = art;
      q(".st-art").toggleAttribute("empty", !m.artwork);
      q(".st-title").textContent = m.title;
      q(".st-artist").textContent = [m.artist, m.app].filter(Boolean).join(" · ");
      q(".st-toggle").style.setProperty("--nplus-icon", `var(--nplus-i-${m.playing ? "pause" : "play"})`);
      this.el.toggleAttribute("playing", m.playing);
      q(".st-dur").textContent = NP.formatTime(m.duration);
    },

    renderLyrics() {
      const st = NP.lyricsState;
      const key = NP.media?.current ? `${NP.media.current.title}|${NP.media.current.artist}` : null;
      const lines = st?.key === key ? st.lines : [];
      this.lines = lines;
      this.active = -2;
      if (!lines.length) {
        const msg = st?.key === key && st.status === "loading" ? "…" : "لیریک هم‌زمانی برای این آهنگ پیدا نشد";
        this.track.replaceChildren(NP.html("div", { class: "st-line st-empty", dir: "auto", text: msg }));
        this.track.style.transform = "none";
        return;
      }
      this.track.replaceChildren(
        ...lines.map((l) =>
          NP.html("div", { class: "st-line", dir: "auto", "data-time": l.time, text: l.text || "♪" }),
        ),
      );
      this.tick();
    },

    tick() {
      const m = NP.media?.current;
      if (!m) return;
      const pos = NP.media.position();
      this.el.querySelector(".st-time").textContent = NP.formatTime(pos);
      this.el.querySelector(".st-fill").style.setProperty("--p", m.duration ? pos / m.duration : 0);
      if (!this.lines?.length) return;
      const offset = (Number.parseFloat(NP.prefs.get("nplus-lyrics-offset")) || 0) / 1000;
      const t = pos + offset;
      let idx = -1;
      for (let i = 0; i < this.lines.length; i++) if (this.lines[i].time <= t) idx = i;
      if (idx === this.active) return;
      this.active = idx;
      const nodes = this.track.children;
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].toggleAttribute("active", i === idx);
        nodes[i].style.setProperty("--d", Math.min(Math.abs(i - idx), 5));
      }
      const node = nodes[Math.max(idx, 0)];
      if (node) {
        const box = this.el.querySelector(".st-lyrics").clientHeight;
        this.track.style.transform = `translateY(${box * 0.42 - node.offsetTop - node.offsetHeight / 2}px)`;
      }
    },

    destroy() {
      clearInterval(this.timer);
      window.removeEventListener("keydown", this.onKey, true);
      document.removeEventListener("dblclick", this.onDbl);
      this.offKey?.();
      this.offMedia?.();
      this.offLyrics?.();
      this.el?.remove();
      delete NP.stage;
    },
  });
})();
