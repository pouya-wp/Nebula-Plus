// ==UserScript==
// @name           plus-assistant.uc.js
// @description    Nebula Plus assistant: our own glass chat panel, powered by your Gemini session
// ==/UserScript==

// How it works
// - A hidden background tab keeps gemini.google.com open with your login.
// - A small frame script in that tab types the prompt into Gemini's editor,
//   presses send, and streams the answer text back to us.
// - You only ever see our panel: quick actions with ready prompts
//   (summarize, translate, key points…) that include the current page.
// - If Gemini can't be driven (signed out, page changed, timeout), the same
//   request goes to OpenAI with your key.

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-assistant-engine"] = 1; // 1 Gemini web, 2 OpenAI
  const GEMINI = "https://gemini.google.com/app";

  // ---------- frame scripts (ASCII only: they travel as data: URLs) ----------
  // Runs inside the hidden Gemini tab. Only small synchronous steps live
  // here (type / send / read): timers in hidden tabs are throttled hard, so
  // all the waiting happens on our side.
  const GEMINI_DRIVER = `
    (function () {
      const d = () => content.document;
      const reply = (id, data) => sendAsyncMessage("nplus:ai:reply", Object.assign({ id }, data));
      const lastText = () => {
        const all = d().querySelectorAll("model-response");
        const last = all[all.length - 1];
        if (!last) return "";
        const md = last.querySelector(".markdown") || last.querySelector("message-content") || last;
        return md.innerText.trim();
      };
      addMessageListener("nplus:ai:step", (msg) => {
        const { id, step, text } = msg.data;
        try {
          if (step === "type") {
            const editor = d().querySelector("rich-textarea .ql-editor, .ql-editor[contenteditable=true]");
            if (!editor) return reply(id, { error: "editor not found (signed out?)" });
            editor.focus();
            d().execCommand("selectAll", false, null);
            const ok = d().execCommand("insertText", false, text);
            if (!ok || !editor.innerText.trim()) {
              editor.innerText = text;
              editor.dispatchEvent(new content.InputEvent("input", { bubbles: true }));
            }
            return reply(id, { ok: true, count: d().querySelectorAll("model-response").length });
          }
          if (step === "send") {
            const btn = d().querySelector("button[aria-label*='Send' i]:not([disabled]), button.send-button:not([disabled])");
            if (!btn) return reply(id, { ok: false });
            btn.click();
            return reply(id, { ok: true });
          }
          if (step === "read") {
            const busy = [...d().querySelectorAll("button[aria-label]")].some((b) => /stop/i.test(b.getAttribute("aria-label")));
            return reply(id, { count: d().querySelectorAll("model-response").length, text: lastText(), busy });
          }
        } catch (e) {
          reply(id, { error: String(e) });
        }
      });
    })();
  `;

  // Runs once in the page you're reading: returns its title, url, selection and text.
  const PAGE_READER = `
    (function () {
      const d = content.document;
      const pick = d.querySelector("article") || d.querySelector("main") || d.body;
      const text = (pick ? pick.innerText : "").replace(/\\n{3,}/g, "\\n\\n").slice(0, 15000);
      sendAsyncMessage("nplus:ai:page", {
        title: d.title,
        url: content.location.href,
        selection: String(content.getSelection() || "").slice(0, 6000),
        text,
      });
    })();
  `;

  const dataURL = (code) => "data:application/javascript," + encodeURIComponent(code);

  // ---------- ready prompts ----------
  const ACTIONS = [
    { id: "summary", label: "خلاصه", icon: "✦", needsPage: true, prompt: (p) => `صفحه‌ی زیر را به فارسی روان خلاصه کن: اول یک جمله‌ی اصلی، بعد ۳ تا ۶ نکته‌ی کلیدی به‌صورت فهرست. فقط بر اساس متن.\n\nعنوان: ${p.title}\n\n${p.text}` },
    { id: "keypoints", label: "نکات کلیدی", icon: "◆", needsPage: true, prompt: (p) => `مهم‌ترین نکات، عددها و نتیجه‌گیری‌های این صفحه را به فارسی و به‌صورت فهرست کوتاه بنویس.\n\nعنوان: ${p.title}\n\n${p.text}` },
    { id: "fa", label: "ترجمه به فارسی", icon: "فا", needsPage: true, prompt: (p) => `متن زیر را به فارسی روان و طبیعی ترجمه کن. فقط ترجمه را بنویس، بدون توضیح.\n\n${p.selection || p.text}` },
    { id: "en", label: "ترجمه به انگلیسی", icon: "En", needsPage: true, prompt: (p) => `Translate the following into natural, fluent English. Output only the translation.\n\n${p.selection || p.text}` },
    { id: "explain", label: "توضیح ساده", icon: "?", needsPage: true, prompt: (p) => `این را خیلی ساده و قدم‌به‌قدم به فارسی توضیح بده، انگار برای کسی که تازه با موضوع آشنا شده:\n\n${p.selection || p.text}` },
    { id: "reply", label: "نوشتن پاسخ", icon: "↩", needsPage: true, prompt: (p) => `برای این پیام یا صفحه یک پاسخ کوتاه، محترمانه و طبیعی بنویس (به همان زبان متن اصلی).\n\n${p.selection || p.text}` },
  ];

  // ---------- tiny markdown → DOM ----------
  function renderMarkdown(md) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s) =>
      esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>");
    const out = [];
    let list = null;
    let code = null;
    for (const raw of md.split("\n")) {
      if (raw.trim().startsWith("```")) {
        if (code) {
          out.push(`<pre dir="ltr">${esc(code.join("\n"))}</pre>`);
          code = null;
        } else code = [];
        continue;
      }
      if (code) {
        code.push(raw);
        continue;
      }
      const li = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) {
        if (!list) list = [];
        list.push(`<li dir="auto">${inline(li[1])}</li>`);
        continue;
      }
      if (list) {
        out.push(`<ul>${list.join("")}</ul>`);
        list = null;
      }
      const h = raw.match(/^#{1,4}\s+(.*)$/);
      if (h) out.push(`<h4 dir="auto">${inline(h[1])}</h4>`);
      else if (raw.trim()) out.push(`<p dir="auto">${inline(raw)}</p>`);
    }
    if (list) out.push(`<ul>${list.join("")}</ul>`);
    if (code) out.push(`<pre dir="ltr">${esc(code.join("\n"))}</pre>`);
    return out.join("");
  }

  NP.feature({
    name: "Assistant",
    init() {
      this.pending = new Map();
      this.seq = 0;

      // ---- toolbar button next to the pomodoro ----
      this.button = NP.html("div", { id: "nplus-ai-button", role: "button", title: "Assistant (Ctrl+Alt+A)" });
      this.button.addEventListener("click", () => this.toggle());
      const anchor = document.getElementById("nplus-pomo") ?? document.getElementById("urlbar-container");
      anchor?.after(this.button);

      // ---- panel ----
      const chip = (a) =>
        NP.html("button", { class: "ai-chip", "data-id": a.id, onclick: () => this.runAction(a) }, [
          NP.html("span", { class: "ai-chip-icon", text: a.icon }),
          NP.html("span", { text: a.label }),
        ]);
      this.panel = NP.html("div", { id: "nplus-ai", hidden: "true" }, [
        NP.html("div", { class: "ai-head" }, [
          NP.html("div", { class: "ai-title" }, [NP.html("span", { class: "ai-star", text: "✦" }), NP.html("span", { text: "دستیار" })]),
          NP.html("div", { class: "ai-engine" }),
          NP.html("button", { class: "ai-icon-btn ai-new", title: "New chat", text: "＋", onclick: () => this.newChat() }),
          NP.html("button", { class: "ai-icon-btn ai-close", title: "Close", text: "✕", onclick: () => this.close() }),
        ]),
        NP.html("div", { class: "ai-chips" }, ACTIONS.map(chip)),
        NP.html("div", { class: "ai-thread" }, [
          NP.html("div", { class: "ai-empty" }, [
            NP.html("div", { class: "ai-empty-star", text: "✦" }),
            NP.html("div", { text: "یکی از دکمه‌های بالا رو بزن، یا هر سؤالی داری بپرس." }),
            NP.html("div", { class: "ai-empty-sub", text: "متن انتخاب‌شده یا صفحه‌ی فعلی همراه سؤال فرستاده می‌شه." }),
          ]),
        ]),
        NP.html("div", { class: "ai-compose" }, [
          NP.html("label", { class: "ai-ctx" }, [NP.html("input", { type: "checkbox", class: "ai-ctx-box" }), NP.html("span", { text: "همراه این صفحه" })]),
          NP.html("div", { class: "ai-input-row" }, [
            NP.html("textarea", { class: "ai-input", rows: "1", dir: "auto", placeholder: "بپرس…" }),
            NP.html("button", { class: "ai-send", title: "Send", onclick: () => this.sendTyped() }),
          ]),
        ]),
      ]);
      document.body.append(this.panel);
      this.thread = this.panel.querySelector(".ai-thread");
      this.input = this.panel.querySelector(".ai-input");
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendTyped();
        } else if (e.key === "Escape") this.close();
      });
      this.input.addEventListener("input", () => {
        this.input.style.height = "auto";
        this.input.style.height = `${Math.min(140, this.input.scrollHeight)}px`;
      });

      // messages from the hidden Gemini tab
      this.onMsg = (m) => {
        const done = this.pending.get(m.data.id);
        if (!done) return;
        this.pending.delete(m.data.id);
        done(m.data);
      };
      window.messageManager.addMessageListener("nplus:ai:reply", this.onMsg);

      this.offKey = NP.hotkey?.("ctrl+alt+a", () => this.toggle());
      NP.assistant = { open: () => this.open(), run: (id) => this.runAction(ACTIONS.find((a) => a.id === id)) };
      NP.prefs.watch("nplus-assistant-engine", () => this.showEngine());
    },

    showEngine(label) {
      this.panel.querySelector(".ai-engine").textContent =
        label ?? (NP.prefs.get("nplus-assistant-engine") === 2 ? "OpenAI" : "Gemini");
    },

    toggle() {
      this.panel.hidden ? this.open() : this.close();
    },

    open() {
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
      this.button.setAttribute("open", "true");
      this.showEngine();
      setTimeout(() => this.input.focus(), 50);
      // warm up Gemini in the background so the first answer is quick
      if (NP.prefs.get("nplus-assistant-engine") === 1) this.geminiTab();
    },

    close() {
      this.panel.removeAttribute("open");
      this.button.removeAttribute("open");
      setTimeout(() => !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    // ---------- the hidden Gemini tab ----------
    geminiTab() {
      if (this.gTab?.isConnected && !this.gTab.closing) return this.gTab;
      // a tab restored from the last session, marked as ours
      let tab = gBrowser.tabs.find((t) => {
        try {
          return t.hasAttribute("nplus-assistant") || SessionStore.getCustomTabValue(t, "nplus-assistant") === "1";
        } catch {
          return false;
        }
      });
      if (!tab) {
        tab = gBrowser.addTrustedTab(GEMINI, { inBackground: true, skipAnimation: true });
        try {
          SessionStore.setCustomTabValue(tab, "nplus-assistant", "1");
        } catch {}
      }
      tab.setAttribute("nplus-assistant", "true");
      try {
        gBrowser.hideTab(tab);
      } catch {}
      this.gTab = tab;
      return tab;
    },

    // one round trip to the driver in the Gemini tab
    step(browser, step, text) {
      const id = ++this.seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => (this.pending.delete(id), reject(new Error(`step ${step} timed out`))), 5000);
        this.pending.set(id, (data) => (clearTimeout(timer), resolve(data)));
        browser.messageManager.sendAsyncMessage("nplus:ai:step", { id, step, text });
      });
    },

    async askGemini(prompt, onPartial) {
      const tab = this.geminiTab();
      const browser = tab.linkedBrowser;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 80 && (browser.webProgress?.isLoadingDocument || tab.hasAttribute("busy")); i++) await sleep(250);

      // Frame scripts survive navigations: load the driver once per browser
      // (tracked on the window, so live reloads don't double it).
      window.__nplusDrivenV2 ??= new WeakSet(); // bump the name when the driver changes
      if (!window.__nplusDrivenV2.has(browser)) {
        browser.messageManager.loadFrameScript(dataURL(GEMINI_DRIVER), false);
        window.__nplusDrivenV2.add(browser);
      }

      // let the hidden page render and run at full speed while we use it
      browser.docShellIsActive = true;
      try {
        let typed;
        for (let i = 0; i < 30; i++) {
          typed = await this.step(browser, "type", prompt);
          if (!typed.error) break;
          await sleep(300);
        }
        if (typed.error) throw new Error(typed.error);
        const before = typed.count;

        let sent = false;
        for (let i = 0; i < 25 && !sent; i++) {
          await sleep(200);
          sent = (await this.step(browser, "send")).ok;
        }
        if (!sent) throw new Error("send button not found");

        const started = Date.now();
        let text = "";
        let stableSince = Date.now();
        while (true) {
          await sleep(300);
          const r = await this.step(browser, "read");
          if (r.count <= before) {
            if (Date.now() - started > 30000) throw new Error("no answer");
            continue;
          }
          if (r.text !== text) {
            text = r.text;
            stableSince = Date.now();
            if (text) onPartial(text);
          }
          if (!r.busy && text && Date.now() - stableSince > 1200) break;
          if (Date.now() - started > 180000) break;
        }
        return text;
      } finally {
        if (!tab.selected) browser.docShellIsActive = false;
      }
    },

    async askOpenAI(prompt) {
      const key = NP.prefs.get("nplus-openai-key").trim();
      if (!key) throw new Error("no OpenAI key");
      const model = NP.prefs.get("nplus-openai-models").split(",")[0].trim() || "gpt-5-mini";
      const body = { model, messages: [{ role: "system", content: "You are a concise, helpful assistant inside a web browser. Answer in the user's language (Persian when they write Persian). Use short markdown." }, { role: "user", content: prompt }] };
      if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = "low";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    },

    // ---------- page context ----------
    readPage() {
      const browser = gBrowser.selectedBrowser;
      if (!/^https?$/.test(browser.currentURI.scheme)) return Promise.resolve(null);
      return new Promise((resolve) => {
        const mm = browser.messageManager;
        const timer = setTimeout(() => (mm.removeMessageListener("nplus:ai:page", on), resolve(null)), 3000);
        const on = (m) => {
          clearTimeout(timer);
          mm.removeMessageListener("nplus:ai:page", on);
          resolve(m.data);
        };
        mm.addMessageListener("nplus:ai:page", on);
        mm.loadFrameScript(dataURL(PAGE_READER), false);
      });
    },

    // ---------- conversation ----------
    newChat() {
      this.thread.replaceChildren(this.thread.querySelector(".ai-empty") ?? NP.html("div"));
      this.thread.querySelector(".ai-empty")?.removeAttribute("hidden");
      if (this.gTab?.isConnected) {
        this.gTab.linkedBrowser.loadURI(Services.io.newURI(GEMINI), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      }
    },

    bubble(kind, text) {
      this.thread.querySelector(".ai-empty")?.setAttribute("hidden", "true");
      const el = NP.html("div", { class: `ai-msg ai-${kind}` });
      if (kind === "user") el.append(NP.html("div", { class: "ai-text", dir: "auto", text }));
      else el.append(NP.html("div", { class: "ai-text" }));
      this.thread.append(el);
      this.thread.scrollTop = this.thread.scrollHeight;
      return el;
    },

    async runAction(action) {
      if (!action) return;
      this.open();
      const page = await this.readPage();
      if (action.needsPage && !page?.text && !page?.selection) {
        this.bubble("bot", "").querySelector(".ai-text").textContent = "این صفحه متنی برای کار کردن نداره.";
        return;
      }
      const label = page?.selection ? `${action.label} · متن انتخاب‌شده` : `${action.label} · ${page.title}`;
      this.ask(action.prompt(page), label);
    },

    async sendTyped() {
      const text = this.input.value.trim();
      if (!text || this.busy) return;
      this.input.value = "";
      this.input.style.height = "auto";
      let prompt = text;
      if (this.panel.querySelector(".ai-ctx-box").checked) {
        const page = await this.readPage();
        if (page) prompt = `${text}\n\n---\nصفحه: ${page.title} (${page.url})\n${page.selection || page.text}`;
      }
      this.ask(prompt, text);
    },

    async ask(prompt, shownAs) {
      if (this.busy) return;
      this.busy = true;
      this.panel.setAttribute("busy", "true");
      this.bubble("user", shownAs);
      const bot = this.bubble("bot", "");
      bot.setAttribute("thinking", "true");
      const out = bot.querySelector(".ai-text");
      const show = (t) => {
        out.innerHTML = renderMarkdown(t);
        this.thread.scrollTop = this.thread.scrollHeight;
      };
      try {
        let text;
        if (NP.prefs.get("nplus-assistant-engine") === 1) {
          try {
            text = await this.askGemini(prompt, (t) => (bot.removeAttribute("thinking"), show(t)));
            this.showEngine("Gemini");
          } catch (err) {
            NP.logger.warn(`Gemini engine: ${err}; using OpenAI`);
            this.showEngine("OpenAI");
            text = await this.askOpenAI(prompt);
          }
        } else {
          text = await this.askOpenAI(prompt);
        }
        show(text || "…");
      } catch (err) {
        out.textContent = `جواب نگرفتم: ${err.message}`;
        bot.setAttribute("error", "true");
      } finally {
        bot.removeAttribute("thinking");
        this.busy = false;
        this.panel.removeAttribute("busy");
      }
    },

    destroy() {
      this.offKey?.();
      window.messageManager.removeMessageListener("nplus:ai:reply", this.onMsg);
      this.button?.remove();
      this.panel?.remove();
      // keep the hidden Gemini tab across reloads; it is reused by tag
      delete NP.assistant;
    },
  });

  // adopt (and hide) the assistant's Gemini tab from a previous session
  setTimeout(() => {
    const f = NP._features.find((x) => x.name === "Assistant");
    const t = gBrowser.tabs.find((tab) => {
      try {
        return tab.hasAttribute("nplus-assistant") || SessionStore.getCustomTabValue(tab, "nplus-assistant") === "1";
      } catch {
        return false;
      }
    });
    if (f && t) f.geminiTab();
  }, 1500);
})();
