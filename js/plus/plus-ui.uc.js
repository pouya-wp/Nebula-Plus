// ==UserScript==
// @name           plus-ui.uc.js
// @description    Nebula Plus UI: time-of-day tint, page halo, sidebar clock, download island
// @include        main
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  // ================= Time-of-day tint =================
  // :root[nplus-daypart] = dawn | day | sunset | night, read by CSS overlays.
  NP.feature({
    name: "TimeTint",
    init() {
      const update = () => {
        const h = new Date().getHours();
        const part =
          h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "sunset" : "night";
        NP.setRootAttr("nplus-daypart", part);
      };
      update();
      this.timer = setInterval(update, 5 * 60 * 1000);
    },
    destroy() {
      clearInterval(this.timer);
      NP.root.removeAttribute("nplus-daypart");
    },
  });

  // ================= Page halo =================
  // The favicon's color glows softly around the web view.
  NP.feature({
    name: "PageHalo",
    init() {
      this.update = this.update.bind(this);
      this.onAttr = (e) => {
        if (e.target === gBrowser.selectedTab && e.detail.changed.includes("image")) this.update();
      };
      window.addEventListener("TabSelect", this.update);
      window.addEventListener("TabAttrModified", this.onAttr);
      NP.prefs.watch("nplus-page-halo", () => this.update());
    },
    async update() {
      if (!NP.prefs.get("nplus-page-halo")) return;
      const icon = gBrowser.selectedTab?.image;
      if (icon === this.icon) return;
      this.icon = icon;
      let color = null;
      try {
        color = icon ? await NP.color.fromImage(icon) : null;
      } catch {}
      if (icon !== this.icon) return;
      if (color) NP.root.style.setProperty("--nplus-page-color", `rgb(${color.join(" ")})`);
      else NP.root.style.removeProperty("--nplus-page-color");
    },
    destroy() {
      window.removeEventListener("TabSelect", this.update);
      window.removeEventListener("TabAttrModified", this.onAttr);
      NP.root.style.removeProperty("--nplus-page-color");
    },
  });

  // ================= Sidebar clock =================
  NP.feature({
    name: "SidebarClock",
    init() {
      this.el = NP.html("div", { id: "nplus-clock", hidden: "true" }, [
        NP.html("div", { class: "nplus-clock-time" }),
        NP.html("div", { class: "nplus-clock-date", dir: "rtl" }),
      ]);
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      if (!foot) return;
      foot.before(this.el);

      this.timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
      this.jalaliFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      this.gregFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

      NP.prefs.watch("nplus-clock", (on) => {
        this.el.hidden = !on;
        clearInterval(this.timer);
        if (on) {
          this.tick();
          this.timer = setInterval(() => this.tick(), 10_000);
        }
      });
      NP.prefs.watch("nplus-clock-jalali", (on) => {
        this.el.querySelector(".nplus-clock-date").hidden = !on;
      });
    },
    tick() {
      const now = new Date();
      this.el.querySelector(".nplus-clock-time").textContent = this.timeFmt.format(now);
      this.el.querySelector(".nplus-clock-date").textContent = this.jalaliFmt.format(now);
      this.el.title = this.gregFmt.format(now);
    },
    destroy() {
      clearInterval(this.timer);
      this.el?.remove();
    },
  });

  // ================= Persian new tab =================
  // Points new tabs at newtab/index.html in this mod (a local page, so it
  // needs no add-on signing) and keeps the URL bar empty on it.
  NP.feature({
    name: "NewTab",
    init() {
      const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
      this.AboutNewTab = AboutNewTab;
      const path = PathUtils.join(PathUtils.profileDir, "chrome", "sine-mods", "Nebula", "newtab", "index.html");
      this.url = PathUtils.toFileURI(path);
      NP.prefs.watch("nplus-newtab", (on) => this.apply(on));
      // Add-ons (e.g. Bonjourr) may claim the new tab after startup; take it back.
      this.timer = setInterval(() => this.apply(NP.prefs.get("nplus-newtab")), 5000);
    },
    apply(on) {
      const { AboutNewTab } = this;
      if (on) {
        if (AboutNewTab.newTabURL !== this.url) {
          if (!this.previous) this.previous = AboutNewTab.newTabURLOverridden ? AboutNewTab.newTabURL : null;
          AboutNewTab.newTabURL = this.url;
        }
        if (window.gInitialPages && !gInitialPages.includes(this.url)) gInitialPages.push(this.url);
      } else if (AboutNewTab.newTabURL === this.url) {
        if (this.previous) AboutNewTab.newTabURL = this.previous;
        else AboutNewTab.resetNewTabURL();
      }
    },
    destroy() {
      clearInterval(this.timer);
    },
  });

  // ================= Download island =================
  NP.feature({
    name: "DownloadIsland",
    async init() {
      const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
      this.seen = new WeakSet();
      this.view = {
        onDownloadAdded: (dl) => {
          // Downloads that were already finished before startup are not news.
          if (dl.succeeded) this.seen.add(dl);
        },
        onDownloadChanged: (dl) => {
          if (!dl.succeeded || this.seen.has(dl)) return;
          this.seen.add(dl);
          if (!NP.prefs.get("nplus-download-island")) return;
          const name = PathUtils.filename(dl.target.path);
          NP.island?.show({
            title: name,
            subtitle: "Download complete · click to open",
            icon: `moz-icon://${encodeURIComponent(name)}?size=32`,
            onClick: () => dl.launch().catch(() => {}),
            duration: 5000,
          });
        },
      };
      this.list = await Downloads.getList(Downloads.ALL);
      await this.list.addView(this.view);
    },
    destroy() {
      this.list?.removeView(this.view);
    },
  });
})();
