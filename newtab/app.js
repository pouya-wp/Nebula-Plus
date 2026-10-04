// Nebula Plus — New Tab
// Persian, Meem-first new tab page. Talks to Nebula Bridge (localhost) for the
// player, LRCLIB for lyrics, Open-Meteo for weather, Ganjoor for Hafez.

"use strict";

const BRIDGE = "http://127.0.0.1:47321";
const $ = (s) => document.querySelector(s);

// ---------------- settings ----------------
const DEFAULTS = {
  name: "",
  city: "تهران",
  faDigits: true,
  seconds: false,
  player: true,
  weather: true,
  notes: true,
  hafez: true,
  engine: "google",
  wallBlur: 0,
  wallDim: 0,
  links: [
    { name: "یوتیوب", url: "https://www.youtube.com" },
    { name: "گیت‌هاب", url: "https://github.com" },
    { name: "جمنای", url: "https://gemini.google.com" },
    { name: "اسپاتیفای", url: "https://open.spotify.com" },
    { name: "تلگرام", url: "https://web.telegram.org" },
    { name: "فیگما", url: "https://www.figma.com" },
  ],
};

const store = {
  get() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("nplus-newtab") || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  },
  set(patch) {
    const next = { ...store.get(), ...patch };
    try {
      localStorage.setItem("nplus-newtab", JSON.stringify(next));
    } catch {}
    return next;
  },
};
let S = store.get();

const nf = () => new Intl.NumberFormat(S.faDigits ? "fa-IR" : "en-US", { useGrouping: false });
const num = (n, pad = 0) => {
  const s = nf().format(n);
  if (!pad) return s;
  return nf().format(0).repeat(Math.max(0, pad - String(n).length)) + s;
};

// ---------------- clock & dates ----------------
const jalali = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hijri = new Intl.DateTimeFormat("fa-IR-u-ca-islamic-umalqura", { day: "numeric", month: "long" });
const greg = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });

function greetingFor(h) {
  if (h < 5) return "شب بخیر";
  if (h < 12) return "صبح بخیر";
  if (h < 15) return "ظهر بخیر";
  if (h < 19) return "عصر بخیر";
  return "شب بخیر";
}

function tickClock() {
  const now = new Date();
  $("#clock-h").textContent = num(now.getHours(), 2);
  $("#clock-m").textContent = num(now.getMinutes(), 2) + (S.seconds ? ":" + num(now.getSeconds(), 2) : "");
  $("#date-jalali").textContent = jalali.format(now);
  $("#date-greg").textContent = greg.format(now);
  $("#date-hijri").textContent = hijri.format(now);
  const g = greetingFor(now.getHours());
  $("#greeting").textContent = S.name ? `${g}، ${S.name}` : g;
}

// ---------------- search ----------------
const ENGINES = {
  google: { name: "گوگل", url: "https://www.google.com/search?q=", host: "google.com" },
  duck: { name: "داک‌داک‌گو", url: "https://duckduckgo.com/?q=", host: "duckduckgo.com" },
  bing: { name: "بینگ", url: "https://www.bing.com/search?q=", host: "bing.com" },
  perplexity: { name: "پرپلکسیتی", url: "https://www.perplexity.ai/search?q=", host: "perplexity.ai" },
  youtube: { name: "یوتیوب", url: "https://www.youtube.com/results?search_query=", host: "youtube.com" },
};
const favicon = (host) => `https://icons.duckduckgo.com/ip3/${host}.ico`;

function renderEngine() {
  const e = ENGINES[S.engine] ?? ENGINES.google;
  $("#engine-btn").style.backgroundImage = `url("${favicon(e.host)}")`;
  $("#engine-btn").title = e.name;
  const list = $("#engines");
  list.replaceChildren(
    ...Object.entries(ENGINES).map(([id, eng]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.toggleAttribute("active", id === S.engine);
      const img = document.createElement("img");
      img.src = favicon(eng.host);
      b.append(img, eng.name);
      b.onclick = () => {
        S = store.set({ engine: id });
        list.hidden = true;
        renderEngine();
        $("#q").focus();
      };
      return b;
    }),
  );
}

function looksLikeUrl(q) {
  return /^(https?:\/\/|localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(q) && !/\s/.test(q);
}

$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (!q) return;
  location.href = looksLikeUrl(q)
    ? (/^https?:\/\//i.test(q) ? q : `https://${q}`)
    : (ENGINES[S.engine] ?? ENGINES.google).url + encodeURIComponent(q);
});
$("#engine-btn").addEventListener("click", () => ($("#engines").hidden = !$("#engines").hidden));
document.addEventListener("click", (e) => {
  if (!e.target.closest("#search")) $("#engines").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== $("#q") && !e.target.closest("input, textarea")) {
    e.preventDefault();
    $("#q").focus();
  }
  if (e.key === "Escape") document.querySelectorAll(".modal").forEach((m) => (m.hidden = true));
});

// ---------------- quick links ----------------
function renderLinks() {
  $("#links").replaceChildren(
    ...S.links.map((l, i) => {
      const a = document.createElement("a");
      a.className = "link";
      a.href = l.url;
      a.style.setProperty("--i", i);
      let host = "";
      try {
        host = new URL(l.url).hostname;
      } catch {}
      a.innerHTML = `<div class="tile glass"><img alt=""></div><span></span>`;
      a.querySelector("img").src = favicon(host);
      a.querySelector("span").textContent = l.name;
      return a;
    }),
  );
}

// ---------------- weather ----------------
const WMO = {
  0: ["آفتابی", "☀️"], 1: ["عمدتاً صاف", "🌤️"], 2: ["نیمه‌ابری", "⛅"], 3: ["ابری", "☁️"],
  45: ["مه", "🌫️"], 48: ["مه یخ‌زده", "🌫️"],
  51: ["نم‌نم باران", "🌦️"], 53: ["نم‌نم باران", "🌦️"], 55: ["نم‌نم باران", "🌦️"],
  61: ["باران سبک", "🌧️"], 63: ["باران", "🌧️"], 65: ["باران شدید", "🌧️"],
  71: ["برف سبک", "🌨️"], 73: ["برف", "🌨️"], 75: ["برف سنگین", "❄️"],
  80: ["رگبار", "🌦️"], 81: ["رگبار", "🌧️"], 82: ["رگبار شدید", "⛈️"],
  95: ["رعدوبرق", "⛈️"], 96: ["رعدوبرق و تگرگ", "⛈️"], 99: ["رعدوبرق و تگرگ", "⛈️"],
};

async function loadWeather() {
  const box = $("#weather");
  if (!S.weather) return (box.hidden = true);
  const cacheKey = `nplus-weather-${S.city}`;
  let data;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.at < 15 * 60 * 1000) data = cached;
  } catch {}
  try {
    if (!data) {
      const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(S.city)}&count=1&language=fa`)).json();
      const place = geo.results?.[0];
      if (!place) throw new Error("city not found");
      const w = await (
        await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day` +
            `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
        )
      ).json();
      data = { at: Date.now(), place: place.name, w };
      localStorage.setItem(cacheKey, JSON.stringify(data));
    }
    const c = data.w.current;
    const [desc, icon] = WMO[c.weather_code] ?? ["", "🌡️"];
    $("#w-icon").textContent = c.is_day === 0 && c.weather_code <= 1 ? "🌙" : icon;
    $("#w-temp").textContent = `${num(Math.round(c.temperature_2m))}°`;
    $("#w-desc").textContent = `${desc} · حس ${num(Math.round(c.apparent_temperature))}°`;
    $("#w-meta").textContent =
      `بیشینه ${num(Math.round(data.w.daily.temperature_2m_max[0]))}° · کمینه ${num(Math.round(data.w.daily.temperature_2m_min[0]))}° · رطوبت ${num(c.relative_humidity_2m)}٪`;
    $("#w-city").textContent = `📍 ${data.place}`;
    box.hidden = false;
  } catch {
    box.hidden = true;
  }
}

// ---------------- player (Nebula Bridge) + lyrics ----------------
const fmt = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${num(Math.floor(sec / 60))}:${num(sec % 60, 2)}`;
};
const player = {
  key: null,
  lines: [],
  state: null,
  stamp: 0,

  async poll() {
    if (!S.player) {
      $("#player").hidden = true;
      document.body.removeAttribute("playing");
      return setTimeout(() => player.poll(), 3000);
    }
    let delay = 1000;
    try {
      const st = await (await fetch(`${BRIDGE}/state`, { cache: "no-store" })).json();
      this.state = st.active ? st : null;
      this.stamp = performance.now();
    } catch {
      this.state = null;
      delay = 5000;
    }
    this.render();
    setTimeout(() => player.poll(), delay);
  },

  position() {
    const st = this.state;
    if (!st) return 0;
    let p = st.position + (st.playing ? (performance.now() - this.stamp) / 1000 : 0);
    return st.duration ? Math.min(p, st.duration) : p;
  },

  render() {
    const st = this.state;
    const box = $("#player");
    if (!st) {
      box.hidden = true;
      document.body.removeAttribute("playing");
      return;
    }
    box.hidden = false;
    document.body.toggleAttribute("playing", st.playing);
    $("#p-title").textContent = st.title;
    $("#p-artist").textContent = [st.artist, st.app].filter(Boolean).join(" · ");
    $("#p-toggle i").className = st.playing ? "i-pause" : "i-play";
    const key = `${st.title}|${st.artist}`;
    if (key !== this.key) {
      this.key = key;
      this.lines = [];
      const lyr = $("#p-lyrics");
      lyr.textContent = "";
      lyr.dataset.line = "";
      this.loadLyrics(st, key);
    }
    // Players often publish the cover a moment after the title: follow
    // the art id itself, not just the track.
    const artId = st.artId ?? null;
    if (artId !== this.artId) {
      this.artId = artId;
      const art = artId ? `${BRIDGE}/art/${artId}` : null;
      $("#p-art").style.backgroundImage = art ? `url("${art}")` : "";
      $(".p-bg").style.backgroundImage = art ? `url("${art}")` : "";
      if (art) accentFrom(art);
      else document.documentElement.style.removeProperty("--accent");
    }
    $("#p-dur").textContent = fmt(st.duration);
  },

  async loadLyrics(st, key) {
    $("#player").removeAttribute("lyrics-found");
    try {
      const params = new URLSearchParams({ track_name: st.title, artist_name: st.artist });
      let res = await (await fetch(`https://lrclib.net/api/search?${params}`)).json();
      if (!res.some((r) => r.syncedLyrics)) {
        res = await (await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${st.artist} ${st.title}`)}`)).json();
      }
      const hit = res
        .filter((r) => r.syncedLyrics)
        .sort((a, b) => Math.abs(a.duration - st.duration) - Math.abs(b.duration - st.duration))[0];
      if (key !== this.key || !hit) return;
      // a little moment when lyrics arrive
      $("#player").setAttribute("lyrics-found", "");
      this.lines = hit.syncedLyrics
        .split("\n")
        .map((l) => l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/))
        .filter(Boolean)
        .map((m) => ({ t: +m[1] * 60 + +m[2], text: m[3].trim() }));
    } catch {}
  },

  tick() {
    const st = this.state;
    if (!st) return;
    const pos = this.position();
    $("#p-fill").style.setProperty("--p", st.duration ? pos / st.duration : 0);
    $("#p-time").textContent = fmt(pos);
    if (!this.lines.length) return;
    let idx = -1;
    for (let i = 0; i < this.lines.length; i++) if (this.lines[i].t <= pos) idx = i;
    const text = idx >= 0 ? this.lines[idx].text || "♪" : "";
    const el = $("#p-lyrics");
    if (el.dataset.line !== String(idx)) {
      el.dataset.line = idx;
      showLyric(el, text);
    }
  },
};

$(".p-controls").addEventListener("click", async (e) => {
  const cmd = e.target.closest("button")?.dataset.cmd;
  if (!cmd) return;
  try {
    await fetch(`${BRIDGE}/cmd/${cmd}`, { method: "POST" });
  } catch {}
});

// Each new lyric line: the old one floats up and blurs away, the new one
// arrives word by word (blur → sharp, rising), then a light sweeps across.
function showLyric(el, text) {
  const old = el.querySelector(".line");
  if (old) {
    old.classList.add("out");
    setTimeout(() => old.remove(), 450);
  }
  if (!text) return;
  const line = document.createElement("div");
  line.className = "line";
  line.dir = "auto";
  text.split(/(\s+)/).forEach((part, i) => {
    if (!part.trim()) return line.append(part);
    const w = document.createElement("span");
    w.className = "w";
    w.textContent = part;
    w.style.setProperty("--i", i / 2);
    line.append(w);
  });
  el.append(line);
}

// Accent color from the album art (glows, ambient light, buttons follow it).
async function accentFrom(url) {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      const score = sat * (1 - Math.abs(max / 255 - 0.65));
      if (score > bestScore) {
        bestScore = score;
        best = [r, g, b];
      }
    }
    if (best) document.documentElement.style.setProperty("--accent", `rgb(${best.join(" ")})`);
  } catch {}
}

// ---------------- notes ----------------
const notes = $("#notes-text");
notes.value = localStorage.getItem("nplus-notes") || "";
notes.addEventListener("input", () => localStorage.setItem("nplus-notes", notes.value));

// ---------------- Hafez ----------------
async function fal() {
  const body = $("#hafez-body");
  $("#hafez").hidden = false;
  $("#hafez-title").textContent = "نیت کن…";
  body.innerHTML = `<div class="loading">در حال باز کردن دیوان…</div>`;
  try {
    const p = await (await fetch("https://api.ganjoor.net/api/ganjoor/hafez/faal")).json();
    $("#hafez-title").textContent = p.title;
    $("#hafez-link").href = `https://ganjoor.net${p.fullUrl}`;
    const couplets = new Map();
    for (const v of p.verses) {
      if (!couplets.has(v.coupletIndex)) couplets.set(v.coupletIndex, []);
      couplets.get(v.coupletIndex).push(v.text);
    }
    body.replaceChildren(
      ...[...couplets.values()].map((pair, i) => {
        const row = document.createElement("div");
        row.className = "beyt";
        row.style.setProperty("--i", i);
        for (const text of pair) {
          const m = document.createElement("div");
          m.textContent = text;
          row.append(m);
        }
        return row;
      }),
    );
  } catch {
    $("#hafez-title").textContent = "فال حافظ";
    body.innerHTML = `<div class="loading">دیوان باز نشد؛ اینترنت رو چک کن.</div>`;
  }
}
$("#hafez-btn").addEventListener("click", fal);
$("#hafez-again").addEventListener("click", fal);

// ---------------- modals ----------------
document.querySelectorAll(".modal").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-close]")) m.hidden = true;
  }),
);
$("#settings-btn").addEventListener("click", () => {
  fillSettings();
  $("#settings").hidden = false;
});

// ---------------- wallpaper (IndexedDB) ----------------
const idb = () =>
  new Promise((res, rej) => {
    const r = indexedDB.open("nplus-newtab", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function wallGet() {
  const db = await idb();
  return new Promise((res) => {
    const q = db.transaction("kv").objectStore("kv").get("wall");
    q.onsuccess = () => res(q.result ?? null);
    q.onerror = () => res(null);
  });
}
async function wallSet(blob) {
  const db = await idb();
  const tx = db.transaction("kv", "readwrite");
  if (blob) tx.objectStore("kv").put(blob, "wall");
  else tx.objectStore("kv").delete("wall");
  return new Promise((res) => (tx.oncomplete = res));
}
async function renderWall() {
  const el = $("#wallpaper");
  el.style.setProperty("--wall-blur", `${S.wallBlur}px`);
  el.style.setProperty("--wall-dim", S.wallDim);
  try {
    const blob = await wallGet();
    if (blob) {
      el.style.backgroundImage = `url("${URL.createObjectURL(blob)}")`;
      accentFrom(el.style.backgroundImage.slice(5, -2));
    } else {
      el.style.backgroundImage = "";
    }
  } catch {}
}

// ---------------- settings ----------------
function fillSettings() {
  $("#s-name").value = S.name;
  $("#s-city").value = S.city;
  $("#s-fa-digits").checked = S.faDigits;
  $("#s-seconds").checked = S.seconds;
  $("#s-player").checked = S.player;
  $("#s-weather").checked = S.weather;
  $("#s-notes").checked = S.notes;
  $("#s-hafez").checked = S.hafez;
  $("#s-blur").value = S.wallBlur;
  $("#s-dim").value = S.wallDim;
  renderLinkEditor();
}

function renderLinkEditor() {
  $("#s-links").replaceChildren(
    ...S.links.map((l, i) => {
      const chip = document.createElement("span");
      chip.textContent = l.name;
      const x = document.createElement("button");
      x.textContent = "✕";
      x.onclick = () => {
        S = store.set({ links: S.links.filter((_, j) => j !== i) });
        renderLinks();
        renderLinkEditor();
      };
      chip.append(x);
      return chip;
    }),
  );
}

const bind = (sel, key, read = (el) => el.value, after = () => {}) =>
  $(sel).addEventListener("change", (e) => {
    S = store.set({ [key]: read(e.target) });
    applyVisibility();
    after();
  });
bind("#s-name", "name", undefined, tickClock);
bind("#s-city", "city", (el) => el.value.trim() || DEFAULTS.city, loadWeather);
bind("#s-fa-digits", "faDigits", (el) => el.checked, () => (tickClock(), loadWeather()));
bind("#s-seconds", "seconds", (el) => el.checked, tickClock);
bind("#s-player", "player", (el) => el.checked);
bind("#s-weather", "weather", (el) => el.checked, loadWeather);
bind("#s-notes", "notes", (el) => el.checked);
bind("#s-hafez", "hafez", (el) => el.checked);
$("#s-blur").addEventListener("input", (e) => (S = store.set({ wallBlur: +e.target.value }), renderWall()));
$("#s-dim").addEventListener("input", (e) => (S = store.set({ wallDim: +e.target.value }), renderWall()));
$("#s-wall").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (file) await wallSet(file);
  renderWall();
});
$("#s-wall-clear").addEventListener("click", async () => {
  await wallSet(null);
  renderWall();
});
$("#s-link-add").addEventListener("click", () => {
  const name = $("#s-link-name").value.trim();
  let url = $("#s-link-url").value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  S = store.set({ links: [...S.links, { name, url }] });
  $("#s-link-name").value = $("#s-link-url").value = "";
  renderLinks();
  renderLinkEditor();
});

function applyVisibility() {
  $("#notes").hidden = !S.notes;
  $("#hafez-btn").hidden = !S.hafez;
  if (!S.player) $("#player").hidden = true;
}

// ---------------- boot ----------------
tickClock();
setInterval(tickClock, 1000);
renderEngine();
renderLinks();
applyVisibility();
renderWall();
loadWeather();
player.poll();
setInterval(() => player.tick(), 250);
