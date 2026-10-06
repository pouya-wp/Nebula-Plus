// Nebula Plus — work modes: درس · کار · تفریح.
// One click switches context: to the Zen workspace with the same name (if
// you have one), opens that mode's saved tabs, and in درس / کار turns the
// focus shield on for distracting sites until you leave the mode. Save the
// tabs you have open now as a mode's set from the panel (palette → "Modes").
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-modes"] = true;

  const MODES = [
    { id: "study", name: "درس", icon: "📚", shield: true },
    { id: "work", name: "کار", icon: "💼", shield: true },
    { id: "fun", name: "تفریح", icon: "🎮", shield: false },
  ];

  NP.feature({
    name: "Modes",
    async init() {
      if (!NP.prefs.get("nplus-modes")) return;
      await NP.store.load();
      NP.modes = { open: () => this.open(), set: (id) => this.activate(id) };
      this.build();
      const cur = NP.store.data.mode;
      if (cur) setTimeout(() => this.applyShield(cur), 3000);
    },

    data() {
      return (NP.store.data.modeTabs ??= {});
    },

    async workspaceFor(name) {
      try {
        const ws = await window.gZenWorkspaces?.getWorkspaces?.();
        const list = Array.isArray(ws) ? ws : ws?.workspaces ?? [];
        return list.find((w) => (w.name ?? "").trim() === name) ?? null;
      } catch {
        return null;
      }
    },

    async activate(id) {
      const m = MODES.find((x) => x.id === id);
      const prev = NP.store.data.mode;
      if (!m || prev === id) return this.leave();
      NP.store.set("mode", id);
      NP.store.data.mode = id;
      const ws = await this.workspaceFor(m.name);
      if (ws) {
        try {
          await gZenWorkspaces.changeWorkspace(ws);
        } catch {}
      }
      const open = new Set(gBrowser.tabs.map((t) => t.linkedBrowser.currentURI.spec));
      const want = (this.data()[id] ?? []).filter((u) => !open.has(u));
      for (const u of want) gBrowser.addTab(u, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(), inBackground: true, skipAnimation: true });
      this.applyShield(id);
      NP.setRootAttr("nplus-mode", id);
      NP.island?.show({ id: "mode", title: `${m.icon} حالت ${m.name}`, subtitle: [ws ? `فضای کاری «${m.name}»` : "", want.length ? `${want.length} تب باز شد` : "", m.shield ? "سپر تمرکز روشنه" : ""].filter(Boolean).join(" · ") || "فعال شد", duration: 3000 });
      this.render();
    },

    applyShield(id) {
      const m = MODES.find((x) => x.id === id);
      NP.setRootAttr("nplus-mode", id || false);
      // the focus shield, with no end time: on until the mode changes
      if (m?.shield) NP.emit?.("focus", { on: true, end: Date.now() + 365 * 86400000, task: `حالت ${m.name}`, mode: true });
    },

    leave() {
      const id = NP.store.data.mode;
      if (!id) return;
      NP.store.set("mode", undefined);
      delete NP.store.data.mode;
      NP.setRootAttr("nplus-mode", false);
      if (MODES.find((x) => x.id === id)?.shield && !NP.focus?.active) NP.emit?.("focus", { on: false, mode: true });
      NP.island?.show({ id: "mode", title: "از حالت بیرون اومدی", duration: 2000 });
      this.render();
    },

    saveTabs(id) {
      const urls = gBrowser.visibleTabs
        .filter((t) => !t.hasAttribute("nplus-worker") && !t.hasAttribute("zen-empty-tab"))
        .map((t) => t.linkedBrowser.currentURI.spec)
        .filter((u) => /^https?:/.test(u))
        .slice(0, 30);
      this.data()[id] = urls;
      NP.store.set("modeTabs", this.data());
      NP.island?.show({ title: `${urls.length} تب برای حالت ${MODES.find((x) => x.id === id).name} ذخیره شد`, duration: 2200 });
      this.render();
    },

    build() {
      this.panel = NP.html("div", { id: "nplus-modes-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [NP.html("div", { class: "wt-title", text: "🧭 حالت‌ها" })]),
        NP.html("div", { class: "md-grid" }),
        NP.html("div", { class: "wt-foot", text: "اگه یه فضای کاری Zen به همین اسم داشته باشی، خودش می‌ره اونجا" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-modes-panel") && this.close();
      window.addEventListener("mousedown", this.onDocDown, true);
    },

    open() {
      this.render();
      this.panel.hidden = false;
      this.panel.getBoundingClientRect();
      this.panel.setAttribute("open", "true");
    },
    close() {
      this.panel?.removeAttribute("open");
      setTimeout(() => this.panel && !this.panel.hasAttribute("open") && (this.panel.hidden = true), 250);
    },

    render() {
      const cur = NP.store.data.mode;
      this.panel.querySelector(".md-grid").replaceChildren(
        ...MODES.map((m) => {
          const n = (this.data()[m.id] ?? []).length;
          const card = NP.html("div", { class: "md-card" }, [
            NP.html("div", { class: "md-icon", text: m.icon }),
            NP.html("div", { class: "md-name", text: m.name }),
            NP.html("div", { class: "md-sub", text: `${n ? `${n} تب` : "بدون تب ذخیره"}${m.shield ? " · سپر تمرکز" : ""}` }),
            NP.html("button", { class: "wt-btn wt-primary md-go", text: cur === m.id ? "خروج" : "فعال کن", onclick: () => (this.activate(m.id), this.close()) }),
            NP.html("button", { class: "wt-btn md-save", text: "تب‌های الان رو ذخیره کن", onclick: () => this.saveTabs(m.id) }),
          ]);
          card.toggleAttribute("active", cur === m.id);
          return card;
        }),
      );
    },

    destroy() {
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.modes;
    },
  });
})();
