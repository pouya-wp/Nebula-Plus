// Nebula Plus — ask from the URL bar.
// Type a question starting with ? (or ؟) and press Enter: the answer
// streams into a glass card right under the URL bar — no new tab, no chat.
// Copy it, take it to the assistant, or search Google instead.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-askbar"] = true;

  const ASK = /^\s*[?؟]\s*(\S[\s\S]*)$/;
  const tidy = (t) =>
    String(t ?? "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`{1,3}/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "• ")
      .trim();

  NP.feature({
    name: "AskBar",
    init() {
      if (!NP.prefs.get("nplus-askbar")) return;
      this.chip = NP.html("div", { id: "nplus-askchip", hidden: "true" }, [
        NP.html("span", { class: "ab-spark", text: "✦" }),
        NP.html("span", { class: "ab-text", text: "Enter = جواب هوش مصنوعی" }),
      ]);
      document.getElementById("urlbar")?.append(this.chip);

      this.card = NP.html("div", { id: "nplus-askcard", hidden: "true" }, [
        NP.html("div", { class: "ab-q", dir: "auto" }),
        NP.html("div", { class: "ab-a", dir: "auto" }),
        NP.html("div", { class: "ab-actions" }, [
          NP.html("button", { class: "ab-btn", text: "کپی", onclick: () => this.copy() }),
          NP.html("button", { class: "ab-btn", text: "جستجو در گوگل", onclick: () => this.google() }),
          NP.html("button", { class: "ab-btn", text: "دستیار", onclick: () => (this.hide(), NP.assistant?.open()) }),
          NP.html("span", { class: "ab-sp" }),
          NP.html("button", { class: "ab-btn ab-x", text: "✕", title: "Esc", onclick: () => this.hide() }),
        ]),
      ]);
      document.body.append(this.card);

      this.onInput = () => (this.chip.hidden = !ASK.test(gURLBar.value));
      this.onKey = (e) => {
        if (e.key !== "Enter" || e.altKey || e.shiftKey) return;
        const m = gURLBar.value.match(ASK);
        if (!m) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.ask(m[1].trim());
      };
      this.onBlur = () => (this.chip.hidden = true);
      gURLBar.inputField.addEventListener("input", this.onInput);
      gURLBar.inputField.addEventListener("keydown", this.onKey, true);
      gURLBar.inputField.addEventListener("blur", this.onBlur);
      this.onDown = (e) => !this.card.hidden && !e.target.closest?.("#nplus-askcard") && this.hide();
      this.onEsc = (e) => e.key === "Escape" && !this.card.hidden && this.hide();
      window.addEventListener("mousedown", this.onDown, true);
      window.addEventListener("keydown", this.onEsc, true);
    },

    async ask(q) {
      this.q = q;
      this.answer = "";
      const id = (this.id = (this.id ?? 0) + 1);
      gURLBar.view.close();
      gURLBar.handleRevert();
      gURLBar.blur();
      this.chip.hidden = true;
      const r = document.getElementById("urlbar").getBoundingClientRect();
      this.card.style.setProperty("--ab-left", `${Math.round(r.left)}px`);
      this.card.style.setProperty("--ab-top", `${Math.round(r.top + Math.min(r.height, 60) + 8)}px`);
      this.card.style.setProperty("--ab-width", `${Math.round(Math.max(380, Math.min(r.width, 680)))}px`);
      this.card.querySelector(".ab-q").textContent = q;
      const out = this.card.querySelector(".ab-a");
      out.textContent = "";
      this.card.setAttribute("busy", "true");
      this.card.hidden = false;
      this.card.getBoundingClientRect();
      this.card.setAttribute("open", "true");
      const prompt = `Answer this directly and briefly (at most ~120 words), in the same language as the question. Plain text, short lines.\n\n${q}`;
      try {
        const a = await NP.assistant?.ask?.(prompt, (t) => id === this.id && (out.textContent = tidy(t)), { fast: true });
        if (id !== this.id) return;
        this.answer = tidy(a) || "جوابی نیومد";
        out.textContent = this.answer;
      } catch (err) {
        if (id === this.id) out.textContent = `نشد: ${err.message}`;
      } finally {
        if (id === this.id) this.card.removeAttribute("busy");
      }
    },

    copy() {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(this.answer || this.card.querySelector(".ab-a").textContent);
      NP.island?.show({ title: "کپی شد", duration: 1200 });
    },

    google() {
      openTrustedLinkIn(`https://www.google.com/search?q=${encodeURIComponent(this.q)}`, "tab");
      this.hide();
    },

    hide() {
      this.id = (this.id ?? 0) + 1;
      this.card.removeAttribute("open");
      setTimeout(() => !this.card.hasAttribute("open") && (this.card.hidden = true), 220);
    },

    destroy() {
      gURLBar.inputField?.removeEventListener("input", this.onInput);
      gURLBar.inputField?.removeEventListener("keydown", this.onKey, true);
      gURLBar.inputField?.removeEventListener("blur", this.onBlur);
      window.removeEventListener("mousedown", this.onDown, true);
      window.removeEventListener("keydown", this.onEsc, true);
      this.chip?.remove();
      this.card?.remove();
    },
  });
})();
