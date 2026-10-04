// ==UserScript==
// @name           plus-palette.uc.js
// @description    Nebula Plus command palette (Ctrl+K): tabs, history, bookmarks, actions
// ==/UserScript==

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  const ICON = (name) => `chrome://browser/skin/zen-icons/${name}.svg`;
  const MAX = 9;

  // Match quality: exact substring > word starts > tight subsequence.
  // Loose subsequences (letters scattered across the text) don't count.
  function score(text, q) {
    if (!q) return 1;
    text = text.toLowerCase();
    const at = text.indexOf(q);
    if (at >= 0) {
      const wordStart = at === 0 || /[\s/.\-_|·:]/.test(text[at - 1]);
      return 100 + (wordStart ? 40 : 0) - Math.min(at, 40) * 0.5 - text.length * 0.05;
    }
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((w) => text.includes(w))) return 70;
    // tight subsequence: all letters within a short span
    let ti = 0;
    let first = -1;
    for (const ch of q) {
      const found = text.indexOf(ch, ti);
      if (found < 0) return 0;
      if (first < 0) first = found;
      ti = found + 1;
    }
    const span = ti - first;
    return q.length >= 3 && span <= q.length * 2 ? 30 - span : 0;
  }

  const looksLikeUrl = (q) =>
    !/\s/.test(q) && /^(https?:\/\/|about:|localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(q);

  function switchTo(tab) {
    if (window.gZenWorkspaces?.switchTabIfNeeded) gZenWorkspaces.switchTabIfNeeded(tab);
    else gBrowser.selectedTab = tab;
  }

  function openUrl(url, where = "tab") {
    openTrustedLinkIn(url, where);
  }

  // Actions. `k` holds extra search words (Persian included).
  const COMMANDS = () => [
    { t: "Play / Pause", k: "پخش توقف music play pause", icon: ICON("media-play"), run: () => NP.media?.toggle(), when: () => NP.media?.current },
    { t: "Next track", k: "آهنگ بعدی next skip", icon: ICON("media-next"), run: () => NP.media?.next(), when: () => NP.media?.current },
    { t: "Previous track", k: "آهنگ قبلی previous", icon: ICON("media-previous"), run: () => NP.media?.prev(), when: () => NP.media?.current },
    { t: "Lyrics stage", k: "لیریک صحنه تمام صفحه lyrics fullscreen", icon: ICON("selectable/music"), run: () => NP.stage?.open(), when: () => NP.media?.current },
    { t: "Toggle lyrics", k: "لیریک lyrics", icon: ICON("selectable/music"), run: () => NP.prefs.set("nplus-lyrics", !NP.prefs.get("nplus-lyrics")) },
    { t: "Toggle dark mode", k: "دارک تاریک شب dark mode night", icon: ICON("selectable/moon"), run: () => NP.prefs.set("nplus-darkmode", !NP.prefs.get("nplus-darkmode")) },
    { t: "Focus mode", k: "تمرکز فوکوس پومودورو focus pomodoro", icon: ICON("selectable/time"), run: () => NP.focus?.toggle() },
    { t: "Sleep this folder", k: "خواب پوشه آزاد کردن رم unload folder sleep", icon: ICON("selectable/moon"), when: () => gBrowser.selectedTab.group?.isZenFolder, run: () => { const f = gBrowser.selectedTab.group; for (const t of f.tabs) if (!t.selected && !t.hasAttribute("zen-empty-tab") && !t.hasAttribute("pending")) gBrowser.discardBrowser(t); NP.island?.show({ title: `${f.label} خوابید 💤`, duration: 2000 }); } },
    { t: "Organize tabs with AI", k: "دسته بندی هوشمند مرتب تب ها پوشه ai organize group", icon: ICON("sparkles"), run: () => NP.autoGroup?.run() },
    { t: "Google Meet", k: "میت جلسه تماس meet call meeting", icon: ICON("selectable/video"), run: () => NP.meet?.open() },
    { t: "New tab", k: "تب جدید new tab", icon: ICON("plus"), run: () => BrowserCommands.openTab() },
    { t: "Close tab", k: "بستن تب close", icon: ICON("close"), run: () => gBrowser.removeTab(gBrowser.selectedTab, { animate: true }) },
    { t: "Duplicate tab", k: "تکثیر کپی تب duplicate", icon: ICON("duplicate-tab"), run: () => (gBrowser.selectedTab = gBrowser.duplicateTab(gBrowser.selectedTab)) },
    { t: "Pin / unpin tab", k: "پین سنجاق pin", icon: ICON("pin"), run: () => { const t = gBrowser.selectedTab; t.pinned ? gBrowser.unpinTab(t) : gBrowser.pinTab(t); } },
    { t: "Mute / unmute tab", k: "بی صدا صدا mute sound", icon: ICON("media-mute"), run: () => gBrowser.selectedTab.toggleMuteAudio() },
    { t: "Reload", k: "بارگذاری مجدد رفرش reload refresh", icon: ICON("reload"), run: () => BrowserCommands.reload() },
    { t: "Copy page link", k: "کپی لینک آدرس copy url link", icon: ICON("link"), run: () => { Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(gBrowser.currentURI.spec); NP.island?.show({ title: "Link copied", subtitle: gBrowser.currentURI.displaySpec, duration: 1800 }); } },
    { t: "Reader view", k: "حالت خواندن reader", icon: ICON("reader-mode"), run: () => AboutReaderParent.toggleReaderMode({ target: gBrowser.selectedBrowser }) },
    { t: "Split with next tab", k: "تقسیم صفحه کنار هم split", icon: ICON("split"), run: () => { const i = gBrowser.visibleTabs.indexOf(gBrowser.selectedTab); const other = gBrowser.visibleTabs[i + 1] ?? gBrowser.visibleTabs[i - 1]; if (other) gZenViewSplitter.splitTabs([gBrowser.selectedTab, other]); } },
    { t: "Toggle sidebar", k: "سایدبار نوار کناری compact sidebar", icon: ICON("sidebar"), run: () => (gZenCompactModeManager.preference = !gZenCompactModeManager.preference) },
    { t: "Screenshot", k: "اسکرین شات عکس screenshot", icon: ICON("screenshot"), run: () => Services.obs.notifyObservers(window, "menuitem-screenshot", "contextMenu") },
    { t: "Downloads", k: "دانلودها downloads", icon: ICON("downloads"), run: () => openUrl("about:downloads") },
    { t: "Nebula Plus settings", k: "تنظیمات تم settings theme mods", icon: ICON("settings"), run: () => openUrl("about:preferences#zenMarketplace") },
  ];

  async function placesSearch(q) {
    if (q.length < 2) return [];
    try {
      const db = await PlacesUtils.promiseDBConnection();
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      const rows = await db.executeCached(
        `SELECT h.url, h.title, (SELECT 1 FROM moz_bookmarks b WHERE b.fk = h.id LIMIT 1) AS bm
         FROM moz_places h
         WHERE h.hidden = 0 AND h.visit_count > 0 AND (h.title LIKE :q ESCAPE '\\' OR h.url LIKE :q ESCAPE '\\')
         ORDER BY bm DESC, h.frecency DESC LIMIT 12`,
        { q: like },
      );
      return rows.map((r) => ({ url: r.getResultByName("url"), title: r.getResultByName("title"), bm: !!r.getResultByName("bm") }));
    } catch (err) {
      NP.logger.warn(`Palette history search failed: ${err}`);
      return [];
    }
  }

  NP.feature({
    name: "CommandPalette",
    init() {
      this.el = NP.html("div", { id: "nplus-palette", hidden: "true" }, [
        NP.html("div", { class: "pal-card" }, [
          NP.html("div", { class: "pal-input-row" }, [
            NP.html("div", { class: "pal-search-icon" }),
            NP.html("input", { class: "pal-input", type: "text", dir: "auto", placeholder: "Search tabs, history, actions…  جستجو…" }),
            NP.html("kbd", { class: "pal-kbd", text: "Esc" }),
          ]),
          NP.html("div", { class: "pal-list" }),
        ]),
      ]);
      document.body.append(this.el);
      this.input = this.el.querySelector(".pal-input");
      this.list = this.el.querySelector(".pal-list");

      this.input.addEventListener("input", () => this.update());
      this.input.addEventListener("keydown", (e) => this.onKey(e));
      this.el.addEventListener("mousedown", (e) => {
        if (e.target === this.el) this.close();
      });
      this.list.addEventListener("click", (e) => {
        const row = e.target.closest(".pal-row");
        if (row) this.run(Number(row.dataset.i));
      });
      this.list.addEventListener("mousemove", (e) => {
        const row = e.target.closest(".pal-row");
        if (row && Number(row.dataset.i) !== this.sel) this.select(Number(row.dataset.i));
      });

      this.offs = [
        NP.hotkey?.("ctrl+k", () => this.toggle()),
        NP.hotkey?.("ctrl+shift+space", () => this.toggle()),
      ];
      NP.palette = { open: () => this.open(), close: () => this.close() };
    },

    toggle() {
      this.isOpen ? this.close() : this.open();
    },

    open() {
      this.isOpen = true;
      this.el.removeAttribute("hidden");
      this.el.getBoundingClientRect();
      this.el.setAttribute("open", "true");
      this.input.value = "";
      this.update();
      setTimeout(() => this.input.focus(), 0);
    },

    close() {
      this.isOpen = false;
      this.el.removeAttribute("open");
      setTimeout(() => !this.isOpen && this.el.setAttribute("hidden", "true"), 250);
      gBrowser.selectedBrowser.focus();
    },

    async update() {
      const raw = this.input.value.trim();
      const q = raw.toLowerCase();
      const token = (this.token = Symbol());
      const items = [];

      // Open tabs (all workspaces)
      for (const tab of gBrowser.tabs) {
        if (tab.hasAttribute("zen-empty-tab") || tab.closing) continue;
        const url = tab.linkedBrowser?.currentURI?.spec ?? "";
        const s = score(`${tab.label} ${url}`, q);
        if (s > 0) {
          items.push({
            kind: "Tab",
            title: tab.label,
            sub: url.replace(/^https?:\/\//, ""),
            icon: tab.image,
            s: s + (tab === gBrowser.selectedTab ? -5 : 2),
            run: () => switchTo(tab),
          });
        }
      }

      // Actions
      for (const c of COMMANDS()) {
        if (c.when && !c.when()) continue;
        const s = score(`${c.t} ${c.k}`, q);
        if (s > 0) items.push({ kind: "Action", title: c.t, icon: c.icon, mask: true, s: s + (q ? 1 : -2), run: c.run });
      }

      // Lyrics of the song that's playing: type a line, jump right to it
      const st = NP.lyricsState;
      const m = NP.media?.current;
      if (q.length >= 2 && m && st?.key === `${m.title}|${m.artist}` && st.lines?.length) {
        const seen = new Set();
        for (const l of st.lines) {
          if (!l.text || seen.has(l.text)) continue;
          const sc = score(l.text, q);
          if (sc < 60) continue; // real matches only
          seen.add(l.text);
          items.push({
            kind: NP.formatTime(l.time),
            title: l.text,
            sub: `${m.title} — ${m.artist}`,
            icon: ICON("selectable/music"),
            mask: true,
            s: sc + 5,
            run: () => NP.media.seek(l.time + 0.01),
          });
        }
      }

      items.sort((a, b) => b.s - a.s);
      let shown = items.slice(0, q ? 7 : MAX);

      if (q) {
        if (looksLikeUrl(raw)) {
          const url = /^[a-z]+:/i.test(raw) ? raw : `https://${raw}`;
          shown.unshift({ kind: "Open", title: url, icon: ICON("open"), mask: true, run: () => openUrl(url) });
        }
        shown.push({
          kind: "Search",
          title: raw,
          sub: "Search the web",
          icon: ICON("search-glass"),
          mask: true,
          run: async () => {
            const engine = await Services.search.getDefault();
            openUrl(engine.getSubmission(raw).uri.spec);
          },
        });
      }
      this.render(shown);

      // History & bookmarks arrive a moment later
      if (q.length >= 2) {
        const places = await placesSearch(raw);
        if (token !== this.token) return;
        const openUrls = new Set(gBrowser.tabs.map((t) => t.linkedBrowser?.currentURI?.spec));
        const seenTitles = new Set();
        const extra = places
          .filter((p) => !openUrls.has(p.url) && !/google\.[a-z.]+\/url\?/.test(p.url))
          .filter((p) => {
            const key = (p.title || p.url).toLowerCase();
            if (seenTitles.has(key)) return false;
            seenTitles.add(key);
            return true;
          })
          .slice(0, 5)
          .map((p) => ({
            kind: p.bm ? "Bookmark" : "History",
            title: p.title || p.url,
            sub: p.url.replace(/^https?:\/\//, ""),
            icon: `page-icon:${p.url}`,
            run: () => openUrl(p.url),
          }));
        const search = shown.pop();
        this.render([...shown, ...extra, search]);
      }
    },

    render(items) {
      this.items = items;
      this.list.replaceChildren(
        ...items.map((it, i) => {
          const icon = NP.html("div", { class: "pal-icon" });
          if (it.mask) {
            icon.classList.add("mask");
            icon.style.setProperty("--icon", `url("${it.icon}")`);
          } else if (it.icon) {
            icon.style.backgroundImage = `url("${it.icon}")`;
          }
          return NP.html("div", { class: "pal-row", "data-i": i, style: `--i:${i}` }, [
            icon,
            NP.html("div", { class: "pal-text" }, [
              NP.html("div", { class: "pal-title", dir: "auto", text: it.title }),
              it.sub ? NP.html("div", { class: "pal-sub", text: it.sub }) : null,
            ]),
            NP.html("div", { class: "pal-kind", text: it.kind }),
          ]);
        }),
      );
      this.select(0);
    },

    select(i) {
      const rows = this.list.children;
      if (!rows.length) return;
      this.sel = (i + rows.length) % rows.length;
      for (const r of rows) r.removeAttribute("selected");
      rows[this.sel].setAttribute("selected", "true");
      rows[this.sel].scrollIntoView({ block: "nearest" });
    },

    onKey(e) {
      if (e.key === "ArrowDown") (e.preventDefault(), this.select(this.sel + 1));
      else if (e.key === "ArrowUp") (e.preventDefault(), this.select(this.sel - 1));
      else if (e.key === "Enter") (e.preventDefault(), this.run(this.sel));
      else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), this.close());
    },

    run(i) {
      const it = this.items?.[i];
      if (!it) return;
      this.close();
      setTimeout(() => {
        try {
          it.run();
        } catch (err) {
          NP.logger.error(`Palette action "${it.title}" failed`, err);
        }
      }, 60);
    },

    destroy() {
      this.offs?.forEach((off) => off?.());
      this.el?.remove();
      delete NP.palette;
    },
  });
})();
