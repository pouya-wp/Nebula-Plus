// Nebula Plus — one way to ask Gemini, for every feature.
// With a Gemini API key (free from aistudio.google.com, put it in the
// "nplus-gemini-key" setting yourself) answers come straight from the API:
// seconds, and it understands audio and images too (voice typing).
// Without a key, text questions go through your Gemini web chat in the
// background (slower, but nothing to set up).
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-gemini-key"] = "";
  NP.DEFAULTS["nplus-gemini-model"] = "gemini-2.5-flash";

  const hasKey = () => !!String(NP.prefs.get("nplus-gemini-key") ?? "").trim();

  async function api(parts, { json = false, signal } = {}) {
    const key = String(NP.prefs.get("nplus-gemini-key")).trim();
    const model = String(NP.prefs.get("nplus-gemini-model") || "gemini-2.5-flash").trim();
    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: "application/json" } : {}), thinkingConfig: { thinkingBudget: 0 } },
    };
    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(90000),
    });
    // older models don't take a thinking budget
    if (res.status === 400) {
      delete body.generationConfig.thinkingConfig;
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(90000),
      });
    }
    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  NP.gemini = {
    hasKey,
    // ask(prompt, { onPartial, json, media: [{ mime, data(base64) }|{ blob }] })
    async ask(prompt, { onPartial = () => {}, json = false, media = [] } = {}) {
      if (hasKey()) {
        const parts = [{ text: prompt }];
        for (const m of media) parts.push({ inline_data: { mime_type: m.mime ?? m.blob.type, data: m.data ?? (await blobToBase64(m.blob)) } });
        try {
          return await api(parts, { json });
        } catch (err) {
          if (media.length) throw err;
          NP.logger?.warn(`Gemini API: ${err}; trying the Gemini web chat`);
        }
      }
      if (media.length) throw new Error("برای صدا و عکس، کلید Gemini API لازمه (تنظیمات: nplus-gemini-key)");
      if (!NP.assistant?.ask) throw new Error("assistant not ready");
      return NP.assistant.ask(json ? `${prompt}\n\nReply with JSON only, no code fences.` : prompt, onPartial);
    },
    // ask and parse the first JSON value in the answer
    async json(prompt, opts = {}) {
      const raw = await NP.gemini.ask(prompt, { ...opts, json: true });
      const m = String(raw).match(/[[{][\s\S]*[\]}]/);
      return JSON.parse(m ? m[0] : raw);
    },
  };
})();
