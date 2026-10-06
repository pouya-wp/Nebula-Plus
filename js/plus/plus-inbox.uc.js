// Nebula Plus — messenger inbox in the sidebar.
// Every messenger you have open in a tab (Telegram, Rubika, Eitaa, Bale,
// WhatsApp, Instagram, Discord, Gmail…) gets a small round icon above the
// sidebar footer with its unread count (read from the tab title, so it
// works for all of them without logging into anything). Click to jump
// there; new messages in a tab you're not looking at nudge the island.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-inbox"] = true;

  const SERVICES = [
    { id: "telegram", name: "تلگرام", re: /(^|\.)telegram\.org$/ },
    { id: "rubika", name: "روبیکا", re: /(^|\.)rubika\.ir$/ },
    { id: "eitaa", name: "ایتا", re: /(^|\.)eitaa\.com$/ },
    { id: "bale", name: "بله", re: /(^|\.)bale\.ai$/ },
    { id: "soroush", name: "سروش", re: /(^|\.)splus\.ir$/ },
    { id: "whatsapp", name: "واتس‌اپ", re: /^web\.whatsapp\.com$/ },
    { id: "instagram", name: "اینستاگرام", re: /(^|\.)instagram\.com$/ },
    { id: "discord", name: "دیسکورد", re: /(^|\.)discord\.com$/ },
    { id: "gmail", name: "جیمیل", re: /^mail\.google\.com$/ },
    { id: "x", name: "ایکس", re: /^(x|twitter)\.com$/ },
  ];
  const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  function unread(label) {
    const m = String(label).match(/\((\d{1,4})\+?\)/) ?? String(label).match(/^(\d{1,4})\s/);
    return m ? Number(m[1]) : 0;
  }

  NP.feature({
    name: "Inbox",
    init() {
      if (!NP.prefs.get("nplus-inbox")) return;
      this.el = NP.html("div", { id: "nplus-inbox", hidden: "true" });
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      (document.getElementById("nplus-clock") ?? foot)?.before(this.el);
      this.last = new Map();
      this.onChange = (e) => {
        if (e.type === "TabAttrModified" && !e.detail?.changed?.some((a) => a === "label" || a === "image")) return;
        clearTimeout(this.t);
        this.t = setTimeout(() => this.update(), 300);
      };
      for (const ev of ["TabAttrModified", "TabOpen", "TabClose", "TabSelect"]) gBrowser.tabContainer.addEventListener(ev, this.onChange);
      this.update();
    },

    find() {
      const out = new Map();
      for (const tab of gBrowser.tabs) {
        if (tab.hasAttribute("nplus-worker")) continue;
        let host = "";
        try {
          host = tab.linkedBrowser.currentURI.host;
        } catch {
          continue;
        }
        const s = SERVICES.find((x) => x.re.test(host));
        if (!s) continue;
        const cur = out.get(s.id) ?? { ...s, tabs: [], n: 0 };
        cur.tabs.push(tab);
        cur.n += unread(tab.label);
        cur.icon ??= tab.getAttribute("image");
        cur.host ??= host;
        out.set(s.id, cur);
      }
      return [...out.values()];
    },

    update() {
      const list = this.find();
      this.el.hidden = !list.length;
      this.el.replaceChildren(
        ...list.map((s) => {
          const img = NP.html("img", { src: s.icon || `http://127.0.0.1:47321/favicon?host=${s.host}` });
          img.onerror = () => (img.style.visibility = "hidden");
          const b = NP.html("button", { class: "ib-item", title: s.n ? `${s.name} · ${fa(s.n)} خوانده‌نشده` : s.name }, [
            img,
            s.n ? NP.html("span", { class: "ib-badge", text: s.n > 99 ? "۹۹+" : fa(s.n) }) : null,
          ].filter(Boolean));
          b.toggleAttribute("unread", s.n > 0);
          b.toggleAttribute("current", s.tabs.includes(gBrowser.selectedTab));
          b.addEventListener("click", () => {
            const t = s.tabs.find((x) => unread(x.label) > 0) ?? s.tabs[0];
            if (window.gZenWorkspaces?.switchTabIfNeeded) gZenWorkspaces.switchTabIfNeeded(t);
            else gBrowser.selectedTab = t;
          });
          // new messages where you aren't looking: a quiet nudge
          const before = this.last.get(s.id) ?? s.n;
          if (s.n > before && !s.tabs.includes(gBrowser.selectedTab)) {
            NP.island?.show({ id: `inbox-${s.id}`, title: `${fa(s.n - before)} پیام تازه در ${s.name}`, icon: "💬", art: s.icon, duration: 4000, onClick: () => b.click() });
          }
          this.last.set(s.id, s.n);
          return b;
        }),
      );
    },

    destroy() {
      clearTimeout(this.t);
      for (const ev of ["TabAttrModified", "TabOpen", "TabClose", "TabSelect"]) gBrowser.tabContainer.removeEventListener(ev, this.onChange);
      this.el?.remove();
    },
  });
})();
