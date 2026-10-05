// Nebula Plus — the assistant's living orb.
// A WebGL port of the watercolor voice orb from PiSugar/whisplay-chatgpt
// (rust/watercolor_renderer): three pigment layers pushed around by fbm
// flow and a watercolor paper texture. Colours come from the panel accent,
// and it moves with what's happening: faster while Gemini thinks, a little
// surge with every streamed chunk, and the music's bass when something plays.
//
//   NP.orb.attach(el)   paint the orb into el (a canvas is added inside)
//   NP.orb.pulse(k)     a short burst of energy (0..1)
//   NP.orb.busy = bool  thinking speed
(function () {
  const NP = window.NebulaPlus;
  if (!NP || NP.orb) return;

  const TEXTURE = "chrome://sine/content/Nebula/nebula/plus/assets/watercolor-noise.png";
  const SIZE = 200; // render resolution of the shared orb

  const VERT = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec4 uBands;
    uniform vec4 uTrav;
    uniform sampler2D uTex;
    uniform vec3 uMain, uLow, uMid, uHigh;

    float hash(vec2 p) { return fract(sin(p.x * 12.9898 + p.y * 4.1414) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      float v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      return v * v;
    }
    float noise3(vec2 p, float z, float seed) {
      float i = floor(z), f = fract(z);
      f = f * f * (3.0 - 2.0 * f);
      vec2 o0 = vec2(hash(vec2(i + seed * 11.31, seed * 0.37)) * 97.0, hash(vec2(i + seed * 23.73, seed * 0.61)) * 113.0);
      vec2 o1 = vec2(hash(vec2(i + 1.0 + seed * 11.31, seed * 0.37)) * 97.0, hash(vec2(i + 1.0 + seed * 23.73, seed * 0.61)) * 113.0);
      return mix(noise(p + o0), noise(p + o1), f) * 2.0 - 1.0;
    }
    float fbm(vec2 p) {
      float v = 0.0, amp = 0.5;
      float c = cos(0.5), s = sin(0.5);
      for (int k = 0; k < 4; k++) {
        v += amp * noise(p);
        p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) * 2.0 + 100.0;
        amp *= 0.5;
      }
      return v;
    }
    float texR(vec2 uv) { return texture2D(uTex, fract(uv)).r; }
    float texG(vec2 uv) { return texture2D(uTex, fract(vec2(uv.x, 1.0 - uv.y))).g; }
    vec3 burn(vec3 base, vec3 blend, float op) { return mix(base, max(base + blend - 1.0, 0.0), op); }

    void main() {
      vec2 frag = gl_FragCoord.xy;
      vec2 q = frag / uRes;
      float x = q.x * 2.0 - 1.0;
      float y = 1.0 - q.y * 2.0;
      float time = uTime;
      vec4 tr = uTrav;
      vec4 re = clamp(uBands * 0.9, 0.0, 1.5);
      float vertical = 0.01 * sin(1.5707963 * time);

      float u = x * 0.5 + 0.5;
      float v = 1.0 - ((y - vertical) * 0.5 + 0.5);
      float nx = noise3(vec2(u, v + 74.8572), (time + tr.x * 0.05) * 0.3, 3.17);
      float ny = noise3(vec2(u + 203.91282, v + 10.0), (time + tr.z * 0.05) * 0.3, 7.91);
      u += nx * 0.38;
      v += ny * 0.19;

      float wa = noise3(vec2(u * 18.0 + 344.91282, v * 18.0), time * 0.3, 11.23);
      float wb = noise3(vec2(u * 39.6 + 723.937, v * 39.6), time * 0.4, 19.47);
      float wc = wa + wb * 0.5;
      u += wc * 0.01;
      v += wc * 0.01 - 0.09;

      float tm = sin(time + tr.w * 2.0) * 0.5 + 0.5;
      float d0 = mix(texR(vec2(u, v)) - 0.5, texG(vec2(u, v)) - 0.5, tm) * 0.08;
      vec2 t1 = vec2(u + 63.861 + tr.x * 0.05, v + 368.937);
      float d1 = mix(texR(t1) - 0.5, texG(t1) - 0.5, tm) * 0.08;
      vec2 t3 = vec2(t1.x + 453.163 - tr.z * 0.1, t1.y + 1649.808 + tr.y * 0.1);
      float d3 = mix(texR(t3) - 0.5, texG(t3) - 0.5, tm) * 0.08;
      u += d0;
      v += d0;

      vec2 st = vec2(u, v) * 1.25;
      float qxc = 0.075 * (time + tr.w * 0.175);
      float qyc = 0.075 * (time + tr.x * 0.136);
      float qx = fbm(st * 0.5 + qxc);
      float qy = fbm(st * 0.5 + qyc);
      float rxc = 0.15 * (time + tr.y * 0.234);
      float ryc = 0.126 * (time + tr.z * 0.165);
      float rx = fbm(st + vec2(qx + 0.3 + rxc, qy + 9.2 + rxc));
      float ry = fbm(st + vec2(qx + 8.3 + ryc, qy + 0.8 + ryc));
      float field = fbm(st + vec2(rx - qx, ry - qy));
      float full = pow(max((field + 0.6 * field * field + 0.7 * field + 0.5) * 0.5, 0.0), 0.55);
      float fc = full - 0.5;

      float l1x = u + fc * 1.2 + 0.025 + d0;
      float l1y = v + fc * 1.2 + 0.025 + d0;
      float n1 = noise(vec2(l1x * 2.0 + sin(tr.x * 0.15 * 0.25), l1y * 2.0 + time * 0.5 + tr.x * 0.15)) * 2.0;
      float layer1 = pow(smoothstep(n1 - 1.8, n1 + 1.8, (l1y - 0.5) * (5.0 - re.x * 0.05) + 0.5), 0.8);

      float l2x = u + fc * 0.85 + 0.025 + d1;
      float l2y = v + fc * 0.85 + 0.025 + d1;
      float n2 = noise(vec2(l2x * 4.0 + sin(tr.y * -0.5 * 0.15) * 2.4 + 293.0, l2y * 4.0 + time - tr.y * 0.25)) * 2.0;
      float layer2 = pow(smoothstep(n2 - (0.9 + re.y * 0.7) * 1.5, n2 + (0.9 + re.y * 1.3) * 1.5, (l2y - 0.6) * (5.0 - re.y * 0.75) + 0.5), 0.9);

      float l3x = u + fc * 1.1 + d3;
      float l3y = v + fc * 1.1 + d3;
      float n3 = noise(vec2(l3x * 6.0 + sin(tr.z * 1.5 * 0.1) * 2.4 + 153.0, l3y * 6.0 + time * 1.2 + tr.z * 1.2)) * 2.0;
      float layer3 = smoothstep(n3 - 1.05, n3 + 1.05, (l3y - 0.9) * 6.0 + 0.5);

      vec3 col = burn(uMain, uLow, 1.0 - layer1);
      vec3 mid = mix(uMain, uMid, 1.0 - layer2);
      col = burn(col, mid, layer1);
      vec3 high = mix(uMain, uHigh, 1.0 - layer3);
      col = mix(col, high, layer1 * layer2);

      // paper tooth, so it reads as pigment on paper rather than a gradient
      float paper = noise(frag * 0.43 + vec2(19.7, 71.3)) - 0.5;
      float fiber = noise(vec2((frag.x + frag.y * 0.22) * 0.075 + 113.0, (frag.y - frag.x * 0.08) * 0.62 + 37.0)) - 0.5;
      col += (paper * 7.0 + fiber * 5.0) / 255.0 * vec3(0.72, 0.92, 1.0);

      float r = length(frag - uRes * 0.5);
      float cover = clamp(uRes.x * 0.5 - 0.5 - r, 0.0, 1.0);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * cover, cover);
    }`;

  // accent -> the four pigments of the original palette (#DCF7FF #0181FE
  // #A4EFFF #FFFDEF), rotated to the accent's hue
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }
  function hueOf([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.06) return null;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  const Orb = {
    targets: new Set(),
    bands: [0, 0, 0, 0],
    trav: [0, 0, 0, 0],
    energy: 0,
    busy: false,
    clock: 0,
    seed: Math.random() * 71,

    attach(el) {
      const cv = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      cv.className = "nplus-orb-canvas";
      el.append(cv);
      this.targets.add(cv);
      this.wake();
      return cv;
    },

    pulse(k = 0.5) {
      this.energy = Math.min(1.4, this.energy + k);
      this.wake();
    },

    setup() {
      if (this.gl !== undefined) return !!this.gl;
      const cv = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      cv.width = cv.height = SIZE;
      const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
      this.gl = gl;
      if (!gl) return false;
      this.cv = cv;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      for (const n of ["uRes", "uTime", "uBands", "uTrav", "uTex", "uMain", "uLow", "uMid", "uHigh"]) this.u[n] = gl.getUniformLocation(prog, n);
      gl.uniform2f(this.u.uRes, SIZE, SIZE);
      // the watercolor paper texture (R and G are two displacement layers)
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      };
      img.src = TEXTURE;
      gl.uniform1i(this.u.uTex, 0);
      this.palette();
      return true;
    },

    // read the accent the panel is using right now
    accent() {
      const probe = (this.probe ??= document.createElementNS("http://www.w3.org/1999/xhtml", "canvas").getContext("2d", { willReadFrequently: true }));
      const panel = document.getElementById("nplus-ai");
      let color = "#0181fe";
      if (panel) {
        const s = getComputedStyle(panel).getPropertyValue("--ai-accent").trim();
        if (s) color = s;
      }
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "#0181fe";
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((v) => v / 255);
    },

    palette() {
      const rgb = this.accent();
      const key = rgb.map((v) => Math.round(v * 40)).join();
      if (key === this.paletteKey || !this.gl) return;
      this.paletteKey = key;
      const h = hueOf(rgb) ?? 210;
      const { gl, u } = this;
      gl.uniform3f(u.uLow, ...hsl(h, 0.98, 0.5));
      gl.uniform3f(u.uMid, ...hsl(h - 19, 1, 0.82));
      gl.uniform3f(u.uMain, ...hsl(h - 16, 1, 0.93));
      gl.uniform3f(u.uHigh, ...hsl(h - 160, 1, 0.97));
    },

    visible() {
      for (const cv of this.targets) {
        if (!cv.isConnected) this.targets.delete(cv);
        else if (cv.offsetWidth && !cv.closest("[hidden]")) return true;
      }
      return false;
    },

    wake() {
      if (this.raf || !this.visible()) return;
      if (!this.setup()) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    },

    frame(now) {
      this.raf = 0;
      if (!this.visible()) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;

      // music: the visualizer's spectrum folded into four bands
      const vis = NP._features?.find?.((f) => f.name === "Visualizer");
      const sb = vis?.bands ?? [];
      const playing = NP.media?.current?.playing;
      const fold = (a, b) => {
        let s = 0;
        for (let i = a; i < b; i++) s += sb[i] ?? 0;
        return playing ? (s / (b - a)) * 0.7 : 0;
      };
      const music = [fold(0, 4), fold(4, 10), fold(10, 18), fold(18, 28)];
      this.energy *= Math.pow(0.25, dt);
      const think = this.busy ? 0.35 + 0.15 * Math.sin(now / 260) : 0;
      for (let i = 0; i < 4; i++) {
        const target = Math.max(music[i], this.energy * (0.6 + i * 0.15), think);
        this.bands[i] += (target - this.bands[i]) * Math.min(1, dt * 8);
        this.trav[i] += this.bands[i] * dt * 2.2;
      }
      this.clock += dt * (this.busy ? 2.1 : 1) * (1 + this.energy * 0.8);

      const { gl, u } = this;
      this.n = (this.n ?? 0) + 1;
      if (this.n % 30 === 0) this.palette();
      gl.viewport(0, 0, SIZE, SIZE);
      gl.uniform1f(u.uTime, (this.clock + this.seed) * 0.85);
      gl.uniform4f(u.uBands, ...this.bands);
      gl.uniform4f(u.uTrav, ...this.trav);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      for (const cv of this.targets) {
        const w = Math.round(cv.offsetWidth * devicePixelRatio);
        if (!w) continue;
        if (cv.width !== w) cv.width = cv.height = w;
        const ctx = cv.getContext("2d");
        ctx.clearRect(0, 0, w, w);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.cv, 0, 0, w, w);
      }
      this.raf = requestAnimationFrame((t) => this.frame(t));
    },
  };

  NP.orb = Orb;
})();
