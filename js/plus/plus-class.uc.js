// Nebula Plus — class board.
// Follows one Rubika group (the class) without keeping Rubika open: every
// few minutes a hidden web.rubika.ir tab (your own logged-in session) opens
// the chat, the latest messages are read from the page, and the tab closes
// again. New messages arrive on the island; a toolbar button with a badge
// opens a panel with the messages (tick homework off as you do it), the
// next class, and an always-there button that opens the group.
// The evening before a class (17:00 by default) it reminds you, and keeps
// reminding (badge pulse + banner) until you say you've checked.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-class"] = true;
  NP.DEFAULTS["nplus-class-group"] = "g0IImWq04afffba49cb884b84168849f";
  NP.DEFAULTS["nplus-class-days"] = "1,4"; // Monday, Thursday (0 = Sunday)
  NP.DEFAULTS["nplus-class-remind-hour"] = "17";
  NP.DEFAULTS["nplus-class-poll-min"] = 10;
  NP.DEFAULTS["nplus-class-restyle"] = true;

  const DAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const groupId = () => NP.prefs.get("nplus-class-group");
  const chatURL = () => `https://web.rubika.ir/#c=${groupId()}`;
  const days = () =>
    String(NP.prefs.get("nplus-class-days"))
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => n >= 0 && n <= 6);
  // NP.store is async; it's loaded once in init and read straight after that
  const store = {
    get: (k, fallback) => (NP.store.data && k in NP.store.data ? NP.store.data[k] : fallback),
    set: (k, v) => NP.store.set(k, v),
  };
  const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  // Reads the open chat (ASCII only: frame scripts are data: URLs).
  const READER = `(function(){
    var d = content.document, gid = GROUP;
    var chat = d.getElementById(gid);
    if (!chat) { sendAsyncMessage("nplus:class:read", { ready: false }); return; }
    var title = (chat.querySelector('.peer-title') || {}).textContent || '';
    var items = [];
    chat.querySelectorAll('.bubbles-date-group').forEach(function (g) {
      var dateEl = g.querySelector('.bubble.is-date');
      var date = dateEl ? dateEl.innerText.trim() : '';
      g.querySelectorAll('.bubble:not(.service)').forEach(function (b) {
        var grp = b.closest('.bubbles-group');
        var nameEl = grp && grp.querySelector('.peer-title, .name');
        var cl = b.classList;
        var kind = cl.contains('voice') ? 'voice' : cl.contains('photo') ? 'photo' : cl.contains('video') ? 'video' :
          (b.querySelector('.document, .document-name') ? 'file' : 'text');
        var timeEl = b.querySelector('.time');
        var tm = timeEl ? (timeEl.innerText.match(/\\d{1,2}:\\d{2}/) || [''])[0] : '';
        // voice bubbles read "0:38 ... 13:24": the last h:mm is the send time
        var stamps = b.innerText.match(/\\d{1,2}:\\d{2}/g) || [];
        if (!tm && stamps.length) tm = stamps[stamps.length - 1];
        var text = '';
        var m = kind === 'voice' ? null : b.querySelector('.message');
        if (m) {
          var c = m.cloneNode(true);
          c.querySelectorAll('.time, .reactions, .reactions-block, .bubble-beside-button').forEach(function (x) { x.remove(); });
          text = c.innerText.trim();
        }
        var dur = kind === 'voice' && stamps.length > 1 ? stamps[0] : '';
        var fname = (b.querySelector('.document-name') || {}).innerText || '';
        items.push({ date: date, name: nameEl ? nameEl.textContent.trim() : '', time: tm, kind: kind, text: text, dur: dur, file: fname,
          out: cl.contains('is-out') });
      });
    });
    sendAsyncMessage("nplus:class:read", { ready: true, title: title, items: items });
  })();`;

  NP.feature({
    name: "ClassBoard",
    async init() {
      if (!NP.prefs.get("nplus-class")) return;
      NP.classBoard = { open: () => this.open() };
      // ticking it in the to-do list ticks it here too
      this.offHw = NP.on?.("homework-done", (e) => {
        const hw = store.get("classHomework", []);
        const h = hw.find((x) => x.id === e.id);
        if (h && h.done !== e.done) {
          h.done = e.done;
          store.set("classHomework", hw);
          this.render?.();
        }
      });
      await NP.store.load();
      // homework found before the to-do list existed joins it once
      setTimeout(() => {
        for (const h of store.get("classHomework", []).filter((x) => !x.done))
          NP.todo?.addItem({ title: h.task, due: h.due ? new Date(h.due.slice(0, 10) + "T00:00:00").getTime() : null, pri: 1, tags: ["کلاس"], hw: h.id });
      }, 3000);
      this.build();
      this.restyle();
      this.timer = setInterval(() => this.tick(), 60 * 1000);
      // first look a little after startup, then every few minutes
      this.first = setTimeout(() => this.refresh(), 20 * 1000);
      this.tick();
    },

    // The group's chat in web.rubika.ir gets our look (only that chat).
    async restyle() {
      if (NP.prefs.get("nplus-class-restyle") === false) return;
      try {
        const css = await (await fetch("chrome://sine/content/Nebula/nebula/plus/content/rubika-class.css")).text();
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(css.replaceAll("GROUP_ID", groupId())));
        if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      } catch (err) {
        NP.logger?.warn(`class restyle: ${err}`);
      }
    },

    // ---------- UI ----------
    build() {
      this.button = NP.html("div", { id: "nplus-class", role: "button", title: "کلاس" }, [NP.html("span", { class: "cl-badge" })]);
      this.button.addEventListener("click", () => this.toggle());
      const anchor = document.getElementById("nplus-ai-button") ?? document.getElementById("nplus-pomo") ?? document.getElementById("urlbar-container");
      anchor?.after(this.button);

      this.panel = NP.html("div", { id: "nplus-class-panel", hidden: "true" }, [
        NP.html("div", { class: "cl-head" }, [
          NP.html("div", { class: "cl-head-text" }, [
            NP.html("div", { class: "cl-title", text: "کلاس" }),
            NP.html("div", { class: "cl-next" }),
          ]),
          NP.html("button", { class: "cl-refresh", title: "به‌روزرسانی", onclick: () => this.refresh(true) }),
        ]),
        NP.html("div", { class: "cl-remind", hidden: "true" }, [
          NP.html("div", { class: "cl-remind-text" }),
          NP.html("button", { class: "cl-ack", text: "چک کردم ✓", onclick: () => this.ack() }),
        ]),
        NP.html("div", { class: "cl-hw" }),
        NP.html("div", { class: "cl-list" }),
        NP.html("div", { class: "cl-foot" }, [
          NP.html("button", { class: "cl-open", onclick: () => this.openGroup() }, [
            NP.html("span", { class: "cl-open-ico" }),
            NP.html("span", { text: "باز کردن گروه در روبیکا" }),
          ]),
          NP.html("div", { class: "cl-status" }),
        ]),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => {
        if (!this.panel.hidden && !e.target.closest?.("#nplus-class-panel, #nplus-class")) this.close();
      };
      window.addEventListener("mousedown", this.onDocDown, true);
      this.render();
    },

    toggle() {
      this.panel.hidden ? this.open() : this.close();
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.button.setAttribute("open", "true");
      // you've seen them now
      this.markSeen();
      if (Date.now() - (this.lastFetch ?? 0) > 60 * 1000) this.refresh();
    },

    close() {
      this.panel.removeAttribute("open");
      this.button.removeAttribute("open");
      setTimeout(() => !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    openGroup() {
      const url = chatURL();
      const existing = gBrowser.tabs.find((t) => !t.hasAttribute("nplus-worker") && t.linkedBrowser.currentURI.spec.startsWith("https://web.rubika.ir"));
      if (existing) {
        gBrowser.selectedTab = existing;
        if (existing.linkedBrowser.currentURI.spec !== url)
          existing.linkedBrowser.loadURI(Services.io.newURI(url), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      } else {
        gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      }
      this.close();
    },

    nextClass(now = new Date()) {
      const ds = days();
      for (let i = 0; i < 8; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        if (ds.includes(d.getDay()) && !(i === 0 && now.getHours() >= 13)) return { date: d, inDays: i };
      }
      return null;
    },

    render() {
      if (!this.panel) return;
      const feed = store.get("classFeed", { items: [], title: "" });
      const done = new Set(store.get("classDone", []));
      const seen = new Set(store.get("classSeen", []));
      const q = (s) => this.panel.querySelector(s);

      q(".cl-title").textContent = feed.title || "کلاس";
      const nx = this.nextClass();
      q(".cl-next").textContent = nx
        ? `کلاس بعدی: ${DAY_FA[nx.date.getDay()]} — ${nx.inDays === 0 ? "امروز" : nx.inDays === 1 ? "فردا" : `${fa(nx.inDays)} روز دیگه`}`
        : "";

      // reminder banner
      const r = this.reminderState();
      q(".cl-remind").hidden = !r.active;
      if (r.active) q(".cl-remind-text").textContent = `فردا (${DAY_FA[r.classDay]}) کلاس داری — تکلیف‌ها رو یه چک بکن.`;
      this.button.toggleAttribute("remind", r.active);

      this.renderHomework(q(".cl-hw"));

      // messages, newest first, grouped by date
      const list = q(".cl-list");
      const items = [...feed.items].reverse();
      if (!items.length) {
        list.replaceChildren(NP.html("div", { class: "cl-empty", text: this.busy ? "در حال خوندن پیام‌ها…" : "هنوز پیامی نخوندم." }));
      } else {
        const rows = [];
        let lastDate = null;
        for (const it of items) {
          if (it.date !== lastDate) {
            lastDate = it.date;
            rows.push(NP.html("div", { class: "cl-date", text: fa(it.date) }));
          }
          rows.push(this.row(it, done.has(it.key), !seen.has(it.key)));
        }
        list.replaceChildren(...rows);
      }

      const unseen = feed.items.filter((it) => !seen.has(it.key)).length;
      const badge = this.button.querySelector(".cl-badge");
      badge.textContent = unseen ? fa(Math.min(unseen, 99)) : "";
      this.button.toggleAttribute("unread", unseen > 0);

      q(".cl-status").textContent = this.busy
        ? "در حال به‌روزرسانی…"
        : feed.fetched
          ? `آخرین بررسی: ${new Date(feed.fetched).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}`
          : "";
      this.panel.toggleAttribute("busy", !!this.busy);
    },

    // ---------- homework ----------
    // New text messages go to the assistant once: anything that is homework
    // comes back as a task with a deadline (a date, or the next class).
    renderHomework(box) {
      const hw = (store.get("classHomework", []) ?? []).filter((h) => !h.done && (!h.due || new Date(h.due) > Date.now() - 86400000));
      box.hidden = !hw.length;
      if (!hw.length) return box.replaceChildren();
      hw.sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
      box.replaceChildren(
        NP.html("div", { class: "cl-hw-title", text: `📝 تکلیف‌های باز · ${fa(hw.length)}` }),
        ...hw.map((h) => {
          const days = h.due ? Math.round((new Date(new Date(h.due).toDateString()) - new Date(new Date().toDateString())) / 86400000) : null;
          const when = days === null ? "" : days < 0 ? "گذشته" : days === 0 ? "امروز" : days === 1 ? "فردا" : `${DAY_FA[new Date(h.due).getDay()]} · ${fa(days)} روز`;
          const row = NP.html("div", { class: "cl-hw-row" }, [
            NP.html("button", { class: "cl-check", title: "انجام شد", onclick: () => this.hwDone(h.id) }),
            NP.html("div", { class: "cl-hw-task", dir: "auto", text: h.task }),
            when ? NP.html("div", { class: "cl-hw-due", text: when }) : null,
          ].filter(Boolean));
          row.toggleAttribute("soon", days !== null && days <= 1);
          return row;
        }),
      );
    },

    hwDone(id) {
      const hw = store.get("classHomework", []);
      const h = hw.find((x) => x.id === id);
      if (h) h.done = true;
      store.set("classHomework", hw);
      const t = NP.todo?.list().find((x) => x.hw === id && !x.done);
      if (t) NP.todo.toggle(t.id);
      this.render();
    },

    async extractHomework(items) {
      const texts = items.filter((i) => i.text && i.text.trim().length > 8 && !i.out);
      if (!texts.length || !NP.assistant?.ask) return;
      const today = new Date();
      const jal = today.toLocaleDateString("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const nx = this.nextClass();
      const prompt = `You read messages from a university class group (Persian). Today is ${today.toISOString().slice(0, 10)} (${jal}). Class days: ${days().map((d) => DAY_FA[d]).join(", ")}; next class: ${nx ? nx.date.toISOString().slice(0, 10) : "unknown"}.
For each message that assigns homework / an exercise / a project / something to prepare or submit, output one task. Ignore everything else.
Reply with JSON only: [{"i": message index, "task": "short Persian task (max 12 words)", "due": "YYYY-MM-DD or null (use the next class date when it says for next session)"}]

${texts.map((t, i) => `[${i}] (${t.date} ${t.time}) ${t.text.slice(0, 600)}`).join("\n")}`;
      try {
        const list = await (NP.gemini ? NP.gemini.json(prompt) : NP.assistant.ask(prompt, () => {}).then((raw) => JSON.parse(String(raw).match(/\[[\s\S]*\]/)?.[0] ?? "[]")));
        if (!list.length) return;
        const hw = store.get("classHomework", []);
        for (const t of list) {
          const src = texts[t.i];
          if (!src || !t.task || hw.some((h) => h.key === src.key && h.task === t.task)) continue;
          const h = { id: `h${Date.now().toString(36)}${hw.length}`, key: src.key, task: t.task, due: /^\d{4}-\d\d-\d\d$/.test(t.due) ? `${t.due}T12:00:00` : null, added: Date.now() };
          hw.push(h);
          // and into the to-do list, with its deadline
          NP.todo?.addItem({ title: h.task, due: h.due ? new Date(`${t.due}T00:00:00`).getTime() : null, pri: 1, tags: ["کلاس"], hw: h.id });
        }
        store.set("classHomework", hw.slice(-80));
        NP.store.data.classHomework = hw.slice(-80);
        this.render();
        NP.island?.show({ id: "class-hw", title: `${fa(list.length)} تکلیف تازه ثبت شد`, subtitle: list.map((t) => t.task).join(" · ").slice(0, 90), icon: "📝", duration: 7000, onClick: () => this.open() });
      } catch (err) {
        NP.logger?.warn(`homework: ${err}`);
      }
    },

    // the evening before a deadline (same hour as the class reminder)
    homeworkReminder(now) {
      const hour = Number(NP.prefs.get("nplus-class-remind-hour")) || 17;
      if (now.getHours() < hour) return;
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const key = tomorrow.toDateString();
      const due = store.get("classHomework", []).filter((h) => !h.done && h.due && new Date(h.due).toDateString() === key);
      if (!due.length || store.get("classHwAck") === key) return;
      store.set("classHwAck", key);
      NP.island?.show({ id: "class-hw-due", title: `مهلت فردا: ${fa(due.length)} تکلیف`, subtitle: due.map((h) => h.task).join(" · ").slice(0, 90), icon: "⏰", duration: 15000, onClick: () => this.open() });
    },

    row(it, isDone, isNew) {
      const kindLabel = { voice: `🎤 پیام صوتی ${it.dur ? fa(it.dur) : ""}`, photo: "🖼 عکس", video: "🎬 ویدیو", file: `📎 ${it.file || "فایل"}` }[it.kind];
      const check = NP.html("button", { class: "cl-check", title: "انجام شد", onclick: (e) => (e.stopPropagation(), this.toggleDone(it.key)) });
      const body = NP.html("div", { class: "cl-body" }, [
        NP.html("div", { class: "cl-meta" }, [
          NP.html("span", { class: "cl-name", text: it.out ? "شما" : it.name || "—" }),
          NP.html("span", { class: "cl-time", text: it.time ? fa(it.time) : "" }),
        ]),
      ]);
      if (kindLabel) body.append(NP.html("div", { class: "cl-kind", text: kindLabel }));
      if (it.text) body.append(NP.html("div", { class: "cl-text", dir: "auto", text: it.text }));
      const avatar = NP.html("div", { class: "cl-avatar", text: (it.name || "?").trim().slice(0, 1) });
      avatar.style.setProperty("--h", [...(it.name || "?")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
      const row = NP.html("div", { class: "cl-msg" }, [avatar, body, check]);
      row.toggleAttribute("done", isDone);
      row.toggleAttribute("new", isNew);
      row.addEventListener("click", () => this.openGroup());
      return row;
    },

    toggleDone(key) {
      const done = new Set(store.get("classDone", []));
      done.has(key) ? done.delete(key) : done.add(key);
      store.set("classDone", [...done].slice(-400));
      this.render();
    },

    markSeen() {
      const feed = store.get("classFeed", { items: [] });
      store.set("classSeen", feed.items.map((it) => it.key).slice(-400));
      setTimeout(() => this.render(), 1500);
    },

    // ---------- reminder ----------
    // Active from remind-hour on the day before a class until the class day
    // starts, unless you've acknowledged it.
    reminderState(now = new Date()) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const active =
        days().includes(tomorrow.getDay()) &&
        now.getHours() >= Number(NP.prefs.get("nplus-class-remind-hour")) &&
        store.get("classAck") !== dateKey(tomorrow);
      return { active, classDay: tomorrow.getDay(), key: dateKey(tomorrow) };
    },

    ack() {
      store.set("classAck", this.reminderState().key);
      this.render();
    },

    tick() {
      this.homeworkReminder(new Date());
      const r = this.reminderState();
      if (r.active && this.reminded !== r.key) {
        this.reminded = r.key;
        this.refresh();
        const msg = `فردا (${DAY_FA[r.classDay]}) کلاس داری — یه چک بکن.`;
        NP.island?.show({ id: "class-remind", title: "یادت نره!", subtitle: msg, icon: "📚", duration: 15000, onClick: () => this.open() });
        // a Windows notification too, in case the window is behind others
        try {
          const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
          alert.init("nplus-class", "chrome://branding/content/icon64.png", "یادآوری کلاس", msg, true);
          Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).showAlert(alert, {
            observe: (subject, topic) => topic === "alertclickcallback" && (window.focus(), this.open()),
          });
        } catch {}
      }
      this.render();
      const every = Math.max(3, Number(NP.prefs.get("nplus-class-poll-min")) || 10) * 60 * 1000;
      if (!this.busy && Date.now() - (this.lastFetch ?? 0) > every) this.refresh();
    },

    // ---------- reading Rubika ----------
    async refresh(manual = false) {
      if (this.busy) return;
      this.busy = true;
      this.lastFetch = Date.now();
      this.render();
      let tab;
      try {
        tab = gBrowser.addTab(chatURL(), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
          inBackground: true,
          skipAnimation: true,
        });
        tab.setAttribute("nplus-worker", "true");
        gBrowser.hideTab(tab);
        const browser = tab.linkedBrowser;
        browser.docShellIsActive = true;
        const result = await this.read(browser);
        if (result?.items?.length) this.ingest(result, manual);
      } catch (err) {
        NP.logger?.warn(`class board: ${err}`);
      } finally {
        if (tab && !tab.closing) gBrowser.removeTab(tab, { animate: false });
        this.busy = false;
        this.render();
      }
    },

    read(browser) {
      return new Promise((resolve) => {
        const mm = browser.messageManager;
        let last = null;
        let tries = 0;
        const on = (m) => {
          last = m.data;
        };
        mm.addMessageListener("nplus:class:read", on);
        const script = "data:," + encodeURIComponent(READER.replace("GROUP", JSON.stringify(groupId())));
        // the chat needs a moment to connect and draw; ask until it has messages
        const step = () => {
          tries++;
          if (last?.ready && last.items.length && tries > 3) return finish();
          if (tries > 24) return finish();
          try {
            browser.messageManager.loadFrameScript(script, false);
          } catch {}
          setTimeout(step, 1500);
        };
        const finish = () => {
          try {
            mm.removeMessageListener("nplus:class:read", on);
          } catch {}
          resolve(last);
        };
        setTimeout(step, 4000);
      });
    },

    ingest(result, manual) {
      const old = store.get("classFeed", { items: [] });
      const items = result.items.map((it) => ({
        ...it,
        key: [it.date, it.time, it.name, it.kind, it.text.slice(0, 80), it.dur].join("|"),
      }));
      // keep older messages we already had (the page only shows the latest)
      const keys = new Set(items.map((i) => i.key));
      const merged = [...old.items.filter((i) => !keys.has(i.key)), ...items].slice(-150);
      const firstRun = !old.fetched;
      store.set("classFeed", { title: result.title, items: merged, fetched: Date.now() });

      const seen = new Set(store.get("classSeen", []));
      if (firstRun) {
        // don't announce the whole history the first time
        store.set("classSeen", merged.map((i) => i.key));
        this.extractHomework(merged.slice(-15));
        return;
      }
      const fresh = items.filter((i) => !seen.has(i.key) && !old.items.some((o) => o.key === i.key) && !i.out);
      if (fresh.length) this.extractHomework(fresh);
      if (fresh.length) {
        const last = fresh[fresh.length - 1];
        const what = last.text || { voice: "🎤 پیام صوتی", photo: "🖼 عکس", video: "🎬 ویدیو", file: "📎 فایل" }[last.kind] || "";
        NP.island?.show({
          id: "class-new",
          title: fresh.length > 1 ? `${fa(fresh.length)} پیام جدید در کلاس` : `پیام جدید در کلاس · ${last.name}`,
          subtitle: what.replace(/\s+/g, " ").slice(0, 90),
          icon: "📚",
          duration: 8000,
          onClick: () => this.open(),
        });
      }
    },

    destroy() {
      clearInterval(this.timer);
      clearTimeout(this.first);
      try {
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.offHw?.();
      this.button?.remove();
      this.panel?.remove();
    },
  });
})();
