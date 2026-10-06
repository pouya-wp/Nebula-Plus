// Nebula Plus — clipboard history and text shortcuts.
// • Everything you copy in the browser is kept (last 100, pin the ones you
//   reuse). Ctrl+Alt+C: search it, click one to put it back on the
//   clipboard — and straight into the box you were typing in.
// • Shortcuts: type ;name then space anywhere and it expands. Built in:
//   ;تاریخ (today, Jalali) ;ساعت ;امروز — add your own in the panel
//   (your email, address, card-free signature…). «؛» works too.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-clip"] = true;

  // Content side (ASCII only; snippets arrive in messages).
  const CLIP = `(function(G){
    var ME = {}; G.__nplus_clip = ME;
    function stale() { return G.__nplus_clip !== ME; }
    var snippets = {};
    function copied(e) {
      if (stale()) return;
      var t = '';
      var a = content.document.activeElement;
      if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.selectionEnd > a.selectionStart && a.type !== 'password') t = a.value.slice(a.selectionStart, a.selectionEnd);
      else t = String(content.getSelection() || '');
      if (t.trim()) sendAsyncMessage('nplus:clip1:copied', { t: t.slice(0, 5000), url: content.location.href });
    }
    addEventListener('copy', copied, true);
    addEventListener('cut', copied, true);
    // ;name + space -> snippet
    addEventListener('keydown', function (e) {
      if (stale() || (e.key !== ' ' && e.key !== 'Enter') || e.ctrlKey || e.altKey || e.metaKey) return;
      var a = e.target; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      if (!a) return;
      var isField = /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'password';
      var before = '';
      if (isField) before = a.value.slice(Math.max(0, a.selectionStart - 40), a.selectionStart);
      else if (a.isContentEditable) { var s = content.getSelection(); if (!s.rangeCount) return; var r = s.getRangeAt(0); if (r.startContainer.nodeType !== 3) return; before = r.startContainer.data.slice(Math.max(0, r.startOffset - 40), r.startOffset); }
      else return;
      var m = before.match(/[;\\u061b]([^\\s;\\u061b]{1,30})$/);
      if (!m || !(m[1] in snippets)) return;
      var text = snippets[m[1]], len = m[0].length;
      e.preventDefault();
      if (isField) { a.setRangeText(text, a.selectionStart - len, a.selectionStart, 'end'); a.dispatchEvent(new content.Event('input', { bubbles: true })); }
      else { var sel = content.getSelection(); for (var i = 0; i < len; i++) sel.modify('extend', 'backward', 'character'); content.document.execCommand('insertText', false, text); }
    }, true);
    addMessageListener('nplus:clip1:cfg', function (m) { if (!stale()) snippets = m.data.snippets || {}; });
    addMessageListener('nplus:clip1:paste', function (m) {
      if (stale()) return;
      var a = content.document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      if (a && (a.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'password'))) { a.focus(); content.document.execCommand('insertText', false, m.data.t); }
    });
    sendAsyncMessage('nplus:clip1:hello', {});
  })(this);`;

  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "همین الان";
    if (m < 60) return `${fa(m)} دقیقه پیش`;
    const h = Math.round(m / 60);
    return h < 24 ? `${fa(h)} ساعت پیش` : `${fa(Math.round(h / 24))} روز پیش`;
  };

  NP.feature({
    name: "Clipboard",
    async init() {
      if (!NP.prefs.get("nplus-clip")) return;
      await NP.store.load();
      this.onHello = (m) => this.sendCfg(m.target.messageManager);
      this.onCopied = (m) => this.add(m.data.t);
      window.messageManager.addMessageListener("nplus:clip1:hello", this.onHello);
      window.messageManager.addMessageListener("nplus:clip1:copied", this.onCopied);
      this.script = "data:," + encodeURIComponent(CLIP);
      window.messageManager.loadFrameScript(this.script, true);
      // copies in the browser's own fields (URL bar…)
      this.onChromeCopy = (e) => {
        const f = e.target;
        if (f && (f.localName === "input" || f.localName === "textarea") && f.selectionEnd > f.selectionStart) this.add(f.value.slice(f.selectionStart, f.selectionEnd));
      };
      document.addEventListener("copy", this.onChromeCopy, true);
      this.offKey = NP.hotkey?.("ctrl+alt+c", () => (this.panel.hidden ? this.open() : this.close()));
      this.build();
      // the date/time shortcuts stay current
      this.timer = setInterval(() => this.broadcast(), 20 * 60000);
      NP.clip = { open: () => this.open() };
    },

    clips() {
      return NP.store.data.clips ?? [];
    },
    snippets() {
      return NP.store.data.snippets ?? {};
    },
    allSnippets() {
      const now = new Date();
      return {
        ...this.snippets(),
        "تاریخ": now.toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" }),
        "امروز": now.toLocaleDateString("fa-IR-u-ca-persian", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
        "ساعت": now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
        "date": now.toISOString().slice(0, 10),
      };
    },

    sendCfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:clip1:cfg", { snippets: this.allSnippets() });
      } catch {}
    },
    broadcast() {
      window.messageManager.broadcastAsyncMessage("nplus:clip1:cfg", { snippets: this.allSnippets() });
    },

    add(t) {
      t = String(t ?? "");
      if (!t.trim() || t.length > 5000) return;
      const list = this.clips().filter((c) => c.t !== t);
      list.unshift({ t, at: Date.now(), pin: this.clips().find((c) => c.t === t)?.pin });
      const pins = list.filter((c) => c.pin);
      const rest = list.filter((c) => !c.pin).slice(0, 100);
      NP.store.data.clips = [...pins, ...rest].sort((a, b) => b.at - a.at);
      clearTimeout(this.saveT);
      this.saveT = setTimeout(() => NP.store.set("clips", NP.store.data.clips), 5000);
      if (!this.panel.hidden) this.render();
    },

    // ---------- panel ----------
    build() {
      this.view = "clips";
      this.panel = NP.html("div", { id: "nplus-clip-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [NP.html("div", { class: "wt-title", text: "📋 کلیپ‌بورد" })]),
        NP.html("input", { class: "np-search", type: "text", dir: "auto", placeholder: "جستجو…" }),
        NP.html("div", { class: "np-tabs" }, [
          NP.html("button", { class: "np-chip", "data-v": "clips", text: "کپی‌ها", onclick: () => ((this.view = "clips"), this.render()) }),
          NP.html("button", { class: "np-chip", "data-v": "snips", text: "میان‌بُرها ;", onclick: () => ((this.view = "snips"), this.render()) }),
        ]),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot" }),
      ]);
      document.body.append(this.panel);
      this.search = this.panel.querySelector(".np-search");
      this.search.addEventListener("input", () => this.render());
      this.search.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.close();
        if (e.key === "Enter" && this.view === "clips") this.panel.querySelector(".wt-row")?.click();
      });
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-clip-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    open() {
      this.target = gBrowser.selectedBrowser;
      this.search.value = "";
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.search.focus();
    },
    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    render() {
      for (const c of this.panel.querySelectorAll(".np-chip")) c.toggleAttribute("selected", c.dataset.v === this.view);
      const q = this.search.value.trim().toLowerCase();
      const list = this.panel.querySelector(".wt-list");
      const foot = this.panel.querySelector(".wt-foot");
      if (this.view === "snips") {
        foot.textContent = "توی هر کادری بنویس ;اسم و فاصله بزن — مثلاً ;ایمیل";
        const sn = this.snippets();
        const keyIn = NP.html("input", { class: "td-edit cl-key", type: "text", dir: "auto", placeholder: "اسم (مثلاً ایمیل)" });
        const valIn = NP.html("textarea", { class: "td-edit cl-val", dir: "auto", placeholder: "متنی که جاش نوشته بشه" });
        const add = NP.html("button", {
          class: "wt-btn wt-primary",
          text: "افزودن",
          onclick: () => {
            const k = keyIn.value.trim().replace(/^[;؛]/, "").replace(/\s+/g, "");
            if (!k || !valIn.value) return;
            NP.store.data.snippets = { ...sn, [k]: valIn.value };
            NP.store.set("snippets", NP.store.data.snippets);
            this.broadcast();
            this.render();
          },
        });
        list.replaceChildren(
          NP.html("div", { class: "cl-new" }, [keyIn, valIn, add]),
          ...Object.entries(sn).map(([k, v]) =>
            NP.html("div", { class: "wt-row" }, [
              NP.html("div", { class: "wt-main" }, [NP.html("div", { class: "wt-name", text: `;${k}` }), NP.html("div", { class: "wt-meta cl-text", dir: "auto", text: v })]),
              NP.html("div", { class: "wt-actions" }, [
                NP.html("button", { class: "wt-icon", text: "✕", onclick: () => { const n = { ...this.snippets() }; delete n[k]; NP.store.data.snippets = n; NP.store.set("snippets", n); this.broadcast(); this.render(); } }),
              ]),
            ]),
          ),
          NP.html("div", { class: "wt-meta cl-builtin", text: "آماده: ;تاریخ ;امروز ;ساعت ;date" }),
        );
        return;
      }
      foot.textContent = "کلیک = کپی و چسباندن توی همون کادری که بودی · سنجاق = همیشه بمونه";
      const clips = this.clips().filter((c) => !q || c.t.toLowerCase().includes(q));
      if (!clips.length) return list.replaceChildren(NP.html("div", { class: "wt-empty", text: q ? "پیدا نشد." : "هنوز چیزی کپی نکردی." }));
      list.replaceChildren(
        ...clips.slice(0, 60).map((c) => {
          const row = NP.html("div", { class: "wt-row np-clickable" }, [
            NP.html("div", { class: "wt-main" }, [NP.html("div", { class: "cl-text", dir: "auto", text: c.t.length > 300 ? `${c.t.slice(0, 300)}…` : c.t }), NP.html("div", { class: "wt-meta", text: ago(c.at) })]),
            NP.html("div", { class: "wt-actions" }, [
              NP.html("button", { class: "wt-icon", title: "سنجاق", text: c.pin ? "★" : "☆", onclick: (e) => (e.stopPropagation(), (c.pin = !c.pin), NP.store.set("clips", this.clips()), this.render()) }),
              NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: (e) => (e.stopPropagation(), (NP.store.data.clips = this.clips().filter((x) => x !== c)), NP.store.set("clips", NP.store.data.clips), this.render()) }),
            ]),
          ]);
          row.toggleAttribute("pinned", !!c.pin);
          row.addEventListener("click", () => this.use(c.t));
          return row;
        }),
      );
    },

    use(t) {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(t);
      this.close();
      const b = this.target;
      if (b && /^https?:/.test(b.currentURI.spec)) {
        b.focus();
        setTimeout(() => b.messageManager.sendAsyncMessage("nplus:clip1:paste", { t }), 80);
      }
      NP.island?.show({ title: "کپی شد ✓", subtitle: t.replace(/\s+/g, " ").slice(0, 70), duration: 1500 });
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.removeMessageListener("nplus:clip1:hello", this.onHello);
        window.messageManager.removeMessageListener("nplus:clip1:copied", this.onCopied);
      } catch {}
      clearInterval(this.timer);
      document.removeEventListener("copy", this.onChromeCopy, true);
      if (NP.store.data?.clips) NP.store.set("clips", NP.store.data.clips);
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.clip;
    },
  });
})();
