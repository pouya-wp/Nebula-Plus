// Nebula Plus — remix any site with AI.
// Ctrl+Alt+R (or the palette): say how a site should look — "dark and
// minimal", "Meem font, calmer", "hide everything but the article" — and
// Gemini (through the assistant's session) writes a stylesheet for it from
// the page's structure. It applies to that domain only and stays; keep it,
// undo it, or ask for "a bit more…" to refine it further.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-remix"] = true;

  const store = {
    get: (k, f) => (NP.store.data && k in NP.store.data ? NP.store.data[k] : f),
    set: (k, v) => NP.store.set(k, v),
  };
  const PRESETS = [
    ["تیره و مینیمال", "a calm, minimal dark theme: deep near-black background, soft off-white text, muted accents, more whitespace, rounded cards"],
    ["فونت میم", "use the font \"Meem\" for all text (keep icon fonts), slightly larger and comfortable line-height"],
    ["حالت تمرکز", "focus mode: hide sidebars, recommendations, ads, banners, cookie bars and pop-ups; keep only the main content centred with a comfortable reading width"],
    ["شیشه‌ای Nebula", "a glassy dark look: translucent dark panels with backdrop blur, hairline borders, soft violet accent (#8b7bff), rounded corners"],
    ["خواناتر", "make reading easier: bigger text, more line-height, wider spacing, higher contrast, narrower text column"],
  ];

  // Page structure for the designer (ASCII only).
  const SURVEY = `(function(){
    var d = content.document, out = [], seen = 0;
    function desc(el) {
      var s = el.localName;
      if (el.id) s += '#' + el.id;
      var cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(function (c) { return c && c.length < 40 && !/\\d{3,}/.test(c); }).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      var role = el.getAttribute('role'); if (role) s += '[role=' + role + ']';
      return s;
    }
    function walk(el, depth) {
      if (seen > 140 || depth > 6) return;
      for (var c of el.children) {
        if (/^(script|style|link|meta|noscript|svg|path|br)$/.test(c.localName)) continue;
        var r = c.getBoundingClientRect();
        if (r.width < 40 || r.height < 16) continue;
        seen++;
        var text = (c.childElementCount === 0 ? (c.textContent || '').trim().slice(0, 40) : '');
        out.push('  '.repeat(depth) + desc(c) + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' + (text ? ' "' + text.replace(/\\s+/g, ' ') + '"' : ''));
        walk(c, depth + 1);
      }
    }
    walk(d.body, 0);
    var cs = content.getComputedStyle(d.body);
    sendAsyncMessage('nplus:remix:survey', { host: content.location.hostname, title: d.title, bg: cs.backgroundColor, color: cs.color, font: cs.fontFamily, tree: out.join(String.fromCharCode(10)).slice(0, 9000) });
  })();`;

  // Keep the remix a restyle: drop anything that moves or rebuilds layout,
  // whatever the model wrote.
  const BANNED = /^(position|float|transform|translate|rotate|scale|top|left|right|bottom|inset|width|height|min-width|min-height|display\s*:\s*(?!none)|grid[\w-]*|flex[\w-]*|order|columns|column-count|content|overflow[\w-]*|zoom|clip-path|contain)$/i;
  function sanitize(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/([^{}]+)\{([^{}]*)\}/g, (all, sel, body) => {
        // no generated boxes
        if (/::?(before|after)/i.test(sel)) return "";
        const kept = body
          .split(";")
          .map((d) => d.trim())
          .filter((d) => {
            const prop = d.split(":")[0]?.trim() ?? "";
            if (!prop || !d.includes(":")) return false;
            if (/^display$/i.test(prop)) return /:\s*none/i.test(d);
            return !BANNED.test(prop);
          });
        return kept.length ? `${sel.trim()} {\n  ${kept.join(";\n  ")};\n}\n` : "";
      })
      .trim();
  }

  NP.feature({
    name: "Remix",
    async init() {
      if (!NP.prefs.get("nplus-remix")) return;
      await NP.store.load();
      this.sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheets = new Map(); // host -> uri
      for (const [host, r] of Object.entries(store.get("remixes", {}))) if (r.on) this.apply(host, r.css);
      this.offKey = NP.hotkey?.("ctrl+alt+r", () => this.open());
      this.build();
      NP.remix = { open: () => this.open(), off: () => this.undo(this.host()) };
    },

    host() {
      try {
        return gBrowser.currentURI.host.replace(/^www\./, "");
      } catch {
        return "";
      }
    },

    // ---------- stylesheet per domain ----------
    apply(host, css) {
      this.remove(host);
      const wrapped = `@-moz-document domain("${host}") {\n${css}\n}`;
      const uri = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(wrapped));
      this.sss.loadAndRegisterSheet(uri, this.sss.USER_SHEET);
      this.sheets.set(host, uri);
    },

    remove(host) {
      const uri = this.sheets.get(host);
      if (uri && this.sss.sheetRegistered(uri, this.sss.USER_SHEET)) this.sss.unregisterSheet(uri, this.sss.USER_SHEET);
      this.sheets.delete(host);
    },

    undo(host) {
      const all = store.get("remixes", {});
      const prev = this.before;
      this.remove(host);
      if (prev?.host === host && prev.css) {
        // back to the previous version of this remix
        this.apply(host, prev.css);
        all[host] = prev.entry;
      } else delete all[host];
      store.set("remixes", all);
      this.before = null;
      this.setState("idle");
    },

    // ---------- UI ----------
    build() {
      const chip = ([label, ask]) => NP.html("button", { class: "rx-chip", text: label, onclick: () => this.run(ask, label) });
      this.bar = NP.html("div", { id: "nplus-remix", hidden: "true" }, [
        NP.html("div", { class: "rx-head" }, [
          NP.html("span", { class: "rx-spark", text: "✦" }),
          NP.html("span", { class: "rx-title" }),
          NP.html("button", { class: "rx-x", text: "✕", title: "بستن", onclick: () => this.close() }),
        ]),
        NP.html("div", { class: "rx-chips" }, PRESETS.map(chip)),
        NP.html("div", { class: "rx-row" }, [
          NP.html("input", { class: "rx-input", placeholder: "می‌خوای این سایت چه شکلی باشه؟", dir: "auto" }),
          NP.html("button", { class: "rx-go", text: "بساز", onclick: () => this.runTyped() }),
        ]),
        NP.html("div", { class: "rx-status" }),
        NP.html("div", { class: "rx-after" }, [
          NP.html("button", { class: "rx-btn rx-keep", text: "نگه دار ✓", onclick: () => this.close() }),
          NP.html("button", { class: "rx-btn", text: "یه کم دیگه…", onclick: () => this.setState("tweak") }),
          NP.html("button", { class: "rx-btn rx-undo", text: "برگردون", onclick: () => this.undo(this.host()) }),
        ]),
      ]);
      this.bar.querySelector(".rx-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.runTyped();
        if (e.key === "Escape") this.close();
      });
      document.body.append(this.bar);
    },

    open() {
      const host = this.host();
      if (!/^https?:/.test(gBrowser.currentURI.spec) || !host) {
        NP.island?.show({ title: "این صفحه رو نمی‌شه ریمیکس کرد", duration: 2000 });
        return;
      }
      const has = !!store.get("remixes", {})[host];
      this.bar.querySelector(".rx-title").textContent = has ? `ریمیکس ${host} · ادامه بده یا برگردون` : `ریمیکس ${host}`;
      this.setState(has ? "applied" : "idle");
      this.bar.hidden = false;
      this.bar.getBoundingClientRect();
      this.bar.setAttribute("open", "true");
      this.bar.querySelector(".rx-input").focus();
    },

    close() {
      this.bar.removeAttribute("open");
      setTimeout(() => !this.bar.hasAttribute("open") && (this.bar.hidden = true), 250);
    },

    setState(state, text = "") {
      this.bar.setAttribute("state", state);
      const status = {
        idle: "",
        busy: text || "Gemini داره طراحی می‌کنه…",
        applied: "اعمال شد. نگهش دارم؟",
        tweak: "بگو چی رو عوض کنم (مثلاً: «تیره‌تر»، «فونت درشت‌تر»)",
        error: text || "نشد، دوباره امتحان کن",
      }[state];
      this.bar.querySelector(".rx-status").textContent = status ?? "";
      if (state === "tweak") {
        const input = this.bar.querySelector(".rx-input");
        input.value = "";
        input.placeholder = "چی رو عوض کنم؟";
        input.focus();
      }
    },

    runTyped() {
      const v = this.bar.querySelector(".rx-input").value.trim();
      if (v) this.run(v, v);
    },

    // ---------- the remix ----------
    async run(ask, label) {
      if (this.busy) return;
      const browser = gBrowser.selectedBrowser;
      const host = this.host();
      this.busy = true;
      this.setState("busy", "دارم ساختار صفحه رو می‌خونم…");
      try {
        const survey = await new Promise((resolve) => {
          const mm = browser.messageManager;
          const on = (m) => {
            mm.removeMessageListener("nplus:remix:survey", on);
            resolve(m.data);
          };
          mm.addMessageListener("nplus:remix:survey", on);
          mm.loadFrameScript("data:," + encodeURIComponent(SURVEY), false);
          setTimeout(() => resolve(null), 4000);
        });
        if (!survey) throw new Error("couldn't read the page");

        const all = store.get("remixes", {});
        const current = all[host];
        const refine = this.bar.getAttribute("state") === "tweak" || (current && this.lastHost === host && this.bar.getAttribute("state") !== "idle");
        const prompt = [
          `You are a senior web designer. Write a USER STYLESHEET that restyles the website "${survey.host}" (${survey.title}).`,
          refine && current ? `It already has this stylesheet:\n\`\`\`css\n${current.css}\n\`\`\`\nChange it as the user now asks: "${ask}". Return the COMPLETE updated stylesheet.` : `The user wants: "${ask}".`,
          "Rules:",
          "- Reply with exactly one ```css code block and nothing else.",
          "- Put !important on every declaration (it must win over the site's own CSS).",
          "- Only use selectors that exist in the structure below (ids, stable class names, tags, [role]); prefer broad, robust selectors.",
          "- Restyle, don't rebuild: change colours, backgrounds, fonts, sizes of text, spacing (padding/margin/max-width), borders, radius, shadows, opacity, blur; hide clutter with display:none.",
          "- Do NOT use position, float, transform, top/left/right/bottom, width/height, grid/flex changes, or ::before/::after content. The page's layout must stay exactly as it is.",
          "- Never hide the main content. Keep text readable (good contrast). If you set a dark background on html/body, set it on both and keep it opaque.",
          '- Persian/Arabic text should use font-family "Meem", sans-serif when a font change is asked for.',
          "- No @import, no external URLs, no JavaScript.",
          `Current page colors: background ${survey.bg}, text ${survey.color}, font ${survey.font}.`,
          "Page structure (tag#id.classes [size] \"text\"):",
          survey.tree,
        ]
          .filter(Boolean)
          .join("\n");

        this.setState("busy");
        let chars = 0;
        const reply = await NP.assistant?.ask?.(prompt, (t) => {
          if (t.length - chars > 40) {
            chars = t.length;
            this.setState("busy", `Gemini داره می‌نویسه… (${Math.round(t.length / 40)} خط)`);
          }
        });
        if (!reply) throw new Error("no answer");
        const css = sanitize((reply.match(/```(?:css)?\s*([\s\S]*?)```/i)?.[1] ?? reply).replace(/@import[^;]+;/g, "").trim());
        if (!/[{}]/.test(css)) throw new Error("no css in the answer");

        this.before = current ? { host, css: current.css, entry: current } : { host, css: null };
        this.apply(host, css);
        all[host] = { css, ask: refine && current ? `${current.ask} + ${ask}` : ask, label, on: true, at: Date.now() };
        store.set("remixes", all);
        this.lastHost = host;
        this.setState("applied");
      } catch (err) {
        NP.logger?.warn(`remix: ${err}`);
        this.setState("error");
      } finally {
        this.busy = false;
      }
    },

    destroy() {
      this.offKey?.();
      for (const host of [...this.sheets.keys()]) this.remove(host);
      this.bar?.remove();
      delete NP.remix;
    },
  });
})();
