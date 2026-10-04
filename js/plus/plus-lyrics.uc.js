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
    const synced = results.filter((r) => r.syncedLyrics);
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

      this.panel = NP.html("div", { id: "nplus-lyrics", hidden: "true" }, [
        NP.html("div", { class: "nplus-lyrics-track" }),
      ]);
      this.track = this.panel.firstChild;
      this.panel.addEventListener("click", (e) => {
        const line = e.target.closest(".nplus-lyric");
        if (!line || !NP.prefs.get("nplus-lyrics-seek")) return;
        NP.media?.seek(Number(line.dataset.time) + 0.01);
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
        this.lines = [];
        this.active = -1;
        this.render();
        if (m?.title) await this.load(m, key);
      }
      this.startTicking(m?.playing);
    },

    async load(m, key) {
      let lines = this.cache.get(key);
      if (!lines) {
        try {
          const hit = await findLyrics(m);
          if (hit?.instrumental) lines = [{ time: 0, text: "♪ ♪ ♪" }];
          else lines = hit?.syncedLyrics ? parseLRC(hit.syncedLyrics) : [];
        } catch (err) {
          NP.logger.warn(`Lyrics lookup failed: ${err}`);
          return; // don't cache network errors
        }
        if (this.cache.size > 100) this.cache.clear();
        this.cache.set(key, lines);
      }
      if (key !== this.key) return; // track changed while loading
      this.lines = lines;
      this.render();
    },

    render() {
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
        this.panel.removeAttribute("hidden");
        this.sync(true);
      } else {
        this.hide();
      }
    },

    hide() {
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
      const pos = NP.media.position() + (this.offset || 0);

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
      this.offMedia?.();
      this.offPos?.();
      this.offKey?.();
      this.panel?.remove();
    },
  });
})();
