// Nebula Plus — to-do list.
// Type a task the way you'd say it and it understands:
//   «خرید نون فردا ساعت ۱۸ !! #خونه»   → tomorrow 18:00, high priority, tag خونه
//   «ورزش هر روز ۷:۳۰»                 → repeats daily (ticking it makes the next one)
//   «تمرین فیزیک شنبه !»               → next Saturday, priority
// Tasks with a time remind you on the island and as a Windows notification.
// Lives in the browser: the panel (Ctrl+Alt+T, palette) and the new tab
// card are the same list. Steps (subtasks), tags, filters, overdue.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-todo"] = true;

  const FA_DAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const en = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const dayStart = (t) => new Date(new Date(t).toDateString()).getTime();
  const DAY = 86400000;
  const dayIndex = (w) => FA_DAYS.findIndex((x) => x.replace(/[‌\s]/g, "") === w.replace(/[‌\s]/g, ""));

  // ---------- understanding a typed task ----------
  function parse(raw) {
    let s = " " + en(raw).replace(/‌/g, " ").replace(/\s+/g, " ") + " ";
    const out = { pri: 0, tags: [], due: null, time: false, repeat: null };
    const take = (re, fn) => {
      s = s.replace(re, (...m) => (fn(...m), " "));
    };
    take(/\s(!{1,3})(?=\s)/, (_, b) => (out.pri = b.length));
    take(/\s!?(فوری|خیلی مهم)(?=\s)/, () => (out.pri = 3));
    take(/\s!?(مهم)(?=\s)/, () => (out.pri = Math.max(out.pri, 2)));
    take(/\s#([^\s#]+)/g, (_, t) => out.tags.push(t));
    // repeat
    take(/\sهر\s?روز(?=\s)|\severy\s?day(?=\s)|\sdaily(?=\s)/i, () => (out.repeat = "day"));
    take(/\sهر\s?هفته(?=\s)|\sweekly(?=\s)/i, () => (out.repeat = "week"));
    take(/\sهر\s(شنبه|یکشنبه|دوشنبه|سه ?شنبه|چهارشنبه|پنج ?شنبه|جمعه)(?=\s)/, (_, d) => {
      out.repeat = "week";
      out.weekday = dayIndex(d);
    });
    // day
    const now = new Date();
    let day = null;
    take(/\s(امروز|today)(?=\s)/i, () => (day = dayStart(now)));
    take(/\s(پس ?فردا)(?=\s)/, () => (day = dayStart(now) + 2 * DAY));
    take(/\s(فردا|tomorrow)(?=\s)/i, () => (day = dayStart(now) + DAY));
    take(/\s(امشب|tonight)(?=\s)/i, () => {
      day = dayStart(now);
      if (!out.hh) (out.hh = 21), (out.mm = 0);
    });
    take(/\s(شنبه|یکشنبه|دوشنبه|سه ?شنبه|چهارشنبه|پنج ?شنبه|جمعه)(?=\s)/, (_, d) => {
      const want = dayIndex(d);
      let add = (want - now.getDay() + 7) % 7 || 7;
      day = dayStart(now) + add * DAY;
    });
    take(/\s(\d+)\s?روز\s?دیگه(?=\s)|\sin\s(\d+)\sdays?(?=\s)/i, (_, a, b) => (day = dayStart(now) + Number(a ?? b) * DAY));
    if (out.weekday >= 0 && day === null) {
      const add = (out.weekday - now.getDay() + 7) % 7;
      day = dayStart(now) + add * DAY;
    }
    // time: «ساعت ۱۸» «۱۸:۳۰» «7:30» «ساعت ۵ عصر»
    take(/\s(?:ساعت\s?)(\d{1,2})(?::(\d{2}))?(\s?(صبح|ظهر|عصر|شب|بعدازظهر))?(?=\s)|\s(\d{1,2}):(\d{2})(\s?(صبح|ظهر|عصر|شب))?(?=\s)/, (_, h1, m1, __, p1, h2, m2, ___, p2) => {
      let h = Number(h1 ?? h2);
      const m = Number(m1 ?? m2 ?? 0);
      const part = p1 ?? p2;
      if ((part === "عصر" || part === "شب" || part === "بعدازظهر") && h < 12) h += 12;
      if (part === "ظهر" && h < 6) h += 12;
      if (h < 24 && m < 60) (out.hh = h), (out.mm = m);
    });
    if (out.hh !== undefined) {
      out.time = true;
      if (day === null) {
        day = dayStart(now);
        if (now.getHours() * 60 + now.getMinutes() > out.hh * 60 + out.mm) day += DAY;
      }
      out.due = day + (out.hh * 60 + out.mm) * 60000;
    } else if (day !== null) out.due = day;
    else if (out.repeat === "day") out.due = dayStart(now);
    delete out.hh;
    delete out.mm;
    out.title = s.replace(/\s+/g, " ").trim();
    return out;
  }

  function whenText(t) {
    if (!t.due) return "";
    const d = new Date(t.due);
    const days = Math.round((dayStart(t.due) - dayStart(Date.now())) / DAY);
    const dayLabel = days === 0 ? "امروز" : days === 1 ? "فردا" : days === -1 ? "دیروز" : days > 1 && days < 7 ? FA_DAYS[d.getDay()] : d.toLocaleDateString("fa-IR-u-ca-persian", { day: "numeric", month: "long" });
    const time = t.time ? ` ${fa(String(d.getHours()).padStart(2, "0"))}:${fa(String(d.getMinutes()).padStart(2, "0"))}` : "";
    return dayLabel + time;
  }

  function state(t) {
    if (t.done) return "done";
    if (!t.due) return "someday";
    const end = t.time ? t.due : t.due + DAY;
    if (end < Date.now()) return "overdue";
    if (dayStart(t.due) === dayStart(Date.now())) return "today";
    return "later";
  }

  NP.feature({
    name: "Todo",
    async init() {
      if (!NP.prefs.get("nplus-todo")) return;
      NP.todo = {
        list: () => this.list(),
        add: (text) => this.add(text),
        toggle: (id) => this.toggle(id),
        remove: (id) => this.remove(id),
        update: (id, patch) => this.update(id, patch),
        parse,
        whenText,
        state,
        open: () => this.open(),
        view: () => this.view(),
      };
      await NP.store.load();
      this.offKey = NP.hotkey?.("ctrl+alt+t", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
      this.timer = setInterval(() => this.remind(), 30000);
      setTimeout(() => this.remind(), 8000);
    },

    list() {
      return NP.store.data.todos ?? [];
    },
    save(list) {
      NP.store.data.todos = list;
      NP.store.set("todos", list);
      if (!this.panel.hidden) this.render();
      NP.emit?.("todos-changed");
    },

    add(text) {
      const p = parse(text);
      if (!p.title) return null;
      const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...p, done: false, created: Date.now(), steps: [] };
      this.save([...this.list(), t]);
      return t;
    },

    toggle(id) {
      const list = this.list();
      const t = list.find((x) => x.id === id);
      if (!t) return;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      // a repeating task: ticking it schedules the next one
      if (t.done && t.repeat && t.due) {
        const step = t.repeat === "day" ? DAY : 7 * DAY;
        let next = t.due + step;
        while (next < Date.now() - (t.time ? 0 : DAY)) next += step;
        list.push({ ...t, id: `t${Date.now().toString(36)}r`, done: false, doneAt: null, due: next, reminded: false, steps: (t.steps ?? []).map((s) => ({ ...s, done: false })), created: Date.now() });
      }
      this.save(list);
    },

    remove(id) {
      this.save(this.list().filter((x) => x.id !== id));
    },

    update(id, patch) {
      const list = this.list();
      const t = list.find((x) => x.id === id);
      if (!t) return;
      if (typeof patch.text === "string") {
        const p = parse(patch.text);
        Object.assign(t, { title: p.title || t.title, pri: p.pri || t.pri, tags: p.tags.length ? p.tags : t.tags, due: p.due ?? t.due, time: p.due ? p.time : t.time, repeat: p.repeat ?? t.repeat, reminded: p.due ? false : t.reminded });
        delete patch.text;
      }
      Object.assign(t, patch);
      this.save(list);
    },

    // sorted for showing: overdue, today (by time), later, someday; done last
    view() {
      const rank = { overdue: 0, today: 1, later: 2, someday: 3, done: 4 };
      return [...this.list()].sort((a, b) => rank[state(a)] - rank[state(b)] || (a.due ?? 9e15) - (b.due ?? 9e15) || b.pri - a.pri || a.created - b.created);
    },

    remind() {
      const now = Date.now();
      let changed = false;
      for (const t of this.list()) {
        if (t.done || !t.time || !t.due || t.reminded || t.due > now + 30000) continue;
        t.reminded = true;
        changed = true;
        if (now - t.due > 6 * 3600000) continue; // missed long ago (computer was off)
        NP.island?.show({ id: `todo-${t.id}`, title: t.title, subtitle: `یادآوری · ${whenText(t)}`, icon: "✅", duration: 20000, onClick: () => this.open() });
        try {
          const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
          alert.init(`nplus-todo-${t.id}`, "chrome://branding/content/icon64.png", "یادآوری کار", t.title, true);
          Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService).showAlert(alert, {
            observe: (s, topic) => topic === "alertclickcallback" && (window.focus(), this.open()),
          });
        } catch {}
      }
      if (changed) this.save(this.list());
    },

    // ---------- panel ----------
    build() {
      this.filter = "active";
      this.panel = NP.html("div", { id: "nplus-todo-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "td-ring" }, [NP.html("span")]),
          NP.html("div", { class: "wt-title", text: "کارها" }),
          NP.html("div", { class: "td-count" }),
        ]),
        NP.html("div", { class: "td-add" }, [
          NP.html("label", { class: "td-field" }, [
            NP.html("span", { class: "td-plus", text: "+" }),
            NP.html("input", { class: "td-input", type: "text", dir: "auto", placeholder: "کار جدید…  مثلاً «خرید نون فردا ساعت ۱۸ !! #خونه»" }),
            NP.html("kbd", { class: "td-enter", text: "Enter ↵" }),
          ]),
          NP.html("div", { class: "td-preview" }),
        ]),
        NP.html("div", { class: "np-tabs" }, [
          ["active", "باز"],
          ["today", "امروز"],
          ["later", "آینده"],
          ["done", "انجام‌شده"],
        ].map(([id, label]) => NP.html("button", { class: "np-chip", "data-f": id, text: label, onclick: () => ((this.filter = id), this.render()) }))),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "امروز / فردا / شنبه · ساعت ۱۸ یا ۷:۳۰ · ! !! !!! اولویت · #برچسب · هر روز / هر هفته" }),
      ]);
      document.body.append(this.panel);
      const input = this.panel.querySelector(".td-input");
      input.addEventListener("input", () => this.preview(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          this.add(input.value);
          input.value = "";
          this.preview("");
        } else if (e.key === "Escape") this.close();
      });
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-todo-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    preview(text) {
      const box = this.panel.querySelector(".td-preview");
      if (!text.trim()) return box.replaceChildren();
      const p = parse(text);
      const bits = [];
      if (p.due) bits.push(whenText(p));
      if (p.repeat) bits.push(p.repeat === "day" ? "🔁 هر روز" : "🔁 هر هفته");
      if (p.pri) bits.push(["", "! اولویت", "!! مهم", "!!! فوری"][p.pri]);
      for (const tg of p.tags) bits.push(`#${tg}`);
      box.replaceChildren(...bits.map((b) => NP.html("span", { class: "td-chip", text: b })));
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.panel.querySelector(".td-input").focus();
    },

    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    render() {
      const all = this.view();
      const open = all.filter((t) => !t.done);
      const doneToday = all.filter((t) => t.done && t.doneAt && dayStart(t.doneAt) === dayStart(Date.now())).length;
      const todayTotal = open.filter((t) => ["today", "overdue"].includes(state(t))).length + doneToday;
      const pct = todayTotal ? doneToday / todayTotal : 0;
      this.panel.querySelector(".td-ring").style.setProperty("--p", pct);
      this.panel.querySelector(".td-ring span").textContent = todayTotal ? fa(Math.round(pct * 100)) : "✓";
      this.panel.querySelector(".td-count").textContent = `${fa(open.length)} کار باز${doneToday ? ` · ${fa(doneToday)} امروز تموم شد` : ""}`;
      for (const c of this.panel.querySelectorAll(".np-chip")) c.toggleAttribute("selected", c.dataset.f === this.filter);
      const f = this.filter;
      const rows = all.filter((t) => {
        const s = state(t);
        if (f === "done") return s === "done";
        if (f === "today") return s === "today" || s === "overdue";
        if (f === "later") return s === "later" || s === "someday";
        return s !== "done";
      });
      const list = this.panel.querySelector(".wt-list");
      if (!rows.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: f === "done" ? "هنوز چیزی تیک نخورده." : "هیچ کار بازی نداری ✨" }));
        return;
      }
      list.replaceChildren(...rows.slice(0, 120).map((t) => this.row(t)));
    },

    row(t) {
      const s = state(t);
      const steps = t.steps ?? [];
      const doneSteps = steps.filter((x) => x.done).length;
      const check = NP.html("button", { class: "td-check", title: "انجام شد", onclick: (e) => (e.stopPropagation(), this.toggle(t.id)) });
      const title = NP.html("div", { class: "td-title", dir: "auto", text: t.title });
      const meta = NP.html("div", { class: "td-meta" }, [
        t.due ? NP.html("span", { class: `td-when td-${s}`, text: `${s === "overdue" ? "⚠ " : ""}${whenText(t)}` }) : null,
        t.repeat ? NP.html("span", { class: "td-tag", text: "🔁" }) : null,
        steps.length ? NP.html("span", { class: "td-tag", text: `${fa(doneSteps)}/${fa(steps.length)}` }) : null,
        ...(t.tags ?? []).map((tg) => NP.html("span", { class: "td-tag", text: `#${tg}` })),
      ].filter(Boolean));
      const main = NP.html("div", { class: "wt-main" }, [title, meta]);
      const actions = NP.html("div", { class: "wt-actions" }, [
        NP.html("button", { class: "wt-icon", title: "اولویت", text: ["☆", "!", "!!", "!!!"][t.pri ?? 0], onclick: (e) => (e.stopPropagation(), this.update(t.id, { pri: ((t.pri ?? 0) + 1) % 4 })) }),
        NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: (e) => (e.stopPropagation(), this.remove(t.id)) }),
      ]);
      const row = NP.html("div", { class: "wt-row td-row-p" }, [check, main, actions]);
      row.dataset.pri = t.pri ?? 0;
      row.toggleAttribute("done", !!t.done);
      row.toggleAttribute("expanded", this.expanded === t.id);
      main.addEventListener("click", () => ((this.expanded = this.expanded === t.id ? null : t.id), this.render()));
      title.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const inp = NP.html("input", { class: "td-edit", type: "text", dir: "auto" });
        inp.value = t.title;
        title.replaceWith(inp);
        inp.focus();
        inp.select();
        const done = (save) => (save && inp.value.trim() ? this.update(t.id, { text: inp.value }) : this.render());
        inp.addEventListener("keydown", (ev) => (ev.key === "Enter" ? done(true) : ev.key === "Escape" ? done(false) : null));
        inp.addEventListener("blur", () => done(true));
      });
      if (this.expanded !== t.id) return row;
      // steps
      const box = NP.html("div", { class: "td-steps" }, [
        ...steps.map((st, i) => {
          const r = NP.html("div", { class: "td-step" }, [
            NP.html("button", { class: "td-check td-small", onclick: () => ((steps[i].done = !steps[i].done), this.update(t.id, { steps })) }),
            NP.html("span", { dir: "auto", text: st.text }),
            NP.html("button", { class: "wt-icon", text: "✕", onclick: () => (steps.splice(i, 1), this.update(t.id, { steps })) }),
          ]);
          r.toggleAttribute("done", !!st.done);
          return r;
        }),
        (() => {
          const inp = NP.html("input", { class: "td-edit td-step-input", type: "text", dir: "auto", placeholder: "+ یه قدم کوچیک‌تر (Enter)" });
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && inp.value.trim()) {
              this.expanded = t.id;
              this.update(t.id, { steps: [...steps, { text: inp.value.trim(), done: false }] });
              setTimeout(() => this.panel.querySelector(".td-step-input")?.focus(), 0);
            }
          });
          return inp;
        })(),
      ]);
      return NP.html("div", { class: "td-wrap" }, [row, box]);
    },

    destroy() {
      clearInterval(this.timer);
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.todo;
    },
  });
})();
