// Nebula Plus — battery and heat aware.
// Unplugged, on battery saver, or the CPU busy for a few minutes (a game,
// a build, the laptop getting hot): Nebula switches to lean rendering by
// itself — same look, much less work — and to performance mode below 20%
// battery. Plug back in / cool down and it goes back to how you had it.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-autolean"] = true;

  NP.feature({
    name: "AutoLean",
    async init() {
      if (!NP.prefs.get("nplus-autolean")) return;
      await NP.store.load();
      this.hot = 0;
      this.cool = 0;
      this.timer = setInterval(() => this.check(), 60000);
      setTimeout(() => this.check(), 15000);
    },

    async check() {
      // one window decides for all of them
      if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
      let p;
      try {
        p = await (await fetch("http://127.0.0.1:47321/power", { cache: "no-store", signal: AbortSignal.timeout(3000) })).json();
      } catch {
        return;
      }
      if (p.cpu >= 70) (this.hot++, (this.cool = 0));
      else if (p.cpu >= 0 && p.cpu < 40) (this.cool++, (this.hot = 0));
      const battery = !p.ac && p.battery >= 0;
      const reason = p.saver ? "saver" : battery ? "battery" : this.hot >= 3 ? "cpu" : null;
      const low = battery && p.battery < 20;
      const applied = NP.store.data.autoLean;

      if (reason && !applied) {
        const was = { lean: !!NP.prefs.get("nplus-lean"), perf: !!NP.prefs.get("nplus-performance") };
        if (was.lean && (!low || was.perf)) return; // already as light as needed
        NP.store.data.autoLean = { ...was, reason };
        NP.store.set("autoLean", NP.store.data.autoLean);
        NP.prefs.set("nplus-lean", true);
        if (low) NP.prefs.set("nplus-performance", true);
        const why = { saver: "حالت صرفه‌جویی باتری روشنه", battery: `روی باتری‌ای (${p.battery}٪)`, cpu: "پردازنده چند دقیقه‌ست خیلی درگیره" }[reason];
        NP.island?.show({ id: "autolean", title: "Nebula سبک شد 🍃", subtitle: `${why} — همون ظاهر، کار خیلی کمتر`, duration: 5000 });
      } else if (applied && low && !NP.prefs.get("nplus-performance")) {
        NP.prefs.set("nplus-performance", true);
      } else if (applied && !reason && (applied.reason !== "cpu" || this.cool >= 3)) {
        NP.prefs.set("nplus-lean", applied.lean);
        NP.prefs.set("nplus-performance", applied.perf);
        NP.store.set("autoLean", undefined);
        delete NP.store.data.autoLean;
        NP.island?.show({ id: "autolean", title: "Nebula برگشت به حالت کامل ✨", subtitle: p.ac ? "شارژر وصله" : "پردازنده آروم شد", duration: 3500 });
      }
    },

    destroy() {
      clearInterval(this.timer);
    },
  });
})();
