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
        case "open": {
          const map = {
            class: () => NP.classBoard?.open(),
            watch: () => NP.watch?.open(),
            words: () => NP.words?.open(),
            usage: () => NP.usage?.open(),
            notes: () => NP.notes?.open(),
            tm: () => NP.timeMachine?.open(),
          };
          map[req.what]?.();
          return this.reply(browser, req.id, {});
        }
      }
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
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:nt1:req", this.onReq);
      } catch {}
    },
  });
})();
