// Nebula Plus — 3D weather illustrations.
// Hand-made SVG in a soft clay/glass style: spheres with light and shade,
// puffy clouds with a lit top and a darker belly, glossy drops, icy flakes.
// Each part is its own layer so it can move on the GPU (transform/opacity
// only): the sun breathes, clouds drift, rain falls, lightning flickers.
// weatherArt(kind, isDay, { still }) -> element; kinds: clear, partly,
// cloudy, fog, drizzle, rain, heavy, snow, storm.

let uid = 0;

const SUN = (u) => `<svg viewBox="0 0 100 100"><defs>
  <radialGradient id="sg${u}" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#fff8d6"/><stop offset=".3" stop-color="#ffd84a"/><stop offset=".72" stop-color="#ff9b1f"/><stop offset="1" stop-color="#ec5f12"/></radialGradient>
  <radialGradient id="sh${u}"><stop offset=".42" stop-color="#ffb42e" stop-opacity=".55"/><stop offset="1" stop-color="#ffb42e" stop-opacity="0"/></radialGradient></defs>
  <circle cx="50" cy="50" r="48" fill="url(#sh${u})"/>
  <circle cx="50" cy="50" r="26" fill="url(#sg${u})"/>
  <ellipse cx="41" cy="38" rx="9" ry="4.6" fill="#fff" opacity=".6" transform="rotate(-32 41 38)"/></svg>`;

const MOON = (u) => `<svg viewBox="0 0 100 100"><defs>
  <radialGradient id="mg${u}" cx="34%" cy="30%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e6e1ff"/><stop offset="1" stop-color="#9d92e8"/></radialGradient>
  <radialGradient id="mh${u}"><stop offset=".4" stop-color="#b9b0ff" stop-opacity=".45"/><stop offset="1" stop-color="#b9b0ff" stop-opacity="0"/></radialGradient>
  <mask id="mm${u}"><rect width="100" height="100" fill="#fff"/><circle cx="63" cy="40" r="22" fill="#000"/></mask></defs>
  <circle cx="50" cy="50" r="46" fill="url(#mh${u})"/>
  <circle cx="48" cy="52" r="25" fill="url(#mg${u})" mask="url(#mm${u})"/>
  <circle cx="38" cy="58" r="3" fill="#8e83d6" opacity=".35"/><circle cx="44" cy="68" r="2" fill="#8e83d6" opacity=".3"/></svg>`;

const STARS = () => `<svg viewBox="0 0 100 100" fill="#fff">
  <path d="M78 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity=".9"/><path d="M86 48l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" opacity=".7"/><path d="M20 20l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" opacity=".6"/></svg>`;

// a puffy cloud: lit top, darker belly, a rim of light
const CLOUD = (u, dark = false, sx = 1) => {
  const [a, b, c] = dark ? ["#c3cbe0", "#7b88a8", "#4f5a78"] : ["#ffffff", "#e3eaf8", "#aebddc"];
  return `<svg viewBox="0 0 100 100"><defs>
  <linearGradient id="cg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
  <radialGradient id="cs${u}" cx="50%" cy="100%" r="60%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
  <g transform="translate(${50 - 50 * sx} 0) scale(${sx} 1)">
  <ellipse cx="52" cy="80" rx="34" ry="6" fill="url(#cs${u})"/>
  <path d="M27 76h48a17 17 0 0 0 1.5-33.9A22 22 0 0 0 35 37.5a16.5 16.5 0 0 0-8 38.5z" fill="url(#cg${u})"/>
  <path d="M36 44a17 17 0 0 1 24-6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity="${dark ? 0.35 : 0.9}"/>
  <ellipse cx="44" cy="47" rx="7" ry="3.4" fill="#fff" opacity="${dark ? 0.18 : 0.55}" transform="rotate(-20 44 47)"/></g></svg>`;
};

const DROP = (u) => `<svg viewBox="0 0 20 30"><defs><linearGradient id="dg${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7ecff"/><stop offset=".5" stop-color="#5cb4ff"/><stop offset="1" stop-color="#2a6fe8"/></linearGradient></defs>
  <path d="M10 2C10 2 3 13 3 18.5a7 7 0 0 0 14 0C17 13 10 2 10 2z" fill="url(#dg${u})"/><ellipse cx="7.5" cy="17" rx="1.6" ry="3" fill="#fff" opacity=".7"/></svg>`;

const FLAKE = (u) => `<svg viewBox="0 0 20 20"><defs><radialGradient id="fg${u}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#f4f9ff"/><stop offset="1" stop-color="#cfe2f8"/></radialGradient></defs>
  <circle cx="10" cy="10" r="8.5" fill="#fff" opacity=".25"/><circle cx="10" cy="10" r="7" fill="url(#fg${u})"/><circle cx="7.5" cy="7.3" r="2" fill="#fff"/></svg>`;

const BOLT = (u) => `<svg viewBox="0 0 40 60"><defs><linearGradient id="bg${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbd1"/><stop offset=".5" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff9a1a"/></linearGradient></defs>
  <path d="M24 2L8 33h11l-5 25 19-34H22z" fill="url(#bg${u})" stroke="#fff6b3" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const FOG = (u) => `<svg viewBox="0 0 100 100"><defs><linearGradient id="og${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#eef2fb"/><stop offset=".7" stop-color="#dfe6f4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect x="10" y="58" width="80" height="8" rx="4" fill="url(#og${u})"/><rect x="18" y="72" width="70" height="8" rx="4" fill="url(#og${u})" opacity=".8"/><rect x="6" y="86" width="66" height="7" rx="3.5" fill="url(#og${u})" opacity=".6"/></svg>`;

function layer(cls, svg) {
  const el = document.createElement("div");
  el.className = `wa-l ${cls}`;
  el.innerHTML = svg;
  return el;
}

function weatherKindOf(code) {
  if ([0, 1].includes(code)) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 80, 81].includes(code)) return "rain";
  if ([65, 66, 67, 82].includes(code)) return "heavy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "cloudy";
}

function weatherArt(kind, isDay = true, { still = false } = {}) {
  const u = ++uid;
  const box = document.createElement("div");
  // the kind goes in its own namespace (wa-fog is also a layer's class)
  box.className = `wa wa-k-${kind}${isDay ? "" : " wa-night"}${still ? " wa-still" : ""}`;
  const orb = () => (isDay ? layer("wa-sun", SUN(u)) : [layer("wa-moon", MOON(u)), layer("wa-stars", STARS())]);
  const add = (x) => [].concat(x).forEach((e) => box.append(e));
  switch (kind) {
    case "clear":
      add(orb());
      break;
    case "partly":
      add(orb());
      box.querySelector(".wa-sun, .wa-moon")?.classList.add("wa-behind");
      add(layer("wa-cloud wa-front", CLOUD(`${u}a`)));
      break;
    case "cloudy":
      add(layer("wa-cloud wa-back", CLOUD(`${u}b`, false, 0.85)));
      add(layer("wa-cloud wa-front", CLOUD(`${u}a`)));
      break;
    case "fog":
      add(layer("wa-cloud wa-back", CLOUD(`${u}a`, false, 0.9)));
      add(layer("wa-fog", FOG(u)));
      break;
    case "storm":
      add(layer("wa-cloud wa-back", CLOUD(`${u}b`, true, 0.85)));
      add(layer("wa-bolt", BOLT(u)));
      add(layer("wa-cloud wa-front", CLOUD(`${u}a`, true)));
      break;
    case "snow":
      add(layer("wa-cloud wa-front wa-high", CLOUD(`${u}a`)));
      for (let i = 0; i < 3; i++) add(layer(`wa-flake wa-p${i}`, FLAKE(`${u}f${i}`)));
      break;
    default: {
      // drizzle / rain / heavy
      const dark = kind === "heavy";
      if (kind === "drizzle" && isDay) add(layer("wa-sun wa-behind", SUN(u)));
      add(layer("wa-cloud wa-front wa-high", CLOUD(`${u}a`, dark)));
      const n = kind === "drizzle" ? 2 : 3;
      for (let i = 0; i < n; i++) add(layer(`wa-drop wa-p${i}`, DROP(`${u}d${i}`)));
    }
  }
  return box;
}
