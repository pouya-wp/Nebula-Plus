// Nebula Plus — opening and closing motion.
// Opening (~1.2s): the browser sits behind frosted glass, the watercolor orb
// surfaces from the blur with a thin wordmark, then a soft iris opens out of
// the orb and the glass melts away. Closing (~0.35s): the window settles back
// and dims before it goes. Click or press any key to skip.
(function () {
  const NP = window.NebulaPlus;
  if (!NP || window.__nplusSplash) return;
  window.__nplusSplash = true;

  NP.DEFAULTS["nplus-splash"] = true;
  const on = () => NP.prefs.get("nplus-splash") !== false;
  const XHTML = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = document.createElementNS(XHTML, tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const root = document.documentElement;

  function intro() {
    const sp = el("div");
    sp.id = "nplus-splash";
    const orb = el("div", "sp-orb");
    const word = el("div", "sp-word", "Nebula");
    sp.append(orb, word);
    root.append(sp);
    root.setAttribute("nplus-splash", "in");
    if (NP.orb) {
      NP.orb.accentFrom = sp;
      NP.orb.attach(orb);
    }

    let done = false;
    const timers = [];
    const finish = () => {
      sp.remove();
      root.removeAttribute("nplus-splash");
      if (NP.orb?.accentFrom === sp) NP.orb.accentFrom = null;
      removeEventListener("keydown", exit, true);
    };
    function exit() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      sp.setAttribute("phase", "out");
      root.setAttribute("nplus-splash", "out");
      setTimeout(finish, 750);
    }
    // two frames so the starting state is painted before it moves
    requestAnimationFrame(() => requestAnimationFrame(() => sp.setAttribute("phase", "show")));
    timers.push(setTimeout(exit, 620));
    sp.addEventListener("click", exit);
    addEventListener("keydown", exit, true);
  }

  // Closing: a short, quiet settle (only for the close button / Alt+F4).
  let closing = false;
  function outro(e) {
    if (closing || e.defaultPrevented || !on()) return;
    e.preventDefault();
    closing = true;
    root.setAttribute("nplus-splash", "close");
    setTimeout(() => {
      window.close();
      // still open (a "close tabs?" prompt was cancelled): undo
      setTimeout(() => {
        root.removeAttribute("nplus-splash");
        closing = false;
      }, 300);
    }, 340);
  }

  // Only the window that opens with the app gets the opening (not new
  // windows, and not hot reloads later on).
  const sinceStart = Date.now() - (Services.startup.getStartupInfo().process?.getTime() ?? 0);
  if (on() && sinceStart < 25000) {
    try {
      intro();
    } catch (err) {
      NP.logger?.error("splash", err);
    }
  }
  addEventListener("close", outro);
  NP.splash = { play: intro };
})();
