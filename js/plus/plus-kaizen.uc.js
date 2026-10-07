// Nebula Plus — Kaizen: your spelling, a little better every day.
// While you type on any page (chats, forms, Gemini…):
// • English: each finished word is checked against the built-in dictionary;
//   an obvious slip (teh → the, recieve → receive) is fixed in place, a small
//   toast shows it, and Ctrl+Z puts it back.
// • Persian: Arabic ي / ك become ی / ک on the spot; other words are checked
//   in quiet batches by Gemini (orthography, not your casual style).
// Every mistake is remembered with the sentence it was in. The new tab and
// the panel (Ctrl+Alt+Q) turn them into flashcards — you see the wrong form
// crossed out and type the right one — plus your accuracy, streak and trend.
// Only single words are sent from pages; passwords, code editors and
// address-like text are never read.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-kaizen"] = true;
  NP.DEFAULTS["nplus-kaizen-autocorrect"] = true;
  NP.DEFAULTS["nplus-kaizen-fa"] = true;

  const DAY = 86400000;
  const GAPS = [0, 1, 3, 7, 16, 35, 80];
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
  const startOfDay = () => new Date(new Date().toDateString()).getTime();

  // Damerau–Levenshtein distance (a swap counts as one slip)
  function dist(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    return d[m][n];
  }

  // Content side (ASCII only): the word you just finished, and putting the fix in.
  const KAIZEN = `(function(G){
    var ME = {}; G.__nplus_kaizen = ME;
    function stale() { return G.__nplus_kaizen !== ME; }
    var on = false, seq = 0, pending = {}, toastEl = null, toastT = 0;
    var BOUNDARY = /^[ .,!?;:)\\]"'\\u060c\\u061f\\u061b]$/;
    var WORD = /([A-Za-z\\u2019']{2,}|[\\u0621-\\u063a\\u0641-\\u064a\\u067e\\u0686\\u0698\\u06a9\\u06af\\u06cc\\u200c]{2,})$/;
    function field(t) {
      var a = t; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      if (!a || !a.tagName) return null;
      if (a.closest && a.closest('.monaco-editor, .CodeMirror, .cm-editor, .ace_editor, pre, code, [spellcheck="false"]')) return null;
      if (a.tagName === 'TEXTAREA') return a;
      if (a.tagName === 'INPUT' && /^(text|search|)$/i.test(a.type || '')) return a;
      if (a.isContentEditable) return a;
      return null;
    }
    function before(a) {
      if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') return { text: a.value.slice(Math.max(0, a.selectionStart - 120), a.selectionStart), node: null, off: a.selectionStart };
      var s = content.getSelection(); if (!s || !s.rangeCount || !s.isCollapsed) return null;
      var r = s.getRangeAt(0); if (r.startContainer.nodeType !== 3) return null;
      return { text: r.startContainer.data.slice(Math.max(0, r.startOffset - 120), r.startOffset), node: r.startContainer, off: r.startOffset };
    }
    function toast(from, to) {
      var d = content.document;
      if (!toastEl) { toastEl = d.createElement('div'); toastEl.id = 'nplus-kaizen-toast'; }
      toastEl.textContent = from + '  \\u2192  ' + to;
      d.documentElement.append(toastEl);
      toastEl.removeAttribute('data-out'); void toastEl.offsetWidth; toastEl.setAttribute('data-in', '1');
      content.clearTimeout(toastT);
      toastT = content.setTimeout(function () { if (toastEl) toastEl.setAttribute('data-out', '1'); }, 1600);
    }
    addEventListener('keydown', function (e) {
      if (stale() || !on || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      if (!BOUNDARY.test(e.key) && e.key !== 'Enter') return;
      var a = field(e.target); if (!a) return;
      var b = before(a); if (!b) return;
      var m = b.text.match(WORD); if (!m) return;
      var w = m[1];
      // part of an address, an email, a #tag or @name: leave it
      var prev = b.text.charAt(b.text.length - w.length - 1);
      if (/[\\/@#._\\-\\d]/.test(prev) || /:\\/\\//.test(b.text)) return;
      var id = ++seq;
      pending[id] = { a: a, node: b.node, end: b.off, w: w };
      sendAsyncMessage('nplus:kaizen1:word', { id: id, w: w, ctx: b.text.slice(-90), host: content.location.hostname, start: b.text.length === w.length || /[.!?\\n]\\s*$/.test(b.text.slice(0, -w.length)) });
      content.setTimeout(function () { delete pending[id]; }, 3000);
    }, true);
    addMessageListener('nplus:kaizen1:cfg', function (m) { if (!stale()) on = !!m.data.on; });
    addMessageListener('nplus:kaizen1:fix', function (m) {
      var p = pending[m.data.id]; if (stale() || !p) return;
      delete pending[m.data.id];
      var a = p.a, w = p.w, fix = m.data.fix, delta = fix.length - w.length;
      try {
        if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
          if (a.value.slice(p.end - w.length, p.end) !== w) return;
          var caret = a.selectionStart;
          a.focus();
          a.setSelectionRange(p.end - w.length, p.end);
          if (!content.document.execCommand('insertText', false, fix)) a.setRangeText(fix, p.end - w.length, p.end);
          var c2 = caret >= p.end ? caret + delta : caret;
          a.setSelectionRange(c2, c2);
        } else {
          var node = p.node; if (!node || !node.isConnected || node.data.slice(p.end - w.length, p.end) !== w) return;
          var s = content.getSelection(), r0 = s.rangeCount ? s.getRangeAt(0) : null;
          var keep = r0 && r0.startContainer === node ? r0.startOffset : -1;
          var r = content.document.createRange(); r.setStart(node, p.end - w.length); r.setEnd(node, p.end);
          s.removeAllRanges(); s.addRange(r);
          content.document.execCommand('insertText', false, fix);
          if (keep >= 0 && node.isConnected) { var r2 = content.document.createRange(); var o = Math.min(node.data.length, keep >= p.end ? keep + delta : keep); r2.setStart(node, o); r2.collapse(true); s.removeAllRanges(); s.addRange(r2); }
        }
        toast(w, fix);
      } catch (e) {}
    });
    sendAsyncMessage('nplus:kaizen1:hello', {});
  })(this);`;

  const SHEET = `
    :where(#nplus-kaizen-toast) { all: revert !important; }
    #nplus-kaizen-toast { position: fixed !important; right: 18px !important; bottom: 18px !important; z-index: 2147483646 !important; display: block !important;
      padding: 7px 14px !important; border-radius: 99px !important; background: rgb(18 18 26 / 90%) !important; color: #fff !important;
      font: 700 12.5px/1.2 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; direction: ltr !important; pointer-events: none !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 12%), 0 12px 28px -12px rgb(0 0 0 / 60%), 0 0 22px -10px #8b7bff !important;
      opacity: 0 !important; translate: 0 8px !important; transition: opacity .2s ease, translate .3s cubic-bezier(.34,1.56,.64,1) !important; }
    #nplus-kaizen-toast[data-in] { opacity: 1 !important; translate: 0 0 !important; }
    #nplus-kaizen-toast[data-out] { opacity: 0 !important; translate: 0 8px !important; }
  `;

  NP.feature({
    name: "Kaizen",
    async init() {
      if (!NP.prefs.get("nplus-kaizen")) return;
      await NP.store.load();
      this.eng = Cc["@mozilla.org/spellchecker/engine;1"].getService(Ci.mozISpellCheckingEngine);
      try {
        this.eng.dictionaries = [this.eng.getDictionaryList().find((d) => /^en/i.test(d)) ?? "en-US"];
      } catch {}
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.onHello = (m) => this.cfg(m.target.messageManager);
      this.onWord = (m) => this.word(m.target, m.data);
      window.messageManager.addMessageListener("nplus:kaizen1:hello", this.onHello);
      window.messageManager.addMessageListener("nplus:kaizen1:word", this.onWord);
      this.script = "data:," + encodeURIComponent(KAIZEN);
      window.messageManager.loadFrameScript(this.script, true);
      this.offPref = NP.prefs.watch("nplus-kaizen-autocorrect", () => window.messageManager.broadcastAsyncMessage("nplus:kaizen1:cfg", { on: true }));
      this.faTimer = setInterval(() => this.checkPersian(), 20 * 60000);
      this.offKey = NP.hotkey?.("ctrl+alt+q", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
      NP.kaizen = { stats: () => this.stats(), next: () => this.next(), grade: (k, ok) => this.grade(k, ok), open: () => this.open() };
    },

    cfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:kaizen1:cfg", { on: true });
      } catch {}
    },

    data() {
      const k = (NP.store.data.kaizen ??= { mistakes: {}, days: {}, ignore: [], ok: [], faQueue: [] });
      k.mistakes ??= {};
      k.days ??= {};
      k.ignore ??= [];
      k.ok ??= [];
      k.faQueue ??= [];
      return k;
    },
    save() {
      clearTimeout(this.saveT);
      this.saveT = setTimeout(() => NP.store.set("kaizen", this.data()), 4000);
    },
    count(lang, wrong) {
      const d = this.data();
      const day = (d.days[dayKey()] ??= { en: 0, fa: 0, enBad: 0, faBad: 0 });
      day[lang]++;
      if (wrong) day[`${lang}Bad`]++;
      for (const k of Object.keys(d.days).sort().slice(0, -60)) delete d.days[k];
    },

    record(lang, wrong, right, ctx, fixed) {
      const d = this.data();
      const key = `${lang}:${wrong.toLowerCase()}`;
      const m = (d.mistakes[key] ??= { key, lang, wrong, right, n: 0, first: Date.now(), box: 0, due: Date.now(), fixed: 0 });
      m.right = right;
      m.n++;
      m.last = Date.now();
      if (fixed) m.fixed++;
      if (ctx) m.ctx = ctx.slice(-90);
      // made again: back to the start of the queue
      m.box = 0;
      m.due = Date.now();
      this.save();
      NP.emit?.("kaizen", m);
    },

    word(browser, { id, w, ctx, host, start }) {
      const persian = /[؀-ۿ]/.test(w);
      if (persian) {
        if (!NP.prefs.get("nplus-kaizen-fa")) return;
        // Arabic letters typed on a Persian text: always wrong, fix now
        const fixed = w.replace(/ي/g, "ی").replace(/ك/g, "ک");
        this.count("fa", fixed !== w);
        if (fixed !== w) {
          this.record("fa", w, fixed, ctx, true);
          browser.messageManager.sendAsyncMessage("nplus:kaizen1:fix", { id, fix: fixed });
          return;
        }
        // the rest: checked later in a batch
        const d = this.data();
        const bare = w.replace(/‌/g, "");
        if (bare.length >= 3 && !d.ok.includes(w) && !d.faQueue.some((q) => q.w === w)) {
          d.faQueue.push({ w, ctx: ctx.slice(-80) });
          if (d.faQueue.length > 120) d.faQueue.shift();
          if (d.faQueue.length >= 30) this.checkPersian();
        }
        return;
      }
      const d = this.data();
      const lower = w.toLowerCase();
      // names, acronyms and things you've said are fine
      if (/[A-Z]/.test(w.slice(1)) || (!start && /^[A-Z]/.test(w)) || d.ignore.includes(lower) || lower.length < 3) return void this.count("en", false);
      let ok = true;
      try {
        ok = this.eng.check(w);
      } catch {
        return;
      }
      this.count("en", !ok);
      if (ok) return;
      let sug = [];
      try {
        sug = this.eng.suggest(w);
      } catch {}
      const best = sug[0];
      if (!best) return void this.record("en", w, "", ctx, false);
      const d1 = dist(lower, best.toLowerCase());
      const d2 = sug[1] ? dist(lower, sug[1].toLowerCase()) : 99;
      // fix only clear slips: close to the first suggestion, clearly closer than the next
      // the same letters, just in the wrong order (teh/the, recieve/receive):
      // a typing slip for sure, even when another word is just as close
      const sameLetters = [...lower].sort().join("") === [...best.toLowerCase()].sort().join("");
      const sure = NP.prefs.get("nplus-kaizen-autocorrect") && !/\s/.test(best) && (d1 === 1 || (d1 === 2 && lower.length >= 6)) && (d1 < d2 || sameLetters);
      const right = /^[A-Z]/.test(w) ? best[0].toUpperCase() + best.slice(1) : best;
      this.record("en", w, right, ctx, sure);
      if (sure) browser.messageManager.sendAsyncMessage("nplus:kaizen1:fix", { id, fix: right });
    },

    // Persian words in quiet batches (Gemini): orthography only
    async checkPersian() {
      const d = this.data();
      if (this.faBusy || d.faQueue.length < 8 || !NP.gemini) return;
      if (!NP.gemini.hasKey() && Date.now() - (this.faLast ?? 0) < 30 * 60000) return;
      this.faBusy = true;
      this.faLast = Date.now();
      const batch = d.faQueue.splice(0, 60);
      try {
        const list = await NP.gemini.json(`These Persian words were typed by a user. Find the ones with a real SPELLING (orthography) mistake — wrong letters, wrong letter of the same sound (ث/س/ص, ز/ذ/ض/ظ, ت/ط, ح/ه, ق/غ), missing or extra letters. Do NOT flag colloquial / spoken forms (میخوام، اینجوری، دیگه), missing half-spaces, or loanwords. Reply with a JSON array of {"wrong": "...", "right": "..."} (empty array if none).\n\n${JSON.stringify(batch.map((b) => b.w))}`);
        const bad = new Map((Array.isArray(list) ? list : []).filter((x) => x?.wrong && x?.right && x.wrong !== x.right).map((x) => [x.wrong, x.right]));
        for (const b of batch) {
          if (bad.has(b.w)) {
            this.record("fa", b.w, bad.get(b.w), b.ctx, false);
            const day = d.days[dayKey()];
            if (day) day.faBad++;
          } else d.ok.push(b.w);
        }
        if (d.ok.length > 6000) d.ok.splice(0, d.ok.length - 6000);
        this.save();
        if (bad.size) NP.island?.show({ id: "kaizen", title: `Kaizen: ${fa(bad.size)} غلط املایی فارسی پیدا شد`, subtitle: [...bad].slice(0, 2).map(([a, b]) => `${a} ← ${b}`).join(" · "), duration: 6000, onClick: () => this.open() });
      } catch (err) {
        d.faQueue.unshift(...batch);
        NP.logger?.warn(`kaizen fa: ${err}`);
      } finally {
        this.faBusy = false;
      }
    },

    // ---------- learning ----------
    list() {
      return Object.values(this.data().mistakes).filter((m) => m.right);
    },
    next() {
      const now = Date.now();
      const due = this.list()
        .filter((m) => m.due <= now)
        .sort((a, b) => a.box - b.box || b.n - a.n);
      const m = due[0];
      return { left: due.length, card: m ? { key: m.key, lang: m.lang, wrong: m.wrong, right: m.right, ctx: m.ctx ?? "", n: m.n } : null };
    },
    grade(key, ok) {
      const m = this.data().mistakes[key];
      if (!m) return;
      m.box = ok ? Math.min(m.box + 1, GAPS.length - 1) : 0;
      m.due = ok ? startOfDay() + GAPS[m.box] * DAY + 4 * 3600000 : Date.now() + 10 * 60000;
      m.seen = (m.seen ?? 0) + 1;
      // learned for good: off the list
      if (m.box >= GAPS.length - 1) m.learned = true;
      this.save();
    },
    ignore(key) {
      const d = this.data();
      const m = d.mistakes[key];
      if (m) {
        if (m.lang === "en") d.ignore.push(m.wrong.toLowerCase());
        else d.ok.push(m.wrong);
        delete d.mistakes[key];
      }
      this.save();
    },
    stats() {
      const d = this.data();
      const days = [...Array(7)].map((_, i) => d.days[dayKey(Date.now() - (6 - i) * DAY)] ?? { en: 0, fa: 0, enBad: 0, faBad: 0 });
      const acc = (x) => (x.en + x.fa ? 1 - (x.enBad + x.faBad) / (x.en + x.fa) : null);
      const today = days[6];
      // streak: days in a row with typing and accuracy ≥ 95%
      let streak = 0;
      for (let i = 0; i < 60; i++) {
        const x = d.days[dayKey(Date.now() - i * DAY)];
        if (!x || x.en + x.fa < 20) {
          if (i === 0) continue;
          break;
        }
        if (acc(x) >= 0.95) streak++;
        else break;
      }
      const list = this.list();
      return {
        today: { words: today.en + today.fa, bad: today.enBad + today.faBad, acc: acc(today) },
        trend: days.map(acc),
        streak,
        total: list.length,
        due: list.filter((m) => m.due <= Date.now()).length,
        learned: list.filter((m) => m.learned).length,
        top: [...list].sort((a, b) => b.n - a.n).slice(0, 8),
      };
    },

    // ---------- panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-kaizen-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [NP.html("div", { class: "wt-title", text: "改善 Kaizen · املا" }), NP.html("div", { class: "kz-streak" })]),
        NP.html("div", { class: "kz-stats" }),
        NP.html("div", { class: "kz-card" }),
        NP.html("div", { class: "np-group", text: "بیشتر از همه اشتباه می‌نویسی" }),
        NP.html("div", { class: "wt-list kz-top" }),
        NP.html("div", { class: "wt-foot", text: "انگلیسی: غلط‌های واضح خودش درست می‌شه (Ctrl+Z برمی‌گردونه) · فارسی: ی/ک عربی فوری، بقیه با Gemini" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-kaizen-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },
    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.panel.querySelector(".kz-input")?.focus();
    },
    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },
    render() {
      const s = this.stats();
      const q = (x) => this.panel.querySelector(x);
      q(".kz-streak").textContent = s.streak ? `🔥 ${fa(s.streak)} روز پشت سر هم` : "";
      // accuracy today + a 7-day line
      const pct = (v) => (v == null ? "—" : `${fa(Math.round(v * 1000) / 10)}٪`);
      const pts = s.trend.map((v, i) => [i * 20 + 2, v == null ? null : 30 - Math.max(0, Math.min(1, (v - 0.85) / 0.15)) * 26]).filter((p) => p[1] != null);
      const spark = pts.length > 1 ? `<svg viewBox="0 0 124 34" class="kz-spark"><polyline points="${pts.map((p) => p.join(",")).join(" ")}"/></svg>` : "";
      q(".kz-stats").innerHTML = `
        <div class="kz-stat"><b>${pct(s.today.acc)}</b><span>دقت امروز</span></div>
        <div class="kz-stat"><b>${fa(s.today.bad)}</b><span>غلط از ${fa(s.today.words)} کلمه</span></div>
        <div class="kz-stat"><b>${fa(s.learned)}/${fa(s.total)}</b><span>یاد گرفتی</span></div>
        <div class="kz-stat kz-trend">${spark}<span>۷ روز اخیر</span></div>`;
      this.renderCard();
      const top = q(".kz-top");
      top.replaceChildren(
        ...(s.top.length
          ? s.top.map((m) =>
              NP.html("div", { class: "wt-row" }, [
                NP.html("div", { class: "wt-main" }, [
                  NP.html("div", { class: "kz-pair", dir: "auto" }, [NP.html("s", { text: m.wrong }), NP.html("span", { text: " → " }), NP.html("b", { text: m.right })]),
                  NP.html("div", { class: "wt-meta", text: `${fa(m.n)} بار${m.fixed ? ` · ${fa(m.fixed)} بار خودش درست کرد` : ""}${m.learned ? " · یاد گرفتی ✓" : ""}` }),
                ]),
                NP.html("div", { class: "wt-actions" }, [NP.html("button", { class: "wt-icon", title: "این غلط نیست", text: "✕", onclick: () => (this.ignore(m.key), this.render()) })]),
              ]),
            )
          : [NP.html("div", { class: "wt-empty", text: "هنوز غلطی ثبت نشده. هر جا تایپ کنی، Kaizen حواسش هست." })]),
      );
    },
    renderCard() {
      const box = this.panel.querySelector(".kz-card");
      const { card, left } = this.next();
      if (!card) return box.replaceChildren(NP.html("div", { class: "kz-done", text: "امروز همه رو مرور کردی ✓" }));
      const input = NP.html("input", { class: "kz-input", type: "text", dir: card.lang === "fa" ? "rtl" : "ltr", placeholder: "درستش رو تایپ کن…", spellcheck: "false" });
      const ctx = (card.ctx || "").replace(card.wrong, "____");
      box.replaceChildren(...[
        NP.html("div", { class: "kz-left", text: `${fa(left)} کارت` }),
        NP.html("div", { class: "kz-wrong", dir: "auto" }, [NP.html("s", { text: card.wrong })]),
        ctx ? NP.html("div", { class: "kz-ctx", dir: "auto", text: `…${ctx}` }) : null,
        input,
        NP.html("div", { class: "kz-hint" }),
      ].filter(Boolean));
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !input.value.trim()) return;
        const ok = input.value.trim().toLowerCase() === card.right.toLowerCase();
        this.grade(card.key, ok);
        box.setAttribute("data-result", ok ? "ok" : "bad");
        box.querySelector(".kz-hint").textContent = ok ? `آفرین ✓ ${card.right}` : `درستش: ${card.right}`;
        setTimeout(() => (box.removeAttribute("data-result"), this.render(), this.panel.querySelector(".kz-input")?.focus()), ok ? 700 : 1600);
      });
    },

    destroy() {
      clearInterval(this.faTimer);
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:kaizen1:cfg", { on: false });
        window.messageManager.removeMessageListener("nplus:kaizen1:hello", this.onHello);
        window.messageManager.removeMessageListener("nplus:kaizen1:word", this.onWord);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
      if (NP.store.data?.kaizen) NP.store.set("kaizen", NP.store.data.kaizen);
      this.offPref?.();
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.kaizen;
    },
  });
})();
