// ==UserScript==
// @name           plus-galaxy.uc.js
// @description    Nebula Plus tab galaxy: every tab as a floating card, folders as constellations
// ==/UserScript==

// Ctrl+Alt+E (or the command palette): the window turns into a dark sky.
// Each folder is a constellation, loose tabs gather in the middle. Scroll to
// zoom, drag the sky to pan, type to filter, click a card to go there, drag a
// card onto another constellation to move it, middle-click to close.

(function () {
  "use strict";

  const NP = window.NebulaPlus;
  if (!NP) return;

  const CARD_W = 176;
  const CARD_H = 112;

  NP.feature({
    name: "TabGalaxy",
    init() {
      this.el = NP.html("div", { id: "nplus-galaxy", hidden: "true" }, [
        NP.html("div", { class: "gx-stars" }),
        NP.html("div", { class: "gx-world" }),
        NP.html("div", { class: "gx-bar" }, [
          NP.html("input", { class: "gx-search", type: "text", dir: "auto", placeholder: "جستجو در کهکشان…" }),
          NP.html("span", { class: "gx-count" }),
          NP.html("button", { class: "gx-close", text: "✕", title: "Esc", onclick: () => this.close() }),
        ]),
        NP.html("div", { class: "gx-hint", text: "اسکرول: زوم · کشیدن: جابه‌جایی · کشیدن کارت روی یه منظومه: انتقال · کلیک وسط: بستن" }),
      ]);
      document.body.append(this.el);
      this.world = this.el.querySelector(".gx-world");
      this.search = this.el.querySelector(".gx-search");

      this.search.addEventListener("input", () => this.filter());
      this.search.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.close();
        if (e.key === "Enter") {
          const first = this.world.querySelector(".gx-card:not([dim])");
          if (first) this.go(first._tab);
        }
      });
      this.el.addEventListener("wheel", (e) => this.zoom(e), { passive: false });
      this.el.addEventListener("pointerdown", (e) => this.down(e));
      this.onKey = (e) => {
        if (this.isOpen && e.key === "Escape") {
          e.preventDefault();
          this.close();
        }
      };
      window.addEventListener("keydown", this.onKey, true);
      this.offKey = NP.hotkey?.("ctrl+alt+e", () => (this.isOpen ? this.close() : this.open()));
      NP.galaxy = { open: () => this.open(), close: () => this.close() };
    },

    // ---------- data ----------
    clusters() {
      const map = new Map();
      for (const tab of gBrowser.visibleTabs) {
        if (tab.hasAttribute("zen-empty-tab") || tab.hasAttribute("nplus-assistant") || tab.hasAttribute("nplus-worker") || tab.closing) continue;
        const folder = tab.group?.isZenFolder ? tab.group : null;
        const key = folder ?? (tab.hasAttribute("zen-essential") ? "essentials" : "loose");
        if (!map.has(key)) {
          map.set(key, {
            key,
            folder,
            label: folder ? folder.label : key === "essentials" ? "⭐ Essentials" : "✦ آزاد",
            tabs: [],
          });
        }
        map.get(key).tabs.push(tab);
      }
      // loose tabs sit in the middle
      return [...map.values()].sort((a, b) => (a.key === "loose" ? -1 : b.key === "loose" ? 1 : 0));
    },

    // ---------- open / close ----------
    open() {
      this.isOpen = true;
      this.view = { x: 0, y: 0, k: 1 };
      this.build();
      this.el.hidden = false;
      this.el.getBoundingClientRect();
      this.el.setAttribute("open", "true");
      this.search.value = "";
      setTimeout(() => this.search.focus(), 60);
    },

    close() {
      this.isOpen = false;
      this.el.removeAttribute("open");
      setTimeout(() => !this.isOpen && (this.el.hidden = true, this.world.replaceChildren()), 350);
    },

    go(tab) {
      this.close();
      if (window.gZenWorkspaces?.switchTabIfNeeded) gZenWorkspaces.switchTabIfNeeded(tab);
      else gBrowser.selectedTab = tab;
    },

    // ---------- layout ----------
    build() {
      const clusters = this.clusters();
      const W = window.innerWidth;
      const H = window.innerHeight;
      this.world.replaceChildren();
      this.clusterEls = [];
      let total = 0;
      let i = 0;

      // Constellations sit on an ellipse around the middle (loose tabs at the
      // center); inside each, cards form a small grid with the name above.
      const GAP = 16;
      const others = clusters.filter((c) => c.key !== "loose");
      const rx = W * (others.length > 3 ? 0.34 : 0.3);
      const ry = H * (others.length > 3 ? 0.3 : 0.26);
      const midY = H / 2 + 28; // leave room for the search bar
      clusters.forEach((c, ci) => {
        const isCenter = c.key === "loose" || !others.length;
        const k = others.indexOf(c);
        // start at the left and go round, so nothing sits right under the bar
        const angle = Math.PI + (k / Math.max(1, others.length)) * Math.PI * 2;
        const cx = isCenter ? W / 2 : W / 2 + Math.cos(angle) * rx;
        const cy = isCenter ? midY : midY + Math.sin(angle) * ry;

        const n = c.tabs.length;
        const cols = Math.min(n, Math.ceil(Math.sqrt(n * 1.6)));
        const rows = Math.ceil(n / cols);
        const gw = cols * CARD_W + (cols - 1) * GAP;
        const gh = rows * CARD_H + (rows - 1) * GAP;
        const x0 = cx - gw / 2;
        const y0 = cy - gh / 2;

        const size = Math.max(gw, gh) + 140;
        const halo = NP.html("div", { class: "gx-cluster" });
        Object.assign(halo.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
        halo.style.setProperty("--hue", `${(ci * 67 + 200) % 360}`);
        halo._cluster = c;
        this.world.append(halo);
        this.clusterEls.push(halo);

        const label = NP.html("div", { class: "gx-label", dir: "auto", text: `${c.label} · ${new Intl.NumberFormat("fa-IR").format(n)}` });
        label.style.setProperty("--hue", `${(ci * 67 + 200) % 360}`);
        Object.assign(label.style, { left: `${cx}px`, top: `${y0 - 44}px` });
        this.world.append(label);

        c.tabs.forEach((tab, ti) => {
          const col = ti % cols;
          const row = Math.floor(ti / cols);
          // center a short last row
          const inRow = row === rows - 1 ? n - row * cols : cols;
          const rowShift = ((cols - inRow) * (CARD_W + GAP)) / 2;
          const x = x0 + rowShift + col * (CARD_W + GAP);
          const y = y0 + row * (CARD_H + GAP);
          this.world.append(this.card(tab, x, y, i++, cx, cy));
          total++;
        });
      });
      this.el.querySelector(".gx-count").textContent = `${new Intl.NumberFormat("fa-IR").format(total)} تب`;
      this.apply();
    },

    card(tab, x, y, i, cx, cy) {
      const shot = NP.html("canvas", { class: "gx-shot" });
      const card = NP.html("div", { class: "gx-card", style: `--i:${i}; --fx:${cx - x - CARD_W / 2}px; --fy:${cy - y - CARD_H / 2}px` }, [
        shot,
        NP.html("div", { class: "gx-meta" }, [
          NP.html("div", { class: "gx-icon", style: tab.image ? `background-image:url("${tab.image}")` : "" }),
          NP.html("div", { class: "gx-title", dir: "auto", text: tab.label }),
        ]),
      ]);
      Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
      card._tab = tab;
      card.toggleAttribute("selected", tab.selected);
      card.toggleAttribute("sleeping", tab.hasAttribute("pending"));
      card.toggleAttribute("playing", tab.hasAttribute("soundplaying"));
      const bmp = NP.tabShot?.(tab);
      if (bmp) {
        shot.width = bmp.width;
        shot.height = bmp.height;
        shot.getContext("2d").drawImage(bmp, 0, 0);
      } else {
        card.setAttribute("noshot", "true");
      }
      return card;
    },

    filter() {
      const q = this.search.value.trim().toLowerCase();
      let shown = 0;
      for (const card of this.world.querySelectorAll(".gx-card")) {
        const t = card._tab;
        const hay = `${t.label} ${t.linkedBrowser?.currentURI?.spec ?? ""}`.toLowerCase();
        const match = !q || hay.includes(q);
        card.toggleAttribute("dim", !match);
        if (match) shown++;
      }
      this.el.querySelector(".gx-count").textContent = `${new Intl.NumberFormat("fa-IR").format(shown)} تب`;
    },

    // ---------- pan & zoom ----------
    apply() {
      const { x, y, k } = this.view;
      this.world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
      this.el.querySelector(".gx-stars").style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    },

    zoom(e) {
      e.preventDefault();
      const k0 = this.view.k;
      const k = Math.min(2.4, Math.max(0.35, k0 * Math.exp(-e.deltaY * 0.0012)));
      // keep the point under the cursor fixed
      this.view.x = e.clientX - ((e.clientX - this.view.x) * k) / k0;
      this.view.y = e.clientY - ((e.clientY - this.view.y) * k) / k0;
      this.view.k = k;
      this.apply();
    },

    down(e) {
      if (e.target.closest(".gx-bar")) return;
      const card = e.target.closest(".gx-card");
      if (e.button === 1 && card) {
        e.preventDefault();
        gBrowser.removeTab(card._tab, { animate: true });
        card.setAttribute("closing", "true");
        setTimeout(() => card.remove(), 300);
        return;
      }
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
      let dragging = false;
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!dragging && Math.hypot(dx, dy) > 6) {
          dragging = true;
          if (card) card.setAttribute("dragging", "true");
        }
        if (!dragging) return;
        if (card) {
          card.style.translate = `${dx / this.view.k}px ${dy / this.view.k}px`;
          const over = this.clusterAt(ev.clientX, ev.clientY);
          for (const c of this.clusterEls) c.toggleAttribute("target", c === over);
        } else {
          this.view.x = start.vx + dx;
          this.view.y = start.vy + dy;
          this.apply();
        }
      };
      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        for (const c of this.clusterEls) c.removeAttribute("target");
        if (!dragging) {
          if (card) this.go(card._tab);
          return;
        }
        if (card) {
          card.removeAttribute("dragging");
          const target = this.clusterAt(ev.clientX, ev.clientY);
          if (target && target._cluster !== this.clusterOf(card._tab)) this.moveTo(card._tab, target._cluster);
          else card.style.translate = "";
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },

    clusterAt(x, y) {
      for (const c of this.clusterEls) {
        const r = c.getBoundingClientRect();
        const dx = x - (r.left + r.width / 2);
        const dy = y - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < r.width / 2) return c;
      }
      return null;
    },

    clusterOf(tab) {
      return this.clusterEls.find((c) => c._cluster.tabs.includes(tab))?._cluster;
    },

    moveTo(tab, cluster) {
      try {
        if (cluster.folder) {
          if (!tab.pinned) gBrowser.pinTab(tab);
          cluster.folder.addTabs([tab]);
        } else if (cluster.key === "loose") {
          if (tab.group) gBrowser.ungroupTab(tab);
          if (tab.pinned) gBrowser.unpinTab(tab);
        }
        NP.sound?.("done");
      } catch (err) {
        NP.logger.warn(`Galaxy move failed: ${err}`);
      }
      // rebuild with the new layout, keeping the camera
      setTimeout(() => {
        const view = this.view;
        this.build();
        this.view = view;
        this.apply();
        this.world.setAttribute("settled", "true");
      }, 250);
    },

    destroy() {
      window.removeEventListener("keydown", this.onKey, true);
      this.offKey?.();
      this.el?.remove();
      delete NP.galaxy;
    },
  });
})();
