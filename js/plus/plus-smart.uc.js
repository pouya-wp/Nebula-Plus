// ==UserScript==
// @name           plus-smart.uc.js
// @description    Nebula Plus: AI tab grouping (llm7.io), late-night mode, UI sounds, wallpaper colors
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-ai-models"] = "codestral-latest, GLM-5.3-Flash, nemotron-3-nano:30b";
  NP.DEFAULTS["nplus-ai-group-lang"] = 1;
  NP.DEFAULTS["nplus-ai-key"] = "";
  NP.DEFAULTS["nplus-ai-provider"] = 1;
  NP.DEFAULTS["nplus-openai-key"] = "";
  NP.DEFAULTS["nplus-openai-models"] = "gpt-5-nano, gpt-4.1-nano, gpt-4o-mini";
  NP.DEFAULTS["nplus-late-night"] = true;
  NP.DEFAULTS["nplus-name"] = "";
  NP.DEFAULTS["nplus-ui-sounds"] = true;
  NP.DEFAULTS["nplus-wallpaper-accent"] = true;

  const BRIDGE = "http://127.0.0.1:47321";
  const fa = (n) => new Intl.NumberFormat("fa-IR").format(n);

  // ================= AI tab grouping =================
  // One click: the tabs of this workspace are sorted into Zen folders by a
  // free llm7.io model. The island offers an undo for a few seconds.
  // Providers: OpenAI (your key, cheapest models first) or llm7.io (free).
  // Both speak the OpenAI chat-completions format.
  function providerChain() {
    const openaiKey = NP.prefs.get("nplus-openai-key").trim();
    const chain = [];
    if (NP.prefs.get("nplus-ai-provider") === 2 && openaiKey) {
      for (const model of NP.prefs.get("nplus-openai-models").split(",").map((m) => m.trim()).filter(Boolean)) {
        chain.push({ url: "https://api.openai.com/v1/chat/completions", key: openaiKey, model, openai: true });
      }
    }
    const llm7Key = NP.prefs.get("nplus-ai-key").trim();
    for (const model of NP.prefs.get("nplus-ai-models").split(",").map((m) => m.trim()).filter(Boolean)) {
      chain.push({ url: "https://api.llm7.io/v1/chat/completions", key: llm7Key, model });
    }
    return chain;
  }

  async function askLLM(messages) {
    let lastErr;
    let quotaHit = false;
    for (const p of providerChain()) {
      if (quotaHit && !p.openai) break; // llm7's quota is per user, not per model
      try {
        const headers = { "Content-Type": "application/json" };
        if (p.key) headers.Authorization = `Bearer ${p.key}`;
        const body = { model: p.model, messages };
        if (p.openai && /^(gpt-5|o\d)/.test(p.model)) {
          // reasoning models: keep it fast and cheap; they reject temperature
          body.reasoning_effort = "minimal";
          body.response_format = { type: "json_object" };
        } else {
          body.temperature = 0.2;
          if (p.openai) body.response_format = { type: "json_object" };
        }
        const res = await fetch(p.url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 429 && !p.openai) {
          quotaHit = true;
          throw Object.assign(new Error("quota"), { quota: true });
        }
        if (!res.ok) throw new Error(`${p.model}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        NP.logger.log(`AI grouping answered by ${p.model}`);
        return JSON.parse(json);
      } catch (err) {
        lastErr = err;
        NP.logger.warn(`AI grouping (${p.model}): ${err}`);
      }
    }
    throw lastErr ?? new Error("no model");
  }

  NP.feature({
    name: "AutoGroup",
    init() {
      // sparkle button in the sidebar footer
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      if (foot) {
        this.button = document.createXULElement("toolbarbutton");
        this.button.id = "nplus-autogroup-button";
        this.button.className = "toolbarbutton-1";
        this.button.setAttribute("tooltiptext", "Organize tabs with AI (Ctrl+Alt+O)");
        this.button.addEventListener("command", () => this.run());
        const plus = foot.querySelector("#zen-create-new-button");
        if (plus) plus.before(this.button);
        else foot.append(this.button);
      }
      this.offKey = NP.hotkey?.("ctrl+alt+o", () => this.run());
      NP.autoGroup = { run: () => this.run(), plan: () => this.run({ dryRun: true }) };
    },

    tabs() {
      return gBrowser.visibleTabs.filter(
        (t) => !t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zen-empty-tab") && !t.closing && !t.group,
      );
    },

    async run({ dryRun = false } = {}) {
      if (this.busy) return;
      const tabs = this.tabs();
      if (tabs.length < 3) {
        NP.island?.show({ title: "تب کافی نیست", subtitle: "حداقل ۳ تب آزاد لازمه", duration: 2200 });
        return;
      }
      this.busy = true;
      this.button?.setAttribute("busy", "true");
      for (const t of tabs) t.setAttribute("nplus-thinking", "true");
      NP.island?.show({ title: "دارم تب‌ها رو می‌چینم…", subtitle: `${fa(tabs.length)} تب · llm7`, duration: 60000 });

      const persian = NP.prefs.get("nplus-ai-group-lang") === 1;
      const list = tabs
        .map((t, i) => {
          let host = "";
          try {
            host = t.linkedBrowser.currentURI.host;
          } catch {}
          return `${i}: ${t.label.slice(0, 90)} (${host})`;
        })
        .join("\n");
      const messages = [
        {
          role: "system",
          content:
            "You organize browser tabs into folders by topic or task. " +
            "Make 2 to 6 groups; every group needs at least 2 tabs; a tab that fits nowhere can be left out. " +
            `Names: ${persian ? "Persian (Farsi)" : "English"}, 1-2 words, each starting with one fitting emoji. ` +
            'Reply ONLY with JSON: {"groups":[{"name":"🎨 name","tabs":[ids]}]}',
        },
        { role: "user", content: list },
      ];

      try {
        const result = await askLLM(messages);
        const used = new Set();
        const groups = (result.groups ?? [])
          .map((g) => ({
            name: String(g.name ?? "").slice(0, 40) || "Folder",
            tabs: (g.tabs ?? [])
              .map((id) => tabs[Number(id)])
              .filter((t) => t && !used.has(t) && used.add(t)),
          }))
          .filter((g) => g.tabs.length >= 2);
        if (!groups.length) throw new Error("no usable groups");
        if (dryRun) {
          NP.island?.hide();
          return groups.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.label) }));
        }

        const folders = [];
        for (const g of groups) {
          try {
            folders.push(gZenFolders.createFolder(g.tabs, { label: g.name, renameFolder: false }));
          } catch (err) {
            NP.logger.error(`Folder "${g.name}" failed`, err);
          }
        }
        NP.sound?.("done");
        NP.island?.show({
          title: `${fa(used.size)} تب در ${fa(folders.length)} پوشه`,
          subtitle: groups.map((g) => g.name).join(" · ") + " — برای برگردوندن کلیک کن",
          duration: 9000,
          onClick: () => this.undo(folders),
        });
      } catch (err) {
        NP.logger.error("AI grouping failed", err);
        if (err.quota) {
          NP.island?.show({
            title: "سهمیه‌ی رایگان امروز تموم شد",
            subtitle: "از token.llm7.io توکن رایگان بگیر و توی تنظیمات بذار · کلیک کن",
            duration: 7000,
            onClick: () => openTrustedLinkIn("https://token.llm7.io", "tab"),
          });
        } else {
          NP.island?.show({ title: "دسته‌بندی نشد", subtitle: "سرویس llm7 جواب نداد، دوباره امتحان کن", duration: 3500 });
        }
        if (dryRun) return { error: String(err) };
      } finally {
        for (const t of tabs) t.removeAttribute("nplus-thinking");
        this.button?.removeAttribute("busy");
        this.busy = false;
      }
    },

    async undo(folders) {
      for (const f of folders) {
        try {
          await f?.unpackTabs?.();
        } catch (err) {
          NP.logger.warn(`Undo failed: ${err}`);
        }
      }
      NP.island?.show({ title: "برگشت به حالت قبل", duration: 1600 });
    },

    destroy() {
      this.offKey?.();
      this.button?.remove();
      delete NP.autoGroup;
    },
  });

  // ================= Late night =================
  // After midnight the browser winds down: a warm, dimmer wash, dark mode
  // for websites, and one quiet reminder. Morning undoes it.
  NP.feature({
    name: "LateNight",
    init() {
      this.check = this.check.bind(this);
      this.timer = setInterval(this.check, 60_000);
      NP.prefs.watch("nplus-late-night", this.check);
    },
    check() {
      const h = new Date().getHours();
      const late = NP.prefs.get("nplus-late-night") && h >= 0 && h < 5;
      const was = NP.root.hasAttribute("nplus-late");
      if (late === was) return;
      NP.setRootAttr("nplus-late", late);
      if (late) {
        if (!NP.prefs.get("nplus-darkmode")) {
          this.turnedDark = true;
          NP.prefs.set("nplus-darkmode", true);
        }
        const name = NP.prefs.get("nplus-name");
        NP.island?.show({ title: `دیروقته${name ? "، " + name : ""} 🌙`, subtitle: "چشمات رو آروم‌تر کردم", duration: 5000 });
      } else if (this.turnedDark) {
        this.turnedDark = false;
        NP.prefs.set("nplus-darkmode", false);
      }
    },
    destroy() {
      clearInterval(this.timer);
      NP.root.removeAttribute("nplus-late");
    },
  });

  // ================= UI sounds =================
  // Tiny glassy tones made with WebAudio (no files): tab open/close,
  // island, palette, done. Kept very quiet.
  NP.feature({
    name: "UISounds",
    init() {
      const play = (kind) => {
        if (!NP.prefs.get("nplus-ui-sounds")) return;
        try {
          this.ctx ??= new AudioContext();
          const ctx = this.ctx;
          const t = ctx.currentTime;
          const notes = {
            open: [[880, 0], [1320, 0.05]],
            close: [[990, 0], [660, 0.05]],
            island: [[1175, 0]],
            palette: [[1568, 0]],
            done: [[784, 0], [988, 0.07], [1319, 0.14]],
          }[kind] ?? [[1000, 0]];
          for (const [freq, at] of notes) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, t + at);
            gain.gain.linearRampToValueAtTime(0.025, t + at + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.32);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t + at);
            osc.stop(t + at + 0.35);
          }
        } catch {}
      };
      NP.sound = play;
      this.onOpen = () => play("open");
      this.onClose = () => play("close");
      window.addEventListener("TabOpen", this.onOpen);
      window.addEventListener("TabClose", this.onClose);
      // island and palette, without touching their code
      this.obs = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.attributeName === "open" && r.target.hasAttribute("open")) {
            play(r.target.id === "nplus-palette" ? "palette" : "island");
          }
        }
      });
      for (const id of ["nplus-island", "nplus-palette"]) {
        const el = document.getElementById(id);
        if (el) this.obs.observe(el, { attributes: true, attributeFilter: ["open"] });
      }
    },
    destroy() {
      window.removeEventListener("TabOpen", this.onOpen);
      window.removeEventListener("TabClose", this.onClose);
      this.obs?.disconnect();
      this.ctx?.close();
      delete NP.sound;
    },
  });

  // ================= Wallpaper accent =================
  // The browser borrows its accent from your Windows wallpaper (via Nebula
  // Bridge) whenever no music is setting it.
  NP.feature({
    name: "WallpaperAccent",
    init() {
      NP.prefs.watch("nplus-wallpaper-accent", () => this.load());
      this.timer = setInterval(() => this.load(), 10 * 60 * 1000);
    },
    async load() {
      if (!NP.prefs.get("nplus-wallpaper-accent")) {
        NP.root.style.removeProperty("--nplus-wall");
        NP.root.removeAttribute("nplus-has-wall");
        return;
      }
      try {
        // cache-bust daily so a new wallpaper is picked up
        const url = `${BRIDGE}/wallpaper?d=${new Date().toDateString().replace(/\s/g, "")}`;
        NP.color._cache.delete(url);
        const c = await NP.color.fromImage(url);
        if (!c) return;
        NP.root.style.setProperty("--nplus-wall", `rgb(${c.join(" ")})`);
        NP.setRootAttr("nplus-has-wall", true);
      } catch {}
    },
    destroy() {
      clearInterval(this.timer);
      NP.root.style.removeProperty("--nplus-wall");
      NP.root.removeAttribute("nplus-has-wall");
    },
  });
})();
