// Nebula Plus — usage meter.
// Counts the time you actually spend on each site (window focused and you
// at the keyboard, or a video/music playing in the tab you're on). Ctrl+Alt+U
// or the palette shows today / yesterday / this week. Sites you list with a
// daily budget (nplus-usage-limits, e.g. "youtube.com:60, instagram.com:30")
// get a gentle island when you pass it, and again every half hour after.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-usage"] = true;
  NP.DEFAULTS["nplus-usage-limits"] = "youtube.com:90, instagram.com:30, x.com:30";

  const TICK = 15;
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const dayKey = (t = Date.now()) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dur = (s) => {
    const m = Math.round(s / 60);
    if (m < 1) return "کمتر از ۱ دقیقه";
    if (m < 60) return `${fa(m)} دقیقه`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${fa(h)} ساعت و ${fa(m % 60)} دقیقه` : `${fa(h)} ساعت`;
  };
  const siteOf = (uri) => {
    try {
      if (!/^https?$/.test(uri.scheme)) return "";
      return uri.host.replace(/^(www|m|mobile)\./, "");
    } catch {
      return "";
    }
  };

  NP.feature({
    name: "Usage",
    async init() {
      if (!NP.prefs.get("nplus-usage")) return;
      await NP.store.load();
      this.idle = Cc["@mozilla.org/widget/useridleservice;1"].getService(Ci.nsIUserIdleService);
      this.timer = setInterval(() => this.tick(), TICK * 1000);
      this.offKey = NP.hotkey?.("ctrl+alt+u", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
      NP.usage = { open: () => this.open(), day: (k) => this.day(k), dayKey };
    },

    data() {
      return (NP.store.data.usage ??= {});
    },
    day(k = dayKey()) {
      return this.data()[k] ?? {};
    },

    tick() {
      if (Services.focus.activeWindow !== window) return;
      const tab = gBrowser.selectedTab;
      const site = siteOf(tab.linkedBrowser.currentURI);
      if (!site) return;
      const playing = tab.hasAttribute("soundplaying");
      if (!playing && this.idle.idleTime > 120000) return;
      const k = dayKey();
      const all = this.data();
      const today = (all[k] ??= {});
      today[site] = (today[site] ?? 0) + TICK;
      // keep two weeks
      for (const old of Object.keys(all).sort().slice(0, -14)) delete all[old];
      if (!this.dirty) {
        this.dirty = true;
        setTimeout(() => {
          this.dirty = false;
          NP.store.set("usage", this.data());
        }, 180000);
      }
      this.checkLimit(site, today[site]);
      if (!this.panel.hidden) this.render();
    },

    limits() {
      const out = {};
      for (const part of String(NP.prefs.get("nplus-usage-limits") || "").split(",")) {
        const [h, m] = part.split(":").map((x) => x.trim());
        if (h && +m > 0) out[h.replace(/^www\./, "")] = +m * 60;
      }
      return out;
    },

    checkLimit(site, secs) {
      const lim = Object.entries(this.limits()).find(([h]) => site === h || site.endsWith(`.${h}`));
      if (!lim || secs < lim[1]) return;
      const over = secs - lim[1];
      const step = Math.floor(over / 1800);
      const mark = `${dayKey()}|${lim[0]}|${step}`;
      if (this.warned === mark || NP.store.data.usageWarned === mark) return;
      this.warned = mark;
      NP.store.set("usageWarned", mark);
      const name = NP.prefs.get("nplus-name");
      NP.island?.show({
        id: "usage",
        title: `${name ? `${name}، ` : ""}امروز ${dur(secs)} توی ${lim[0]} بودی`,
        subtitle: step ? "هنوز اینجایی… یه استراحت کوچیک؟" : `سهم امروزت ${dur(lim[1])} بود — یه نفس بکش 🌿`,
        icon: "⏳",
        duration: 9000,
        onClick: () => this.open(),
      });
    },

    // ---------- panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-usage-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "⏳ وقتم کجا رفت؟" }),
          NP.html("div", { class: "us-total" }),
        ]),
        NP.html("div", { class: "np-tabs" }, [
          NP.html("button", { class: "np-chip", "data-tab": "today", text: "امروز", onclick: () => this.tab("today") }),
          NP.html("button", { class: "np-chip", "data-tab": "yesterday", text: "دیروز", onclick: () => this.tab("yesterday") }),
          NP.html("button", { class: "np-chip", "data-tab": "week", text: "۷ روز اخیر", onclick: () => this.tab("week") }),
        ]),
        NP.html("div", { class: "us-week" }),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "فقط وقتی پشت سیستمی (یا ویدیو پخش می‌شه) حساب می‌شه · سقف روزانه در تنظیمات: nplus-usage-limits" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-usage-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
      this.view = "today";
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
    },

    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    tab(v) {
      this.view = v;
      this.render();
    },

    render() {
      for (const c of this.panel.querySelectorAll(".np-chip")) c.toggleAttribute("selected", c.dataset.tab === this.view);
      const keys = this.view === "today" ? [dayKey()] : this.view === "yesterday" ? [dayKey(Date.now() - 86400000)] : [...Array(7)].map((_, i) => dayKey(Date.now() - i * 86400000));
      const sum = {};
      for (const k of keys) for (const [h, s] of Object.entries(this.day(k))) sum[h] = (sum[h] ?? 0) + s;
      const rows = Object.entries(sum).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((t, r) => t + r[1], 0);
      this.panel.querySelector(".us-total").textContent = total ? `جمعاً ${dur(total)}` : "";

      // the week as small columns
      const week = this.panel.querySelector(".us-week");
      week.hidden = this.view !== "week";
      if (this.view === "week") {
        const days = [...Array(7)].map((_, i) => Date.now() - (6 - i) * 86400000);
        const totals = days.map((t) => Object.values(this.day(dayKey(t))).reduce((a, b) => a + b, 0));
        const max = Math.max(...totals, 1);
        week.replaceChildren(
          ...days.map((t, i) =>
            NP.html("div", { class: "us-col", title: dur(totals[i]) }, [
              Object.assign(NP.html("div", { class: "us-colbar" }), { _h: Math.max(4, Math.round((totals[i] / max) * 64)) }),
              NP.html("div", { class: "us-day", text: new Date(t).toLocaleDateString("fa-IR", { weekday: "narrow" }) }),
            ]),
          ),
        );
        for (const b of week.querySelectorAll(".us-colbar")) b.style.height = `${b._h}px`;
      }

      const limits = this.limits();
      const list = this.panel.querySelector(".wt-list");
      if (!rows.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: "هنوز چیزی ثبت نشده." }));
        return;
      }
      const max = rows[0][1];
      list.replaceChildren(
        ...rows.slice(0, 25).map(([h, s]) => {
          const lim = this.view === "today" ? Object.entries(limits).find(([x]) => h === x || h.endsWith(`.${x}`)) : null;
          const row = NP.html("div", { class: "wt-row np-clickable" }, [
            NP.html("img", { class: "us-ico", src: `http://127.0.0.1:47321/favicon?host=${h}` }),
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "us-line" }, [NP.html("span", { class: "wt-name", dir: "ltr", text: h }), NP.html("span", { class: "us-time", text: dur(s) })]),
              NP.html("div", { class: "np-bar" }, [NP.html("div", { class: "np-fill" })]),
              lim ? NP.html("div", { class: "wt-meta", text: s > lim[1] ? `${dur(s - lim[1])} بیشتر از سهم روزانه` : `${dur(lim[1] - s)} از سهم امروز مونده` }) : null,
            ].filter(Boolean)),
          ]);
          row.toggleAttribute("over", !!lim && s > lim[1]);
          row.querySelector(".np-fill").style.width = `${Math.max(2, (s / max) * 100)}%`;
          row.querySelector(".us-ico").onerror = (e) => (e.target.dataset.f ? (e.target.style.visibility = "hidden") : ((e.target.dataset.f = 1), (e.target.src = `https://icons.duckduckgo.com/ip3/${h}.ico`)));
          row.addEventListener("click", () => (openTrustedLinkIn(`https://${h}/`, "tab"), this.close()));
          return row;
        }),
      );
    },

    destroy() {
      clearInterval(this.timer);
      if (NP.store.data?.usage) NP.store.set("usage", NP.store.data.usage);
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.usage;
    },
  });
})();
