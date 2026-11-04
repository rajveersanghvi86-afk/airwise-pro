/* ==========================================================================
   AirWise Pro - Theme, units, sharing & shareable links
   ========================================================================== */

state.themePref = storage.get("airwise_theme") || "system"; // system | light | dark
// Default units follow the region: °F and mph in the US and a few other places
function defaultUnits() {
  const region = String(navigator.language || "").split("-")[1] || "";
  return ["US", "LR", "MM", "BS", "BZ", "KY", "PW"].includes(region.toUpperCase()) ? "imperial" : "metric";
}
state.units = storage.get("airwise_units") || defaultUnits();   // metric | imperial

const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolvedTheme() {
  if (state.themePref === "light" || state.themePref === "dark") return state.themePref;
  return systemDark && !systemDark.matches ? "light" : "dark";
}

function isLightTheme() {
  return resolvedTheme() === "light";
}

// Read a CSS variable (used for chart colors)
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#eef2f7" : "#0b0f19");

  const btn = document.getElementById("themeBtn");
  if (btn) {
    btn.innerHTML = `<i class="fa-solid ${theme === "light" ? "fa-moon" : "fa-sun"}" aria-hidden="true"></i>`;
    btn.title = t("btn.theme");
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
  const select = document.getElementById("themeSelect");
  if (select) select.value = state.themePref;

  if (typeof setMapTheme === "function") setMapTheme(theme);
  // Text colors depend on the theme, so redraw
  if (state.aqiData && typeof renderAll === "function") renderAll();
}

function setThemePref(pref) {
  state.themePref = pref;
  storage.set("airwise_theme", pref);
  applyTheme();
}

/* ---------- Units ---------- */

function formatTemp(c) {
  if (!isValidNumber(c)) return state.units === "imperial" ? "--°F" : "--°C";
  return state.units === "imperial" ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

function formatWind(kmh, cardinal = "") {
  if (!isValidNumber(kmh)) return state.units === "imperial" ? "-- mph" : "-- km/h";
  const val = state.units === "imperial" ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  return `${val} ${cardinal}`.trim();
}

function setUnits(units) {
  state.units = units === "imperial" ? "imperial" : "metric";
  storage.set("airwise_units", state.units);
  if (state.aqiData) renderHeroAQI();
}

/* ---------- Shareable links ---------- */

function readLocationFromURL() {
  const q = new URLSearchParams(location.search);
  const lat = parseFloat(q.get("lat"));
  const lon = parseFloat(q.get("lon"));
  if (!isValidNumber(lat) || !isValidNumber(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, city: (q.get("city") || "Shared location").slice(0, 80), country: (q.get("country") || "").slice(0, 80) };
}

function locationURL() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("lat", Number(state.currentLat).toFixed(4));
  url.searchParams.set("lon", Number(state.currentLon).toFixed(4));
  url.searchParams.set("city", state.currentCityName);
  if (state.currentCountry) url.searchParams.set("country", state.currentCountry);
  return url.toString();
}

function updateURL() {
  try { history.replaceState(history.state, "", locationURL() + location.hash); } catch (e) { /* ignore (e.g. file://) */ }
}

async function shareCurrent() {
  const aqi = getCurrentAQI();
  const lvl = isValidNumber(aqi) ? getAQILevel(aqi) : null;
  const place = `${state.currentCityName}${state.currentCountry ? ", " + state.currentCountry : ""}`;
  const text = lvl ? t("share.text", { place, aqi: lvl.value, cat: lvl.category }) : place;
  const url = locationURL();

  if (navigator.share) {
    try {
      await navigator.share({ title: "AirWise Pro", text, url });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast(t("share.copied"), "", "success");
    buzz();
  } catch (e) {
    showToast(t("share.failed"), url, "warn");
  }
}

function initPrefs() {
  applyTheme();
  systemDark?.addEventListener?.("change", () => { if (state.themePref === "system") applyTheme(); });

  document.getElementById("themeBtn").addEventListener("click", () => {
    setThemePref(isLightTheme() ? "dark" : "light");
  });
  document.getElementById("themeSelect").addEventListener("change", (e) => setThemePref(e.target.value));

  const unitsSelect = document.getElementById("unitsSelect");
  unitsSelect.value = state.units;
  unitsSelect.addEventListener("change", (e) => setUnits(e.target.value));

  document.getElementById("shareBtn").addEventListener("click", shareCurrent);
}
