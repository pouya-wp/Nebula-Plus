// ==UserScript==
// @name           plus-darkmode.uc.js
// @description    Nebula Plus force-dark: one-click dark mode for every website
// @include        main
// ==/UserScript==

// How it works
// - One user stylesheet (nsIStyleSheetService) inverts every http(s) page
//   and re-inverts media, so photos and videos keep their real colors.
// - Sites with a native dark theme are asked for it first
//   (prefers-color-scheme: dark).
// - Smart skip: after a page loads, we snapshot it. If the *inverted* page
//   is bright, the site was already dark, so it is added to the skip list
//   and shown untouched.
// - Left click the moon: toggle. Right click: always skip / un-skip this site.

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  const PREF_ON = "nplus-darkmode";
  const PREF_SKIP = "nplus-darkmode-skip"; // comma-separated domains
  const PREF_AUTO = "nplus-darkmode-auto-skip"; // domains auto-detected as dark
  const PREF_SMART = "nplus-darkmode-smart";
  const SCHEME_PREF = "layout.css.prefers-color-scheme.content-override";

  NP.DEFAULTS[PREF_ON] = false;
  NP.DEFAULTS[PREF_SKIP] = "";
  NP.DEFAULTS[PREF_AUTO] = "";
  NP.DEFAULTS[PREF_SMART] = true;

  const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);

  const list = (pref) =>
    NP.prefs
      .get(pref)
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function buildSheet(skip) {
    // @-moz-document regexp() must match the whole URL.
    const domains = skip.map(escapeRe).join("|");
    const urlRe = domains
      ? `https?://(?!(?:[^/:]*\\.)?(?:${domains})(?:[:/]|$)).*`
      : "https?://.*";
    const media =
      "img:not(picture img), picture, video, canvas, embed, object, svg image, " +
      "[style*='background-image'], [style*='background: url'], [style*='background:url']";
    return `@-moz-document regexp("${urlRe.replace(/\\/g, "\\\\")}") {
  :root {
    filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.94) !important;
    background-color: white !important;
  }
  :is(${media}) {
    filter: invert(1) hue-rotate(180deg) !important;
  }
  :is(${media}) :is(${media}) { filter: none !important; }
  :fullscreen, :fullscreen * { filter: none !important; }
}`;
  }

  // nsIStyleSheetService is process-wide (all windows share it), so the sheet
  // URL is derived from the state alone: every window agrees on it.
  function syncSheet() {
    const on = NP.prefs.get(PREF_ON);
    const skip = [...new Set([...list(PREF_SKIP), ...list(PREF_AUTO)])];
    const wanted = on ? Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(buildSheet(skip))) : null;

    const current = DarkMode.registered;
    if (current && (!wanted || current.spec !== wanted.spec)) {
      if (sss.sheetRegistered(current, sss.USER_SHEET)) sss.unregisterSheet(current, sss.USER_SHEET);
      DarkMode.registered = null;
    }
    if (wanted && !sss.sheetRegistered(wanted, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(wanted, sss.USER_SHEET);
    }
    DarkMode.registered = wanted;

    // 0 = dark, 1 = light, 2 = follow browser. Only touch it while we're on.
    if (on) Services.prefs.setIntPref(SCHEME_PREF, 0);
    else if (Services.prefs.prefHasUserValue(SCHEME_PREF)) Services.prefs.clearUserPref(SCHEME_PREF);
  }

  function siteOf(browser) {
    try {
      const uri = browser.currentURI;
      if (!/^https?$/.test(uri.scheme)) return null;
      return uri.host.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  }

  function toggleIn(pref, domain) {
    const items = list(pref);
    const next = items.includes(domain) ? items.filter((d) => d !== domain) : [...items, domain];
    NP.prefs.set(pref, next.join(","));
    return next.includes(domain);
  }

  const DarkMode = {
    name: "DarkMode",
    registered: null,

    init() {
      this.button = this.createButton();
      this.offs = [
        NP.prefs.watch(PREF_ON, (on) => {
          syncSheet();
          this.updateButton();
          NP.setRootAttr("nplus-darkmode", on);
        }),
        NP.prefs.watch(PREF_SKIP, () => (syncSheet(), this.updateButton())),
        NP.prefs.watch(PREF_AUTO, () => (syncSheet(), this.updateButton())),
      ];
      this.offKey = NP.hotkey?.("ctrl+alt+d", () => this.toggle());

      this.progress = {
        onStateChange: (browser, webProgress, request, flags) => {
          const STOP = Ci.nsIWebProgressListener.STATE_STOP;
          const WINDOW = Ci.nsIWebProgressListener.STATE_IS_WINDOW;
          if (webProgress.isTopLevel && flags & STOP && flags & WINDOW) {
            setTimeout(() => this.detect(browser), 600);
          }
        },
        onLocationChange: (browser) => {
          if (browser === gBrowser.selectedBrowser) this.updateButton();
        },
      };
      gBrowser.addTabsProgressListener(this.progress);
      this.onSelect = () => this.updateButton();
      window.addEventListener("TabSelect", this.onSelect);
    },

    createButton() {
      const box = document.getElementById("page-action-buttons");
      if (!box) return null;
      const btn = document.createXULElement("hbox");
      btn.id = "nplus-darkmode-button";
      btn.className = "urlbar-page-action";
      btn.setAttribute("role", "button");
      btn.append(NP.html("div", { class: "nplus-dm-orb" }, [NP.html("div", { class: "nplus-dm-shadow" })]));
      btn.addEventListener("click", (e) => {
        if (e.button === 0) this.toggle();
      });
      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleSite();
      });
      box.prepend(btn);
      return btn;
    },

    toggle() {
      const on = !NP.prefs.get(PREF_ON);
      // Animate the orb before the pages flip.
      this.button?.setAttribute("switching", "true");
      setTimeout(() => this.button?.removeAttribute("switching"), 600);
      NP.prefs.set(PREF_ON, on);
    },

    toggleSite() {
      const site = siteOf(gBrowser.selectedBrowser);
      if (!site) return;
      // A site the detector skipped can be forced back on, and vice versa.
      if (list(PREF_AUTO).includes(site)) {
        toggleIn(PREF_AUTO, site);
        NP.island?.show({ title: site, subtitle: "Dark mode forced on this site", duration: 2200 });
        return;
      }
      const skipped = toggleIn(PREF_SKIP, site);
      NP.island?.show({
        title: site,
        subtitle: skipped ? "Dark mode skipped on this site" : "Dark mode enabled on this site",
        duration: 2200,
      });
    },

    updateButton() {
      if (!this.button) return;
      const on = NP.prefs.get(PREF_ON);
      const site = siteOf(gBrowser.selectedBrowser);
      const skipped = !!site && (list(PREF_SKIP).includes(site) || list(PREF_AUTO).includes(site));
      this.button.setAttribute("state", !on ? "off" : skipped ? "skipped" : "on");
      this.button.setAttribute(
        "tooltiptext",
        !on
          ? "Dark mode: off  (Ctrl+Alt+D)"
          : skipped
            ? `Dark mode: on · ${site} is left as-is (right-click to force)`
            : "Dark mode: on  (right-click to skip this site)",
      );
    },

    // Smart skip: a forced-dark page that renders bright was dark to begin with.
    async detect(browser) {
      if (!NP.prefs.get(PREF_ON) || !NP.prefs.get(PREF_SMART)) return;
      const site = siteOf(browser);
      if (!site || list(PREF_SKIP).includes(site) || list(PREF_AUTO).includes(site)) return;
      const wg = browser.browsingContext?.currentWindowGlobal;
      if (!wg) return;
      try {
        const bitmap = await wg.drawSnapshot(null, 0.05, "white");
        const canvas = document.createElementNS(NP.HTML_NS, "canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const luminance = sum / (data.length / 4) / 255;
        if (luminance > 0.62 && siteOf(browser) === site) {
          toggleIn(PREF_AUTO, site);
          NP.logger.log(`🌙 ${site} is already dark, skipping it`);
        }
      } catch (err) {
        NP.logger.warn(`Dark mode detection failed for ${site}: ${err}`);
      }
    },

    destroy() {
      this.offs?.forEach((off) => off());
      this.offKey?.();
      gBrowser.removeTabsProgressListener(this.progress);
      window.removeEventListener("TabSelect", this.onSelect);
      this.button?.remove();
      // Leave the sheet registered: other windows may still use it.
    },
  };

  NP.feature(DarkMode);
})();
