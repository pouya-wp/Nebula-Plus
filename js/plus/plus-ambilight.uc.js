// Nebula Plus — ambilight for videos (YouTube, Aparat, any <video>).
// Like a TV with ambilight: the light of the picture spills out of the page
// over Zen's own UI (and, on YouTube, behind the see-through page right
// around the video). Inside the page the playing video is shrunk to 32×18
// eight times a second (letterbox bars cropped away); here that tiny frame
// is laid out around the page on a tiny canvas that the GPU stretches over
// the window — bilinear stretching from so few pixels is soft by itself, so
// there is no blur filter and nothing is drawn between frames. Every colour
// comes out on the side of the screen it sits on in the picture; it eases
// between frames, cuts fast on scene changes, dims on pause and rests in an
// unfocused window.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-ambilight"] = true;
  NP.DEFAULTS["nplus-ambilight-strength"] = 3; // 1 subtle … 5 bold
  NP.DEFAULTS["nplus-youtube-clear"] = true; // see-through YouTube, light behind the video
  NP.DEFAULTS["nplus-youtube-calm"] = true; // recommendations/comments further down, faded

  const FW = 32;
  const FH = 18;
  const S = 14; // one canvas pixel per 14 screen pixels
  const XHTML = "http://www.w3.org/1999/xhtml";
  const canvas = (w, h) => {
    const c = document.createElementNS(XHTML, "canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  // Content side (ASCII only). Samples the biggest playing video.
  const SAMPLER = `(function(){
    var cv = null, ctx = null, on = false, timer = 0;
    function pick() {
      var d = content && content.document; if (!d || d.hidden) return null;
      var best = null, area = 0;
      d.querySelectorAll('video').forEach(function (v) {
        if (v.readyState < 2 || !v.videoWidth) return;
        var r = v.getBoundingClientRect(), a = r.width * r.height;
        if (r.width < 240 || a <= area) return;
        best = v; area = a;
      });
      return best;
    }
    function lum(d, i) { return d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722; }
    function tick() {
      timer = 0;
      if (!on) return;
      var v = pick();
      if (!v) { sendAsyncMessage('nplus:ambi:frame', { none: true }); timer = content.setTimeout(tick, 1000); return; }
      try {
        if (!cv) { cv = content.document.createElement('canvas'); cv.width = ${FW}; cv.height = ${FH}; ctx = cv.getContext('2d', { willReadFrequently: true }); }
        ctx.drawImage(v, 0, 0, ${FW}, ${FH});
        var d = ctx.getImageData(0, 0, ${FW}, ${FH}).data;
        var top = 0, bottom = ${FH} - 1, left = 0, right = ${FW} - 1;
        function rowDark(y) { var s = 0; for (var x = 0; x < ${FW}; x++) s += lum(d, (y * ${FW} + x) * 4); return s / ${FW} < 14; }
        function colDark(x) { var s = 0; for (var y = top; y <= bottom; y++) s += lum(d, (y * ${FW} + x) * 4); return s / (bottom - top + 1) < 14; }
        while (top < ${FH} / 3 && rowDark(top)) top++;
        while (bottom > ${FH} * 2 / 3 && rowDark(bottom)) bottom--;
        while (left < ${FW} / 3 && colDark(left)) left++;
        while (right > ${FW} * 2 / 3 && colDark(right)) right--;
        var vr = v.getBoundingClientRect();
        sendAsyncMessage('nplus:ambi:frame', { px: d, crop: [left, top, right - left + 1, bottom - top + 1], playing: !v.paused && !v.ended,
          rect: [vr.left, vr.top, vr.width, vr.height], view: [content.innerWidth, content.innerHeight] });
      } catch (e) {
        sendAsyncMessage('nplus:ambi:frame', { none: true });
        timer = content.setTimeout(tick, 3000);
        return;
      }
      timer = content.setTimeout(tick, v.paused ? 1000 : 125);
    }
    addMessageListener('nplus:ambi:on', function (m) {
      on = !!m.data;
      if (on && !timer) tick();
    });
  })();`;

  NP.feature({
    name: "Ambilight",
    init() {
      this.loaded = new WeakSet();
      this.canvas = NP.html("canvas", { id: "nplus-ambi" });
      document.documentElement.append(this.canvas);
      // a second light *behind* the page, seen through sites made
      // transparent (YouTube): it glows right around the video itself
      this.inner = NP.html("canvas", { id: "nplus-ambi-inner", hidden: "true" });
      this.frame = canvas(FW, FH); // newest sample
      this.acc = canvas(FW, FH); // what we show, eased toward the samples
      this.soft = canvas(8, 5); // a very coarse copy: the wide, smooth glow
      this.restyle();
      NP.prefs.watch("nplus-youtube-calm", () => this.restyle());
      NP.prefs.watch("nplus-youtube-clear", () => (this.restyle(), this.select()));
      this.onFrame = (m) => this.receive(m);
      window.messageManager.addMessageListener("nplus:ambi:frame", this.onFrame);
      this.sync = () => this.select();
      window.addEventListener("TabSelect", this.sync);
      window.addEventListener("focus", this.sync);
      window.addEventListener("blur", this.sync);
      window.addEventListener("resize", this.sync);
      this.progress = { onLocationChange: (b) => b === gBrowser.selectedBrowser && this.select() };
      gBrowser.addTabsProgressListener(this.progress);
      NP.prefs.watch("nplus-ambilight", () => (this.restyle(), this.select()));
      this.select();
    },

    // Watch the selected tab only, and only while the window is in use.
    select() {
      const on = NP.prefs.get("nplus-ambilight") && document.hasFocus() && !document.fullscreenElement && !window.fullScreen;
      // switched off: not even an empty layer to composite
      this.canvas.hidden = !NP.prefs.get("nplus-ambilight");
      const browser = gBrowser.selectedBrowser;
      if (this.browser && this.browser !== browser) this.send(this.browser, false);
      this.browser = browser;
      let host = "";
      try {
        host = browser.currentURI.host;
      } catch {}
      this.behind = /(^|\.)youtube\.com$/.test(host) && !!NP.prefs.get("nplus-youtube-clear");
      if (this.behind && this.inner.parentNode !== browser.parentNode) browser.parentNode.prepend(this.inner);
      this.inner.hidden = !this.behind;
      this.box = null; // re-measure the page on the next frame
      if (!on || !/^https?:/.test(browser.currentURI.spec)) {
        this.send(browser, false);
        this.setLive(false);
        return;
      }
      if (!this.loaded.has(browser)) {
        this.loaded.add(browser);
        try {
          browser.messageManager.loadFrameScript("data:," + encodeURIComponent(SAMPLER), false);
        } catch {}
      }
      this.send(browser, true);
    },

    send(browser, on) {
      try {
        browser.messageManager.sendAsyncMessage("nplus:ambi:on", on);
      } catch {}
    },

    receive(m) {
      if (m.target !== this.browser) return;
      const data = m.data;
      if (data.none || !data.px) {
        this.setLive(false);
        return;
      }
      const px = data.px;
      // scene cut: compare with the previous sample (no canvas read-back)
      let diff = 0;
      if (this.prev) {
        for (let i = 0; i < px.length; i += 16) diff += Math.abs(this.prev[i] - px[i]) + Math.abs(this.prev[i + 1] - px[i + 1]) + Math.abs(this.prev[i + 2] - px[i + 2]);
        diff /= (px.length / 16) * 3 * 255;
      }
      const cut = !this.prev || diff > 0.22;
      this.prev = px;
      this.frame.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(px), FW, FH), 0, 0);
      const a = this.acc.getContext("2d");
      a.globalAlpha = cut ? 0.8 : 0.38;
      const [cx, cy, cw, ch] = data.crop;
      a.drawImage(this.frame, cx, cy, cw, ch, 0, 0, FW, FH);
      a.globalAlpha = 1;
      this.soft.getContext("2d").drawImage(this.acc, 0, 0, 8, 5);
      this.videoRect = data.rect;
      this.view = data.view;
      this.playing = data.playing;
      this.setLive(true);
      this.render();
    },

    setLive(live) {
      const state = live ? (this.playing ? "on" : "paused") : false;
      if (state !== this.state) {
        this.state = state;
        NP.setRootAttr("nplus-ambi", state);
      }
      if (!live) this.prev = null;
    },

    // Paint the light: a wide glow from the coarse copy and a tighter rim
    // from the detailed one, both just stretched (the GPU does the rest).
    paint(ctx, x, y, w, h, wide, rim) {
      const k = (Number(NP.prefs.get("nplus-ambilight-strength")) || 3) / 3;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const g = wide + 0.06 * k;
      ctx.globalAlpha = Math.min(1, 0.75 + 0.12 * k);
      ctx.drawImage(this.soft, x - w * g, y - h * g, w * (1 + 2 * g), h * (1 + 2 * g));
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.acc, x - w * rim, y - h * rim * 1.5, w * (1 + 2 * rim), h * (1 + 3 * rim));
      ctx.globalAlpha = 1;
    },

    render() {
      // around the page, over Zen's UI
      if (!this.box) {
        const r = this.browser.getBoundingClientRect();
        this.box = { x: r.x, y: r.y, w: r.width, h: r.height };
        // the page itself stays untouched: a crisp CSS hole, not a canvas cut
        const { x, y, w, h } = this.box;
        this.canvas.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)`;
      }
      const W = Math.ceil(innerWidth / S);
      const H = Math.ceil(innerHeight / S);
      const c = this.canvas;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const { x, y, w, h } = this.box;
      if (w && h) this.paint(ctx, x / S, y / S, w / S, h / S, 0.24, 0.03);

      // behind the see-through page, around the video itself
      if (this.behind && this.videoRect && this.view) {
        const ic = this.inner;
        const IW = Math.ceil(w / S);
        const IH = Math.ceil(h / S);
        if (ic.width !== IW || ic.height !== IH) {
          ic.width = IW;
          ic.height = IH;
        }
        const ictx = ic.getContext("2d");
        ictx.clearRect(0, 0, IW, IH);
        const zx = w / this.view[0] / S;
        const zy = h / this.view[1] / S;
        const [vx, vy, vw, vh] = this.videoRect;
        if (vw > 10 && vh > 10) this.paint(ictx, vx * zx, vy * zy, vw * zx, vh * zy, 0.32, 0.05);
      }
    },

    // YouTube made see-through and calm (content user sheet).
    async restyle() {
      const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      if (this.ytSheet && sss.sheetRegistered(this.ytSheet, sss.USER_SHEET)) sss.unregisterSheet(this.ytSheet, sss.USER_SHEET);
      this.ytSheet = null;
      // see-through YouTube only makes sense (and only costs) with the light on
      if (!NP.prefs.get("nplus-youtube-clear") || !NP.prefs.get("nplus-ambilight")) return;
      try {
        let css = await (await fetch("chrome://sine/content/Nebula/nebula/plus/content/youtube.css")).text();
        if (!NP.prefs.get("nplus-youtube-calm")) css = css.replace(/\/\* CALM-START[\s\S]*?CALM-END \*\//, "");
        this.ytSheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(css));
        sss.loadAndRegisterSheet(this.ytSheet, sss.USER_SHEET);
      } catch (err) {
        NP.logger?.warn(`youtube restyle: ${err}`);
      }
    },

    destroy() {
      window.messageManager.removeMessageListener("nplus:ambi:frame", this.onFrame);
      window.removeEventListener("TabSelect", this.sync);
      window.removeEventListener("focus", this.sync);
      window.removeEventListener("blur", this.sync);
      window.removeEventListener("resize", this.sync);
      gBrowser.removeTabsProgressListener(this.progress);
      if (this.browser) this.send(this.browser, false);
      try {
        const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
        if (this.ytSheet && sss.sheetRegistered(this.ytSheet, sss.USER_SHEET)) sss.unregisterSheet(this.ytSheet, sss.USER_SHEET);
      } catch {}
      NP.setRootAttr("nplus-ambi", false);
      this.canvas?.remove();
      this.inner?.remove();
    },
  });
})();
