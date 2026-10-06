// Nebula Plus — wrong keyboard layout fixer (Persian ⇄ English).
// Typed "sghl" meaning «سلام», or «حخخلمث» meaning "google"? Ctrl+Alt+K
// converts the selection, or else the last run you typed in the wrong
// layout — in the URL bar and in any text field on any site. While you type
// in the URL bar, a small chip offers the fix by itself when it looks wrong.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-kbfix"] = true;

  // Windows Persian (standard) layout, key by key.
  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,\\`HCM?";
  const FA = "ضصثقفغعهخحجچشسیبلاتنمکگظطزرذدپوپپآژء؟";
  const toFa = new Map([...EN].map((c, i) => [c, FA[i]]));
  const toEn = new Map();
  [...FA].forEach((c, i) => !toEn.has(c) && toEn.set(c, EN[i]));
  // a few Persian keyboard variants of the same keys
  for (const [k, v] of [["ي", "d"], ["ك", ";"], ["ئ", "m"], ["ـ", "J"], ["،", "T"], ["ۀ", "G"]]) toEn.set(k, v);

  const isFa = (c) => /[؀-ۿ]/.test(c);
  const isEnKey = (c) => toFa.has(c.toLowerCase()) || toFa.has(c);

  function convert(text) {
    const fa = [...text].filter(isFa).length;
    const en = [...text].filter((c) => /[a-z;'[\],\\`]/i.test(c)).length;
    if (fa >= en) return [...text].map((c) => toEn.get(c) ?? c).join("");
    return [...text].map((c) => toFa.get(c) ?? toFa.get(c.toLowerCase()) ?? c).join("");
  }

  // Does this look like it was typed in the wrong layout?
  function looksWrong(text) {
    const t = text.trim();
    if (t.length < 3 || /^[\d\s.:/-]+$/.test(t)) return false;
    if ([...t].some(isFa)) {
      // Persian letters that make an English-ish word or a web address
      const en = convert(t);
      return /^[a-z0-9.\-/:]+(\.[a-z]{2,})/i.test(en) || (/^[a-z ]+$/i.test(en) && vowelRatio(en) > 0.3 && !/[اوی]/.test(t.slice(1, -1)));
    }
    if (!/^[a-z;',[\]\\`?. ]+$/i.test(t)) return false;
    if (/[;'[\]]/.test(t.replace(/[;'[\]]$/, "")) || /[a-z],[a-z]/i.test(t)) return true; // keys that only make sense in Persian
    return vowelRatio(t) < 0.18 && t.replace(/ /g, "").length >= 4;
  }

  function vowelRatio(s) {
    const letters = s.replace(/[^a-z]/gi, "");
    return letters ? (letters.match(/[aeiouy]/gi) ?? []).length / letters.length : 0;
  }

  // Where the wrongly typed run starts, before the caret: walk back word by
  // word while words look mistyped ("Hello sghl" fixes only "sghl"); if
  // none do, the last word (you pressed the key, so something is wrong).
  // ASCII only: its source is also sent into pages.
  function npWordRun(t, conv) {
    function vowels(s) {
      var l = s.replace(/[^a-z]/gi, "");
      return l ? (l.match(/[aeiouy]/gi) || []).length / l.length : 0;
    }
    function wrong(w) {
      if (/[\u0600-\u06FF]/.test(w)) {
        var en = conv(w);
        return /^[a-z0-9.\-\/:]+$/i.test(en) && (/\./.test(en) || vowels(en) > 0.3);
      }
      var core = w.replace(/[?.!]+$/, "");
      if (!core || !/^[a-z;',\[\]\`?.]+$/i.test(core)) return false;
      if (/[;'\[\],\`]/.test(core)) return true;
      return core.length >= 2 && vowels(core) < 0.2;
    }
    var parts = t.split(/(\s+)/);
    var pos = t.length, start = -1;
    for (var k = parts.length - 1; k >= 0; k--) {
      var p = parts[k];
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        pos -= p.length;
        continue;
      }
      if (!wrong(p)) break;
      pos -= p.length;
      start = pos;
    }
    if (start < 0) {
      var m = t.match(/\S+\s*$/);
      start = m ? t.length - m[0].length : t.length;
    }
    return start;
  }

  const tailRun = (text) => npWordRun(text, convert);

  // Content side (ASCII only): fixes the focused field in the page.
  const CONTENT = `(function(){
    ${npWordRun.toString()}
    addMessageListener('nplus:kb:fix', function (m) {
      var map = m.data;
      var d = content.document, el = d.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      while (el && el.contentDocument && el.contentDocument.activeElement) { d = el.contentDocument; el = d.activeElement; }
      if (!el) return;
      var conv = function (s) {
        var fa = 0, en = 0;
        for (var c of s) { if (/[\\u0600-\\u06FF]/.test(c)) fa++; else if (/[a-z;'\\[\\],\\\\\`]/i.test(c)) en++; }
        var table = fa >= en ? map.toEn : map.toFa;
        var out = '';
        for (var c of s) out += table[c] || table[c.toLowerCase()] || c;
        return out;
      };
      var tail = function (t) { return npWordRun(t, conv); };
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        var s = el.selectionStart, e = el.selectionEnd, v = el.value;
        if (s === e) { s = tail(v.slice(0, e)); }
        if (s === e) return;
        el.setRangeText(conv(v.slice(s, e)), s, e, 'end');
        el.dispatchEvent(new content.InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
        return;
      }
      if (el.isContentEditable) {
        var sel = d.getSelection();
        if (!sel.rangeCount) return;
        var r = sel.getRangeAt(0);
        if (r.collapsed) {
          var node = r.startContainer;
          if (node.nodeType !== 3) return;
          var before = node.data.slice(0, r.startOffset);
          var start = tail(before);
          if (start === before.length) return;
          r.setStart(node, start);
          sel.removeAllRanges(); sel.addRange(r);
        }
        var text = sel.toString();
        d.execCommand('insertText', false, conv(text));
      }
    });
  })();`;

  NP.feature({
    name: "KeyboardFix",
    init() {
      if (!NP.prefs.get("nplus-kbfix")) return;
      this.loaded = new WeakSet();
      this.maps = { toFa: Object.fromEntries(toFa), toEn: Object.fromEntries(toEn) };
      this.offKey = NP.hotkey?.("ctrl+alt+k", () => this.fix());

      // the URL bar hint
      this.chip = NP.html("div", { id: "nplus-kbfix", hidden: "true" }, [
        NP.html("span", { class: "kb-key", text: "⌨" }),
        NP.html("span", { class: "kb-text" }),
        NP.html("span", { class: "kb-hint", text: "Ctrl+Alt+K" }),
      ]);
      this.chip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.fixUrlbar();
      });
      document.getElementById("urlbar")?.append(this.chip);
      this.onInput = () => this.hint();
      gURLBar.inputField.addEventListener("input", this.onInput);
      this.onBlur = () => (this.chip.hidden = true);
      gURLBar.inputField.addEventListener("blur", this.onBlur);
    },

    hint() {
      const v = gURLBar.value;
      const wrong = v && looksWrong(v);
      this.chip.hidden = !wrong;
      if (wrong) this.chip.querySelector(".kb-text").textContent = convert(v);
    },

    fix() {
      const f = document.commandDispatcher.focusedElement;
      if (f === gURLBar.inputField || gURLBar.focused) return this.fixUrlbar();
      // chrome text fields (find bar, our panels)
      if (f && (f.localName === "input" || f.localName === "textarea") && !gBrowser.selectedBrowser.contains(f)) {
        this.fixField(f);
        return;
      }
      const b = gBrowser.selectedBrowser;
      if (!this.loaded.has(b)) {
        this.loaded.add(b);
        b.messageManager.loadFrameScript("data:," + encodeURIComponent(CONTENT), false);
      }
      b.messageManager.sendAsyncMessage("nplus:kb:fix", this.maps);
    },

    fixField(el) {
      let s = el.selectionStart;
      const e = el.selectionEnd;
      if (s === e) s = tailRun(el.value.slice(0, e));
      if (s === e) return;
      el.setRangeText(convert(el.value.slice(s, e)), s, e, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },

    fixUrlbar() {
      const field = gURLBar.inputField;
      const all = field.selectionStart === field.selectionEnd && looksWrong(gURLBar.value);
      if (all) {
        gURLBar.value = convert(gURLBar.value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      } else this.fixField(field);
      this.chip.hidden = true;
      gURLBar.focus();
    },

    destroy() {
      this.offKey?.();
      gURLBar.inputField?.removeEventListener("input", this.onInput);
      gURLBar.inputField?.removeEventListener("blur", this.onBlur);
      this.chip?.remove();
    },
  });

  NP.kbfix = { convert, looksWrong };
})();
