// Nebula Plus — link X-ray.
// Rest the mouse on a link for a moment (or hold Shift over it) and a small
// card shows where it really goes: the real site (redirect wrappers like
// google.com/url?q= unwrapped), the page's own title and description, and
// warnings — not https, link text that names a different site than the
// one it opens, look-alike (punycode) domains, files that download.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-xray"] = true;

  const SHEET = `
    :where(#nplus-xray, #nplus-xray *) { all: revert !important; box-sizing: border-box !important; }
    #nplus-xray {
      position: fixed !important; left: var(--nx) !important; top: var(--ny) !important; z-index: 2147483647 !important;
      display: block !important; width: max-content !important; max-width: 360px !important; margin: 0 !important; padding: 10px 12px !important;
      border-radius: 14px !important; pointer-events: none !important;
      background: rgb(22 22 32 / 94%) !important; backdrop-filter: blur(20px) saturate(170%) !important;
      box-shadow: 0 0 0 1px rgb(255 255 255 / 10%), 0 16px 40px -14px rgb(0 0 0 / 70%) !important;
      font: 500 12px/1.55 "Meem", "Vazirmatn", "Segoe UI", system-ui, sans-serif !important; color: #f2f2f8 !important;
      direction: ltr !important; text-align: left !important;
      animation: nplus-xray-in .16s ease-out !important;
    }
    @keyframes nplus-xray-in { from { opacity: 0; translate: 0 4px; } }
    #nplus-xray .nx-host { display: flex !important; align-items: center !important; gap: 7px !important; font-weight: 800 !important; font-size: 13px !important; }
    #nplus-xray .nx-host img { display: block !important; width: 16px !important; height: 16px !important; border-radius: 4px !important; }
    #nplus-xray .nx-lock { display: inline-block !important; padding: 1px 6px !important; border-radius: 6px !important; font-size: 10px !important; font-weight: 700 !important;
      background: rgb(91 227 160 / 18%) !important; color: #7ff0b8 !important; }
    #nplus-xray .nx-lock[data-bad] { background: rgb(255 180 60 / 18%) !important; color: #ffc46b !important; }
    #nplus-xray .nx-path { display: block !important; margin-top: 2px !important; color: rgb(242 242 248 / 55%) !important; font-size: 11px !important;
      white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 336px !important; }
    #nplus-xray .nx-title { display: block !important; margin-top: 8px !important; font-weight: 700 !important; font-size: 12.5px !important; unicode-bidi: plaintext !important; }
    #nplus-xray .nx-desc { display: block !important; margin-top: 2px !important; color: rgb(242 242 248 / 70%) !important; unicode-bidi: plaintext !important;
      display: -webkit-box !important; -webkit-box-orient: vertical !important; -webkit-line-clamp: 3 !important; overflow: hidden !important; }
    #nplus-xray .nx-warn { display: block !important; margin-top: 8px !important; padding: 5px 9px !important; border-radius: 9px !important;
      background: rgb(229 72 77 / 18%) !important; color: #ff9b9e !important; font-weight: 700 !important; direction: rtl !important; text-align: right !important; }
    #nplus-xray .nx-note { display: block !important; margin-top: 6px !important; color: #b9b0ff !important; font-weight: 600 !important; direction: rtl !important; text-align: right !important; }
  `;

  // Content side (ASCII only; words arrive with the config).
  const XRAY = `(function(G){
    var ME = {}; G.__nplus_xray = ME;
    function stale() { return G.__nplus_xray !== ME; }
    var cfg = null, el = null, timer = 0, cur = null, req = 0;
    function d() { return content.document; }
    function hide() { content.clearTimeout(timer); cur = null; if (el) { el.remove(); el = null; } }
    var WRAP = [
      [/(^|\\.)google\\.[a-z.]+$/, '/url', ['q', 'url']],
      [/^l\\.facebook\\.com$|^lm\\.facebook\\.com$/, '/l.php', ['u']],
      [/^l\\.instagram\\.com$/, '/', ['u']],
      [/(^|\\.)youtube\\.com$/, '/redirect', ['q']],
      [/^out\\.reddit\\.com$/, '/', ['url']],
      [/^(www\\.)?linkedin\\.com$/, '/redir', ['url']],
      [/(^|\\.)duckduckgo\\.com$/, '/l/', ['uddg']],
      [/^away\\.vk\\.com$/, '/away.php', ['to']]
    ];
    function unwrap(u) {
      for (var i = 0; i < 4; i++) {
        var hit = false;
        for (var j = 0; j < WRAP.length; j++) {
          var w = WRAP[j];
          if (w[0].test(u.hostname) && u.pathname.indexOf(w[1]) === 0) {
            for (var k = 0; k < w[2].length; k++) { var v = u.searchParams.get(w[2][k]); if (v && /^https?:/.test(v)) { try { u = new content.URL(v); hit = true; } catch (e) {} break; } }
          }
          if (hit) break;
        }
        if (!hit) break;
      }
      return u;
    }
    function base(h) { var p = h.replace(/^www\\./, '').split('.'); return p.slice(-2).join('.'); }
    function show(a, x, y) {
      var raw; try { raw = new content.URL(a.href); } catch (e) { return; }
      if (!/^https?:$/.test(raw.protocol)) return;
      var u = unwrap(raw), here = content.location.hostname;
      var wrapped = u.href !== raw.href;
      if (!wrapped && base(u.hostname) === base(here) && !content.__nplus_xray_shift) return;
      hide(); cur = a;
      var L = cfg.labels;
      el = d().createElement('div'); el.id = 'nplus-xray';
      var host = d().createElement('div'); host.className = 'nx-host';
      var ic = d().createElement('img'); ic.src = 'https://icons.duckduckgo.com/ip3/' + u.hostname + '.ico'; ic.onerror = function () { ic.remove(); };
      var hn = d().createElement('span'); hn.textContent = u.hostname.replace(/^www\\./, '');
      var lock = d().createElement('span'); lock.className = 'nx-lock'; lock.textContent = u.protocol === 'https:' ? 'HTTPS' : 'HTTP';
      if (u.protocol !== 'https:') lock.setAttribute('data-bad', '1');
      host.append(ic, hn, lock);
      var path = d().createElement('span'); path.className = 'nx-path'; var ps = u.pathname + u.search; try { ps = decodeURI(ps); } catch (e) {} path.textContent = ps.slice(0, 160);
      el.append(host, path);
      var warns = [];
      if (/(^|\\.)xn--/.test(u.hostname)) warns.push(L.puny);
      var txt = (a.textContent || '').trim().toLowerCase();
      var m = txt.match(/([a-z0-9-]+\\.)+[a-z]{2,}/);
      if (m && txt.length < 120 && base(m[0]) !== base(u.hostname) && !/\\s/.test(m[0])) warns.push(L.mismatch + ' (' + m[0] + ')');
      var ext = (u.pathname.match(/\\.([a-z0-9]{2,4})$/i) || [])[1];
      if (ext && /^(exe|msi|apk|bat|cmd|scr|zip|rar|7z|dmg|iso)$/i.test(ext)) warns.push(L.file + ' .' + ext.toLowerCase());
      if (wrapped) { var n = d().createElement('span'); n.className = 'nx-note'; n.textContent = L.unwrapped + ' ' + raw.hostname.replace(/^www\\./, ''); el.append(n); }
      warns.forEach(function (t) { var w = d().createElement('span'); w.className = 'nx-warn'; w.textContent = t; el.append(w); });
      var t1 = d().createElement('span'); t1.className = 'nx-title';
      var t2 = d().createElement('span'); t2.className = 'nx-desc';
      el.append(t1, t2);
      d().documentElement.append(el);
      var r = a.getBoundingClientRect(), vw = content.innerWidth, vh = content.innerHeight;
      function place() {
        if (!el) return;
        var w = el.offsetWidth, h = el.offsetHeight;
        var left = Math.min(Math.max(8, x - 20), vw - w - 8), top = r.bottom + 8;
        if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
        el.style.setProperty('--nx', left + 'px'); el.style.setProperty('--ny', top + 'px');
      }
      place();
      var id = ++req;
      sendAsyncMessage('nplus:xray1:peek', { id: id, url: u.href });
      ME.answer = function (data) {
        if (data.id !== id || !el) return;
        if (data.title) t1.textContent = data.title;
        if (data.desc) t2.textContent = data.desc;
        if (data.final && data.final !== u.hostname) { var n = d().createElement('span'); n.className = 'nx-note'; n.textContent = L.lands + ' ' + data.final; el.insertBefore(n, t1); }
        place();
      };
    }
    addEventListener('mouseover', function (e) {
      if (stale() || !cfg || !cfg.on) return;
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a) { if (cur) hide(); return; }
      if (a === cur) return;
      hide();
      var x = e.clientX, y = e.clientY;
      timer = content.setTimeout(function () { show(a, x, y); }, e.shiftKey ? 80 : cfg.delay);
    }, true);
    addEventListener('keydown', function (e) {
      if (e.key !== 'Shift' || stale() || !cfg || !cfg.on) return;
      var h = d().querySelectorAll('a[href]:hover'); var a = h[h.length - 1];
      if (a && a !== cur) { var r = a.getBoundingClientRect(); content.__nplus_xray_shift = true; show(a, r.left + 20, r.bottom); content.__nplus_xray_shift = false; }
    }, true);
    addEventListener('mousedown', hide, true);
    addEventListener('scroll', hide, true);
    addEventListener('pagehide', hide, true);
    addMessageListener('nplus:xray1:cfg', function (m) { if (stale()) return; cfg = m.data; if (!cfg.on) hide(); });
    addMessageListener('nplus:xray1:answer', function (m) { if (!stale() && ME.answer) ME.answer(m.data); });
    sendAsyncMessage('nplus:xray1:hello', {});
  })(this);`;

  const decode = (s) => {
    const t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  };

  NP.feature({
    name: "LinkXray",
    init() {
      if (!NP.prefs.get("nplus-xray")) return;
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      if (!sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.loadAndRegisterSheet(this.sheet, sss.USER_SHEET);
      this.cache = new Map();
      this.onHello = (m) => this.sendCfg(m.target.messageManager);
      this.onPeek = (m) => this.peek(m.target, m.data);
      window.messageManager.addMessageListener("nplus:xray1:hello", this.onHello);
      window.messageManager.addMessageListener("nplus:xray1:peek", this.onPeek);
      this.script = "data:," + encodeURIComponent(XRAY);
      window.messageManager.loadFrameScript(this.script, true);
      window.messageManager.broadcastAsyncMessage("nplus:xray1:cfg", this.cfg());
    },

    cfg() {
      return {
        on: true,
        delay: 900,
        labels: {
          puny: "دامنه‌ی شبیه‌سازی‌شده (punycode) — مراقب باش",
          mismatch: "متن لینک یه سایت دیگه رو نشون می‌ده",
          file: "این لینک فایل دانلود می‌کنه:",
          unwrapped: "از پشت ریدایرکتِ",
          lands: "در نهایت می‌ره به",
        },
      };
    },

    sendCfg(mm) {
      try {
        mm.sendAsyncMessage("nplus:xray1:cfg", this.cfg());
      } catch {}
    },

    // Title + description of the target, read once and cached. Only the
    // head of the page is parsed; nothing is rendered.
    async peek(browser, { id, url }) {
      const send = (data) => {
        try {
          browser.messageManager.sendAsyncMessage("nplus:xray1:answer", { id, ...data });
        } catch {}
      };
      if (this.cache.has(url)) return send(this.cache.get(url));
      try {
        const res = await fetch(url, { credentials: "omit", redirect: "follow", signal: AbortSignal.timeout(5000) });
        let final = "";
        try {
          final = new URL(res.url).hostname.replace(/^www\./, "");
        } catch {}
        const type = res.headers.get("content-type") || "";
        let title = "";
        let desc = "";
        if (type.includes("html")) {
          const reader = res.body.getReader();
          let html = "";
          const dec = new TextDecoder();
          while (html.length < 120000) {
            const { done, value } = await reader.read();
            if (done) break;
            html += dec.decode(value, { stream: true });
            if (/<\/head>/i.test(html)) break;
          }
          reader.cancel().catch(() => {});
          const meta = (name) =>
            html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)`, "i"))?.[1] ??
            html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1];
          title = decode(meta("og:title") ?? html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").trim().slice(0, 140);
          desc = decode(meta("og:description") ?? meta("description") ?? "").trim().slice(0, 240);
        } else if (type) {
          title = type.split(";")[0];
        }
        const host = new URL(url).hostname.replace(/^www\./, "");
        const data = { title, desc, final: final && final !== host ? final : "" };
        this.cache.set(url, data);
        if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
        send(data);
      } catch {
        send({});
      }
    },

    destroy() {
      try {
        window.messageManager.removeDelayedFrameScript(this.script);
        window.messageManager.broadcastAsyncMessage("nplus:xray1:cfg", { on: false });
        window.messageManager.removeMessageListener("nplus:xray1:hello", this.onHello);
        window.messageManager.removeMessageListener("nplus:xray1:peek", this.onPeek);
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.sheet && sss.sheetRegistered(this.sheet, sss.USER_SHEET)) sss.unregisterSheet(this.sheet, sss.USER_SHEET);
      } catch {}
    },
  });
})();
