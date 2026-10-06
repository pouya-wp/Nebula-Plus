// Nebula Plus — Gemini in the palette and on tabs.
// • Say what you want in the palette (Ctrl+K), in your own words:
//   «همه‌ی تب‌های یوتیوب رو ببند»، «تب‌های دانشگاه رو بذار تو یه پوشه»،
//   «این سه تا مقاله رو پین کن» — Gemini turns it into actions; closing
//   anything is shown first and waits for your OK.
// • Search history by meaning: «اون مقاله‌ای که درباره‌ی شبکه‌ی عصبی بود».
// • Tab preview gets a one-line summary of the page (from the page's own
//   description; with the Gemini API key, Gemini writes it).
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-genie"] = true;

  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const PAGE = `(function(){
    var d = content.document, m = d.querySelector('meta[name="description"], meta[property="og:description"]');
    sendAsyncMessage('nplus:genie1:page', { title: d.title, desc: m ? m.content : '', text: (d.body ? d.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 2500) });
  })();`;

  NP.feature({
    name: "Genie",
    init() {
      if (!NP.prefs.get("nplus-genie")) return;
      this.sums = new Map();
      NP.genie = {
        command: (t) => this.command(t),
        searchHistory: (t) => this.searchHistory(t),
        summary: (tab) => this.summary(tab),
      };
      this.panel = NP.html("div", { id: "nplus-genie-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [NP.html("div", { class: "wt-title" })]),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "gn-actions" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-genie-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    open(title) {
      this.panel.querySelector(".wt-title").textContent = title;
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
    },
    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },
    busy(text) {
      this.panel.querySelector(".wt-list").replaceChildren(NP.html("div", { class: "wt-empty gn-busy", text }));
      this.panel.querySelector(".gn-actions").replaceChildren();
    },

    // ---------- natural-language tab commands ----------
    tabs() {
      return gBrowser.tabs.filter((t) => !t.hasAttribute("nplus-worker") && !t.hasAttribute("zen-empty-tab") && !t.closing);
    },

    async command(text) {
      this.open(`✦ ${text}`);
      this.busy("دارم می‌فهمم چی می‌خوای…");
      const tabs = this.tabs();
      const inv = tabs.map((t, i) => ({ i, title: t.label.slice(0, 90), host: host(t.linkedBrowser.currentURI.spec), pinned: t.pinned || undefined, playing: t.hasAttribute("soundplaying") || undefined, folder: t.group?.label || undefined, selected: t.selected || undefined }));
      const prompt = `You control a web browser's tabs. The user said (Persian or English): "${text}"
Open tabs (index, title, host, flags): ${JSON.stringify(inv)}
Reply with JSON only: {"actions":[{"do":"close|pin|unpin|mute|unmute|reload|select|sleep|group|open","tabs":[indices],"name":"folder name for group","url":"for open"}],"say":"one short Persian sentence describing what will happen"}
Use only these actions. Match tabs by meaning (e.g. «دانشگاه» = university/course sites). If nothing fits, return {"actions":[],"say":"..."}.`;
      let plan;
      try {
        plan = await NP.gemini.json(prompt);
      } catch (err) {
        return this.busy(`نشد: ${err.message}`);
      }
      const acts = (plan.actions ?? []).filter((a) => a && a.do);
      const list = this.panel.querySelector(".wt-list");
      const LABEL = { close: "بستن", pin: "پین", unpin: "برداشتن پین", mute: "بی‌صدا", unmute: "صدادار", reload: "بارگذاری دوباره", select: "رفتن به", sleep: "خوابوندن", group: "پوشه", open: "باز کردن" };
      list.replaceChildren(
        NP.html("div", { class: "gn-say", text: plan.say || "" }),
        ...acts.map((a) =>
          NP.html("div", { class: "wt-row" }, [
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "wt-name", text: `${LABEL[a.do] ?? a.do}${a.do === "group" && a.name ? ` «${a.name}»` : ""}${a.do === "open" ? ` ${a.url ?? ""}` : ""}` }),
              NP.html("div", { class: "wt-meta", dir: "auto", text: (a.tabs ?? []).map((i) => tabs[i]?.label).filter(Boolean).slice(0, 6).join(" · ") + ((a.tabs ?? []).length > 6 ? ` و ${fa(a.tabs.length - 6)} تای دیگه` : "") }),
            ]),
          ]),
        ),
      );
      if (!acts.length) return;
      const run = () => {
        this.execute(acts, tabs);
        this.close();
        NP.island?.show({ title: "انجام شد ✓", subtitle: plan.say || "", duration: 2500 });
      };
      // anything that closes tabs waits for your OK; the rest just happens
      if (acts.some((a) => a.do === "close")) {
        this.panel.querySelector(".gn-actions").replaceChildren(
          NP.html("button", { class: "wt-btn", text: "نه", onclick: () => this.close() }),
          NP.html("button", { class: "wt-btn wt-primary", text: "آره، انجامش بده", onclick: run }),
        );
      } else run();
    },

    execute(acts, tabs) {
      const pick = (a) => (a.tabs ?? []).map((i) => tabs[i]).filter((t) => t?.isConnected && !t.closing);
      for (const a of acts) {
        const ts = pick(a);
        try {
          switch (a.do) {
            case "close":
              gBrowser.removeTabs(ts);
              break;
            case "pin":
              ts.forEach((t) => gBrowser.pinTab(t));
              break;
            case "unpin":
              ts.forEach((t) => gBrowser.unpinTab(t));
              break;
            case "mute":
            case "unmute":
              ts.forEach((t) => (t.muted !== (a.do === "mute") ? t.toggleMuteAudio() : null));
              break;
            case "reload":
              ts.forEach((t) => t.linkedBrowser.reload());
              break;
            case "select":
              if (ts[0]) gBrowser.selectedTab = ts[0];
              break;
            case "sleep":
              ts.forEach((t) => !t.selected && gBrowser.discardBrowser(t));
              break;
            case "group":
              if (ts.length && window.gZenFolders) gZenFolders.createFolder(ts, { id: `nplus-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, label: a.name || "پوشه", renameFolder: false });
              break;
            case "open":
              if (/^https?:\/\//.test(a.url ?? "")) openTrustedLinkIn(a.url, "tab");
              break;
          }
        } catch (err) {
          NP.logger?.warn(`genie ${a.do}: ${err}`);
        }
      }
    },

    // ---------- history by meaning ----------
    async searchHistory(text) {
      this.open(`🔎 ${text}`);
      this.busy("دارم توی تاریخچه می‌گردم…");
      let words = [];
      try {
        const j = await NP.gemini.json(`The user is looking for a page they visited before, described as: "${text}". Give search keywords likely to appear in that page's title or URL, in English and Persian, including synonyms and site names. Reply with a JSON array of 4 to 10 short keywords.`);
        words = (Array.isArray(j) ? j : []).map(String).filter((w) => w.trim().length > 1).slice(0, 10);
      } catch {}
      if (!words.length) words = text.split(/\s+/).filter((w) => w.length > 2);
      const db = await PlacesUtils.promiseDBConnection();
      const hits = new Map();
      for (const w of words) {
        const like = `%${w.replace(/[%_\\]/g, "\\$&")}%`;
        const rows = await db.executeCached(
          `SELECT h.url, h.title, h.last_visit_date AS t FROM moz_places h WHERE h.hidden = 0 AND h.visit_count > 0 AND (h.title LIKE :q ESCAPE '\\' OR h.url LIKE :q ESCAPE '\\') ORDER BY h.frecency DESC LIMIT 25`,
          { q: like },
        );
        for (const r of rows) {
          const url = r.getResultByName("url");
          const cur = hits.get(url) ?? { url, title: r.getResultByName("title") || url, t: r.getResultByName("t"), n: 0 };
          cur.n++;
          hits.set(url, cur);
        }
      }
      const best = [...hits.values()].sort((a, b) => b.n - a.n || (b.t ?? 0) - (a.t ?? 0)).slice(0, 15);
      const list = this.panel.querySelector(".wt-list");
      if (!best.length) return this.busy("چیزی پیدا نشد — با کلمه‌های دیگه امتحان کن.");
      list.replaceChildren(
        NP.html("div", { class: "gn-say", text: `کلمه‌ها: ${words.slice(0, 6).join("، ")}` }),
        ...best.map((h) => {
          const row = NP.html("div", { class: "wt-row np-clickable" }, [
            NP.html("img", { class: "gn-ico", src: `page-icon:${h.url}` }),
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "wt-name", dir: "auto", text: h.title }),
              NP.html("div", { class: "wt-meta", text: `${host(h.url)}${h.t ? ` · ${new Date(h.t / 1000).toLocaleDateString("fa-IR")}` : ""}` }),
            ]),
          ]);
          row.addEventListener("click", () => (openTrustedLinkIn(h.url, "tab"), this.close()));
          return row;
        }),
      );
    },

    // ---------- one-line summary for the tab preview ----------
    async summary(tab) {
      const url = tab?.linkedBrowser?.currentURI?.spec;
      if (!url || !/^https?:/.test(url)) return "";
      if (this.sums.has(url)) return this.sums.get(url);
      if (tab.hasAttribute("pending") || tab.linkedBrowser.isRemoteBrowser === false) return "";
      const page = await new Promise((resolve) => {
        const mm = tab.linkedBrowser.messageManager;
        const on = (m) => (mm.removeMessageListener("nplus:genie1:page", on), resolve(m.data));
        mm.addMessageListener("nplus:genie1:page", on);
        mm.loadFrameScript("data:," + encodeURIComponent(PAGE), false);
        setTimeout(() => (mm.removeMessageListener("nplus:genie1:page", on), resolve(null)), 1500);
      });
      if (!page) return "";
      let s = (page.desc || "").trim().slice(0, 160);
      if (NP.gemini?.hasKey() && page.text.length > 200) {
        try {
          s = (await NP.gemini.ask(`In one short Persian sentence (max 18 words), what is this page about / what is in it? No intro.\n\nTitle: ${page.title}\n\n${page.text}`)).replace(/\s+/g, " ").trim();
        } catch {}
      }
      this.sums.set(url, s);
      if (this.sums.size > 200) this.sums.delete(this.sums.keys().next().value);
      return s;
    },

    destroy() {
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.genie;
    },
  });
})();
