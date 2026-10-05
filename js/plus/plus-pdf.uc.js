// Nebula Plus — PDF reader skin.
// Firefox's PDF viewer (pdf.js) in the Nebula look: glass toolbar and
// sidebar, a deep backdrop, rounded pages with soft shadows, Meem in the UI.
// Dark pages use pdf.js's own page colours (text and background recoloured,
// images untouched — no inverted photos). pdf.js already remembers where you
// were in each file.
(function () {
  const NP = window.NebulaPlus;
  if (!NP) return;

  NP.DEFAULTS["nplus-pdf-skin"] = true;
  NP.DEFAULTS["nplus-pdf-dark"] = true;

  // Only pdf.js pages have this structure; :has keeps it from touching sites.
  const SHEET = `
    @-moz-document regexp(".*") {
      html:has(> body > #outerContainer #viewerContainer) {
        --np-accent: #8b7bff;
        --np-glass: rgb(20 20 30 / 72%);
        --np-line: rgb(255 255 255 / 8%);
        color-scheme: dark !important;
      }
      html:has(> body > #outerContainer #viewerContainer) body {
        background:
          radial-gradient(60% 40% at 85% 0%, rgb(139 123 255 / 16%), transparent 70%),
          radial-gradient(50% 40% at 0% 100%, rgb(95 180 255 / 10%), transparent 70%),
          #0d0d14 !important;
        font-family: "Meem", system-ui, sans-serif !important;
      }
      html:has(> body > #outerContainer #viewerContainer) :is(#outerContainer, #mainContainer, #viewerContainer) {
        background: transparent !important;
      }
      html:has(> body > #outerContainer #viewerContainer) :is(#toolbarContainer, .toolbar, #toolbarViewer, #findbar, #secondaryToolbar, .doorHanger, .doorHangerRight, .editorParamsToolbar, #sidebarContainer, #viewsManager, #sidebarContent, #toolbarSidebar) {
        background: var(--np-glass) !important;
        backdrop-filter: blur(22px) saturate(160%) !important;
        border-color: var(--np-line) !important;
        box-shadow: none !important;
      }
      html:has(> body > #outerContainer #viewerContainer) #toolbarContainer {
        box-shadow: 0 0.5px 0 var(--np-line), 0 10px 30px -18px rgb(0 0 0 / 80%) !important;
      }
      html:has(> body > #outerContainer #viewerContainer) :is(#toolbarContainer, #findbar, #secondaryToolbar, #sidebarContainer, #viewsManager) :is(button, input, select, span, label) {
        font-family: "Meem", system-ui, sans-serif !important;
      }
      html:has(> body > #outerContainer #viewerContainer) :is(#findbar, #secondaryToolbar, .doorHanger, .doorHangerRight) {
        border-radius: 14px !important;
        box-shadow: 0 0 0 0.5px var(--np-line), 0 18px 40px -16px rgb(0 0 0 / 80%) !important;
      }
      html:has(> body > #outerContainer #viewerContainer) .toolbarButton:hover,
      html:has(> body > #outerContainer #viewerContainer) .secondaryToolbarButton:hover {
        background-color: rgb(139 123 255 / 22%) !important;
        border-radius: 8px !important;
      }
      html:has(> body > #outerContainer #viewerContainer) :is(.toolbarField, #pageNumber, #scaleSelect, #findInput) {
        background: rgb(255 255 255 / 7%) !important;
        border: none !important;
        border-radius: 8px !important;
        box-shadow: 0 0 0 0.5px var(--np-line) !important;
        color: #f0f0f8 !important;
      }
      /* the pages: rounded sheets floating on the backdrop */
      html:has(> body > #outerContainer #viewerContainer) .pdfViewer .page {
        border: none !important;
        border-radius: 10px !important;
        overflow: hidden !important;
        margin: 14px auto !important;
        box-shadow: 0 0 0 0.5px rgb(255 255 255 / 6%), 0 22px 50px -26px rgb(0 0 0 / 90%) !important;
      }
      /* sidebar thumbnails */
      html:has(> body > #outerContainer #viewerContainer) :is(.thumbnailImage, .thumbnail .thumbnailImage) {
        border-radius: 6px !important;
      }
      html:has(> body > #outerContainer #viewerContainer) .thumbnail.selected .thumbnailImage,
      html:has(> body > #outerContainer #viewerContainer) .thumbnail[aria-current] .thumbnailImage {
        outline: 2px solid var(--np-accent) !important;
        outline-offset: 2px !important;
      }
      html:has(> body > #outerContainer #viewerContainer) #viewerContainer {
        scrollbar-color: rgb(255 255 255 / 18%) transparent !important;
      }
    }
  `;

  const PREFS = {
    "pdfjs.viewerCssTheme": ["int", 2],
    "pdfjs.forcePageColors": ["bool", true],
    "pdfjs.pageColorsBackground": ["string", "#16161f"],
    "pdfjs.pageColorsForeground": ["string", "#e6e6ef"],
  };

  NP.feature({
    name: "PdfSkin",
    init() {
      this.sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
      this.sheet = Services.io.newURI("data:text/css;charset=utf-8," + encodeURIComponent(SHEET));
      this.apply = () => {
        const skin = NP.prefs.get("nplus-pdf-skin");
        const has = this.sss.sheetRegistered(this.sheet, this.sss.USER_SHEET);
        if (skin && !has) this.sss.loadAndRegisterSheet(this.sheet, this.sss.USER_SHEET);
        if (!skin && has) this.sss.unregisterSheet(this.sheet, this.sss.USER_SHEET);
        // dark UI with the skin; dark pages only if asked
        const dark = NP.prefs.get("nplus-pdf-dark");
        for (const [name, [type, value]] of Object.entries(PREFS)) {
          const on = name === "pdfjs.viewerCssTheme" ? skin : skin && dark;
          if (!on) Services.prefs.clearUserPref(name);
          else if (type === "int") Services.prefs.setIntPref(name, value);
          else if (type === "bool") Services.prefs.setBoolPref(name, value);
          else Services.prefs.setStringPref(name, value);
        }
      };
      NP.prefs.watch("nplus-pdf-skin", this.apply);
      NP.prefs.watch("nplus-pdf-dark", this.apply);
      this.apply();
    },

    destroy() {
      try {
        if (this.sss.sheetRegistered(this.sheet, this.sss.USER_SHEET)) this.sss.unregisterSheet(this.sheet, this.sss.USER_SHEET);
      } catch {}
    },
  });
})();
