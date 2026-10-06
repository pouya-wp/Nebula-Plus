// Nebula Plus — price tracker (Digikala).
// On a Digikala product page: palette → "Track this price" (or Ctrl+Alt+I).
// Every few hours its price is checked through Digikala's own API (no page
// is opened), kept as a history, and when it gets cheaper — or comes back
// in stock — you hear about it on the island. The panel shows each item
// with a small chart, lowest / highest and the change.
// (Other shops: use the watcher, Ctrl+Alt+W, on the price.)
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-prices"] = true;

  const fa = (n) => Math.round(n).toLocaleString("fa-IR");
  const dkp = (url) => String(url).match(/digikala\.com\/product\/dkp-(\d+)/)?.[1];

  async function fetchDk(id) {
    const r = await (await fetch(`https://api.digikala.com/v2/product/${id}/`, { signal: AbortSignal.timeout(10000) })).json();
    const p = r?.data?.product;
    if (!p) throw new Error("no product");
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const dv = !Array.isArray(p.default_variant) ? p.default_variant : null;
    const prices = [dv, ...variants].map((v) => v?.price?.selling_price).filter((x) => x > 0);
    return { title: p.title_fa || p.title_en || `dkp-${id}`, price: prices.length ? Math.min(...prices) / 10 : null, image: p.images?.main?.url?.[0] ?? "" };
  }

  NP.feature({
    name: "PriceTracker",
    async init() {
      if (!NP.prefs.get("nplus-prices")) return;
      await NP.store.load();
      NP.prices = { track: () => this.track(), open: () => this.open(), canTrack: () => !!dkp(gBrowser.currentURI.spec) };
      this.offKey = NP.hotkey?.("ctrl+alt+i", () => (dkp(gBrowser.currentURI.spec) ? this.track() : this.open()));
      this.build();
      this.timer = setInterval(() => this.checkAll(), 3 * 3600000);
      setTimeout(() => this.checkAll(true), 5 * 60000);
    },

    items() {
      return NP.store.data.prices ?? [];
    },
    save(list) {
      NP.store.data.prices = list;
      NP.store.set("prices", list);
      if (!this.panel.hidden) this.render();
    },

    async track() {
      const id = dkp(gBrowser.currentURI.spec);
      if (!id) return NP.island?.show({ title: "این صفحه محصول دیجی‌کالا نیست", subtitle: "برای بقیه‌ی سایت‌ها از چشم مراقب استفاده کن (Ctrl+Alt+W)", duration: 3500 });
      const list = this.items();
      if (list.some((x) => x.id === id)) return this.open();
      try {
        const r = await fetchDk(id);
        list.push({ id, src: "dk", title: r.title, url: gBrowser.currentURI.spec.split("?")[0], image: r.image, hist: [[Date.now(), r.price]], added: Date.now() });
        this.save(list);
        NP.island?.show({ id: "prices", title: "قیمتش رو زیر نظر گرفتم 🏷", subtitle: `${r.title.slice(0, 50)} · ${r.price ? `${fa(r.price)} تومان` : "ناموجود"}`, duration: 4000, onClick: () => this.open() });
      } catch (err) {
        NP.island?.show({ title: "قیمت خونده نشد", subtitle: String(err.message || err).slice(0, 80), duration: 3000 });
      }
    },

    async checkAll(startup) {
      if (Services.wm.getMostRecentWindow("navigator:browser") !== window) return;
      const list = this.items();
      if (!list.length) return;
      let changed = false;
      for (const it of list) {
        if (startup && Date.now() - (it.hist.at(-1)?.[0] ?? 0) < 2 * 3600000) continue;
        try {
          const r = await fetchDk(it.id);
          const last = it.hist.at(-1)?.[1] ?? null;
          it.hist = [...it.hist, [Date.now(), r.price]].slice(-200);
          changed = true;
          if (r.price && last && r.price < last * 0.995) {
            NP.island?.show({ id: `price-${it.id}`, title: `ارزون شد: ${it.title.slice(0, 40)}`, subtitle: `${fa(last)} ← ${fa(r.price)} تومان (${fa(((last - r.price) / last) * 100)}٪ کمتر)`, icon: "🏷", duration: 15000, onClick: () => openTrustedLinkIn(it.url, "tab") });
          } else if (r.price && !last) {
            NP.island?.show({ id: `price-${it.id}`, title: `موجود شد: ${it.title.slice(0, 40)}`, subtitle: `${fa(r.price)} تومان`, icon: "🏷", duration: 15000, onClick: () => openTrustedLinkIn(it.url, "tab") });
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (changed) this.save(list);
    },

    // ---------- panel ----------
    build() {
      this.panel = NP.html("div", { id: "nplus-prices-panel", class: "nplus-panel", hidden: "true" }, [
        NP.html("div", { class: "wt-head" }, [
          NP.html("div", { class: "wt-title", text: "🏷 ردیاب قیمت" }),
          NP.html("button", { class: "wt-btn", text: "بررسی همه", onclick: () => this.checkAll() }),
          NP.html("button", { class: "wt-btn wt-primary", text: "+ این محصول", onclick: () => this.track() }),
        ]),
        NP.html("div", { class: "wt-list" }),
        NP.html("div", { class: "wt-foot", text: "روی صفحه‌ی محصول دیجی‌کالا: Ctrl+Alt+I · هر ۳ ساعت چک می‌شه" }),
      ]);
      document.body.append(this.panel);
      this.onDocDown = (e) => !this.panel.hidden && !e.target.closest?.("#nplus-prices-panel") && this.close();
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
      const list = this.panel.querySelector(".wt-list");
      const items = this.items();
      if (!items.length) {
        list.replaceChildren(NP.html("div", { class: "wt-empty", text: "هنوز چیزی زیر نظر نیست. یه صفحه‌ی محصول دیجی‌کالا باز کن و + این محصول رو بزن." }));
        return;
      }
      list.replaceChildren(
        ...items.map((it) => {
          const vals = it.hist.map((h) => h[1]).filter((x) => x);
          const now = it.hist.at(-1)?.[1];
          const first = vals[0];
          const lo = Math.min(...vals);
          const hi = Math.max(...vals);
          const NS = "http://www.w3.org/2000/svg";
          const svg = document.createElementNS(NS, "svg");
          svg.setAttribute("viewBox", "0 0 100 28");
          svg.setAttribute("class", "pr-spark");
          if (vals.length > 1) {
            const pl = document.createElementNS(NS, "polyline");
            pl.setAttribute("points", vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / (hi - lo || 1)) * 22).toFixed(1)}`).join(" "));
            svg.append(pl);
          }
          const delta = now && first ? ((now - first) / first) * 100 : 0;
          const row = NP.html("div", { class: "wt-row np-clickable" }, [
            it.image ? NP.html("img", { class: "pr-img", src: it.image }) : null,
            NP.html("div", { class: "wt-main" }, [
              NP.html("div", { class: "wt-name", dir: "auto", text: it.title }),
              NP.html("div", { class: "wt-value", text: now ? `${fa(now)} تومان` : "ناموجود" }),
              NP.html("div", { class: "wt-meta", text: vals.length ? `کمترین ${fa(lo)} · بیشترین ${fa(hi)}${delta ? ` · ${delta < 0 ? "▼" : "▲"}${fa(Math.abs(delta))}٪ از اول` : ""}` : "" }),
            ]),
            svg,
            NP.html("div", { class: "wt-actions" }, [NP.html("button", { class: "wt-icon", title: "حذف", text: "✕", onclick: (e) => (e.stopPropagation(), this.save(this.items().filter((x) => x.id !== it.id))) })]),
          ].filter(Boolean));
          row.toggleAttribute("cheaper", delta < 0);
          row.addEventListener("click", () => (openTrustedLinkIn(it.url, "tab"), this.close()));
          return row;
        }),
      );
    },

    destroy() {
      clearInterval(this.timer);
      this.offKey?.();
      window.removeEventListener("mousedown", this.onDocDown, true);
      this.panel?.remove();
      delete NP.prices;
    },
  });
})();
