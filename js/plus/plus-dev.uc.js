// ==UserScript==
// @name           plus-dev.uc.js
// @description    Nebula Plus live dev: hot-reloads CSS and Nebula Plus scripts on save
// @include        main
// ==/UserScript==

// Enabled by the pref "nplus-dev-live". Watches every stylesheet Sine loads
// (sine-mods/chrome.css and its @imports) plus js/plus/*.uc.js:
// - CSS change: re-bundles the stylesheet and swaps it in, no restart.
// - JS change: destroys Nebula Plus and re-runs its scripts.

(function () {
  "use strict";

  if (window.NebulaPlusDev) {
    try {
      window.NebulaPlusDev.stop();
    } catch {}
  }

  const PREF = "nplus-dev-live";
  const SINE_URI = "chrome://sine/content/chrome.css";
  const SINE_DIR = PathUtils.join(PathUtils.profileDir, "chrome", "sine-mods");
  const MOD_DIR = PathUtils.join(SINE_DIR, "Nebula");
  const PLUS_SCRIPTS = [
    "plus-core.uc.js",
    "plus-media.uc.js",
    "plus-lyrics.uc.js",
    "plus-darkmode.uc.js",
    "plus-ui.uc.js",
  ];

  const toPath = (url) => {
    if (url.startsWith("chrome://sine/content/")) {
      return PathUtils.join(SINE_DIR, ...decodeURIComponent(url.slice(22)).split("/"));
    }
    if (url.startsWith("file:")) {
      return Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file.path;
    }
    return null;
  };
  const toFileURL = (path) => PathUtils.toFileURI(path);

  // Inline @imports recursively and absolutize relative url()s, so the whole
  // tree can be loaded from a single data: URI without stale cached children.
  async function bundle(url, files, depth = 0) {
    const path = toPath(url);
    if (!path || depth > 12) return "";
    files.add(path);
    let css;
    try {
      css = await IOUtils.readUTF8(path);
    } catch {
      return `/* missing: ${url} */`;
    }
    const base = toFileURL(path);
    const resolve = (ref) => new URL(ref, base).href;

    css = css.replace(/url\(\s*(["']?)(?!data:|chrome:|resource:|moz-|https?:|file:|#)([^"')]+)\1\s*\)/g, (_, q, ref) => `url("${resolve(ref)}")`);

    const parts = [];
    let last = 0;
    // @import "x" | @import 'x' | @import url("x") | @import url(x) [media];
    // Quoted forms may contain parentheses (e.g. "Default (release)-1").
    const importRe = /@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^"'\s)]+))\s*\)?\s*([^;]*);/g;
    for (const m of css.matchAll(importRe)) {
      parts.push(css.slice(last, m.index));
      const ref = m[1] ?? m[2] ?? m[3];
      const child = await bundle(/^(file|chrome):/.test(ref) ? ref : resolve(ref), files, depth + 1);
      const condition = m[4].trim();
      parts.push(condition ? `@media ${condition} {
${child}
}` : child);
      last = m.index + m[0].length;
    }
    parts.push(css.slice(last));
    // @import must come first in a sheet; hoisted children are inlined as-is,
    // and leftover @charset/@namespace lines are harmless here.
    return parts.join("\n");
  }

  const Dev = (window.NebulaPlusDev = {
    sheet: null,
    stamps: new Map(),
    cssFiles: new Set(),

    async start() {
      await this.reloadCSS(false);
      await this.snapshot();
      this.timer = setInterval(() => this.check(), 600);
      console.log("[Nebula+] 🔥 Live dev mode on");
    },

    stop() {
      clearInterval(this.timer);
      this.timer = null;
      if (this.sheet) {
        try {
          windowUtils.removeSheet(this.sheet, windowUtils.USER_SHEET);
        } catch {}
        this.sheet = null;
        // Hand the stylesheet back to Sine.
        try {
          windowUtils.loadSheet(Services.io.newURI(SINE_URI), windowUtils.USER_SHEET);
        } catch {}
      }
      delete window.NebulaPlusDev;
    },

    // every plus-*.uc.js (the extra modules too, not just the ones Sine loads)
    async jsFiles() {
      try {
        return (await IOUtils.getChildren(PathUtils.join(MOD_DIR, "js", "plus"))).filter((p) => /plus-[\w-]+\.uc\.js$/.test(p));
      } catch {
        return PLUS_SCRIPTS.map((f) => PathUtils.join(MOD_DIR, "js", "plus", f));
      }
    },

    async snapshot() {
      for (const path of [...this.cssFiles, ...(await this.jsFiles())]) {
        try {
          this.stamps.set(path, (await IOUtils.stat(path)).lastModified);
        } catch {}
      }
    },

    async check() {
      if (this.busy) return;
      this.busy = true;
      try {
        let css = false;
        let js = false;
        for (const path of [...this.cssFiles, ...(await this.jsFiles())]) {
          let stamp;
          try {
            stamp = (await IOUtils.stat(path)).lastModified;
          } catch {
            continue;
          }
          if (this.stamps.get(path) !== stamp) {
            this.stamps.set(path, stamp);
            if (path.endsWith(".js")) js = true;
            else css = true;
          }
        }
        if (css) await this.reloadCSS(true);
        if (js) this.reloadJS();
        if (css || js) await this.snapshot();
      } finally {
        this.busy = false;
      }
    },

    async reloadCSS(announce) {
      const files = new Set();
      const css = await bundle(SINE_URI, files);
      this.cssFiles = files;
      const uri = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(css));
      windowUtils.loadSheet(uri, windowUtils.USER_SHEET);
      if (this.sheet) {
        windowUtils.removeSheet(this.sheet, windowUtils.USER_SHEET);
      } else {
        try {
          windowUtils.removeSheet(Services.io.newURI(SINE_URI), windowUtils.USER_SHEET);
        } catch {}
      }
      this.sheet = uri;
      if (announce) this.toast("CSS reloaded");
    },

    reloadJS() {
      try {
        window.NebulaPlus?.destroy();
      } catch (err) {
        console.error("[Nebula+] destroy failed", err);
      }
      const t = Date.now();
      for (const file of PLUS_SCRIPTS) {
        try {
          Services.scriptloader.loadSubScript(`chrome://sine/content/Nebula/js/plus/${file}?t=${t}`, window);
        } catch (err) {
          console.error(`[Nebula+] ${file} failed to load`, err);
        }
      }
      setTimeout(() => this.toast("Scripts reloaded"), 300);
    },

    toast(text) {
      window.NebulaPlus?.island?.show({ title: "🔥 Live", subtitle: text, duration: 1400 });
    },
  });

  const apply = () => {
    // On by default for this dev install; turn off in Sine settings.
    const on = Services.prefs.getBoolPref(PREF, true);
    if (on && !Dev.timer) Dev.start();
    else if (!on && Dev.timer) Dev.stop();
  };
  Services.prefs.addObserver(PREF, apply);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, apply), { once: true });
  apply();
})();
