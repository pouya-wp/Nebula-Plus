// Nebula Plus — your week, wrapped.
// Friday evening (or any time from the palette) a story-style card sums up
// the week: music (top artist and song), time on the web and where it went,
// tasks done, focus sessions, words learned, homework handed in — with a
// few warm lines from Gemini about it. Arrows / click to go through it.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-wrapped"] = true;

  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const DAY = 86400000;
  const hm = (sec) => {
    const m = Math.round(sec / 60);
    if (m < 60) return `${fa(m)} دقیقه`;
    return `${fa(Math.floor(m / 60))} ساعت${m % 60 ? ` و ${fa(m % 60)} دقیقه` : ""}`;
  };

  NP.feature({
    name: "Wrapped",
    async init() {
      if (!NP.prefs.get("nplus-wrapped")) return;
      await NP.store.load();
      NP.wrapped = { open: () => this.open() };
      this.timer = setInterval(() => this.maybeShow(), 10 * 60000);
      setTimeout(() => this.maybeShow(), 60000);
    },

    // Friday after 18:00, once a week, a gentle invitation
    maybeShow() {
      const now = new Date();
      if (now.getDay() !== 5 || now.getHours() < 18) return;
      const key = now.toDateString();
      if (NP.store.data.wrappedShown === key) return;
      NP.store.set("wrappedShown", key);
      NP.island?.show({ id: "wrapped", title: "هفته‌ات آماده‌ست ✨", subtitle: "یه نگاه به هفته‌ای که گذشت — کلیک کن", icon: "🎁", duration: 15000, onClick: () => this.open() });
    },

    async collect() {
      const d = NP.store.data;
      const since = Date.now() - 7 * DAY;
      const out = {};
      try {
        out.music = await (await fetch("http://127.0.0.1:47321/stats?days=7", { cache: "no-store", signal: AbortSignal.timeout(3000) })).json();
      } catch {}
      // web time
      const web = {};
      if (NP.usage) for (let i = 0; i < 7; i++) for (const [h, s] of Object.entries(NP.usage.day(NP.usage.dayKey(Date.now() - i * DAY)))) web[h] = (web[h] ?? 0) + s;
      out.webTotal = Object.values(web).reduce((a, b) => a + b, 0);
      out.webTop = Object.entries(web).sort((a, b) => b[1] - a[1]).slice(0, 3);
      // tasks
      const todos = d.todos ?? [];
      out.done = todos.filter((t) => t.done && t.doneAt > since).length;
      out.open = todos.filter((t) => !t.done).length;
      // homework
      out.hw = (d.classHomework ?? []).filter((h) => h.done && h.added > since - 14 * DAY).length;
      // words
      const words = d.words ?? [];
      out.newWords = words.filter((w) => w.added > since).length;
      out.learned = words.filter((w) => w.box >= 3).length;
      // notes
      out.notes = (d.notes ?? []).filter((n) => n.created > since).length;
      // focus sessions (only today's count is kept; good enough as a hint)
      out.focusToday = Number(String(NP.prefs.get("nplus-focus-done") ?? "").split("|")[1]) || 0;
      return out;
    },

    slides(s) {
      const name = NP.prefs.get("nplus-name");
      const list = [{ big: "هفته‌ای که گذشت", sub: `${name ? `${name}، ` : ""}بیا یه نگاه بندازیم 🎁`, tone: 0 }];
      const m = s.music;
      if (m?.minutes) {
        list.push({ kicker: "موسیقی", big: `${fa(m.minutes)} دقیقه`, sub: "آهنگ گوش دادی", tone: 1 });
        if (m.artists?.[0]) list.push({ kicker: "خواننده‌ی هفته", big: m.artists[0].name, sub: `${fa(m.artists[0].minutes)} دقیقه با هم بودین`, tone: 2, ltr: true });
        if (m.tracks?.[0]) list.push({ kicker: "آهنگ هفته", big: m.tracks[0].title, sub: `${m.tracks[0].artist} · ${fa(m.tracks[0].minutes)} دقیقه`, tone: 3, ltr: true });
      }
      if (s.webTotal) list.push({ kicker: "وب", big: hm(s.webTotal), sub: `بیشترش: ${s.webTop.map(([h]) => h).join("، ")}`, tone: 4 });
      if (s.done || s.hw) list.push({ kicker: "کارها", big: `${fa(s.done)} کار تموم شد`, sub: s.hw ? `${fa(s.hw)} تکلیف هم تحویل شد 💪` : s.open ? `${fa(s.open)} کار هنوز بازه` : "لیستت خالیه!", tone: 5 });
      if (s.newWords) list.push({ kicker: "لغت", big: `${fa(s.newWords)} لغت تازه`, sub: s.learned ? `${fa(s.learned)} تاش دیگه ملکه‌ی ذهنت شده` : "مرورشون یادت نره", tone: 6 });
      if (s.notes) list.push({ kicker: "یادداشت", big: `${fa(s.notes)} هایلایت و یادداشت`, sub: "از وب برداشتی", tone: 1 });
      list.push({ kicker: "از طرف Gemini", big: "", sub: "", ai: true, tone: 7 });
      return list;
    },

    async open() {
      this.close(true);
      const stats = await this.collect();
      this.list = this.slides(stats);
      this.i = 0;
      this.el = NP.html("div", { id: "nplus-wrapped" }, [
        NP.html("div", { class: "wr-bars" }, this.list.map(() => NP.html("span"))),
        NP.html("div", { class: "wr-card" }, [
          NP.html("div", { class: "wr-kicker" }),
          NP.html("div", { class: "wr-big" }),
          NP.html("div", { class: "wr-sub" }),
        ]),
        NP.html("div", { class: "wr-hint", text: "کلیک / ← → · Esc" }),
      ]);
      document.body.append(this.el);
      this.el.addEventListener("click", (e) => (e.clientX < window.innerWidth / 3 ? this.go(1) : this.go(-1)));
      this.onKey = (e) => {
        if (e.key === "Escape") this.close();
        else if (e.key === "ArrowLeft") this.go(1);
        else if (e.key === "ArrowRight") this.go(-1);
        else return;
        e.preventDefault();
      };
      window.addEventListener("keydown", this.onKey, true);
      this.el.getBoundingClientRect();
      this.el.setAttribute("open", "true");
      this.show();
      // the closing lines come from Gemini while you look through it
      const prompt = `You write the last card of a friendly weekly recap ("Wrapped") inside a browser, in casual, warm Persian (Farsi, colloquial Tehrani), max 3 short sentences, no emojis overload (one is fine), no headings. Address the user${NP.prefs.get("nplus-name") ? ` by name (${NP.prefs.get("nplus-name")})` : ""}. Mention one or two concrete things from the data and end with gentle encouragement for next week. Data: ${JSON.stringify({ musicMinutes: stats.music?.minutes, topArtist: stats.music?.artists?.[0]?.name, topSong: stats.music?.tracks?.[0]?.title, webHours: Math.round(stats.webTotal / 360) / 10, topSites: stats.webTop.map(([h]) => h), tasksDone: stats.done, tasksOpen: stats.open, homeworkDone: stats.hw, newWords: stats.newWords })}`;
      this.ai = null;
      NP.gemini
        ?.ask(prompt)
        .then((t) => {
          this.ai = String(t || "").replace(/\*\*/g, "").trim();
          if (this.list?.[this.i]?.ai) this.show();
        })
        .catch(() => (this.ai = "هفته‌ی خوبی بود؛ هفته‌ی بعد هم قدم به قدم جلو برو ✨"));
    },

    go(d) {
      const n = this.i + d;
      if (n < 0) return;
      if (n >= this.list.length) return this.close();
      this.i = n;
      this.show();
    },

    show() {
      const s = this.list[this.i];
      const q = (x) => this.el.querySelector(x);
      this.el.dataset.tone = s.tone;
      [...this.el.querySelectorAll(".wr-bars span")].forEach((b, k) => b.toggleAttribute("on", k <= this.i));
      q(".wr-kicker").textContent = s.kicker ?? "";
      const big = q(".wr-big");
      big.textContent = s.ai ? "" : s.big;
      big.dir = s.ltr ? "ltr" : "rtl";
      q(".wr-sub").textContent = s.ai ? (this.ai ?? "دارم چند خط برات می‌نویسم…") : s.sub;
      q(".wr-sub").toggleAttribute("long", !!s.ai);
      const card = q(".wr-card");
      card.classList.remove("in");
      card.getBoundingClientRect();
      card.classList.add("in");
    },

    close(now) {
      window.removeEventListener("keydown", this.onKey, true);
      const el = this.el;
      this.el = null;
      if (!el) return;
      if (now) return el.remove();
      el.removeAttribute("open");
      setTimeout(() => el.remove(), 350);
    },

    destroy() {
      clearInterval(this.timer);
      this.close(true);
      delete NP.wrapped;
    },
  });
})();
