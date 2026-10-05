// Nebula Plus — ambilight for videos (YouTube, Aparat, any <video>).
// Like a TV with ambilight: the light of the picture spills out of the page
// over Zen's own UI. Inside the page the playing video is shrunk to 48×27
// a dozen times a second (letterbox bars cropped away); here that tiny frame
// is blown up and blurred around the page, so every colour comes out on the
// side of the screen it sits on in the picture. It glides between frames,
// cuts fast on scene changes, dims on pause and rests in an unfocused window.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-ambilight"] = true;
  NP.DEFAULTS["nplus-ambilight-strength"] = 3; // 1 subtle … 5 bold

  const FW = 48;
  const FH = 27;

  // Content side (ASCII only). Samples the biggest playing video.
  const SAMPLER = `(function(){
    var cv = null, ctx = null, on = false, timer = 0;
    function pick() {
      var d = content && content.document; if (!d) return null;
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
      if (!v) { sendAsyncMessage('nplus:ambi:frame', { none: true }); timer = content.setTimeout(tick, 600); return; }
      try {
        if (!cv) { cv = content.document.createElement('canvas'); cv.width = ${FW}; cv.height = ${FH}; ctx = cv.getContext('2d', { willReadFrequently: true }); }
        ctx.drawImage(v, 0, 0, ${FW}, ${FH});
        var d = ctx.getImageData(0, 0, ${FW}, ${FH}).data;
        // crop black bars (letterbox / pillarbox)
        var top = 0, bottom = ${FH} - 1, left = 0, right = ${FW} - 1;
        function rowDark(y) { var s = 0; for (var x = 0; x < ${FW}; x++) s += lum(d, (y * ${FW} + x) * 4); return s / ${FW} < 14; }
        function colDark(x) { var s = 0; for (var y = top; y <= bottom; y++) s += lum(d, (y * ${FW} + x) * 4); return s / (bottom - top + 1) < 14; }
        while (top < ${FH} / 3 && rowDark(top)) top++;
        while (bottom > ${FH} * 2 / 3 && rowDark(bottom)) bottom--;
        while (left < ${FW} / 3 && colDark(left)) left++;
        while (right > ${FW} * 2 / 3 && colDark(right)) right--;
        sendAsyncMessage('nplus:ambi:frame', { px: Array.prototype.slice.call(d), crop: [left, top, right - left + 1, bottom - top + 1], playing: !v.paused && !v.ended });
      } catch (e) {
        // DRM or cross-origin video: nothing we can read
        sendAsyncMessage('nplus:ambi:frame', { none: true });
        timer = content.setTimeout(tick, 2000);
        return;
      }
      timer = content.setTimeout(tick, v.paused ? 400 : 80);
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
      this.frame = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      this.frame.width = FW;
      this.frame.height = FH;
      this.acc = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); // smoothed frame
      this.acc.width = FW;
      this.acc.height = FH;
      this.onFrame = (m) => this.receive(m);
      window.messageManager.addMessageListener("nplus:ambi:frame", this.onFrame);
      this.sync = () => this.select();
      window.addEventListener("TabSelect", this.sync);
      window.addEventListener("focus", this.sync);
      window.addEventListener("blur", this.sync);
      this.onSound = (e) => e.detail.changed.includes("soundplaying") && e.target === gBrowser.selectedTab && this.select();
      window.addEventListener("TabAttrModified", this.onSound);
      this.progress = { onLocationChange: (b) => b === gBrowser.selectedBrowser && this.select() };
      gBrowser.addTabsProgressListener(this.progress);
      NP.prefs.watch("nplus-ambilight", () => this.select());
      this.draw = this.draw.bind(this);
      this.select();
    },

    // Watch the selected tab only, and only while the window is in use.
    select() {
      const on = NP.prefs.get("nplus-ambilight") && document.hasFocus() && !document.fullscreenElement && !window.fullScreen;
      const browser = gBrowser.selectedBrowser;
      if (this.browser && this.browser !== browser) this.send(this.browser, false);
      this.browser = browser;
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
      const img = new ImageData(new Uint8ClampedArray(data.px), FW, FH);
      this.frame.getContext("2d").putImageData(img, 0, 0);
      // scene cut? compare against what we show now
      const a = this.acc.getContext("2d", { willReadFrequently: true });
      let diff = 0;
      if (this.hasFrame) {
        const prev = a.getImageData(0, 0, FW, FH).data;
        for (let i = 0; i < prev.length; i += 16) diff += Math.abs(prev[i] - data.px[i]) + Math.abs(prev[i + 1] - data.px[i + 1]) + Math.abs(prev[i + 2] - data.px[i + 2]);
        diff /= (prev.length / 16) * 3 * 255;
      }
      this.target = { crop: data.crop, cut: !this.hasFrame || diff > 0.22 };
      this.playing = data.playing;
      this.hasFrame = true;
      this.setLive(true);
    },

    setLive(live) {
      if (live === this.live) {
        if (live && this.playing !== this.lastPlaying) NP.setRootAttr("nplus-ambi", this.playing ? "on" : "paused");
        this.lastPlaying = this.playing;
        return;
      }
      this.live = live;
      NP.setRootAttr("nplus-ambi", live ? (this.playing ? "on" : "paused") : false);
      if (live && !this.raf) this.raf = requestAnimationFrame(this.draw);
      if (!live) this.hasFrame = false;
    },

    draw(now) {
      this.raf = 0;
      // not live: stop drawing; the last picture fades out with the canvas (CSS)
      if (!this.live) return;
      // ~30 fps is plenty for light this soft
      if (now - (this.lastDraw ?? 0) < 30) {
        this.raf = requestAnimationFrame(this.draw);
        return;
      }
      this.lastDraw = now;

      // 1. ease the shown frame toward the newest one (fast on scene cuts)
      if (this.target) {
        const a = this.acc.getContext("2d");
        a.globalAlpha = this.target.cut ? 0.75 : 0.22;
        const [cx, cy, cw, ch] = this.target.crop;
        a.drawImage(this.frame, cx, cy, cw, ch, 0, 0, FW, FH);
        a.globalAlpha = 1;
        if (this.target.cut) this.target.cut = false;
      }

      // 2. paint it around the page at low resolution (CSS scales it up)
      const S = 6; // canvas pixel = 6 screen pixels
      const W = Math.ceil(innerWidth / S);
      const H = Math.ceil(innerHeight / S);
      const c = this.canvas;
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const box = gBrowser.selectedBrowser.getBoundingClientRect();
      if (box.width && box.height) {
        const k = (Number(NP.prefs.get("nplus-ambilight-strength")) || 3) / 3;
        const x = box.x / S, y = box.y / S, w = box.width / S, h = box.height / S;
        const grow = 0.22 + 0.06 * k;
        ctx.filter = `blur(${Math.round(9 + 3 * k)}px) saturate(${1.25 + 0.15 * k})`;
        ctx.drawImage(this.acc, x - w * grow, y - h * grow, w * (1 + grow * 2), h * (1 + grow * 2));
        // a hotter, tighter rim right at the page edge
        ctx.filter = `blur(${Math.round(3 + k)}px) saturate(1.5)`;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(this.acc, x - w * 0.04, y - h * 0.06, w * 1.08, h * 1.12);
        ctx.globalAlpha = 1;
        ctx.filter = "none";
        // keep the page itself untouched
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      this.raf = requestAnimationFrame(this.draw);
    },

    destroy() {
      cancelAnimationFrame(this.raf);
      window.messageManager.removeMessageListener("nplus:ambi:frame", this.onFrame);
      window.removeEventListener("TabSelect", this.sync);
      window.removeEventListener("focus", this.sync);
      window.removeEventListener("blur", this.sync);
      window.removeEventListener("TabAttrModified", this.onSound);
      gBrowser.removeTabsProgressListener(this.progress);
      if (this.browser) this.send(this.browser, false);
      NP.setRootAttr("nplus-ambi", false);
      this.canvas?.remove();
    },
  });
})();
