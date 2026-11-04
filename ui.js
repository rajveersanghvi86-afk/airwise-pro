/* ==========================================================================
   AirWise Pro - Layout, navigation, accessibility & performance helpers
   ========================================================================== */

const TABS = ["now", "plan", "forecast", "map"];

state.layoutPref = storage.get("airwise_layout") || "auto";  // auto | phone | desktop
state.litePref = storage.get("airwise_lite") || "auto";      // auto | on | off
state.tab = "now";

/* ---------- Device & layout ---------- */

// Phones and small tablets get the tabbed app layout
function detectDevice() {
  const w = window.innerWidth;
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const shortSide = Math.min(window.screen?.width || w, window.screen?.height || w);
  return w <= 820 || (coarse && shortSide <= 600) ? "phone" : "desktop";
}

function resolvedLayout() {
  return state.layoutPref === "phone" || state.layoutPref === "desktop" ? state.layoutPref : detectDevice();
}

function applyLayout() {
  const layout = resolvedLayout();
  const changed = document.body.dataset.layout !== layout;
  document.body.dataset.layout = layout;
  document.body.dataset.tab = state.tab;
  renderNav();
  if (changed) afterLayoutChange();
}

function setLayoutPref(pref) {
  state.layoutPref = pref;
  storage.set("airwise_layout", pref);
  applyLayout();
  renderLayoutHint();
}

function renderLayoutHint() {
  const el = document.getElementById("layoutHint");
  if (!el) return;
  const device = detectDevice() === "phone" ? t("settings.devicePhone") : t("settings.deviceDesktop");
  el.textContent = t("settings.detected", { device });
  const select = document.getElementById("layoutSelect");
  if (select) select.value = state.layoutPref;
}

// Leaflet and Chart.js need to re-measure when their card appears
function afterLayoutChange() {
  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
    if (state.mainChart) state.mainChart.resize();
  }, 60);
}

/* ---------- Tabs (phone layout) ---------- */

function setTab(tab, { push = true, focus = false } = {}) {
  if (!TABS.includes(tab)) tab = "now";
  const changed = state.tab !== tab;
  state.tab = tab;
  document.body.dataset.tab = tab;
  renderNav();
  if (push && changed) {
    try { history.pushState({ tab }, "", `${location.pathname}${location.search}#${tab}`); } catch (e) { /* ignore */ }
  }
  if (document.body.dataset.layout === "phone") {
    window.scrollTo(0, 0);
    afterLayoutChange();
    if (focus) document.querySelector(`[data-tab~="${tab}"] .card-title, [data-tab~="${tab}"] h2`)?.focus?.();
  }
}

function renderNav() {
  document.querySelectorAll(".bottom-nav [data-nav]").forEach(btn => {
    const active = btn.dataset.nav === state.tab;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

/* ---------- Lite mode (older phones, data saver) ---------- */

function deviceIsLowEnd() {
  const conn = navigator.connection || {};
  return !!(conn.saveData ||
    /(^|-)2g$/.test(conn.effectiveType || "") ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
}

function applyLite() {
  state.lite = state.litePref === "on" || (state.litePref === "auto" && deviceIsLowEnd());
  document.body.classList.toggle("lite", state.lite);
  const select = document.getElementById("liteSelect");
  if (select) select.value = state.litePref;
}

function setLitePref(pref) {
  state.litePref = pref;
  storage.set("airwise_lite", pref);
  applyLite();
  if (state.mainChart) renderCharts();
  if (typeof refreshMapOverlays === "function") refreshMapOverlays();
}

/* ---------- Haptic feedback ---------- */

function buzz(pattern = 12) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ }
}

/* ---------- Screen reader announcements ---------- */

function announce(message) {
  const el = document.getElementById("srAnnouncer");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = message; }, 50);
}

/* ---------- Dialogs: focus in, trap Tab, focus back on close ---------- */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function initDialogs() {
  const dialogs = document.querySelectorAll(".modal-backdrop, .tour-overlay");
  const returnFocus = new Map();

  const anyOpen = () => [...dialogs].some(d => d.classList.contains("active"));
  const setInert = (on) => {
    document.querySelectorAll(".app-container, .bottom-nav").forEach(el => {
      if (on) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); }
      else { el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); }
    });
  };

  dialogs.forEach(d => {
    if (!d.hasAttribute("role")) d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    const heading = d.querySelector("h2, h3");
    if (heading && !d.hasAttribute("aria-labelledby")) {
      if (!heading.id) heading.id = `${d.id}-title`;
      d.setAttribute("aria-labelledby", heading.id);
    }

    new MutationObserver(() => {
      const open = d.classList.contains("active");
      if (open && !returnFocus.has(d)) {
        returnFocus.set(d, document.activeElement);
        setInert(true);
        setTimeout(() => {
          if (d.contains(document.activeElement)) return;
          const first = [...d.querySelectorAll(FOCUSABLE)].find(el => el.offsetParent !== null);
          (first || d.querySelector(".modal-box") || d).focus?.({ preventScroll: true });
        }, 30);
      } else if (!open && returnFocus.has(d)) {
        const back = returnFocus.get(d);
        returnFocus.delete(d);
        if (!anyOpen()) setInert(false);
        if (back && document.contains(back)) back.focus?.({ preventScroll: true });
      }
    }).observe(d, { attributes: true, attributeFilter: ["class"] });

    d.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !d.classList.contains("active")) return;
      const items = [...d.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  // Escape closes the top dialog
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal-backdrop.active")];
    if (open.length) open[open.length - 1].classList.remove("active");
  });
}

/* ---------- Load heavy libraries only when needed ---------- */

const loadedScripts = {};

function loadScript(src) {
  if (!loadedScripts[src]) {
    loadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete loadedScripts[src]; reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }
  return loadedScripts[src];
}

function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

// Run `cb` once, the first time `el` is (nearly) on screen
function whenVisible(el, cb) {
  if (!el) return;
  if (!("IntersectionObserver" in window)) { cb(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      io.disconnect();
      cb();
    }
  }, { rootMargin: "300px 0px" });
  io.observe(el);
}

/* ---------- Init ---------- */

function initUI() {
  applyLite();

  const hashTab = location.hash.replace("#", "");
  if (TABS.includes(hashTab)) state.tab = hashTab;
  applyLayout();

  document.querySelectorAll(".bottom-nav [data-nav]").forEach(btn => {
    btn.addEventListener("click", () => { buzz(); setTab(btn.dataset.nav); });
  });
  window.addEventListener("popstate", () => {
    const tab = location.hash.replace("#", "");
    setTab(TABS.includes(tab) ? tab : "now", { push: false });
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (state.layoutPref === "auto") applyLayout(); }, 150);
  });

  // Settings: language, layout, lite mode
  document.querySelectorAll(".lang-select").forEach(sel => {
    sel.innerHTML = languageOptionsHTML();
    sel.value = currentLang;
    sel.addEventListener("change", (e) => { setLanguage(e.target.value); buzz(); });
  });
  document.getElementById("layoutSelect").addEventListener("change", (e) => { setLayoutPref(e.target.value); buzz(); });
  document.getElementById("liteSelect").addEventListener("change", (e) => { setLitePref(e.target.value); buzz(); });
  renderLayoutHint();

  initDialogs();

  // Load the icon font and web font without blocking first paint.
  // Lite mode skips the web font and uses the phone's own font.
  if (!state.lite) loadCSS("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap");
}
