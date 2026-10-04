// Verifies every Nebula Plus pref in preferences.json has a JS default and is
// actually used somewhere in CSS or JS (no dead toggles).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const prefs = JSON.parse(readFileSync(join(root, "preferences.json"), "utf8"))
  .map((p) => p.property)
  .filter((p) => p && /^(var-)?nplus/.test(p));

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|js)$/.test(f)) files.push(p);
  }
};
walk(join(root, "nebula", "plus"));
walk(join(root, "js", "plus"));
const sources = files.map((f) => readFileSync(f, "utf8")).join("\n");
const core = readFileSync(join(root, "js", "plus", "plus-core.uc.js"), "utf8");
const dark = ["plus-darkmode", "plus-tabs", "plus-meet", "plus-media", "plus-smart"].map((f) => readFileSync(join(root, "js", "plus", `${f}.uc.js`), "utf8")).join("\n");

let bad = 0;
for (const p of prefs) {
  const hasDefault = core.includes(`"${p}":`) || dark.includes(`"${p}"`) || p === "nplus-dev-live";
  const uses = sources.split(`"${p}"`).length - 1;
  if (!hasDefault) (bad++, console.log(`✗ no default: ${p}`));
  const viaConst = dark.includes(`= "${p}"`);
  if (uses < (hasDefault && !viaConst ? 2 : 1)) (bad++, console.log(`✗ unused:     ${p}`));
}
console.log(bad ? `${bad} problem(s)` : `✓ ${prefs.length} prefs OK`);
process.exit(bad ? 1 : 0);
