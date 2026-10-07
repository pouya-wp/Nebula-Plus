// Nebula Plus — new tab ⇄ browser link, and the daily digest.
// The new tab is a local page; it asks the browser for things only the
// browser knows through a tiny message channel (page event ⇄ frame script ⇄
// here): today's digest (next class, unread class messages, homework that's
// due, watched items that changed, words to review, yesterday's screen
// time), the next flashcard, and "open that panel".
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const DAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

  // Content side (ASCII only). Only acts on our new tab page.
  const LINK = `(function(G){
    var ME = {}; G.__nplus_ntlink = ME;
    function stale() { return G.__nplus_ntlink !== ME; }
    function ours() { try { return /\\/newtab\\/index\\.html$/.test(content.location.pathname) && content.location.protocol === 'file:'; } catch (e) { return false; } }
    addEventListener('nplus-nt-req', function (e) {
      if (stale() || !ours()) return;
      var req; try { req = JSON.parse(e.detail); } catch (x) { return; }
      sendAsyncMessage('nplus:nt1:req', req);
    }, true, true);
    addMessageListener('nplus:nt1:res', function (m) {
      if (stale() || !ours()) return;
      content.dispatchEvent(new content.CustomEvent('nplus-nt-res', { detail: JSON.stringify(m.data) }));
    });
  })(this);`;

  NP.feature({
    name: "NewTabLink",
    async init() {
      await NP.store.load();
      this.onReq = (m) => this.handle(m.target, m.data);
      window.messageManager.addMessageListener("nplus:nt1:req", this.onReq);
      this.script = "data:," + encodeURIComponent(LINK);
      window.messageManager.loadFrameScript(this.script, true);
      // market prices and the calendar refresh quietly in the background
      this.refreshMarket();
      this.refreshCalendar();
      this.mTimer = setInterval(() => this.refreshMarket(), 30 * 60000);
      this.cTimer = setInterval(() => this.refreshCalendar(), 3 * 3600000);
    },

    // ---------- market (Nobitex): dollar (USDT), gold 18k per gram, bitcoin ----------
    async refreshMarket() {
      if (Services.wm.getMostRecentWindow("navigator:browser") !== window && NP.store.data.market) return;
      try {
        const r = await (await fetch("https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt,paxg,btc&dstCurrency=rls", { signal: AbortSignal.timeout(8000) })).json();
        const st = r.stats ?? {};
        const toman = (k) => Number(st[k]?.latest) / 10;
        const usd = toman("usdt-rls");
        if (!usd) return;
        const gold18 = (toman("paxg-rls") / 31.1035) * 0.75;
        const m = NP.store.data.market ?? { hist: [] };
        m.at = Date.now();
        m.usd = { v: usd, ch: Number(st["usdt-rls"]?.dayChange) || 0 };
        m.gold = gold18 ? { v: gold18, ch: Number(st["paxg-rls"]?.dayChange) || 0 } : null;
        m.btc = st["btc-rls"] ? { v: toman("btc-rls") / usd, ch: Number(st["btc-rls"]?.dayChange) || 0 } : null;
        m.hist = [...(m.hist ?? []).filter((h) => h[0] > Date.now() - 7 * 86400000), [Date.now(), usd]];
        NP.store.data.market = m;
        NP.store.set("market", m);
      } catch {}
    },

    // ---------- calendar: holidays and occasions (holidayapi.ir), cached per day ----------
    jalali(t) {
      const parts = new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date(t));
      const get = (k) => Number(parts.find((p) => p.type === k)?.value);
      return { y: get("year"), m: get("month"), d: get("day") };
    },

    async refreshCalendar() {
      const cal = (NP.store.data.calendar ??= {});
      const keep = new Set();
      for (let i = 0; i < 21; i++) {
        const j = this.jalali(Date.now() + i * 86400000);
        const key = `${j.y}/${String(j.m).padStart(2, "0")}/${String(j.d).padStart(2, "0")}`;
        keep.add(key);
        if (cal[key]) continue;
        try {
          const r = await (await fetch(`https://holidayapi.ir/jalali/${key}`, { signal: AbortSignal.timeout(6000) })).json();
          cal[key] = { off: !!r.is_holiday, ev: (r.events ?? []).map((e) => ({ t: e.description, off: !!e.is_holiday })).slice(0, 4) };
        } catch {
          break;
        }
      }
      for (const k of Object.keys(cal)) if (!keep.has(k) && k < [...keep][0]) delete cal[k];
      NP.store.set("calendar", cal);
    },

    reply(browser, id, data) {
      try {
        browser.messageManager.sendAsyncMessage("nplus:nt1:res", { id, ...data });
      } catch {}
    },

    async handle(browser, req) {
      switch (req.type) {
        case "digest":
          return this.reply(browser, req.id, { digest: this.digest() });
        case "word":
          return this.reply(browser, req.id, { word: this.word() });
        case "grade":
          NP.words?.grade(req.key, !!req.ok);
          return this.reply(browser, req.id, { word: this.word() });
        case "highlight": {
          // one of your highlights (with a note, or long enough to mean something)
          const hl = (NP.store.data.notes ?? []).filter((n) => n.kind === "hl" && (n.note || (n.exact ?? "").length > 40) && (n.exact ?? "").length < 260);
          const h = hl[Math.floor(Math.random() * hl.length)];
          return this.reply(browser, req.id, { highlight: h ? { text: h.exact, note: h.note, title: h.title, url: h.url } : null });
        }
        case "open-url":
          if (/^https?:\/\//.test(req.url ?? "")) openTrustedLinkIn(req.url, "tab");
          return this.reply(browser, req.id, {});
        case "spell":
          return this.reply(browser, req.id, { spell: NP.kaizen?.next() ?? null });
        case "spell-grade":
          NP.kaizen?.grade(req.key, !!req.ok);
          return this.reply(browser, req.id, { spell: NP.kaizen?.next() ?? null });
        case "weather-fx": {
          const mode = { auto: 1, rain: 2, snow: 3, off: 0 }[req.mode];
          if (mode !== undefined) NP.prefs.set("nplus-weather-fx", mode);
          return this.reply(browser, req.id, {});
        }
        case "todos":
          return this.reply(browser, req.id, { todos: this.todos() });
        case "todo-add":
          NP.todo?.add(String(req.text || ""));
          return this.reply(browser, req.id, { todos: this.todos() });
        case "todo-toggle":
          NP.todo?.toggle(req.todo);
          return this.reply(browser, req.id, { todos: this.todos() });
        case "open": {
          const map = {
            class: () => NP.classBoard?.open(),
            watch: () => NP.watch?.open(),
            words: () => NP.words?.open(),
            usage: () => NP.usage?.open(),
            notes: () => NP.notes?.open(),
            tm: () => NP.timeMachine?.open(),
            todo: () => NP.todo?.open(),
            kaizen: () => NP.kaizen?.open(),
          };
          map[req.what]?.();
          return this.reply(browser, req.id, {});
        }
      }
    },

    todos() {
      if (!NP.todo) return null;
      const all = NP.todo.view();
      const open = all.filter((t) => !t.done);
      const today = new Date().toDateString();
      const doneToday = all.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === today).length;
      const dueNow = open.filter((t) => ["today", "overdue"].includes(NP.todo.state(t))).length;
      return {
        open: open.length,
        doneToday,
        dueNow,
        items: open.slice(0, 6).map((t) => ({ id: t.id, title: t.title, when: NP.todo.whenText(t), state: NP.todo.state(t), pri: t.pri ?? 0, steps: (t.steps ?? []).length, stepsDone: (t.steps ?? []).filter((x) => x.done).length, repeat: !!t.repeat })),
      };
    },

    word() {
      const due = NP.words?.due() ?? [];
      const s = NP.words?.stats() ?? { total: 0, due: 0 };
      const w = due[0];
      return { left: due.length, total: s.total, card: w ? { key: w.key, w: w.w, ipa: w.ipa, fa: w.fa, pos: w.pos, ctx: w.ctx, ex: w.ex } : null };
    },

    digest() {
      const d = NP.store.data;
      const items = [];

      // class: tomorrow / today, unread, homework
      if (NP.prefs.get("nplus-class")) {
        const days = String(NP.prefs.get("nplus-class-days")).split(/[,\s]+/).map(Number);
        const now = new Date();
        let next = null;
        for (let i = 0; i < 8 && !next; i++) {
          const x = new Date(now);
          x.setDate(now.getDate() + i);
          if (days.includes(x.getDay()) && !(i === 0 && now.getHours() >= 13)) next = { day: x.getDay(), inDays: i };
        }
        const feed = d.classFeed ?? { items: [] };
        const seen = new Set(d.classSeen ?? []);
        const unread = feed.items.filter((it) => !seen.has(it.key) && !it.out).length;
        const hw = (d.classHomework ?? []).filter((h) => !h.done && (!h.due || new Date(h.due).getTime() > Date.now() - 86400000));
        if (next && next.inDays <= 1) items.push({ icon: "📚", text: `${next.inDays === 0 ? "امروز" : "فردا"} (${DAY_FA[next.day]}) کلاس داری`, sub: hw.length ? `${fa(hw.length)} تکلیف باز` : "تکلیف‌ها رو یه چک بکن", open: "class", hot: true });
        if (unread) items.push({ icon: "💬", text: `${fa(unread)} پیام تازه در گروه کلاس`, open: "class" });
        for (const h of hw.slice(0, 3)) items.push({ icon: "📝", text: h.task, sub: h.due ? this.dueText(h.due) : "", open: "class" });
      }

      // watcher: changed in the last day, not seen
      for (const w of (d.watches ?? []).filter((w) => w.unseen).slice(0, 2)) {
        let host = "";
        try {
          host = new URL(w.url).hostname.replace(/^www\./, "");
        } catch {}
        items.push({ icon: "👁", text: `تغییر کرد: ${w.title || host}`, sub: String(w.last || "").slice(0, 80), open: "watch" });
      }

      // overdue tasks
      const overdue = NP.todo ? NP.todo.list().filter((t) => NP.todo.state(t) === "overdue").length : 0;
      if (overdue) items.push({ icon: "⏰", text: `${fa(overdue)} کار عقب افتاده`, open: "todo", hot: true });

      // Kaizen: today's spelling
      const kz = NP.kaizen?.stats();
      if (kz && (kz.today.words >= 10 || kz.due)) {
        const acc = kz.today.acc == null ? "" : `دقت املا ${Math.round(kz.today.acc * 1000) / 10}٪`.replace(/\d/g, (x) => "۰۱۲۳۴۵۶۷۸۹"[x]);
        items.push({ icon: "✍️", text: acc || "Kaizen", sub: kz.due ? `${fa(kz.due)} کارت املا برای مرور` : kz.streak ? `${fa(kz.streak)} روز پشت سر هم 🔥` : "", open: "kaizen", hot: kz.due > 0 });
      }

      // words due
      const ws = NP.words?.stats();
      if (ws?.due) items.push({ icon: "📘", text: `${fa(ws.due)} لغت منتظر مرورن`, open: "words" });

      // yesterday's screen time
      const y = NP.usage?.day(NP.usage.dayKey(Date.now() - 86400000));
      if (y && Object.keys(y).length) {
        const total = Object.values(y).reduce((a, b) => a + b, 0);
        const [top, secs] = Object.entries(y).sort((a, b) => b[1] - a[1])[0];
        const h = (s) => (s >= 3600 ? `${fa(Math.floor(s / 3600))}:${fa(String(Math.round((s % 3600) / 60)).padStart(2, "0"))}` : `${fa(Math.round(s / 60))} دقیقه`);
        items.push({ icon: "⏳", text: `دیروز ${h(total)} پای وب بودی`, sub: `بیشترش ${top} (${h(secs)})`, open: "usage" });
      }

      // exams: tasks named «امتحان…» or tagged #امتحان
      for (const t of (NP.todo?.list() ?? []).filter((t) => !t.done && t.due && (/امتحان|میان‌ترم|میانترم|کوییز|exam|quiz/i.test(t.title) || (t.tags ?? []).some((g) => /امتحان|exam/i.test(g))))) {
        const days = Math.round((new Date(new Date(t.due).toDateString()) - new Date(new Date().toDateString())) / 86400000);
        if (days < 0 || days > 30) continue;
        items.push({ icon: "🎓", text: days === 0 ? `امروز: ${t.title}` : `${fa(days)} روز تا ${t.title}`, open: "todo", hot: days <= 2 });
      }

      // today's occasion / the next holiday
      const cal = d.calendar ?? {};
      const jk = (t) => {
        const j = this.jalali(t);
        return `${j.y}/${String(j.m).padStart(2, "0")}/${String(j.d).padStart(2, "0")}`;
      };
      const todayCal = cal[jk(Date.now())];
      if (todayCal?.ev?.length) items.push({ icon: todayCal.off ? "🎉" : "📅", text: todayCal.ev[0].t, sub: todayCal.off ? "تعطیله" : "" });
      for (let i = 1; i < 21; i++) {
        const c = cal[jk(Date.now() + i * 86400000)];
        // an official holiday (plain Fridays don't count)
        const ev = c?.ev?.find((e) => e.off && !/^جمعه$/.test(e.t.trim()));
        if (c?.off && ev) {
          items.push({ icon: "🏖", text: `${i === 1 ? "فردا" : `${fa(i)} روز دیگه`} تعطیله`, sub: ev.t });
          break;
        }
      }

      // market
      const m = d.market;
      if (m?.usd) {
        const n = (v) => Math.round(v).toLocaleString("fa-IR");
        const pct = (c) => `${c > 0 ? "▲" : c < 0 ? "▼" : ""}${Math.abs(c).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;
        items.push({ type: "market", icon: "💵", text: `دلار ${n(m.usd.v)}`, sub: pct(m.usd.ch), dir: Math.sign(m.usd.ch), spark: (m.hist ?? []).slice(-48).map((h) => h[1]) });
        if (m.gold) items.push({ type: "market", icon: "🪙", text: `طلای ۱۸ ${n(m.gold.v / 1000)} هزار`, sub: pct(m.gold.ch), dir: Math.sign(m.gold.ch) });
      }

      return { items };
    },

    dueText(iso) {
      const due = new Date(iso);
      const days = Math.round((new Date(due.toDateString()) - new Date(new Date().toDateString())) / 86400000);
      if (days < 0) return "مهلتش گذشته";
      if (days === 0) return "مهلت: امروز";
      if (days === 1) return "مهلت: فردا";
      return `مهلت: ${DAY_FA[due.getDay()]} (${fa(days)} روز دیگه)`;
    },

    destroy() {
      clearInterval(this.mTimer);
      clearInterval(this.cTimer);
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:nt1:req", this.onReq);
      } catch {}
    },
  });
})();
