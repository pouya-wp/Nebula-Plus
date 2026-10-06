// Nebula Plus — smart proxy routing (off until you turn it on).
// With your VPN/proxy app running, Iranian sites (.ir, Digikala, Aparat,
// Rubika, Eitaa, Bale, banks…) and local addresses open DIRECT — fast, and
// they don't block you — while everything else goes through the proxy.
// The proxy address is read from Windows' proxy setting (what v2rayN and
// friends set) unless you write one in nplus-proxy-addr. Turning it off
// puts Zen's own proxy setting back exactly as it was.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-smart-proxy"] = false;
  NP.DEFAULTS["nplus-proxy-addr"] = "";
  NP.DEFAULTS["nplus-proxy-direct"] = "";

  const DIRECT = [
    "digikala.com", "dkstatics-public.digikala.com", "aparat.com", "eitaa.com", "bale.ai", "splus.ir", "filimo.com", "namava.ir",
    "torob.com", "emalls.ir", "sheypoor.com", "zoomit.ir", "varzesh3.com", "cafebazaar.ir", "myket.ir", "nobitex.ir", "ganjoor.net",
    "telewebion.com", "tamasha.com", "digikalajet.com", "snappfood.ir", "alibaba.ir", "virgool.io", "jobinja.ir", "quera.org",
    "arvancloud.ir", "arvancdn.ir", "tapsi.ir", "balad.ir", "neshan.org", "samandehi.ir", "enamad.ir", "shaparak.ir",
  ];

  function readWindowsProxy() {
    try {
      const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
      key.open(Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", Ci.nsIWindowsRegKey.ACCESS_READ);
      const on = key.hasValue("ProxyEnable") && key.readIntValue("ProxyEnable") === 1;
      const server = key.hasValue("ProxyServer") ? key.readStringValue("ProxyServer") : "";
      key.close();
      if (!on || !server) return "";
      // "host:port" or "http=host:port;https=host:port;socks=host:port"
      const parts = Object.fromEntries(server.split(";").map((p) => (p.includes("=") ? p.split("=") : ["all", p])));
      return parts.all || parts.https || parts.http || "";
    } catch {
      return "";
    }
  }

  NP.feature({
    name: "SmartProxy",
    async init() {
      await NP.store.load();
      this.off = [
        NP.prefs.watch("nplus-smart-proxy", () => this.later()),
        NP.prefs.watch("nplus-proxy-addr", () => this.later()),
        NP.prefs.watch("nplus-proxy-direct", () => this.later()),
      ];
    },

    later() {
      clearTimeout(this.t);
      this.t = setTimeout(() => this.apply(), 300);
    },

    pac(addr) {
      const extra = String(NP.prefs.get("nplus-proxy-direct") || "")
        .split(/[,\s]+/)
        .map((d) => d.trim().replace(/^\*?\./, ""))
        .filter(Boolean);
      const list = JSON.stringify([...DIRECT, ...extra]);
      const socks = /^socks/i.test(addr);
      const target = addr.replace(/^\w+:\/\//, "");
      return `function FindProxyForURL(url, host) {
  if (isPlainHostName(host) || /\\.(ir|local|localhost|test)$/.test(host) || /^(127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|\\[?::1)/.test(host)) return "DIRECT";
  var d = ${list};
  for (var i = 0; i < d.length; i++) if (host === d[i] || dnsDomainIs(host, "." + d[i])) return "DIRECT";
  return "${socks ? `SOCKS5 ${target}; SOCKS ${target}` : `PROXY ${target}`}; DIRECT";
}`;
    },

    apply() {
      const P = Services.prefs;
      const on = NP.prefs.get("nplus-smart-proxy");
      const saved = NP.store.data.proxySaved;
      if (!on) {
        if (saved) {
          P.setIntPref("network.proxy.type", saved.type);
          if (saved.pac) P.setStringPref("network.proxy.autoconfig_url", saved.pac);
          else P.clearUserPref("network.proxy.autoconfig_url");
          NP.store.set("proxySaved", undefined);
          delete NP.store.data.proxySaved;
          NP.island?.show({ title: "مسیریابی هوشمند خاموش شد", subtitle: "تنظیم پروکسی قبلی برگشت", duration: 2500 });
        }
        return;
      }
      const addr = String(NP.prefs.get("nplus-proxy-addr") || "").trim() || readWindowsProxy();
      if (!addr) {
        NP.island?.show({ title: "پروکسی پیدا نشد", subtitle: "برنامه‌ی VPN/پروکسی رو روشن کن یا آدرسش رو در nplus-proxy-addr بنویس", duration: 6000 });
        return;
      }
      if (!saved) {
        const cur = P.getStringPref("network.proxy.autoconfig_url", "");
        NP.store.data.proxySaved = { type: P.getIntPref("network.proxy.type", 5), pac: cur.startsWith("data:application/x-ns-proxy-autoconfig") ? "" : cur };
        NP.store.set("proxySaved", NP.store.data.proxySaved);
      }
      P.setStringPref("network.proxy.autoconfig_url", "data:application/x-ns-proxy-autoconfig," + encodeURIComponent(this.pac(addr)));
      P.setIntPref("network.proxy.type", 2);
      Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(Ci.nsIProtocolProxyService).reloadPAC?.();
      NP.island?.show({ title: "مسیریابی هوشمند روشنه", subtitle: `سایت‌های ایرانی مستقیم · بقیه از ${addr}`, icon: "🧭", duration: 3500 });
    },

    destroy() {
      clearTimeout(this.t);
      for (const f of this.off ?? []) f?.();
    },
  });
})();
