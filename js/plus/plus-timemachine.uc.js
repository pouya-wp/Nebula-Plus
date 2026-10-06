// Nebula Plus — tab time machine.
// "What did I have open yesterday at four?" Every few minutes the set of
// open tabs is noted (only when it changed, kept for a week, in its own
// small file). Ctrl+Alt+Y or the palette: scroll back through the days,
// open a moment to see its tabs, bring back one tab or the whole moment.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-timemachine"] = true;

  const EVERY = 5 * 60 * 1000;
  const KEEP = 7 * 86400000;
  const PATH = PathUtils.join(PathUtils.profileDir, "nebula-plus-timeline.json");
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  NP.feature({
    name: "TimeMachine",
    async init() {
      if (!NP.prefs.get("nplus-timemachine")) return;
      try {
        this.line = await IOUtils.readJSON(PATH);
      } catch {
        this.line = [];
      }
      this.timer = setInterval(() => this.snap(), EVERY);
      this.first = setTimeout(() => this.snap(), 60000);
      this.offKey = NP.hotkey?.("ctrl+alt+y", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
      NP.timeMachine = { open: () => this.open() };
    },

    current() {
      const tabs = [];
      for (const t of gBrowser.tabs) {
        if (t.hasAttribute("nplus-worker") || t.hasAttribute("zen-empty-tab")) continue;
        const u = t.linkedBrowser.currentURI.spec;
        if (!/^https?:/.test(u)) continue;
        tabs.push({ u, t: t.label || host(u), p: t.pinned ? 1 : 0 });
      }
      return tabs;
    },

    async snap() {
      // the most recent window speaks for all of them
      if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
      const tabs = this.current();
      if (!tabs.length) return;
      const now = Date.now();
      const sig = tabs.map((x) => x.u).sort().join("\n");
      const last = this.line.at(-1);
      const same = last && last.sig === sig;
      if (same) last.to = now;
      else this.line.push({ at: now, to: now, sig, tabs });
      // nothing new: the "until" time can wait for the next real change
      if (same && now - (this.wrote ?? 0) < 30 * 60000) return;
      this.wrote = now;
      this.line = this.line.filter((s) => s.to > now - KEEP).slice(-400);
      try {
        await IOUtils.writeJSON(PATH, this.line, { tmpPath: `${PATH}.tmp` });
      } catch {}
      if (!this.panel.hidden) this.render();
    },

    // ---------- panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-tm-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "🕰 ماشین زمان تب‌ها" }),
          NP.html("button", { class: "wt-btn", text: "الان ثبت کن", onclick: () => this.snap() }),
        ]),
        NP.html("input", { class: "np-search", type: "text", dir: "auto", placeholder: "دنبال چی بودی؟ (اسم سایت یا عنوان)" }),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "هر ۵ دقیقه، اگه تب‌ها عوض شده باشن، یه لحظه ثبت می‌شه · تا ۷ روز" }),
      ]);
      document.body.append(this.panel);
      this.search = this.panel.querySelector(".np-search");
      this.search.addEventListener("input", () => this.render());
      this.search.addEventListener("keydown", (e) => e.key === "Escape" && this.close());
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-tm-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    async open() {
      await this.snap();
      this.expanded = null;
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
    },

    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    when(t) {
      const d = new Date(t);
      const today = new Date().toDateString();
      const y = new Date(Date.now() - 86400000).toDateString();
      const day = d.toDateString() === today ? "امروز" : d.toDateString() === y ? "دیروز" : d.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" });
      return { day, time: d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) };
    },

    render() {
      const list = this.panel.querySelector(".wt-list");
      const q = this.search.value.trim().toLowerCase();
      const open = new Set(this.current().map((x) => x.u));
      const moments = [...this.line].reverse().filter((s) => !q || s.tabs.some((x) => `${x.t} ${x.u}`.toLowerCase().includes(q)));
      if (!moments.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: q ? "توی این هفته چنین تبی نداشتی." : "هنوز چیزی ثبت نشده — چند دقیقه دیگه سر بزن." }));
        return;
      }
      const rows = [];
      let lastDay = "";
      for (const s of moments) {
        const w = this.when(s.at);
        if (w.day !== lastDay) {
          lastDay = w.day;
          rows.push(NP.html("div", { class: "np-group", text: w.day }));
        }
        const missing = s.tabs.filter((x) => !open.has(x.u));
        const hosts = [...new Set(s.tabs.map((x) => host(x.u)))].slice(0, 9);
        const head = NP.html("div", { class: "wt-row np-clickable tm-moment" }, [
          NP.html("div", { class: "wt-main" }, [
            NP.html("div", { class: "tm-line" }, [
              NP.html("span", { class: "wt-name", text: `${w.time}${s.to - s.at > 120000 ? ` تا ${this.when(s.to).time}` : ""}` }),
              NP.html("span", { class: "wt-meta", text: `${fa(s.tabs.length)} تب${missing.length ? ` · ${fa(missing.length)} تاش الان بسته‌ست` : ""}` }),
            ]),
            NP.html(
              "div",
              { class: "tm-icons" },
              hosts.map((h) => {
                const img = NP.html("img", { src: `http://127.0.0.1:47321/favicon?host=${h}`, title: h });
                img.onerror = () => (img.dataset.f ? img.remove() : ((img.dataset.f = 1), (img.src = `https://icons.duckduckgo.com/ip3/${h}.ico`)));
                return img;
              }),
            ),
          ]),
          missing.length
            ? NP.html("button", { class: "wt-btn", text: "برگردون", title: "تب‌های بسته‌شده‌ی این لحظه رو باز کن", onclick: (e) => (e.stopPropagation(), this.restore(missing)) })
            : null,
        ].filter(Boolean));
        head.addEventListener("click", () => ((this.expanded = this.expanded === s.at ? null : s.at), this.render()));
        rows.push(head);
        if (this.expanded === s.at || (q && moments.length <= 3)) {
          const inner = NP.html(
            "div",
            { class: "tm-tabs" },
            s.tabs
              .filter((x) => !q || `${x.t} ${x.u}`.toLowerCase().includes(q))
              .map((x) => {
                const r = NP.html("div", { class: "tm-tab", title: x.u }, [
                  NP.html("img", { src: `http://127.0.0.1:47321/favicon?host=${host(x.u)}` }),
                  NP.html("span", { dir: "auto", text: x.t }),
                  open.has(x.u) ? NP.html("span", { class: "tm-open", text: "باز" }) : null,
                ].filter(Boolean));
                r.querySelector("img").onerror = (e) => (e.target.dataset.f ? (e.target.style.visibility = "hidden") : ((e.target.dataset.f = 1), (e.target.src = `https://icons.duckduckgo.com/ip3/${host(x.u)}.ico`)));
                r.addEventListener("click", () => this.restore([x], true));
                return r;
              }),
          );
          rows.push(inner);
        }
      }
      list.replaceChildren(...rows);
    },

    restore(tabs, select) {
      let last = null;
      for (const x of tabs) {
        const existing = gBrowser.tabs.find((t) => t.linkedBrowser.currentURI.spec === x.u);
        last = existing ?? gBrowser.addTab(x.u, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), skipAnimation: true });
      }
      if (select && last) gBrowser.selectedTab = last;
      if (!select) NP.island?.show({ title: `${fa(tabs.length)} تب برگشت`, icon: "🕰", duration: 2000 });
      this.render();
    },

    destroy() {
      clearInterval(this.timer);
      clearTimeout(this.first);
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.timeMachine;
    },
  });
})();
