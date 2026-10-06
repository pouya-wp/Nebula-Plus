// Nebula Plus — voice typing (Persian and English).
// Put the cursor in any text box (a site, the URL bar, a chat), press
// Ctrl+Alt+J and talk; press it again (or Enter) and Gemini writes what you
// said right there, with punctuation. Esc cancels. Needs the Gemini API key
// (audio can't go through the web chat).
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-voice"] = true;

  // Content side (ASCII only): put text where the cursor is.
  const INSERT = (text) => `(function(){
    var t = ${JSON.stringify(text).replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))};
    var d = content.document, a = d.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    var ok = false;
    try {
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) { a.focus(); ok = d.execCommand('insertText', false, t); }
      if (!ok && a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { a.setRangeText(t, a.selectionStart, a.selectionEnd, 'end'); a.dispatchEvent(new content.Event('input', { bubbles: true })); ok = true; }
    } catch (e) {}
    sendAsyncMessage('nplus:voice1:done', { ok: ok });
  })();`;

  NP.feature({
    name: "VoiceTyping",
    init() {
      if (!NP.prefs.get("nplus-voice")) return;
      this.offKey = NP.hotkey?.("ctrl+alt+j", () => (this.rec ? this.stop() : this.start()));
      NP.voice = { start: () => this.start() };
    },

    async start() {
      if (!NP.gemini?.hasKey()) {
        NP.island?.show({ title: "تایپ صوتی کلید Gemini API می‌خواد", subtitle: "از aistudio.google.com بگیرش و توی تنظیمات nplus-gemini-key بذار", icon: "🎙", duration: 7000 });
        return;
      }
      // where the text should go
      const f = document.commandDispatcher.focusedElement;
      this.target = f === gURLBar.inputField || gURLBar.focused ? "urlbar" : gBrowser.selectedBrowser;
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (err) {
        NP.island?.show({ title: "به میکروفون دسترسی نشد", subtitle: String(err.message || err).slice(0, 80), duration: 3500 });
        return;
      }
      this.stream = stream;
      this.chunks = [];
      const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/ogg;codecs=opus";
      this.rec = new MediaRecorder(stream, { mimeType: type });
      this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
      this.rec.start();
      this.started = Date.now();
      this.pill();
      // a small live level so you can see it hears you
      try {
        this.ctx = new AudioContext();
        const an = this.ctx.createAnalyser();
        an.fftSize = 256;
        this.ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const loop = () => {
          if (!this.rec) return;
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          this.el?.style.setProperty("--lvl", Math.min(1, peak / 60).toFixed(2));
          const s = Math.floor((Date.now() - this.started) / 1000);
          const t = this.el?.querySelector(".vc-time");
          if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
          if (s > 120) return this.stop(); // two minutes at a time
          this.raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {}
      this.onKey = (e) => {
        if (e.key === "Escape") (e.preventDefault(), this.cancel());
        else if (e.key === "Enter") (e.preventDefault(), this.stop());
      };
      window.addEventListener("keydown", this.onKey, true);
    },

    pill() {
      this.el?.remove();
      this.el = NP.html("div", { id: "nplus-voice" }, [
        NP.html("span", { class: "vc-dot" }),
        NP.html("span", { class: "vc-text", text: "دارم گوش می‌دم…" }),
        NP.html("span", { class: "vc-time", text: "0:00" }),
        NP.html("span", { class: "vc-hint", text: "Enter تموم · Esc لغو" }),
      ]);
      document.body.append(this.el);
    },

    release() {
      cancelAnimationFrame(this.raf);
      window.removeEventListener("keydown", this.onKey, true);
      for (const t of this.stream?.getTracks() ?? []) t.stop();
      this.ctx?.close().catch(() => {});
      this.stream = this.ctx = null;
    },

    cancel() {
      try {
        this.rec?.stop();
      } catch {}
      this.rec = null;
      this.release();
      this.el?.remove();
      this.el = null;
    },

    async stop() {
      const rec = this.rec;
      if (!rec) return;
      this.rec = null;
      const done = new Promise((r) => (rec.onstop = r));
      rec.stop();
      await done;
      this.release();
      this.el.setAttribute("busy", "true");
      this.el.querySelector(".vc-text").textContent = "دارم می‌نویسمش…";
      this.el.querySelector(".vc-hint").textContent = "";
      try {
        const blob = new Blob(this.chunks, { type: rec.mimeType.split(";")[0] });
        const text = (
          await NP.gemini.ask(
            "Transcribe this speech exactly as spoken, in its own language (Persian in Persian script, English in English; mixed is fine). Add natural punctuation. Output only the transcription, nothing else.",
            { media: [{ blob, mime: blob.type }] },
          )
        ).trim();
        if (!text) throw new Error("چیزی شنیده نشد");
        await this.insert(text);
      } catch (err) {
        NP.island?.show({ title: "نوشته نشد", subtitle: String(err.message || err).slice(0, 90), icon: "🎙", duration: 3500 });
      } finally {
        this.el?.remove();
        this.el = null;
      }
    },

    async insert(text) {
      if (this.target === "urlbar") {
        gURLBar.focus();
        const f = gURLBar.inputField;
        f.setRangeText(text, f.selectionStart, f.selectionEnd, "end");
        f.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const b = this.target;
      const ok = await new Promise((resolve) => {
        const mm = b.messageManager;
        const on = (m) => (mm.removeMessageListener("nplus:voice1:done", on), resolve(m.data.ok));
        mm.addMessageListener("nplus:voice1:done", on);
        mm.loadFrameScript("data:," + encodeURIComponent(INSERT(text)), false);
        setTimeout(() => resolve(false), 2500);
      });
      if (!ok) {
        Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
        NP.island?.show({ title: "کادری انتخاب نشده بود — متن کپی شد", subtitle: text.slice(0, 90), icon: "🎙", duration: 4000 });
      }
    },

    destroy() {
      this.cancel();
      this.offKey?.();
      delete NP.voice;
    },
  });
})();
