// Nebula Plus — smart screenshot.
// Ctrl+Alt+S (or the palette): drag over any part of the page. Then:
// read the text in it (Persian or English, also from images and videos),
// explain it, copy the picture, save it, or send the text to your phone.
// Reading uses the OpenAI key (vision); the picture never leaves otherwise.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-snap"] = true;

  const tidy = (t) =>
    String(t ?? "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .trim();

  NP.feature({
    name: "SmartSnap",
    init() {
      if (!NP.prefs.get("nplus-snap")) return;
      this.offKey = NP.hotkey?.("ctrl+alt+s", () => this.start());
      NP.snap = { start: () => this.start() };
    },

    start() {
      if (this.layer) return;
      const browser = gBrowser.selectedBrowser;
      const box = browser.getBoundingClientRect();
      this.browser = browser;
      this.layer = NP.html("div", { id: "nplus-snap-layer" }, [
        NP.html("div", { class: "sn-sel", hidden: "true" }),
        NP.html("div", { class: "sn-hint", text: "یه قسمت رو بکش و انتخاب کن · Esc برای لغو" }),
      ]);
      for (const [k, v] of Object.entries({ left: box.left, top: box.top, width: box.width, height: box.height })) this.layer.style.setProperty(`--sn-${k}`, `${v}px`);
      document.body.append(this.layer);
      const sel = this.layer.querySelector(".sn-sel");
      let from = null;
      const local = (e) => ({ x: Math.min(Math.max(0, e.clientX - box.left), box.width), y: Math.min(Math.max(0, e.clientY - box.top), box.height) });
      this.layer.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        from = local(e);
        sel.hidden = false;
        this.layer.setAttribute("dragging", "true");
      });
      this.layer.addEventListener("mousemove", (e) => {
        if (!from) return;
        const p = local(e);
        this.rect = { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) };
        for (const [k, v] of Object.entries({ x: this.rect.x, y: this.rect.y, w: this.rect.w, h: this.rect.h })) sel.style.setProperty(`--sn-${k}`, `${v}px`);
      });
      this.layer.addEventListener("mouseup", () => {
        if (!from) return;
        from = null;
        if (!this.rect || this.rect.w < 8 || this.rect.h < 8) return this.cancel();
        this.capture();
      });
      this.onKey = (e) => e.key === "Escape" && this.cancel();
      window.addEventListener("keydown", this.onKey, true);
    },

    cancel() {
      window.removeEventListener("keydown", this.onKey, true);
      this.layer?.remove();
      this.layer = null;
      this.rect = null;
    },

    async capture() {
      const r = this.rect;
      const browser = this.browser;
      this.cancel();
      try {
        const wg = browser.browsingContext.currentWindowGlobal;
        const scale = Math.min(2, window.devicePixelRatio || 1);
        const bmp = await wg.drawSnapshot(new DOMRect(r.x, r.y, r.w, r.h), scale, "white");
        const c = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d").drawImage(bmp, 0, 0);
        this.canvas = c;
        this.dataURL = c.toDataURL("image/png");
        this.showCard();
      } catch (err) {
        NP.island?.show({ title: "عکس گرفته نشد", subtitle: String(err.message || err).slice(0, 80), duration: 2500 });
      }
    },

    showCard() {
      this.card?.remove();
      const hasKey = !!String(NP.prefs.get("nplus-openai-key") ?? "").trim();
      this.card = NP.html("div", { id: "nplus-snap-card" }, [
        NP.html("div", { class: "sn-top" }, [
          NP.html("img", { class: "sn-img", src: this.dataURL }),
          NP.html("div", { class: "sn-actions" }, [
            hasKey ? NP.html("button", { class: "sn-btn sn-primary", text: "متنش رو بخون", onclick: () => this.ask("ocr") }) : null,
            hasKey ? NP.html("button", { class: "sn-btn", text: "توضیح بده", onclick: () => this.ask("explain") }) : null,
            NP.html("button", { class: "sn-btn", text: "کپی عکس", onclick: () => this.copyImage() }),
            NP.html("button", { class: "sn-btn", text: "ذخیره", onclick: () => this.save() }),
            NP.html("button", { class: "sn-btn sn-x", text: "✕", onclick: () => this.close() }),
          ].filter(Boolean)),
        ]),
        NP.html("div", { class: "sn-out", dir: "auto", hidden: "true" }),
        NP.html("div", { class: "sn-out-actions", hidden: "true" }, [
          NP.html("button", { class: "sn-btn", text: "کپی متن", onclick: () => this.copyText() }),
          NP.wormhole ? NP.html("button", { class: "sn-btn", text: "بفرست به گوشی", onclick: () => NP.wormhole.send(this.text) }) : null,
        ].filter(Boolean)),
      ]);
      document.body.append(this.card);
      this.card.getBoundingClientRect();
      this.card.setAttribute("open", "true");
      this.onDown = (e) => this.card && !e.target.closest?.("#nplus-snap-card") && this.close();
      setTimeout(() => window.addEventListener("mousedown", this.onDown, true), 0);
      this.onEsc = (e) => e.key === "Escape" && this.close();
      window.addEventListener("keydown", this.onEsc, true);
    },

    close() {
      window.removeEventListener("mousedown", this.onDown, true);
      window.removeEventListener("keydown", this.onEsc, true);
      const c = this.card;
      this.card = null;
      c?.removeAttribute("open");
      setTimeout(() => c?.remove(), 250);
    },

    async ask(kind) {
      const out = this.card.querySelector(".sn-out");
      out.hidden = false;
      out.textContent = kind === "ocr" ? "دارم می‌خونمش…" : "دارم نگاه می‌کنم…";
      this.card.setAttribute("busy", "true");
      const prompt =
        kind === "ocr"
          ? "Transcribe all the text in this image exactly, keeping line breaks and the original language(s). Output only the text."
          : "In Persian (Farsi), explain briefly and simply what this image shows / means (3-5 sentences). If it has code, a chart or a formula, explain that.";
      try {
        const key = NP.prefs.get("nplus-openai-key").trim();
        const model = NP.prefs.get("nplus-openai-models").split(",")[0].trim() || "gpt-5-mini";
        const body = {
          model,
          messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: this.dataURL } }] }],
        };
        if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = "low";
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
        const data = await res.json();
        this.text = tidy(data.choices?.[0]?.message?.content) || "چیزی پیدا نشد";
      } catch (err) {
        this.text = `نشد: ${err.message}`;
      }
      if (!this.card) return;
      this.card.removeAttribute("busy");
      out.textContent = this.text;
      this.card.querySelector(".sn-out-actions").hidden = false;
    },

    copyText() {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(this.text || "");
      NP.island?.show({ title: "متن کپی شد", duration: 1200 });
    },

    async copyImage() {
      try {
        const blob = await new Promise((r) => this.canvas.toBlob(r, "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        NP.island?.show({ title: "عکس کپی شد", duration: 1200 });
      } catch (err) {
        NP.island?.show({ title: "کپی نشد", subtitle: String(err.message || err).slice(0, 60), duration: 2000 });
      }
    },

    async save() {
      try {
        const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
        const dir = PathUtils.join(await Downloads.getPreferredDownloadsDirectory(), "تصویر");
        await IOUtils.makeDirectory(dir, { ignoreExisting: true });
        const d = new Date();
        const name = `Nebula ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}.${String(d.getSeconds()).padStart(2, "0")}.png`;
        const blob = await new Promise((r) => this.canvas.toBlob(r, "image/png"));
        const path = PathUtils.join(dir, name);
        await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        file.initWithPath(path);
        NP.island?.show({ title: "ذخیره شد", subtitle: `Downloads › تصویر › ${name}`, icon: "📸", duration: 3000, onClick: () => file.reveal() });
      } catch (err) {
        NP.island?.show({ title: "ذخیره نشد", subtitle: String(err.message || err).slice(0, 60), duration: 2000 });
      }
    },

    destroy() {
      this.offKey?.();
      this.cancel();
      this.card?.remove();
      delete NP.snap;
    },
  });
})();
