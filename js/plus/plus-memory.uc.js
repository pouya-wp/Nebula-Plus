// Nebula Plus — memory diet.
// • The engine's own memory knobs, set tighter (only while "nplus-lean-memory"
//   is on; turning it off gives them back to Firefox's defaults).
// • When you step away (3 minutes idle) every process is asked to give back
//   what it can — the same as about:memory → "Minimize memory usage".
// • The hidden Gemini tab the assistant talks to is closed after 4 minutes
//   unused (it's a whole web app); it comes back by itself when needed.
// • Optional, off by default: "fewer processes" (nplus-fewer-processes)
//   turns off per-site process isolation — the biggest saving of all, at the
//   cost of the extra security that isolation gives. Needs a restart.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-fewer-processes"] = false;

  // [pref, type, value]
  const DIET = [
    ["browser.sessionhistory.max_total_viewers", "int", 0], // Back reloads instead of keeping whole pages in memory
    ["browser.cache.memory.capacity", "int", 32768], // 32 MB in-memory cache (disk cache stays)
    ["image.mem.surfacecache.max_size_kb", "int", 131072], // decoded images: 128 MB cap
    ["image.mem.surfacecache.min_expiration_ms", "int", 30000], // drop unused decoded images sooner
    ["media.memory_cache_max_size", "int", 32768], // media buffers in RAM: 32 MB
    ["dom.ipc.processPrelaunch.enabled", "bool", false], // no idle spare process
    ["browser.tabs.unloadOnLowMemory", "bool", true],
    ["browser.low_commit_space_threshold_percent", "int", 25], // start unloading tabs earlier on this 8 GB machine
    ["javascript.options.mem.gc_incremental_slice_ms", "int", 5], // smaller GC slices: no stutter
    ["browser.sessionstore.interval", "int", 60000], // session saved every minute, not every 15 s
  ];
  const FEWER = [
    ["fission.autostart", "bool", false],
    ["dom.ipc.processCount", "int", 3],
  ];

  const set = ([name, type, value]) => (type === "int" ? Services.prefs.setIntPref(name, value) : Services.prefs.setBoolPref(name, value));
  const clear = ([name]) => Services.prefs.clearUserPref(name);

  NP.feature({
    name: "MemoryDiet",
    init() {
      this.off = [
        NP.prefs.watch("nplus-lean-memory", (on) => DIET.forEach(on ? set : clear)),
        NP.prefs.watch("nplus-fewer-processes", (on) => {
          const was = Services.prefs.getBoolPref("fission.autostart", true) === false;
          FEWER.forEach(on ? set : clear);
          if (!!on !== was && this.ready) NP.island?.show({ title: on ? "پردازش‌های کمتر روشن شد" : "پردازش‌های کمتر خاموش شد", subtitle: "بعد از ری‌استارت Zen اعمال می‌شه", duration: 5000 });
        }),
      ];
      this.ready = true;

      // stepping away: give memory back once per idle stretch
      this.idle = Cc["@mozilla.org/widget/useridleservice;1"].getService(Ci.nsIUserIdleService);
      this.idleObs = {
        observe: (s, topic) => {
          if (topic !== "idle" || Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
          if (Date.now() - (this.lastMin ?? 0) < 10 * 60000) return;
          this.lastMin = Date.now();
          this.minimize();
        },
      };
      this.idle.addIdleObserver(this.idleObs, 180);

      // the assistant's hidden Gemini tab: close it when it isn't being used
      this.reaper = setInterval(() => this.reap(), 60000);
      NP.memory = { minimize: () => this.minimize() };
    },

    minimize() {
      try {
        Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager).minimizeMemoryUsage(() => {});
      } catch {
        Services.obs.notifyObservers(null, "memory-pressure", "heap-minimize");
      }
    },

    reap() {
      const a = NP._features.find((f) => f.name === "Assistant");
      const tab = a?.gTab;
      if (!tab?.isConnected || tab.closing || a.busy || a.panel?.hasAttribute("open")) {
        this.gUsed = Date.now();
        return;
      }
      this.gUsed ??= Date.now();
      if (Date.now() - this.gUsed < 4 * 60000) return;
      a.gTab = null;
      gBrowser.removeTab(tab, { animate: false });
      this.gUsed = null;
    },

    destroy() {
      clearInterval(this.reaper);
      try {
        this.idle?.removeIdleObserver(this.idleObs, 180);
      } catch {}
      for (const f of this.off ?? []) f?.();
      delete NP.memory;
    },
  });
})();
