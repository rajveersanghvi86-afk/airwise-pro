/* ==========================================================================
   AirWise Pro - Modern AQI Intelligence & Health Safety Engine
   ========================================================================== */

const DEFAULT_LOCATION = { lat: 28.6139, lon: 77.2090, city: "New Delhi", country: "India" };
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;   // auto-refresh every 15 minutes
const MAX_STATION_DISTANCE_KM = 50;           // ignore WAQI stations further away than this

// Safe localStorage helpers (storage can be blocked in private mode)
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } },
  remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
};

function loadSavedDefaultCity() {
  try { return JSON.parse(storage.get("airwise_default_city")) || null; } catch (e) { return null; }
}

// Global State
const state = {
  currentLat: DEFAULT_LOCATION.lat,
  currentLon: DEFAULT_LOCATION.lon,
  currentCityName: DEFAULT_LOCATION.city,
  currentCountry: DEFAULT_LOCATION.country,
  currentProfile: storage.get("airwise_profile") || "general",
  aqiData: null,
  weatherData: null,
  waqiData: null,
  stationMeta: null,
  activeChartTab: "hourly",
  waqiToken: storage.get("airwise_waqi_token") || "",
  defaultCity: loadSavedDefaultCity(),
  mainChart: null,
  map: null,
  requestId: 0,
  refreshTimer: null
};

// Health profiles. `factor` scales the AQI before applying thresholds, so sensitive
// groups get stricter advice. `exertionFactor` applies to strenuous activities only.
const PROFILES = {
  general:     { factor: 1.0,  exertionFactor: 1.0,  cleanLimit: 80 },
  sensitive:   { factor: 1.3,  exertionFactor: 1.3,  cleanLimit: 50 },
  respiratory: { factor: 1.5,  exertionFactor: 1.5,  cleanLimit: 50 },
  athlete:     { factor: 1.0,  exertionFactor: 1.4,  cleanLimit: 60 }
};

function profileLabel(key = state.currentProfile) {
  return t("profile." + (PROFILES[key] ? key : "general"));
}

function getProfile() {
  return PROFILES[state.currentProfile] || PROFILES.general;
}

// `color` fills shapes. `textDark` / `textLight` are readable text versions of it
// for each theme (at least 4.5:1 contrast, WCAG AA).
const AQI_THRESHOLDS = [
  { max: 50,  key: "good",          class: "aqi-status-good",           color: "#10b981", textDark: "#34d399", textLight: "#065f46", icon: "fa-circle-check" },
  { max: 100, key: "moderate",      class: "aqi-status-moderate",       color: "#f59e0b", textDark: "#fbbf24", textLight: "#7c2d12", icon: "fa-circle-info" },
  { max: 150, key: "sensitive",     class: "aqi-status-sensitive",      color: "#f97316", textDark: "#fb923c", textLight: "#9a3412", icon: "fa-triangle-exclamation" },
  { max: 200, key: "unhealthy",     class: "aqi-status-unhealthy",      color: "#ef4444", textDark: "#f87171", textLight: "#991b1b", icon: "fa-triangle-exclamation" },
  { max: 300, key: "veryUnhealthy", class: "aqi-status-very-unhealthy", color: "#a855f7", textDark: "#c084fc", textLight: "#6b21a8", icon: "fa-skull-crossbones" },
  { max: 500, key: "hazardous",     class: "aqi-status-hazardous",      color: "#e11d48", textDark: "#fb7185", textLight: "#881337", icon: "fa-skull-crossbones" }
];

function getAQILevel(aqi) {
  const val = Math.max(0, Math.min(500, Math.round(aqi || 0)));
  const th = AQI_THRESHOLDS.find(x => val <= x.max) || AQI_THRESHOLDS[AQI_THRESHOLDS.length - 1];
  const light = document.documentElement.dataset.theme === "light";
  return Object.assign({}, th, { value: val, category: t("cat." + th.key), text: light ? th.textLight : th.textDark });
}

function isValidNumber(n) {
  return typeof n === "number" && isFinite(n);
}

// Escape text before putting it into HTML strings
function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// Distance between two coordinates in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// US EPA piecewise AQI calculation (fallback when the API does not supply sub-AQIs).
// Uses the May 2024 PM2.5 breakpoints. Concentrations are truncated per EPA rules.
function calcSubAQI(pollutant, conc) {
  if (!isValidNumber(conc) || conc < 0) return null;

  const scale = (c, table) => {
    for (const [cLo, cHi, iLo, iHi] of table) {
      if (c <= cHi) return Math.round(((iHi - iLo) / (cHi - cLo)) * (Math.max(c, cLo) - cLo) + iLo);
    }
    return 500;
  };

  switch (pollutant) {
    case "PM25": // µg/m³, truncate to 0.1
      return scale(Math.floor(conc * 10) / 10, [
        [0.0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
        [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]
      ]);
    case "PM10": // µg/m³, truncate to integer
      return scale(Math.floor(conc), [
        [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
        [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]
      ]);
    case "NO2": // µg/m³ -> ppb (1.88 µg/m³ per ppb)
      return scale(Math.floor(conc / 1.88), [
        [0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150],
        [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 2049, 301, 500]
      ]);
    case "O3": // µg/m³ -> ppb (1.96 µg/m³ per ppb), 8-hour breakpoints
      return scale(Math.floor(conc / 1.96), [
        [0, 54, 0, 50], [55, 70, 51, 100], [71, 85, 101, 150],
        [86, 105, 151, 200], [106, 200, 201, 300]
      ]);
    case "SO2": // µg/m³ -> ppb (2.62 µg/m³ per ppb)
      return scale(Math.floor(conc / 2.62), [
        [0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150],
        [186, 304, 151, 200], [305, 604, 201, 300], [605, 1004, 301, 500]
      ]);
    case "CO": // µg/m³ -> ppm (1145 µg/m³ per ppm), truncate to 0.1
      return scale(Math.floor((conc / 1145) * 10) / 10, [
        [0.0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150],
        [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 50.4, 301, 500]
      ]);
    default:
      return null;
  }
}

// Pollutant definitions shared by cards and dominant-pollutant detection
const POLLUTANTS = [
  { id: "PM25", label: "PM2.5", waqiKey: "pm25", concKey: "pm2_5",            aqiKey: "us_aqi_pm2_5" },
  { id: "PM10", label: "PM10",  waqiKey: "pm10", concKey: "pm10",             aqiKey: "us_aqi_pm10" },
  { id: "NO2",  label: "NO₂",   waqiKey: "no2",  concKey: "nitrogen_dioxide", aqiKey: "us_aqi_nitrogen_dioxide" },
  { id: "O3",   label: "O₃",    waqiKey: "o3",   concKey: "ozone",            aqiKey: "us_aqi_ozone" },
  { id: "SO2",  label: "SO₂",   waqiKey: "so2",  concKey: "sulphur_dioxide",  aqiKey: "us_aqi_sulphur_dioxide" },
  { id: "CO",   label: "CO",    waqiKey: "co",   concKey: "carbon_monoxide",  aqiKey: "us_aqi_carbon_monoxide" }
];

function pollutantLabel(id) {
  return POLLUTANTS.find(p => p.id === id)?.label || id;
}

// Sub-AQI for one pollutant, from the same source as the headline AQI
function getSubAQI(p) {
  if (state.stationMeta?.isStation) {
    const v = state.waqiData?.iaqi?.[p.waqiKey]?.v;
    if (isValidNumber(v)) return Math.round(v);
  }
  const cur = state.aqiData?.current || {};
  if (isValidNumber(cur[p.aqiKey])) return Math.round(cur[p.aqiKey]);
  return calcSubAQI(p.id, cur[p.concKey]);
}

// The single AQI number every section uses
function getCurrentAQI() {
  if (state.stationMeta?.isStation && isValidNumber(state.waqiData?.aqi)) {
    return state.waqiData.aqi;
  }
  const omAQI = state.aqiData?.current?.us_aqi;
  if (isValidNumber(omAQI)) return omAQI;
  const subs = POLLUTANTS.map(getSubAQI).filter(isValidNumber);
  return subs.length ? Math.max(...subs) : null;
}

function findDominantPollutant() {
  let best = null;
  POLLUTANTS.forEach(p => {
    const v = getSubAQI(p);
    if (isValidNumber(v) && (!best || v > best.v)) best = { id: p.id, v };
  });
  return best ? best.id : null;
}

// Convert Wind Bearing Angle to Cardinal Compass String
function getWindCardinal(degree) {
  if (!isValidNumber(degree)) return "";
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return directions[Math.floor((degree / 22.5) + 0.5) % 16];
}

// Get UV Safety Risk Level
function getUvRiskCategory(uv) {
  if (!isValidNumber(uv)) return "";
  if (uv <= 2) return t("uv.low");
  if (uv <= 5) return t("uv.moderate");
  if (uv <= 7) return t("uv.high");
  if (uv <= 10) return t("uv.veryHigh");
  return t("uv.extreme");
}

/* ---------- Time helpers ----------
   The APIs are called with timezone=auto, so times are local to the searched
   place (e.g. "2026-11-04T13:00"). formatHourLabel / formatDayLabel (i18n.js)
   format them in the chosen language without browser time zone shifts. */

function hourFromISO(str) {
  return parseInt(String(str).slice(11, 13), 10);
}

function timeOfDayName(hour) {
  if (hour < 5) return t("time.lateNight");
  if (hour < 12) return t("time.morning");
  if (hour < 17) return t("time.afternoon");
  if (hour < 21) return t("time.evening");
  return t("time.night");
}

// Index of the current hour inside the hourly arrays
function getCurrentHourIndex() {
  const times = state.aqiData?.hourly?.time || [];
  const curTime = state.aqiData?.current?.time;
  if (curTime) {
    const key = String(curTime).slice(0, 13);
    const idx = times.findIndex(x => String(x).slice(0, 13) === key);
    if (idx >= 0) return idx;
  }
  return Math.min(new Date().getHours(), Math.max(0, times.length - 1));
}

// Next 24 hours of { time, aqi }, with null for missing values
function getNext24Hours() {
  const hourly = state.aqiData?.hourly || {};
  const times = hourly.time || [];
  const aqis = hourly.us_aqi || [];
  const start = getCurrentHourIndex();
  const out = [];
  for (let i = start; i < Math.min(start + 24, times.length); i++) {
    out.push({ time: times[i], aqi: isValidNumber(aqis[i]) ? aqis[i] : null });
  }
  return out;
}

/* ---------- Start-up ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  // Get the chosen language file first so the page never flashes in English
  if (currentLang !== "en") {
    try { await loadLanguage(currentLang); } catch (e) { currentLang = "en"; }
  }
  applyTranslations();
  initUI();          // layout, tabs, lite mode, modals, haptics (ui.js)
  initPrefs();
  initPersonal();
  initEventListeners();
  initSearch();
  initFavorites();
  initAlerts();
  initPWA();
  initTour();

  if (!PROFILES[state.currentProfile]) state.currentProfile = "general";

  if (state.waqiToken) document.getElementById("waqiTokenInput").value = state.waqiToken;
  if (state.defaultCity) document.getElementById("defaultCityInput").value = state.defaultCity.city;

  // Restore saved health profile
  document.querySelectorAll(".profile-chip").forEach(c => {
    const active = c.dataset.profile === state.currentProfile;
    c.classList.toggle("active", active);
    c.setAttribute("aria-pressed", active ? "true" : "false");
  });

  // A shared link (?lat=&lon=&city=) wins, then the saved default city, then GPS
  const linked = readLocationFromURL();
  if (linked) {
    loadData(linked.lat, linked.lon, linked.city, linked.country);
  } else if (state.defaultCity) {
    const d = state.defaultCity;
    loadData(d.lat, d.lon, d.city, d.country);
  } else {
    detectLocation();
  }

  // Auto refresh. Keeps going in a hidden tab only when alerts are on.
  state.refreshTimer = setInterval(() => {
    if (!document.hidden || state.alerts?.enabled) refreshData();
  }, refreshInterval());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.lastLoaded && Date.now() - state.lastLoaded > refreshInterval()) {
      refreshData();
    }
  });
});

// Lite mode checks less often to save data and battery
function refreshInterval() {
  return state.lite ? REFRESH_INTERVAL_MS * 2 : REFRESH_INTERVAL_MS;
}

function refreshData() {
  loadData(state.currentLat, state.currentLon, state.currentCityName, state.currentCountry);
}

// Redraw everything (after a language or theme change)
function renderAll() {
  renderFavButton();
  renderFavorites();
  renderAlertButton();
  if (!state.aqiData) {
    document.getElementById("locName").textContent = state.currentCityName ? placeLabel() : t("loc.detecting");
    return;
  }
  document.getElementById("locName").textContent = placeLabel();
  renderUpdatedTime();
  renderHeroAQI();
  renderPollutants();
  renderPlanner();
  renderMaskGuidance();
  renderActivities();
  renderCharts();
  renderPersonalPlan();
  if (typeof refreshMapLanguage === "function") refreshMapLanguage();
}

function placeLabel() {
  return `${state.currentCityName}${state.currentCountry ? ", " + state.currentCountry : ""}`;
}

function renderUpdatedTime() {
  if (!state.lastLoaded) return;
  document.getElementById("updatedTime").textContent = "• " + t("updated", { time: formatClock(new Date(state.lastLoaded)) });
}

/* ---------- Event listeners ---------- */

function initEventListeners() {
  document.getElementById("geoBtn").addEventListener("click", () => detectLocation(true));

  // Health profile chips
  document.querySelectorAll(".profile-chip").forEach(chip => {
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    const select = () => {
      document.querySelectorAll(".profile-chip").forEach(c => {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");
      state.currentProfile = chip.dataset.profile;
      storage.set("airwise_profile", state.currentProfile);
      buzz();
      if (state.aqiData) {
        renderPlanner();
        renderMaskGuidance();
        renderActivities();
      }
    };
    chip.addEventListener("click", select);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
    });
  });

  // Chart tabs
  document.querySelectorAll(".chart-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chart-tab-btn").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      state.activeChartTab = btn.dataset.chart;
      buzz();
      renderCharts();
    });
  });

  // Settings modal
  const modal = document.getElementById("settingsModal");
  const openSettings = () => {
    renderLayoutHint();
    modal.classList.add("active");
  };
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.querySelectorAll("[data-open-settings]").forEach(el => el.addEventListener("click", openSettings));
  document.getElementById("closeModal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });
  modal.querySelectorAll("[data-close-settings]").forEach(el => el.addEventListener("click", () => modal.classList.remove("active")));
  document.getElementById("settingsTourBtn").addEventListener("click", () => {
    modal.classList.remove("active");
    startTour();
  });

  document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
    const tokenInput = document.getElementById("waqiTokenInput");
    const cityInput = document.getElementById("defaultCityInput");
    const cityError = document.getElementById("defaultCityError");
    const token = tokenInput.value.trim();
    const cityStr = cityInput.value.trim();
    cityError.hidden = true;
    cityInput.removeAttribute("aria-invalid");

    state.waqiToken = token;
    if (token) storage.set("airwise_waqi_token", token);
    else storage.remove("airwise_waqi_token");

    if (cityStr) {
      if (!(state.defaultCity && state.defaultCity.city === cityStr)) {
        const results = await geocodeCity(cityStr);
        if (!results || !results.length) {
          // Explain the problem next to the field and keep the dialog open
          cityError.textContent = t("settings.cityNotFound", { q: cityStr });
          cityError.hidden = false;
          cityInput.setAttribute("aria-invalid", "true");
          cityInput.focus();
          buzz([30, 40, 30]);
          return;
        }
        const first = results[0];
        state.defaultCity = { lat: first.latitude, lon: first.longitude, city: first.name, country: first.country || "" };
        storage.set("airwise_default_city", JSON.stringify(state.defaultCity));
        cityInput.value = first.name;
      }
      const d = state.defaultCity;
      loadData(d.lat, d.lon, d.city, d.country);
    } else {
      state.defaultCity = null;
      storage.remove("airwise_default_city");
      refreshData();
    }
    modal.classList.remove("active");
    showToast(t("settings.saved"), "", "success");
    buzz();
  });
}

/* ---------- Location ---------- */

function detectLocation(userAsked = false) {
  document.getElementById("locName").textContent = t("loc.locating");

  const fallback = (reason) => {
    const d = state.defaultCity || DEFAULT_LOCATION;
    loadData(d.lat, d.lon, d.city, d.country);
    // Say what happened in plain words instead of failing silently
    if (userAsked || reason === "denied") showToast(t("loc.denied", { city: d.city }), "", "warn");
  };

  if (!("geolocation" in navigator)) return fallback("unsupported");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const loc = await reverseGeocode(lat, lon);
      loadData(lat, lon, loc.city, loc.country);
    },
    (err) => {
      console.warn("Geolocation failed, using default city.", err);
      fallback(err && err.code === 1 ? "denied" : "failed");
    },
    { timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
}

// Reverse geocode (BigDataCloud)
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${currentLang}`);
    const data = await res.json();
    return {
      city: data.city || data.locality || data.principalSubdivision || t("loc.current"),
      country: data.countryName || ""
    };
  } catch (e) {
    return { city: t("loc.current"), country: "" };
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// WAQI station feed. Only used with a personal token: the public "demo" token
// returns a fixed station, not the nearest one.
async function fetchWaqi(lat, lon) {
  if (!state.waqiToken) return null;
  try {
    const json = await fetchJSON(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${encodeURIComponent(state.waqiToken)}`);
    if (json.status !== "ok" || !json.data || !isValidNumber(json.data.aqi)) return null;
    const geo = json.data.city?.geo;
    if (Array.isArray(geo) && geo.length === 2 && haversineKm(lat, lon, geo[0], geo[1]) > MAX_STATION_DISTANCE_KM) {
      return null; // nearest station is too far away to represent this place
    }
    return json.data;
  } catch (e) {
    console.warn("WAQI fetch failed, using Open-Meteo only", e);
    return null;
  }
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
  document.querySelector(".aqi-hero-card")?.setAttribute("aria-busy", isLoading ? "true" : "false");
  const geoBtn = document.getElementById("geoBtn");
  if (geoBtn) geoBtn.disabled = isLoading;
}

function showError(message, retry = false) {
  const el = document.getElementById("heroSummary");
  el.textContent = message;
  el.classList.add("error-text");
  if (retry) {
    const btn = document.createElement("button");
    btn.className = "btn-icon-text btn-small retry-btn";
    btn.textContent = t("err.retry");
    btn.addEventListener("click", () => { buzz(); refreshData(); });
    el.appendChild(document.createElement("br"));
    el.appendChild(btn);
  }
  announce(message);
}

/* ---------- Load data ---------- */

async function loadData(lat, lon, cityName, country) {
  const requestId = ++state.requestId;
  const placeChanged = lat !== state.currentLat || lon !== state.currentLon || !state.aqiData;
  state.currentLat = lat;
  state.currentLon = lon;
  state.currentCityName = cityName;
  state.currentCountry = country;

  document.getElementById("locName").textContent = placeLabel();
  setLoading(true);
  updateURL();
  renderFavButton();
  renderFavorites();

  const aqVars = "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_nitrogen_dioxide,us_aqi_ozone,us_aqi_sulphur_dioxide,us_aqi_carbon_monoxide,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide";
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=${aqVars}&hourly=us_aqi&forecast_days=7&timezone=auto`;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index&timezone=auto`;

  try {
    const [aqData, wxData, waqiData] = await Promise.all([
      fetchJSON(aqUrl),
      fetchJSON(wxUrl).catch(e => { console.warn("Weather fetch failed", e); return null; }),
      fetchWaqi(lat, lon)
    ]);

    // A newer request started while this one was loading; drop this result
    if (requestId !== state.requestId) return;

    state.aqiData = aqData;
    state.weatherData = wxData;
    state.waqiData = waqiData;

    if (waqiData) {
      const dominant = (waqiData.dominentpol || "").toUpperCase().replace(".", "");
      state.stationMeta = {
        name: waqiData.city?.name || cityName,
        dominantPol: dominant || null,
        geo: waqiData.city?.geo,
        isStation: true
      };
    } else {
      state.stationMeta = { name: null, dominantPol: null, geo: [lat, lon], isStation: false };
    }
    if (!state.stationMeta.dominantPol) state.stationMeta.dominantPol = findDominantPollutant();

    state.lastLoaded = Date.now();
    renderUpdatedTime();
    document.getElementById("heroSummary").classList.remove("error-text");

    renderHeroAQI();
    renderPollutants();
    renderPlanner();
    renderMaskGuidance();
    renderActivities();
    renderCharts();
    if (typeof updateMap === "function") updateMap();
    afterDataLoaded();

    // Tell screen reader users about a new place (not every silent refresh)
    if (placeChanged) {
      const aqi = getCurrentAQI();
      if (isValidNumber(aqi)) {
        const lvl = getAQILevel(aqi);
        announce(t("announce.aqi", { place: cityName, aqi: lvl.value, cat: lvl.category }));
      }
    }
  } catch (err) {
    if (requestId !== state.requestId) return;
    console.error("Failed to load air quality data:", err);
    showError(t("err.load"), true);
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
}

// Favorites and alerts run after the main view has rendered
async function afterDataLoaded() {
  // Start lazy-loading the chart and map only once the page has its real
  // height, so they aren't pulled in just because the empty page was short
  if (!state.lazyStarted) {
    state.lazyStarted = true;
    initChartLazy();
    initMapLazy();
  }
  renderPersonalPlan();
  checkAlertsForCurrent();
  const favResults = await fetchFavoritesAQI();
  checkAlertsForFavorites(favResults);
}

/* ---------- 1. Hero gauge ---------- */

function renderHeroAQI() {
  const currentAQI = getCurrentAQI();
  const aqiNumEl = document.getElementById("aqiNum");
  const pill = document.getElementById("aqiPill");

  if (!isValidNumber(currentAQI)) {
    aqiNumEl.textContent = "--";
    aqiNumEl.style.color = "";
    document.getElementById("aqiCategory").textContent = t("nodata");
    showError(t("err.noData"));
    return;
  }

  const level = getAQILevel(currentAQI);

  const stationTag = document.getElementById("stationName");
  stationTag.textContent = state.stationMeta?.isStation && state.stationMeta.name
    ? t("source.station", { name: state.stationMeta.name })
    : t("source.model");
  stationTag.style.display = "inline-block";

  aqiNumEl.textContent = level.value;
  aqiNumEl.style.color = level.text;
  document.getElementById("gaugeWrapper").setAttribute("aria-label", `${t("aqi.label")} ${level.value}, ${level.category}`);

  pill.className = `aqi-status-pill ${level.class}`;
  const pillIcon = pill.querySelector("i");
  if (pillIcon) pillIcon.className = `fa-solid ${level.icon}`;
  document.getElementById("aqiCategory").textContent = level.category;

  const dominantTag = document.getElementById("dominantTag");
  if (state.stationMeta?.dominantPol) {
    dominantTag.textContent = "⚡ " + t("driver", { pol: pollutantLabel(state.stationMeta.dominantPol) });
    dominantTag.style.display = "inline-block";
  } else {
    dominantTag.style.display = "none";
  }

  // Gauge needle (-90deg to +90deg for AQI 0-500)
  const fraction = Math.min(level.value, 500) / 500;
  document.getElementById("gaugeNeedle").style.transform = `rotate(${-90 + fraction * 180}deg)`;
  const arc = document.getElementById("gaugeArc");
  const maxDash = 345.5;
  arc.style.strokeDashoffset = maxDash - fraction * maxDash;
  arc.style.stroke = level.color;

  const summaryEl = document.getElementById("heroSummary");
  summaryEl.classList.remove("error-text");
  summaryEl.textContent = t("summary." + level.key);

  // Weather
  const wx = state.weatherData?.current || {};
  const windCardinal = getWindCardinal(wx.wind_direction_10m);
  const uvCategory = getUvRiskCategory(wx.uv_index);
  document.getElementById("tempVal").textContent = formatTemp(wx.temperature_2m);
  document.getElementById("humidityVal").textContent = isValidNumber(wx.relative_humidity_2m) ? `${Math.round(wx.relative_humidity_2m)}%` : "--%";
  document.getElementById("windVal").textContent = formatWind(wx.wind_speed_10m, windCardinal);
  document.getElementById("uvVal").textContent = isValidNumber(wx.uv_index) ? `${wx.uv_index.toFixed(1)} (${uvCategory})` : "--";
}

/* ---------- 2. Pollutants ---------- */

function renderPollutants() {
  const cur = state.aqiData?.current || {};
  const dominant = state.stationMeta?.dominantPol;

  POLLUTANTS.forEach(p => {
    const cardEl = document.getElementById(`card${p.id}`);
    const valEl = document.getElementById(`val${p.id}`);
    const badgeEl = document.getElementById(`badge${p.id}`);
    const catEl = document.getElementById(`cat${p.id}`);
    const barEl = document.getElementById(`bar${p.id}`);

    const conc = cur[p.concKey];
    const subAQI = getSubAQI(p);
    valEl.textContent = isValidNumber(conc) ? (conc >= 100 ? Math.round(conc) : conc.toFixed(1)) : "--";

    if (isValidNumber(subAQI)) {
      const level = getAQILevel(subAQI);
      badgeEl.textContent = t("subaqi", { v: level.value });
      badgeEl.style.color = level.text;
      badgeEl.style.background = `${level.color}22`;
      badgeEl.style.border = `1px solid ${level.color}55`;
      catEl.textContent = level.category;
      catEl.style.color = level.text;
      barEl.style.width = `${Math.min(100, Math.max(5, Math.round((level.value / 300) * 100)))}%`;
      barEl.style.background = level.color;
      cardEl.setAttribute("aria-label", `${p.label}: ${valEl.textContent} µg/m³, ${t("subaqi", { v: level.value })}, ${level.category}`);
    } else {
      badgeEl.textContent = t("subaqi", { v: "--" });
      badgeEl.style.color = "var(--text-muted)";
      badgeEl.style.background = "rgba(var(--fg-rgb), 0.08)";
      badgeEl.style.border = "none";
      catEl.textContent = t("na");
      catEl.style.color = "var(--text-dim)";
      barEl.style.width = "0%";
      cardEl.setAttribute("aria-label", `${p.label}: ${t("na")}`);
    }
    cardEl.classList.toggle("dominant-card-highlight", p.id === dominant);
  });
}

/* ---------- 3. Best time to go out ---------- */

function renderPlanner() {
  const hours = getNext24Hours();
  const valid = hours.filter(h => h.aqi !== null);
  const headline = document.getElementById("plannerHeadline");
  const detail = document.getElementById("plannerDetail");
  const icon = document.getElementById("plannerIcon");
  const strip = document.getElementById("hourlyTimeline");

  if (valid.length === 0) {
    headline.textContent = t("planner.unavailable");
    detail.textContent = t("planner.unavailableDetail");
    strip.innerHTML = "";
    return;
  }

  const profile = getProfile();
  const best = valid.reduce((a, b) => (b.aqi < a.aqi ? b : a));
  const bestAQI = Math.round(best.aqi);
  const bestTimeStr = formatHourLabel(best.time, true);
  const isTomorrow = String(best.time).slice(0, 10) !== String(hours[0].time).slice(0, 10);
  const bestPeriod = (isTomorrow ? t("time.tomorrow") + " " : "") + timeOfDayName(hourFromISO(best.time));
  const effectiveBest = bestAQI * profile.factor;

  // Color the summary box by how good the best hour is
  const box = document.querySelector(".planner-best-window");
  const boxColor = effectiveBest <= 50 ? "#10b981" : effectiveBest <= 100 ? "#f59e0b" : "#ef4444";
  if (box) {
    box.style.background = `${boxColor}14`;
    box.style.borderColor = `${boxColor}55`;
  }

  const cleanCount = valid.filter(h => h.aqi <= profile.cleanLimit).length;
  const cleanNote = cleanCount > 0
    ? " " + t("planner.cleanNote", { n: cleanCount, total: valid.length, limit: profile.cleanLimit, profile: profileLabel() })
    : "";

  if (effectiveBest <= 50) {
    icon.innerHTML = `<i class="fa-solid fa-face-smile" aria-hidden="true"></i>`;
    icon.style.background = "#059669";
    headline.textContent = t("planner.goodTitle", { period: bestPeriod, time: bestTimeStr });
    detail.textContent = t("planner.goodDetail", { aqi: bestAQI }) + cleanNote;
  } else if (effectiveBest <= 100) {
    icon.innerHTML = `<i class="fa-solid fa-face-meh" aria-hidden="true"></i>`;
    icon.style.background = "#d97706";
    headline.textContent = t("planner.modTitle", { period: bestPeriod, time: bestTimeStr });
    detail.textContent = t("planner.modDetail", { aqi: bestAQI }) + cleanNote;
  } else {
    icon.innerHTML = `<i class="fa-solid fa-face-frown" aria-hidden="true"></i>`;
    icon.style.background = "#dc2626";
    headline.textContent = t("planner.badTitle");
    detail.textContent = t("planner.badDetail", { time: bestTimeStr, aqi: bestAQI });
  }

  strip.innerHTML = hours.map((h, i) => {
    const label = i === 0 ? t("time.now") : formatHourLabel(h.time);
    if (h.aqi === null) {
      return `
        <li class="timeline-hour-card" style="border-top: 3px solid var(--text-dim);">
          <span class="timeline-time">${label}</span>
          <span class="timeline-aqi" style="color: var(--text-dim);">--</span>
          <span class="timeline-badge">${t("nodata")}</span>
        </li>`;
    }
    const lvl = getAQILevel(h.aqi);
    const isBest = h === best;
    return `
      <li class="timeline-hour-card${isBest ? " timeline-best" : ""}" style="border-top: 3px solid ${lvl.color};"
        aria-label="${label}: ${t("aqi.label")} ${lvl.value}, ${lvl.category}${isBest ? ", " + t("planner.best") : ""}">
        <span class="timeline-time" aria-hidden="true">${label}${isBest ? " ★" : ""}</span>
        <span class="timeline-aqi" style="color: ${lvl.text};" aria-hidden="true">${lvl.value}</span>
        <span class="timeline-badge" style="background: ${lvl.color}22; color: ${lvl.text};" aria-hidden="true">${lvl.category}</span>
      </li>`;
  }).join("");
}

/* ---------- 4. Masks ---------- */

function renderMaskGuidance() {
  const currentAQI = getCurrentAQI();
  if (!isValidNumber(currentAQI)) return;

  const profile = getProfile();
  const aqi = currentAQI * profile.factor; // stricter advice for sensitive groups
  const lvl = getAQILevel(aqi);

  const titleEl = document.getElementById("maskDecisionTitle");
  const descEl = document.getElementById("maskDecisionDesc");
  const iconEl = document.getElementById("maskIcon");

  const setTag = (id, cls, key) => {
    const el = document.getElementById(id);
    el.className = `mask-tag ${cls}`;
    el.textContent = t("tag." + key);
  };

  document.querySelectorAll(".mask-type-card").forEach(c => c.classList.remove("active-recommended"));
  setTag("tagCloth", "tag-not-needed", "notEnough");
  setTag("tagSurgical", "tag-not-needed", "notEnough");
  setTag("tagN95", "tag-optional", "optional");
  setTag("tagP100", "tag-optional", "severeOnly");

  const note = state.currentProfile !== "general" ? t("mask.note", { profile: profileLabel() }) : "";
  const step = aqi <= 50 ? 1 : aqi <= 100 ? 2 : aqi <= 150 ? 3 : aqi <= 200 ? 4 : 5;
  const icons = ["fa-wind", "fa-head-side-mask", "fa-shield-virus", "fa-shield-halved", "fa-gas-mask"];

  iconEl.innerHTML = `<i class="fa-solid ${icons[step - 1]}" style="color: ${lvl.color};" aria-hidden="true"></i>`;
  titleEl.textContent = t("mask.t" + step);
  titleEl.style.color = lvl.text;
  descEl.textContent = t("mask.d" + step, { note });

  if (step === 1) {
    ["tagCloth", "tagSurgical", "tagN95", "tagP100"].forEach(id => setTag(id, "tag-not-needed", "notNeeded"));
  } else if (step === 2) {
    document.getElementById("maskSurgical").classList.add("active-recommended");
    setTag("tagCloth", "tag-optional", "optional");
    setTag("tagSurgical", "tag-recommended", "optional");
    setTag("tagN95", "tag-optional", "optional");
    setTag("tagP100", "tag-not-needed", "notNeeded");
  } else if (step === 3) {
    document.getElementById("maskN95").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "recommended");
  } else if (step === 4) {
    document.getElementById("maskN95").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "strongly");
  } else {
    document.getElementById("maskN95").classList.add("active-recommended");
    document.getElementById("maskP100").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "minimum");
    setTag("tagP100", "tag-recommended", "best");
  }
}

/* ---------- 5. Activities ---------- */

const ACTIVITIES = [
  { key: "run",     icon: "🏃", exertion: true,  limits: [50, 100] },
  { key: "cycle",   icon: "🚴", exertion: true,  limits: [60, 120] },
  { key: "kids",    icon: "🛝", exertion: false, limits: [50, 90] },
  { key: "dining",  icon: "☕", exertion: false, limits: [80, 140] },
  { key: "windows", icon: "🪟", exertion: false, limits: [70, 100] },
  { key: "walk",    icon: "🚶", exertion: false, limits: [100, 160] }
];

function renderActivities() {
  const currentAQI = getCurrentAQI();
  if (!isValidNumber(currentAQI)) return;
  const profile = getProfile();

  document.getElementById("activityGrid").innerHTML = ACTIVITIES.map(act => {
    const aqi = currentAQI * (act.exertion ? profile.exertionFactor : profile.factor);
    const status = aqi <= act.limits[0] ? "allowed" : aqi <= act.limits[1] ? "caution" : "avoid";
    const badge = {
      allowed: ["badge-allowed", t("badge.safe"), "fa-circle-check"],
      caution: ["badge-caution", t("badge.caution"), "fa-circle-exclamation"],
      avoid:   ["badge-avoid", t("badge.avoid"), "fa-circle-xmark"]
    }[status];

    return `
      <li class="activity-card">
        <div class="activity-header">
          <h4 class="activity-title">
            <span class="activity-icon" aria-hidden="true">${act.icon}</span>
            <span>${t("act." + act.key)}</span>
          </h4>
          <span class="activity-badge ${badge[0]}"><i class="fa-solid ${badge[2]}" aria-hidden="true"></i> ${badge[1]}</span>
        </div>
        <p class="activity-desc">${t("act." + act.key + "." + status)}</p>
      </li>`;
  }).join("");
}

/* ---------- 6. Forecast chart ----------
   Chart.js is only downloaded when the chart card scrolls into view. */

function initChartLazy() {
  whenVisible(document.getElementById("chartCard"), () => {
    state.chartVisible = true;
    loadScript("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js")
      .then(renderCharts)
      .catch(() => {
        const box = document.querySelector(".chart-container");
        if (box) box.innerHTML = `<p class="map-fallback">${escapeHTML(t("err.load"))}</p>`;
      });
  });
}

function chartData() {
  if (state.activeChartTab === "hourly") {
    const hours = getNext24Hours();
    return {
      title: t("chart.hourlyTitle", { city: state.currentCityName }),
      labels: hours.map((h, i) => (i === 0 ? t("time.now") : formatHourLabel(h.time))),
      values: hours.map(h => (h.aqi === null ? null : Math.round(h.aqi)))
    };
  }
  const times = state.aqiData.hourly?.time || [];
  const aqis = state.aqiData.hourly?.us_aqi || [];
  const days = new Map();
  times.forEach((x, i) => {
    if (!isValidNumber(aqis[i])) return;
    const day = String(x).slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(aqis[i]);
  });
  const labels = [], values = [];
  days.forEach((vals, day) => {
    labels.push(formatDayLabel(day));
    values.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  });
  return { title: t("chart.dailyTitle", { city: state.currentCityName }), labels, values };
}

function renderCharts() {
  if (!state.aqiData) return;
  const { title, labels, values } = chartData();

  // Heading always names the place, so it's clear the data is local
  document.getElementById("forecastTitle").textContent = t("card.forecastFor", { city: state.currentCityName });

  // Text summary for screen readers (the canvas itself is just a picture)
  const pts = values.map((v, i) => ({ v, l: labels[i] })).filter(p => isValidNumber(p.v));
  const canvas = document.getElementById("mainChart");
  if (pts.length) {
    const min = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const max = pts.reduce((a, b) => (b.v > a.v ? b : a));
    canvas.setAttribute("aria-label", t("chart.summary", { title, min: min.v, minAt: min.l, max: max.v, maxAt: max.l }));
  }

  if (!state.chartVisible || typeof Chart === "undefined") return;
  if (state.mainChart) state.mainChart.destroy();

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.35)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

  state.mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: title,
        data: values,
        borderColor: "#3b82f6",
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        spanGaps: true,
        pointBackgroundColor: (c) => (isValidNumber(c.raw) ? getAQILevel(c.raw).color : "#ffffff"),
        pointBorderColor: cssVar("--bg-solid"),
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHitRadius: 14
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: state.lite ? false : { duration: 500 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--bg-solid"),
          titleColor: cssVar("--text-main"),
          bodyColor: cssVar("--text-muted"),
          borderColor: cssVar("--border-highlight"),
          borderWidth: 1,
          padding: 10,
          titleFont: { family: "Plus Jakarta Sans", size: 13, weight: "bold" },
          bodyFont: { family: "Plus Jakarta Sans", size: 13 },
          callbacks: {
            label: (c) => " " + t("chart.tooltip", { v: c.raw, cat: getAQILevel(c.raw).category })
          }
        }
      },
      scales: {
        x: {
          grid: { color: cssVar("--border-color") },
          ticks: { color: cssVar("--text-muted"), font: { family: "Plus Jakarta Sans", size: 12 }, maxRotation: 0, autoSkipPadding: 12 }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: t("aqi.label"), color: cssVar("--text-muted") },
          grid: { color: cssVar("--border-color") },
          ticks: { color: cssVar("--text-muted"), font: { family: "Plus Jakarta Sans", size: 12 } }
        }
      }
    }
  });
}
