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
      // the bridge also finds icons of new/private sites; DuckDuckGo if it's off
      const img = a.querySelector("img");
      img.onerror = () => ((img.onerror = null), (img.src = favicon(host)));
      img.src = `${BRIDGE}/favicon?host=${encodeURIComponent(host)}`;
      neonIcon(host).then((shape) => {
        if (!shape) return;
        const tile = a.querySelector(".tile");
        tile.append(Neon.add(shape, i));
        tile.classList.add("is-neon");
      });
      a.querySelector("span").textContent = l.name;
      return a;
    }),
  );
}

// ---------------- neon favicons ----------------
// Each favicon becomes a single-colour neon sign, built like an After Effects
// stack: fill colour (the live accent) -> bevel -> light sweep -> deep glow.
// Here we only turn the icon into a mask: its shape at low strength, plus a
// bright outline that reads as the glowing tube. Colours live in CSS.
const neonCache = new Map();
function neonIcon(host) {
  if (!host) return Promise.resolve(null);
  if (!neonCache.has(host)) neonCache.set(host, buildNeon(host).catch(() => null));
  return neonCache.get(host);
}

async function buildNeon(host) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = `${BRIDGE}/favicon?host=${encodeURIComponent(host)}`;
  await img.decode();
  const N = 96, pad = 8, inner = N - pad * 2;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, pad, pad, inner, inner);
  const px = ctx.getImageData(0, 0, N, N);
  const d = px.data;
  const at = (x, y) => (y * N + x) * 4;

  // Most icons are a filled shape (YouTube's red box, Spotify's green disc)
  // with the real symbol inside in a contrasting colour. Find that main
  // colour; whatever differs from it is "ink" - the part that lights up.
  const N2 = N * N;
  let alpha = new Float32Array(N2);
  for (let i = 0; i < N2; i++) alpha[i] = d[i * 4 + 3] / 255;
  const split = (alpha) => {
    const hist = new Map();
    let solid = 0;
    for (let i = 0; i < N2; i++) {
      if (alpha[i] < 0.8) continue;
      const j = i * 4;
      solid++;
      const key = ((d[j] >> 4) << 8) | ((d[j + 1] >> 4) << 4) | (d[j + 2] >> 4);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    let mainKey = -1, mainCount = 0;
    for (const [k, n] of hist) if (n > mainCount) (mainKey = k), (mainCount = n);
    const main = [((mainKey >> 8) & 15) * 16 + 8, ((mainKey >> 4) & 15) * 16 + 8, (mainKey & 15) * 16 + 8];
    const ink = new Float32Array(N2);
    let inkSum = 0;
    for (let i = 0; i < N2; i++) {
      const j = i * 4;
      const dist = Math.hypot(d[j] - main[0], d[j + 1] - main[1], d[j + 2] - main[2]) / 255;
      ink[i] = Math.min(1, Math.max(0, (dist - 0.14) / 0.22)) * alpha[i];
      inkSum += ink[i];
    }
    return { ink, twoTone: solid > 0 && mainCount / solid > 0.35, share: solid ? inkSum / solid : 0 };
  };
  // A logo on a solid tile (white square behind Telegram/GitHub): drop the
  // tile colour first, so the logo itself is the shape.
  const corner = [at(pad + 1, pad + 1), at(N - pad - 2, pad + 1), at(pad + 1, N - pad - 2), at(N - pad - 2, N - pad - 2)];
  const cdist = (j, k) => Math.hypot(d[j] - d[k], d[j + 1] - d[k + 1], d[j + 2] - d[k + 2]) / 255;
  if (corner.every((j) => d[j + 3] > 200 && cdist(j, corner[0]) < 0.1)) {
    const bg = corner[0];
    for (let i = 0; i < N2; i++) alpha[i] *= Math.min(1, Math.max(0, (cdist(i * 4, bg) - 0.12) / 0.2));
  }
  let { ink, twoTone, share } = split(alpha);
  // The "ink" is itself a big body: that body is the shape, look inside it.
  if (twoTone && share > 0.35) {
    alpha = ink;
    ({ ink, twoTone, share } = split(alpha));
  }
  // The main colour covers almost everything (a plain glyph): the glyph is the ink.
  const inkOnly = !twoTone || share < 0.03;
  if (inkOnly) ink = alpha;

  // Outlines = how fast a value changes around each pixel (Sobel).
  const sobel = (f, x, y) => {
    const a = (dx, dy) => f[(y + dy) * N + x + dx];
    const gx = a(1, -1) + 2 * a(1, 0) + a(1, 1) - a(-1, -1) - 2 * a(-1, 0) - a(-1, 1);
    const gy = a(-1, 1) + 2 * a(0, 1) + a(1, 1) - a(-1, -1) - 2 * a(0, -1) - a(1, -1);
    return Math.min(1, Math.hypot(gx, gy) * 0.9);
  };
  const out = ctx.createImageData(N, N);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      // tube around the shape, the symbol fully lit, the body a faint haze
      const v = inkOnly
        ? Math.max(sobel(alpha, x, y), alpha[i] * 0.1)
        : Math.max(sobel(alpha, x, y) * 0.95, ink[i], alpha[i] * 0.07);
      const o = i * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = 255;
      out.data[o + 3] = v * 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  // Bevel: light the shape like a raised surface (light from the top-left),
  // using the blurred shape as a height map.
  const h = new Float32Array(N2);
  for (let i = 0; i < N2; i++) h[i] = out.data[i * 4 + 3] / 255;
  for (let pass = 0; pass < 2; pass++) {
    const t = h.slice();
    for (let y = 1; y < N - 1; y++)
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        h[i] = (t[i] * 4 + t[i - 1] + t[i + 1] + t[i - N] + t[i + N]) / 8;
      }
  }
  const bevel = ctx.createImageData(N, N);
  const L = [-0.5, -0.6, 0.62];
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const nx = (h[i - 1] - h[i + 1]) * 3;
      const ny = (h[i - N] - h[i + N]) * 3;
      const lit = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / Math.hypot(nx, ny, 1));
      const spec = Math.pow(lit, 14) * (out.data[i * 4 + 3] / 255);
      bevel.data[i * 4] = bevel.data[i * 4 + 1] = bevel.data[i * 4 + 2] = 255;
      bevel.data[i * 4 + 3] = Math.min(255, spec * 320);
    }
  const bc = document.createElement("canvas");
  bc.width = bc.height = N;
  bc.getContext("2d").putImageData(bevel, 0, 0);
  return { mask: c, bevel: bc };
}

// Paints every neon icon: colour -> bevel -> light sweep -> deep glow.
// Redrawn when the accent changes; the sweep runs now and then.
const Neon = {
  items: [],
  S: 64, // css px of the canvas (icon + room for the glow)
  add(shape, i) {
    const cv = document.createElement("canvas");
    cv.className = "neon";
    const dpr = Math.max(2, devicePixelRatio);
    cv.width = cv.height = this.S * dpr;
    const item = { cv, shape, i, sweep: -1, dpr };
    this.items.push(item);
    this.draw(item);
    this.watch();
    return cv;
  },
  accent() {
    const probe = (this.probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true }));
    probe.fillStyle = "#7aa2ff";
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7aa2ff";
    probe.clearRect(0, 0, 1, 1);
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((v) => v / 255);
    // Neon has to glow: keep the hue, force it bright and saturated
    // (dark album art would otherwise give a black sign).
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    const sat = d < 0.06 ? 0.15 : 0.9;
    const light = 0.6;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  },
  draw(item) {
    const { cv, shape, dpr } = item;
    const W = cv.width;
    const icon = 40 * dpr;
    const off = (W - icon) / 2;
    const [r, g, b] = this.rgb ?? (this.rgb = this.accent());
    const col = (k, a = 1) => `rgb(${Math.min(255, r * k)} ${Math.min(255, g * k)} ${Math.min(255, b * k)} / ${a})`;
    // 1. colour
    const L = (item.layer ??= document.createElement("canvas"));
    L.width = L.height = W;
    const lx = L.getContext("2d");
    lx.imageSmoothingQuality = "high";
    lx.drawImage(shape.mask, off, off, icon, icon);
    lx.globalCompositeOperation = "source-in";
    const grad = lx.createLinearGradient(off, off, off + icon * 0.4, off + icon);
    grad.addColorStop(0, col(1.5));
    grad.addColorStop(0.55, col(1));
    grad.addColorStop(1, col(0.65));
    lx.fillStyle = grad;
    lx.fillRect(0, 0, W, W);
    // 2. bevel
    lx.globalCompositeOperation = "source-atop";
    lx.globalAlpha = 0.8;
    lx.drawImage(shape.bevel, off, off, icon, icon);
    lx.globalAlpha = 1;
    // 3. light sweep
    if (item.sweep >= 0) {
      const x = off - icon * 0.6 + item.sweep * icon * 2.2;
      const sg = lx.createLinearGradient(x - icon * 0.25, 0, x + icon * 0.25, icon * 0.35);
      sg.addColorStop(0, "rgb(255 255 255 / 0)");
      sg.addColorStop(0.5, "rgb(255 255 255 / 0.9)");
      sg.addColorStop(1, "rgb(255 255 255 / 0)");
      lx.fillStyle = sg;
      lx.fillRect(0, 0, W, W);
    }
    lx.globalCompositeOperation = "source-over";
    // 4. deep glow, a tighter hot glow, then the sign itself
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, W, W);
    // glow passes paint only the shadow: the sign is drawn off-canvas and
    // its shadow is shifted back into place
    const glow = (blur, color) => {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * dpr;
      ctx.shadowOffsetX = W * 2;
      ctx.drawImage(L, -W * 2, 0);
    };
    glow(24, col(1, 0.85));
    glow(24, col(1, 0.5));
    glow(9, col(1.2, 0.9));
    glow(3, col(1.5, 0.9));
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.drawImage(L, 0, 0);
  },
  redrawAll() {
    this.rgb = this.accent();
    for (const it of this.items) this.draw(it);
  },
  sweep(item, ms = 1100) {
    if (item.sweeping) return;
    item.sweeping = true;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      item.sweep = p < 1 ? 0.5 - 0.5 * Math.cos(p * Math.PI) : -1;
      this.draw(item);
      if (p < 1) requestAnimationFrame(step);
      else item.sweeping = false;
    };
    requestAnimationFrame(step);
  },
  watch() {
    if (this.watching) return;
    this.watching = true;
    // the accent follows the album art
    new MutationObserver(() => {
      if (this.accent().join() !== this.rgb?.join()) this.redrawAll();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    // a light sweep crosses the row every few seconds, one sign after another
    setInterval(() => {
      if (document.hidden) return;
      this.items.filter((it) => it.cv.isConnected).forEach((it, k) => setTimeout(() => this.sweep(it), k * 140));
    }, 7000);
    document.addEventListener("pointerover", (e) => {
      const cv = e.target.closest?.(".link")?.querySelector("canvas.neon");
      const it = cv && this.items.find((x) => x.cv === cv);
      if (it) this.sweep(it, 700);
    });
  },
};

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

const wIcon = (code, day = 1) => (day === 0 && code <= 1 ? "🌙" : day === 0 && code === 2 ? "☁️" : (WMO[code] ?? ["", "🌡️"])[1]);

async function loadWeather() {
  const box = $("#weather");
  if (!S.weather) return (box.hidden = true);
  const cacheKey = `nplus-weather2-${S.city}`;
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
            `&hourly=temperature_2m,weather_code,is_day&forecast_hours=12` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`,
        )
      ).json();
      data = { at: Date.now(), place: place.name, w };
      localStorage.setItem(cacheKey, JSON.stringify(data));
    }
    renderWeather(data);
    box.hidden = false;
  } catch {
    box.hidden = true;
  }
}

function renderWeather(data) {
  const c = data.w.current;
  const d = data.w.daily;
  const [desc] = WMO[c.weather_code] ?? [""];
  document.body.dataset.weather = weatherKind(c.weather_code);
  $("#w-city").textContent = data.place;
  const mins = Math.round((Date.now() - data.at) / 60000);
  $("#w-updated").textContent = mins < 1 ? "همین الان" : `${num(mins)} دقیقه پیش`;
  $("#w-icon").textContent = wIcon(c.weather_code, c.is_day);
  $("#w-temp").textContent = `${num(Math.round(c.temperature_2m))}°`;
  $("#w-desc").textContent = `${desc} · حس ${num(Math.round(c.apparent_temperature))}°`;

  // next hours, every 2 hours
  const h = data.w.hourly;
  const hours = [];
  for (let i = 1; i < h.time.length && hours.length < 5; i += 2) {
    const t = new Date(h.time[i]);
    hours.push(
      `<div class="w-hour"><span class="w-h-t">${num(t.getHours(), 2)}</span>` +
        `<span class="w-h-i">${wIcon(h.weather_code[i], h.is_day[i])}</span>` +
        `<span class="w-h-v">${num(Math.round(h.temperature_2m[i]))}°</span></div>`,
    );
  }
  $("#w-hours").innerHTML = hours.join("");

  const chip = (label, value) => `<span class="w-chip"><b>${label}</b>${value}</span>`;
  $("#w-chips").innerHTML = [
    chip("↑", `${num(Math.round(d.temperature_2m_max[0]))}°`),
    chip("↓", `${num(Math.round(d.temperature_2m_min[0]))}°`),
    chip("💧", `${num(c.relative_humidity_2m)}٪`),
    d.precipitation_probability_max?.[0] ? chip("☔", `${num(d.precipitation_probability_max[0])}٪`) : "",
  ].join("");
  // ?sky=rain / ?sky=snow forces an effect (for testing)
  sky.set(new URLSearchParams(location.search).get("sky") || weatherKind(c.weather_code));
}

// rain | snow | clear (drives the gentle weather effect)
function weatherKind(code) {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  return "clear";
}

// ---------------- gentle rain / snow ----------------
// Very few, very faint particles: atmosphere, not a screensaver.
const sky = {
  kind: "clear",
  set(kind) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) kind = "clear";
    if (kind === this.kind) return;
    this.kind = kind;
    cancelAnimationFrame(this.raf);
    const cv = $("#sky");
    const ctx = cv.getContext("2d");
    if (kind === "clear") return ctx.clearRect(0, 0, cv.width, cv.height);
    const resize = () => {
      cv.width = innerWidth * devicePixelRatio;
      cv.height = innerHeight * devicePixelRatio;
    };
    resize();
    addEventListener("resize", resize);
    const n = kind === "rain" ? 38 : 28;
    const P = Array.from({ length: n }, () => this.spawn(kind, true));
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(50, now - last) / 16.7;
      last = now;
      const W = cv.width;
      const H = cv.height;
      const dpr = devicePixelRatio;
      ctx.clearRect(0, 0, W, H);
      for (const p of P) {
        p.y += p.vy * dt * dpr;
        p.x += (p.vx + (kind === "snow" ? Math.sin((now / 1000) * p.f + p.ph) * 0.35 : 0)) * dt * dpr;
        if (p.y > H + 20 || p.x < -20 || p.x > W + 20) Object.assign(p, this.spawn(kind, false, W, H));
        if (kind === "rain") {
          ctx.strokeStyle = `rgba(200, 215, 235, ${p.a})`;
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.2 * dpr, p.y - p.len * dpr);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  },
  spawn(kind, anywhere, W = innerWidth * devicePixelRatio, H = innerHeight * devicePixelRatio) {
    const p = { x: Math.random() * W, y: anywhere ? Math.random() * H : -20, ph: Math.random() * 6.28, f: 0.4 + Math.random() * 0.6 };
    if (kind === "rain") Object.assign(p, { vx: -0.8, vy: 9 + Math.random() * 5, len: 12 + Math.random() * 12, a: 0.22 + Math.random() * 0.14 });
    else Object.assign(p, { vx: -0.15, vy: 0.5 + Math.random() * 0.7, r: 1.1 + Math.random() * 1.8, a: 0.45 + Math.random() * 0.3 });
    return p;
  },
};

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

// ---------------- this week's listening (Nebula Bridge) ----------------
async function loadWeek() {
  const box = $("#week");
  try {
    const s = await (await fetch(`${BRIDGE}/stats?days=7`, { cache: "no-store" })).json();
    if (!s.minutes || s.minutes < 1) return (box.hidden = true);
    const h = Math.floor(s.minutes / 60);
    const m = s.minutes % 60;
    $("#wk-total").textContent = h ? `${num(h)} ساعت و ${num(m)} دقیقه` : `${num(m)} دقیقه`;
    // one bar per day, oldest on the right (RTL)
    const max = Math.max(1, ...s.perDay);
    const dayName = new Intl.DateTimeFormat("fa-IR", { weekday: "narrow" });
    $("#wk-bars").innerHTML = s.perDay
      .map((v, i) => {
        const d = new Date(Date.now() - (s.perDay.length - 1 - i) * 86400000);
        return `<div class="wk-bar" title="${num(v)} دقیقه"><span style="--h:${Math.max(4, (v / max) * 100)}%"></span><i>${dayName.format(d)}</i></div>`;
      })
      .join("");
    $("#wk-artists").innerHTML = s.artists
      .map((a, i) => `<div class="wk-artist"><b>${num(i + 1)}</b><span dir="auto">${a.name}</span><em>${num(a.minutes)} دقیقه</em></div>`)
      .join("");
    const t = s.tracks[0];
    $("#wk-track").innerHTML = t ? `<span>آهنگ هفته</span><b dir="auto">${t.title}</b>` : "";
    box.hidden = false;
  } catch {
    box.hidden = true;
  }
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
loadWeek();
setInterval(() => player.tick(), 250);

// ---------------- lean: rest while nobody is looking ----------------
const setIdle = () => document.documentElement.toggleAttribute("idle", document.hidden || !document.hasFocus());
addEventListener("focus", setIdle);
addEventListener("blur", setIdle);
document.addEventListener("visibilitychange", setIdle);
setIdle();
