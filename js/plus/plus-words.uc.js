// Nebula Plus — word catcher.
// Select an English word or phrase anywhere and press «لغت» in the
// selection bubble: it goes into your deck with the sentence you met it in,
// its Persian meaning and an example (from the assistant). Reviewing is a
// flashcard on the new tab (and Ctrl+Alt+V / the palette anywhere): know it
// and it comes back later and later (1, 3, 7, 16, 35 days); miss it and it
// comes back tomorrow.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-words"] = true;

  const DAY = 86400000;
  const GAPS = [0, 1, 3, 7, 16, 35, 80];
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const startOfDay = (t = Date.now()) => new Date(new Date(t).toDateString()).getTime();

  function sentenceOf(ctx, word) {
    const parts = String(ctx || "").split(/(?<=[.!?؟])\s+/);
    const w = word.toLowerCase();
    return (parts.find((p) => p.toLowerCase().includes(w)) || "").trim().slice(0, 280);
  }

  NP.feature({
    name: "WordCatcher",
    async init() {
      if (!NP.prefs.get("nplus-words")) return;
      NP.words = {
        add: (w, ctx, url) => this.add(w, ctx, url),
        due: () => this.due(),
        grade: (w, ok) => this.grade(w, ok),
        list: () => this.deck(),
        open: () => this.open(),
        stats: () => this.stats(),
      };
      await NP.store.load();
      this.offKey = NP.hotkey?.("ctrl+alt+v", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
    },

    deck() {
      return NP.store.data.words ?? [];
    },
    save(deck) {
      NP.store.data.words = deck;
      NP.store.set("words", deck);
      NP.emit?.("words-changed");
    },

    due() {
      const now = Date.now();
      return this.deck()
        .filter((w) => w.due <= now)
        .sort((a, b) => a.box - b.box || a.due - b.due);
    },

    stats() {
      const d = this.deck();
      return { total: d.length, due: this.due().length, learned: d.filter((w) => w.box >= 4).length };
    },

    async add(text, ctx, url) {
      const w = String(text || "").trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      if (!w || !/^[A-Za-z][A-Za-z' -]{0,40}$/.test(w) || w.split(/\s+/).length > 4) {
        NP.island?.show({ title: "فقط کلمه یا عبارت کوتاه انگلیسی", subtitle: "حداکثر ۴ کلمه", duration: 2000 });
        return;
      }
      const deck = this.deck();
      const key = w.toLowerCase();
      let item = deck.find((x) => x.key === key);
      if (item) {
        NP.island?.show({ title: `«${w}» از قبل توی دفترته`, subtitle: item.fa || "", icon: "📘", duration: 2200 });
        return;
      }
      item = { key, w, ctx: sentenceOf(ctx, w), url, added: Date.now(), box: 0, due: Date.now(), fa: "", ex: "", pos: "" };
      deck.push(item);
      this.save(deck);
      NP.island?.show({ id: "word", title: `«${w}» رفت توی دفتر لغت`, subtitle: "دارم معنیش رو پیدا می‌کنم…", icon: "📘", duration: 2500 });
      try {
        const prompt = `For the English ${w.includes(" ") ? "phrase" : "word"} "${w}"${item.ctx ? ` as used in: "${item.ctx}"` : ""}, reply with JSON only: {"fa": "short Persian meaning for this sense (max 6 words)", "pos": "part of speech in Persian (اسم/فعل/صفت/قید/عبارت)", "ipa": "IPA", "ex": "one short, simple English example sentence"}`;
        const raw = await NP.assistant?.ask?.(prompt, () => {}, { fast: true });
        const j = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] ?? "{}");
        const cur = this.deck().find((x) => x.key === key);
        if (cur) {
          Object.assign(cur, { fa: j.fa || "", pos: j.pos || "", ipa: j.ipa || "", ex: j.ex || "" });
          this.save(this.deck());
          NP.island?.show({ id: "word", title: `${w} — ${cur.fa}`, subtitle: cur.ex || "", icon: "📘", duration: 3500 });
        }
      } catch (err) {
        NP.logger?.warn(`word meaning: ${err}`);
      }
      if (!this.panel.hidden) this.render();
    },

    grade(key, ok) {
      const deck = this.deck();
      const w = deck.find((x) => x.key === key);
      if (!w) return;
      w.box = ok ? Math.min(w.box + 1, GAPS.length - 1) : 0;
      w.due = ok ? startOfDay() + GAPS[w.box] * DAY + 4 * 3600000 : Date.now() + 10 * 60000;
      w.seen = (w.seen ?? 0) + 1;
      this.save(deck);
    },

    // ---------- review panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-words-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "📘 دفتر لغت" }),
          NP.html("div", { class: "wd-stats" }),
        ]),
        NP.html("div", { class: "np-tabs" }, [
          NP.html("button", { class: "np-chip", "data-tab": "review", text: "مرور", onclick: () => this.tab("review") }),
          NP.html("button", { class: "np-chip", "data-tab": "all", text: "همه‌ی لغت‌ها", onclick: () => this.tab("all") }),
        ]),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "روی هر سایتی یه کلمه‌ی انگلیسی رو انتخاب کن ← «لغت»" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-words-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
      this.view = "review";
    },

    open() {
      this.flipped = false;
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
      this.flipped = false;
      this.render();
    },

    render() {
      const s = this.stats();
      this.panel.querySelector(".wd-stats").textContent = `${fa(s.total)} لغت · ${fa(s.learned)} یاد گرفتی`;
      for (const c of this.panel.querySelectorAll(".np-chip")) c.toggleAttribute("selected", c.dataset.tab === this.view);
      const list = this.panel.querySelector(".wt-list");
      if (this.view === "all") {
        const deck = [...this.deck()].sort((a, b) => b.added - a.added);
        list.replaceChildren(
          ...(deck.length
            ? deck.map((w) =>
                NP.html("div", { class: "wt-row" }, [
                  NP.html("div", { class: "wt-main" }, [
                    NP.html("div", { class: "wt-name", dir: "ltr", text: w.w }),
                    NP.html("div", { class: "wt-value", text: w.fa || "…" }),
                    NP.html("div", { class: "wt-meta", text: `جعبه‌ی ${fa(w.box)} از ${fa(GAPS.length - 1)}` }),
                  ]),
                  NP.html("div", { class: "wt-actions" }, [
                    NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: () => (this.save(this.deck().filter((x) => x.key !== w.key)), this.render()) }),
                  ]),
                ]),
              )
            : [NP.html("div", { class: "wt-empty", text: "دفترت هنوز خالیه." })]),
        );
        return;
      }
      const due = this.due();
      if (!due.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: s.total ? "امروز همه رو مرور کردی ✓" : "دفترت هنوز خالیه. روی یه کلمه‌ی انگلیسی «لغت» رو بزن." }));
        return;
      }
      const w = due[0];
      const card = NP.html("div", { class: "wd-card" }, [
        NP.html("div", { class: "wd-word", dir: "ltr", text: w.w }),
        w.ipa ? NP.html("div", { class: "wd-ipa", dir: "ltr", text: w.ipa }) : null,
        this.flipped
          ? NP.html("div", { class: "wd-back" }, [
              NP.html("div", { class: "wd-fa", text: `${w.fa || "—"}${w.pos ? `  ·  ${w.pos}` : ""}` }),
              w.ctx ? NP.html("div", { class: "wd-ctx", dir: "ltr", text: w.ctx }) : null,
              w.ex ? NP.html("div", { class: "wd-ex", dir: "ltr", text: w.ex }) : null,
            ].filter(Boolean))
          : NP.html("div", { class: "wd-hint", text: "یادته یعنی چی؟ کلیک کن تا ببینی" }),
      ].filter(Boolean));
      card.addEventListener("click", () => ((this.flipped = !this.flipped), this.render()));
      const actions = this.flipped
        ? NP.html("div", { class: "wd-actions" }, [
            NP.html("button", { class: "wt-btn", text: "یادم نبود", onclick: () => this.answer(w, false) }),
            NP.html("button", { class: "wt-btn wt-primary", text: "بلد بودم ✓", onclick: () => this.answer(w, true) }),
          ])
        : NP.html("div", { class: "wd-left", text: `${fa(due.length)} لغت برای مرور` });
      list.replaceChildren(card, actions);
    },

    answer(w, ok) {
      this.grade(w.key, ok);
      this.flipped = false;
      this.render();
    },

    destroy() {
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.words;
    },
  });
})();
