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
      // With real sunrise/sunset (from the weather feature) the colors follow
      // the sun in your city; otherwise fixed hours.
      const update = () => {
        const now = new Date();
        let part;
        const sun = NP.sunTimes;
        if (sun) {
          // shift today's times onto today's date (cached values may be from yesterday)
          const at = (d) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), d.getHours(), d.getMinutes());
          const rise = at(sun.sunrise).getTime();
          const set = at(sun.sunset).getTime();
          const t = now.getTime();
          const min = 60_000;
          if (t >= rise - 45 * min && t < rise + 75 * min) part = "dawn";
          else if (t >= rise + 75 * min && t < set - 90 * min) part = "day";
          else if (t >= set - 90 * min && t < set + 35 * min) part = "sunset";
          else part = "night";
        } else {
          const h = now.getHours();
          part = h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "sunset" : "night";
        }
        NP.setRootAttr("nplus-daypart", part);
      };
      update();
      this.offSun = NP.on("sun", update);
      this.timer = setInterval(update, 60 * 1000);
    },
    destroy() {
      clearInterval(this.timer);
      this.offSun?.();
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
      // The first tab of a fresh window is opened before this script runs, so
      // it gets Firefox's page. Swap it (and the home page) for ours.
      this.swapInitial();
      const until = Date.now() + 15000;
      this.onLoc = {
        onLocationChange: (browser, progress, req, uri) => {
          if (Date.now() > until) return gBrowser.removeTabsProgressListener(this.onLoc);
          if (progress.isTopLevel) this.swapInitial(browser, uri);
        },
      };
      gBrowser.addTabsProgressListener(this.onLoc);
    },
    swapInitial(only, uri) {
      if (!NP.prefs.get("nplus-newtab")) return;
      const stock = /^about:(newtab|home|welcome)\b/;
      for (const b of only ? [only] : gBrowser.browsers) {
        if (!stock.test((uri ?? b.currentURI).spec)) continue;
        b.loadURI(Services.io.newURI(this.url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        if (b === gBrowser.selectedBrowser) setTimeout(() => (gURLBar.value = "", gURLBar.focus()), 300);
      }
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
      try {
        gBrowser.removeTabsProgressListener(this.onLoc);
      } catch {}
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
          // live progress while it downloads (throttled)
          if (!dl.succeeded && !dl.error && !dl.canceled && dl.hasProgress && NP.prefs.get("nplus-download-island")) {
            const now = Date.now();
            if (now - (this.lastProgress ?? 0) > 400) {
              this.lastProgress = now;
              const name = PathUtils.filename(dl.target.path);
              // all-Persian text keeps the right-to-left order clean
              const fa = (n, d = 1) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: d }).format(n);
              const mb = (b) => fa(b / 1048576, b > 104857600 ? 0 : 1);
              const speed = dl.speed ? ` · ${mb(dl.speed)} مگ/ثانیه` : "";
              NP.island?.show({
                id: "download",
                title: name,
                subtitle: `${fa(dl.progress, 0)}٪ · ${mb(dl.currentBytes)} از ${mb(dl.totalBytes)} مگابایت${speed}`,
                icon: `moz-icon://${encodeURIComponent(name)}?size=32`,
                progress: dl.progress / 100,
                duration: 4000,
              });
            }
          }
          if (!dl.succeeded || this.seen.has(dl)) return;
          this.seen.add(dl);
          this.finished(dl);
        },
      };
      this.Downloads = Downloads;
      this.list = await Downloads.getList(Downloads.ALL);
      await this.list.addView(this.view);
    },

    // Sort finished files into folders by kind (only ones that landed in the
    // default Downloads folder; a place you picked yourself is left alone).
    async finished(dl) {
      let path = dl.target.path;
      let folder = "";
      if (NP.prefs.get("nplus-download-sort")) {
        try {
          const base = await this.Downloads.getPreferredDownloadsDirectory();
          const ext = (path.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
          const KINDS = [
            ["تصویر", /^(jpe?g|png|gif|webp|avif|heic|bmp|svg|ico|tiff?)$/],
            ["ویدیو", /^(mp4|mkv|webm|mov|avi|m4v|flv|wmv)$/],
            ["موسیقی", /^(mp3|m4a|flac|wav|ogg|opus|aac|wma)$/],
            ["سند", /^(pdf|docx?|xlsx?|pptx?|txt|md|csv|epub|odt|rtf)$/],
            ["فشرده", /^(zip|rar|7z|tar|gz|bz2|xz)$/],
            ["برنامه", /^(exe|msi|apk|appx|msix|bat|dmg|iso)$/],
          ];
          folder = KINDS.find(([, re]) => re.test(ext))?.[0] ?? "";
          if (folder && PathUtils.parent(path) === base && !/\.part$/i.test(path)) {
            const dir = PathUtils.join(base, folder);
            await IOUtils.makeDirectory(dir, { ignoreExisting: true });
            let target = PathUtils.join(dir, PathUtils.filename(path));
            for (let n = 2; await IOUtils.exists(target); n++) target = PathUtils.join(dir, PathUtils.filename(path).replace(/(\.[^.]*)?$/, ` (${n})$1`));
            await IOUtils.move(path, target);
            path = target;
          } else folder = "";
        } catch (err) {
          NP.logger?.warn(`download sort: ${err}`);
          folder = "";
        }
      }
      if (!NP.prefs.get("nplus-download-island")) return;
      const name = PathUtils.filename(path);
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      NP.island?.show({
        id: "download-done",
        title: name,
        subtitle: folder ? `دانلود تموم شد · رفت توی پوشه‌ی «${folder}»` : "دانلود تموم شد · کلیک کن تا باز بشه",
        icon: `moz-icon://${encodeURIComponent(name)}?size=32`,
        onClick: () => {
          try {
            folder ? file.reveal() : file.launch();
          } catch {
            dl.launch().catch(() => {});
          }
        },
        duration: 6000,
      });
    },
    destroy() {
      this.list?.removeView(this.view);
    },
  });
})();
