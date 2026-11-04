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
  mapMarker: null,
  requestId: 0,
  refreshTimer: null
};

// Health profiles. `factor` scales the AQI before applying thresholds, so sensitive
// groups get stricter advice. `exertionFactor` applies to strenuous activities only.
const PROFILES = {
  general:     { label: "General Public",       factor: 1.0,  exertionFactor: 1.0,  cleanLimit: 80 },
  sensitive:   { label: "Children & Seniors",   factor: 1.3,  exertionFactor: 1.3,  cleanLimit: 50 },
  respiratory: { label: "Asthma & Respiratory", factor: 1.5,  exertionFactor: 1.5,  cleanLimit: 50 },
  athlete:     { label: "Outdoor Athletes",     factor: 1.0,  exertionFactor: 1.4,  cleanLimit: 60 }
};

function getProfile() {
  return PROFILES[state.currentProfile] || PROFILES.general;
}

// AQI Threshold Definitions
const AQI_THRESHOLDS = [
  { max: 50,  category: "Good",                    class: "aqi-status-good",           color: "#10b981", icon: "fa-circle-check" },
  { max: 100, category: "Moderate",                class: "aqi-status-moderate",       color: "#f59e0b", icon: "fa-circle-info" },
  { max: 150, category: "Unhealthy for Sensitive", class: "aqi-status-sensitive",      color: "#f97316", icon: "fa-triangle-exclamation" },
  { max: 200, category: "Unhealthy",               class: "aqi-status-unhealthy",      color: "#ef4444", icon: "fa-triangle-exclamation" },
  { max: 300, category: "Very Unhealthy",          class: "aqi-status-very-unhealthy", color: "#a855f7", icon: "fa-skull-crossbones" },
  { max: 500, category: "Hazardous",               class: "aqi-status-hazardous",      color: "#e11d48", icon: "fa-skull-crossbones" }
];

function getAQILevel(aqi) {
  const val = Math.max(0, Math.min(500, Math.round(aqi || 0)));
  for (const t of AQI_THRESHOLDS) {
    if (val <= t.max) return { ...t, value: val };
  }
  return { ...AQI_THRESHOLDS[AQI_THRESHOLDS.length - 1], value: val };
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
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

/* ---------- Time helpers ----------
   The APIs are called with timezone=auto, so times are local to the searched
   location (e.g. "2026-11-04T13:00"). We format them straight from the string so
   the labels are right even when the viewer's browser is in another time zone. */

function hourFromISO(str) {
  return parseInt(String(str).slice(11, 13), 10);
}

function formatHourLabel(str, withMinutes = false) {
  const h = hourFromISO(str);
  if (isNaN(h)) return "--";
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return withMinutes ? `${h12}:00 ${suffix}` : `${h12} ${suffix}`;
}

function formatDayLabel(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function timeOfDayName(hour) {
  if (hour < 5) return "Late Night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

// Index of the current hour inside the hourly arrays
function getCurrentHourIndex() {
  const times = state.aqiData?.hourly?.time || [];
  const curTime = state.aqiData?.current?.time;
  if (curTime) {
    const key = String(curTime).slice(0, 13);
    const idx = times.findIndex(t => String(t).slice(0, 13) === key);
    if (idx >= 0) return idx;
  }
  return Math.min(new Date().getHours(), Math.max(0, times.length - 1));
}

// Next 24 hours of [time, aqi] pairs, skipping missing values
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

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initPrefs();
  initPersonal();
  initEventListeners();
  initMap();
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
  }, REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.lastLoaded && Date.now() - state.lastLoaded > REFRESH_INTERVAL_MS) {
      refreshData();
    }
  });
});

function refreshData() {
  loadData(state.currentLat, state.currentLon, state.currentCityName, state.currentCountry);
}

// Event Listeners Setup
function initEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  let searchTimeout = null;

  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 2) {
      searchResults.style.display = "none";
      return;
    }
    searchTimeout = setTimeout(() => fetchCitySuggestions(query), 300);
  });

  // Enter picks the first result, Escape closes the list
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = searchResults.querySelector(".search-item[data-lat]");
      if (first) first.click();
      else if (searchInput.value.trim().length >= 2) fetchCitySuggestions(searchInput.value.trim(), true);
    } else if (e.key === "Escape") {
      searchResults.style.display = "none";
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) searchResults.style.display = "none";
  });

  document.getElementById("geoBtn").addEventListener("click", () => detectLocation());

  // Health Profile Chips
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

  // Chart Tab Buttons
  document.querySelectorAll(".chart-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".chart-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeChartTab = btn.dataset.chart;
      renderCharts();
    });
  });

  // Settings Modal
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsBtn").addEventListener("click", () => modal.classList.add("active"));
  modal.querySelectorAll("[data-close-settings]").forEach(el => el.addEventListener("click", () => modal.classList.remove("active")));
  document.getElementById("settingsTourBtn").addEventListener("click", () => {
    modal.classList.remove("active");
    startTour();
  });
  document.getElementById("closeModal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("active"); });

  document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
    const token = document.getElementById("waqiTokenInput").value.trim();
    const cityStr = document.getElementById("defaultCityInput").value.trim();
    state.waqiToken = token;
    if (token) storage.set("airwise_waqi_token", token);
    else storage.remove("airwise_waqi_token");
    modal.classList.remove("active");

    if (cityStr) {
      if (state.defaultCity && state.defaultCity.city === cityStr) {
        const d = state.defaultCity;
        loadData(d.lat, d.lon, d.city, d.country);
        return;
      }
      const results = await geocodeCity(cityStr);
      if (results && results.length) {
        const first = results[0];
        state.defaultCity = { lat: first.latitude, lon: first.longitude, city: first.name, country: first.country || "" };
        storage.set("airwise_default_city", JSON.stringify(state.defaultCity));
        document.getElementById("defaultCityInput").value = first.name;
        loadData(first.latitude, first.longitude, first.name, first.country || "");
      } else {
        showError(`Could not find "${cityStr}". Please check the city name.`);
      }
    } else {
      state.defaultCity = null;
      storage.remove("airwise_default_city");
      refreshData();
    }
  });
}

// Geolocation Detection
function detectLocation() {
  document.getElementById("locName").innerText = "Locating...";

  const fallback = () => {
    const d = state.defaultCity || DEFAULT_LOCATION;
    loadData(d.lat, d.lon, d.city, d.country);
  };

  if (!("geolocation" in navigator)) return fallback();

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const loc = await reverseGeocode(lat, lon);
      loadData(lat, lon, loc.city, loc.country);
    },
    (err) => {
      console.warn("Geolocation denied/failed. Falling back to default city.", err);
      fallback();
    },
    { timeout: 8000, maximumAge: 10 * 60 * 1000 }
  );
}

async function geocodeCity(query) {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error("City search error:", err);
    return null;
  }
}

// City Search Suggestions (Open-Meteo Geocoding)
async function fetchCitySuggestions(query, autoSelectFirst = false) {
  const searchResults = document.getElementById("searchResults");
  const results = await geocodeCity(query);

  if (results === null) {
    searchResults.innerHTML = `<div class="search-item" style="color: var(--text-dim);">Search unavailable. Check your connection.</div>`;
    searchResults.style.display = "block";
    return;
  }
  if (results.length === 0) {
    searchResults.innerHTML = `<div class="search-item" style="color: var(--text-dim);">No locations found</div>`;
    searchResults.style.display = "block";
    return;
  }

  if (autoSelectFirst) {
    const first = results[0];
    loadData(first.latitude, first.longitude, first.name, first.country || "");
    searchResults.style.display = "none";
    return;
  }

  searchResults.innerHTML = results.map(item => `
    <div class="search-item" data-lat="${item.latitude}" data-lon="${item.longitude}" data-name="${escapeHTML(item.name)}" data-country="${escapeHTML(item.country || "")}">
      <i class="fa-solid fa-location-dot" style="color: var(--accent-primary);"></i>
      <span><strong>${escapeHTML(item.name)}</strong>${item.admin1 ? ", " + escapeHTML(item.admin1) : ""}</span>
      <span class="search-item-country">${escapeHTML(item.country || "")}</span>
    </div>
  `).join("");
  searchResults.style.display = "block";

  searchResults.querySelectorAll(".search-item").forEach(el => {
    el.addEventListener("click", () => {
      document.getElementById("searchInput").value = el.dataset.name;
      searchResults.style.display = "none";
      loadData(parseFloat(el.dataset.lat), parseFloat(el.dataset.lon), el.dataset.name, el.dataset.country);
    });
  });
}

// Reverse Geocode (BigDataCloud)
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const data = await res.json();
    return {
      city: data.city || data.locality || data.principalSubdivision || "Current Location",
      country: data.countryName || ""
    };
  } catch (e) {
    return { city: "Current Location", country: "" };
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
      return null; // nearest station is too far away to represent this location
    }
    return json.data;
  } catch (e) {
    console.warn("WAQI fetch failed, using Open-Meteo only", e);
    return null;
  }
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
  const geoBtn = document.getElementById("geoBtn");
  if (geoBtn) geoBtn.disabled = isLoading;
}

function showError(message) {
  const el = document.getElementById("heroSummary");
  el.innerText = message;
  el.classList.add("error-text");
}

// Load Data (WAQI station + Open-Meteo Air Quality & Weather)
async function loadData(lat, lon, cityName, country) {
  const requestId = ++state.requestId;
  state.currentLat = lat;
  state.currentLon = lon;
  state.currentCityName = cityName;
  state.currentCountry = country;

  document.getElementById("locName").innerText = `${cityName}${country ? ", " + country : ""}`;
  setLoading(true);
  updateURL();
  if (typeof renderFavButton === "function") {
    renderFavButton();
    renderFavorites();
  }

  const aqVars = "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_nitrogen_dioxide,us_aqi_ozone,us_aqi_sulphur_dioxide,us_aqi_carbon_monoxide,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide";
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=${aqVars}&hourly=us_aqi,pm2_5&forecast_days=7&timezone=auto`;
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
        name: waqiData.city?.name || `${cityName} Station`,
        dominantPol: dominant || null,
        geo: waqiData.city?.geo,
        isStation: true
      };
    } else {
      state.stationMeta = { name: null, dominantPol: null, geo: [lat, lon], isStation: false };
    }
    if (!state.stationMeta.dominantPol) state.stationMeta.dominantPol = findDominantPollutant();

    state.lastLoaded = Date.now();
    document.getElementById("updatedTime").innerText = `• Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    document.getElementById("heroSummary").classList.remove("error-text");

    renderHeroAQI();
    renderPollutants();
    renderPlanner();
    renderMaskGuidance();
    renderActivities();
    renderCharts();
    updateMap();
    afterDataLoaded();
  } catch (err) {
    if (requestId !== state.requestId) return;
    console.error("Failed to load air quality data:", err);
    showError("Couldn't load air quality data. Check your internet connection and try again.");
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
}

// Favorites and alerts run after the main view has rendered
async function afterDataLoaded() {
  renderPersonalPlan();
  if (typeof checkAlertsForCurrent !== "function") return;
  checkAlertsForCurrent();
  const favResults = await fetchFavoritesAQI();
  checkAlertsForFavorites(favResults);
}

// 1. Hero Speedometer & Status Pill
function renderHeroAQI() {
  const currentAQI = getCurrentAQI();
  const aqiNumEl = document.getElementById("aqiNum");
  const pill = document.getElementById("aqiPill");

  if (!isValidNumber(currentAQI)) {
    aqiNumEl.innerText = "--";
    aqiNumEl.style.color = "";
    document.getElementById("aqiCategory").innerText = "No data";
    showError("No air quality data is available for this location right now.");
    return;
  }

  const level = getAQILevel(currentAQI);

  const stationTag = document.getElementById("stationName");
  if (state.stationMeta?.isStation && state.stationMeta.name) {
    stationTag.innerText = `Station: ${state.stationMeta.name}`;
  } else {
    stationTag.innerText = "Source: Open-Meteo model";
  }
  stationTag.style.display = "inline-block";

  aqiNumEl.innerText = level.value;
  aqiNumEl.style.color = level.color;

  pill.className = `aqi-status-pill ${level.class}`;
  const pillIcon = pill.querySelector("i");
  if (pillIcon) pillIcon.className = `fa-solid ${level.icon}`;
  document.getElementById("aqiCategory").innerText = level.category;

  const dominantTag = document.getElementById("dominantTag");
  if (state.stationMeta?.dominantPol) {
    dominantTag.innerText = `⚡ Primary Driver: ${pollutantLabel(state.stationMeta.dominantPol)}`;
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

  const summaries = [
    [50,  "Air quality is satisfactory, and air pollution poses little or no risk."],
    [100, "Air quality is acceptable. Unusually sensitive people may experience minor symptoms."],
    [150, "Members of sensitive groups may experience health effects. The general public is less likely to be affected."],
    [200, "Everyone may begin to experience health effects. Limit prolonged outdoor exposure."],
    [300, "Health alert: everyone may experience more serious health effects. Avoid outdoor exertion."],
    [500, "Health warning of emergency conditions. Everyone should stay indoors and keep activity low."]
  ];
  document.getElementById("heroSummary").innerText = summaries.find(([max]) => level.value <= max)[1];

  // Weather Metrics
  const wx = state.weatherData?.current || {};
  const windCardinal = getWindCardinal(wx.wind_direction_10m);
  const uvCategory = getUvRiskCategory(wx.uv_index);

  document.getElementById("tempVal").innerText = formatTemp(wx.temperature_2m);
  document.getElementById("humidityVal").innerText = isValidNumber(wx.relative_humidity_2m) ? `${Math.round(wx.relative_humidity_2m)}%` : "--%";
  document.getElementById("windVal").innerText = formatWind(wx.wind_speed_10m, windCardinal);
  document.getElementById("uvVal").innerText = isValidNumber(wx.uv_index) ? `${wx.uv_index.toFixed(1)} (${uvCategory})` : "--";
}

// 2. Pollutants Breakdown (EPA Sub-AQI & Concentrations)
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

    valEl.innerText = isValidNumber(conc) ? (conc >= 100 ? Math.round(conc) : conc.toFixed(1)) : "--";

    if (isValidNumber(subAQI)) {
      const level = getAQILevel(subAQI);
      badgeEl.innerText = `Sub-AQI ${level.value}`;
      badgeEl.style.color = level.color;
      badgeEl.style.background = `${level.color}22`;
      badgeEl.style.border = `1px solid ${level.color}44`;
      catEl.innerText = level.category;
      catEl.style.color = level.color;
      // Bar on a 0-300 scale
      barEl.style.width = `${Math.min(100, Math.max(5, Math.round((level.value / 300) * 100)))}%`;
      barEl.style.background = level.color;
    } else {
      badgeEl.innerText = "Sub-AQI --";
      badgeEl.style.color = "var(--text-muted)";
      badgeEl.style.background = "rgba(var(--fg-rgb), 0.08)";
      badgeEl.style.border = "none";
      catEl.innerText = "N/A";
      catEl.style.color = "var(--text-dim)";
      barEl.style.width = "0%";
    }

    cardEl.classList.toggle("dominant-card-highlight", p.id === dominant);
  });
}

// 3. Best Outdoor Time Planner
function renderPlanner() {
  const hours = getNext24Hours();
  const valid = hours.filter(h => h.aqi !== null);
  const headline = document.getElementById("plannerHeadline");
  const detail = document.getElementById("plannerDetail");
  const icon = document.getElementById("plannerIcon");
  const strip = document.getElementById("hourlyTimeline");

  if (valid.length === 0) {
    headline.innerText = "Hourly forecast unavailable";
    detail.innerText = "No hourly forecast data is available for this location.";
    strip.innerHTML = "";
    return;
  }

  const profile = getProfile();
  const best = valid.reduce((a, b) => (b.aqi < a.aqi ? b : a));
  const bestAQI = Math.round(best.aqi);
  const bestTimeStr = formatHourLabel(best.time, true);
  const isTomorrow = String(best.time).slice(0, 10) !== String(hours[0].time).slice(0, 10);
  const bestPeriod = (isTomorrow ? "Tomorrow " : "") + timeOfDayName(hourFromISO(best.time));
  const effectiveBest = bestAQI * profile.factor;

  // Count of clean hours for this profile
  const cleanCount = valid.filter(h => h.aqi <= profile.cleanLimit).length;
  const cleanNote = cleanCount > 0
    ? ` ${cleanCount} of the next ${valid.length} hours are below AQI ${profile.cleanLimit} for ${profile.label.toLowerCase()}.`
    : "";

  if (effectiveBest <= 50) {
    icon.innerHTML = `<i class="fa-solid fa-face-smile"></i>`;
    icon.style.background = "#10b981";
    headline.innerText = `Best Time for Outdoors: ${bestPeriod}, around ${bestTimeStr}`;
    detail.innerText = `Pollution is lowest then (AQI ~${bestAQI}). Good window for sports, running and errands.${cleanNote}`;
  } else if (effectiveBest <= 100) {
    icon.innerHTML = `<i class="fa-solid fa-face-meh"></i>`;
    icon.style.background = "#f59e0b";
    headline.innerText = `Best Window: ${bestPeriod}, around ${bestTimeStr}`;
    detail.innerText = `Moderate pollution expected (best AQI ~${bestAQI}). Limit intense exertion if you are in a sensitive group.${cleanNote}`;
  } else {
    icon.innerHTML = `<i class="fa-solid fa-face-frown"></i>`;
    icon.style.background = "#ef4444";
    headline.innerText = "Avoid Prolonged Outdoor Activity Today";
    detail.innerText = `Even the cleanest hour (${bestTimeStr}) is elevated at AQI ${bestAQI}. Stay indoors or wear an N95 respirator if stepping out.`;
  }

  strip.innerHTML = hours.map((h, i) => {
    const label = i === 0 ? "Now" : formatHourLabel(h.time);
    if (h.aqi === null) {
      return `
        <div class="timeline-hour-card" style="border-top: 3px solid var(--text-dim);">
          <span class="timeline-time">${label}</span>
          <span class="timeline-aqi" style="color: var(--text-dim);">--</span>
          <span class="timeline-badge">No data</span>
        </div>`;
    }
    const lvl = getAQILevel(h.aqi);
    const isBest = h === best;
    return `
      <div class="timeline-hour-card${isBest ? " timeline-best" : ""}" style="border-top: 3px solid ${lvl.color};" title="${isBest ? "Cleanest hour" : ""}">
        <span class="timeline-time">${label}${isBest ? " ★" : ""}</span>
        <span class="timeline-aqi" style="color: ${lvl.color};">${Math.round(h.aqi)}</span>
        <span class="timeline-badge" style="background: ${lvl.color}22; color: ${lvl.color};">${lvl.category}</span>
      </div>`;
  }).join("");
}

// 4. Mask Guidance & Respirator Selector
function renderMaskGuidance() {
  const currentAQI = getCurrentAQI();
  if (!isValidNumber(currentAQI)) return;

  const profile = getProfile();
  const aqi = currentAQI * profile.factor; // stricter advice for sensitive groups

  const titleEl = document.getElementById("maskDecisionTitle");
  const descEl = document.getElementById("maskDecisionDesc");
  const iconEl = document.getElementById("maskIcon");

  const setTag = (id, cls, text) => {
    const el = document.getElementById(id);
    el.className = `mask-tag ${cls}`;
    el.innerText = text;
  };

  // Reset every card and tag so nothing is left over from the last render
  document.querySelectorAll(".mask-type-card").forEach(c => c.classList.remove("active-recommended"));
  setTag("tagCloth", "tag-not-needed", "Not Enough");
  setTag("tagSurgical", "tag-not-needed", "Not Enough");
  setTag("tagN95", "tag-optional", "Optional");
  setTag("tagP100", "tag-optional", "Severe Only");

  const profileNote = state.currentProfile !== "general" ? ` (adjusted for ${profile.label.toLowerCase()})` : "";

  if (aqi <= 50) {
    iconEl.innerHTML = `<i class="fa-solid fa-wind" style="color: #10b981;"></i>`;
    titleEl.innerText = "No Mask Required";
    titleEl.style.color = "#34d399";
    descEl.innerText = `Air quality is good. Enjoy fresh air without a mask${profileNote}.`;
    setTag("tagCloth", "tag-not-needed", "Not Needed");
    setTag("tagSurgical", "tag-not-needed", "Not Needed");
    setTag("tagN95", "tag-not-needed", "Not Needed");
    setTag("tagP100", "tag-not-needed", "Not Needed");
  } else if (aqi <= 100) {
    iconEl.innerHTML = `<i class="fa-solid fa-head-side-mask" style="color: #f59e0b;"></i>`;
    titleEl.innerText = "Mask Optional";
    titleEl.style.color = "#fbbf24";
    descEl.innerText = `Acceptable air${profileNote}. Sensitive people may prefer a surgical mask or N95 near traffic.`;
    document.getElementById("maskSurgical").classList.add("active-recommended");
    setTag("tagCloth", "tag-optional", "Optional");
    setTag("tagSurgical", "tag-recommended", "Optional");
    setTag("tagN95", "tag-optional", "Optional");
    setTag("tagP100", "tag-not-needed", "Not Needed");
  } else if (aqi <= 150) {
    iconEl.innerHTML = `<i class="fa-solid fa-shield-virus" style="color: #f97316;"></i>`;
    titleEl.innerText = "N95 / KN95 Recommended";
    titleEl.style.color = "#fb923c";
    descEl.innerText = `Elevated particle pollution${profileNote}. An N95 is advised for outdoor commutes. Cloth masks don't filter fine particles.`;
    document.getElementById("maskN95").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "Recommended");
  } else if (aqi <= 200) {
    iconEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color: #ef4444;"></i>`;
    titleEl.innerText = "N95 Respirator Strongly Advised";
    titleEl.style.color = "#f87171";
    descEl.innerText = `Unhealthy air${profileNote}. Wear a tight-fitting N95 or KN95 outdoors and keep time outside short.`;
    document.getElementById("maskN95").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "Strongly Advised");
  } else {
    iconEl.innerHTML = `<i class="fa-solid fa-gas-mask" style="color: #a855f7;"></i>`;
    titleEl.innerText = "Stay Indoors · N95 / P100 if Outside";
    titleEl.style.color = "#c084fc";
    descEl.innerText = `Very unhealthy to hazardous air${profileNote}. Stay indoors. If you must go out, use a well-sealed N95 or P100.`;
    document.getElementById("maskN95").classList.add("active-recommended");
    document.getElementById("maskP100").classList.add("active-recommended");
    setTag("tagN95", "tag-recommended", "Minimum");
    setTag("tagP100", "tag-recommended", "Best");
  }
}

// 5. Activity Safety Matrix
const ACTIVITIES = [
  {
    title: "Outdoor Running & Sports", icon: "🏃", exertion: true, limits: [50, 100],
    desc: {
      allowed: "Safe for high-intensity workouts and outdoor running.",
      caution: "Reduce exertion. Take frequent breaks or train indoors.",
      avoid: "Avoid intense outdoor exercise. Rapid breathing increases pollutant intake."
    }
  },
  {
    title: "Cycling & Commuting", icon: "🚴", exertion: true, limits: [60, 120],
    desc: {
      allowed: "Great conditions for cycling and outdoor commutes.",
      caution: "Stick to low-traffic roads and consider an N95 mask.",
      avoid: "Avoid open-air cycling. Prefer enclosed, filtered transport."
    }
  },
  {
    title: "Kids Playground & Park", icon: "🛝", exertion: false, limits: [50, 90],
    desc: {
      allowed: "Good time for outdoor play and park visits.",
      caution: "Limit outdoor play time for children.",
      avoid: "Keep children indoors. Their lungs are more vulnerable to PM2.5."
    }
  },
  {
    title: "Outdoor Dining & Patios", icon: "☕", exertion: false, limits: [80, 140],
    desc: {
      allowed: "Enjoy outdoor seating and patio dining.",
      caution: "Consider indoor seating if you are sensitive to dust.",
      avoid: "Dine indoors, ideally with HEPA air filtration."
    }
  },
  {
    title: "Ventilate House (Open Windows)", icon: "🪟", exertion: false, limits: [70, 100],
    desc: {
      allowed: "Open windows to refresh indoor air.",
      caution: "Open windows briefly, during the cleanest hour of the day.",
      avoid: "Keep windows closed. Run indoor HEPA air purifiers."
    }
  },
  {
    title: "Walking & Light Stroll", icon: "🚶", exertion: false, limits: [100, 160],
    desc: {
      allowed: "Safe for walking, errands, and casual strolls.",
      caution: "Wear a mask if walking near heavy traffic.",
      avoid: "Minimize walking outdoors. Stay in filtered indoor air."
    }
  }
];

function renderActivities() {
  const currentAQI = getCurrentAQI();
  if (!isValidNumber(currentAQI)) return;
  const profile = getProfile();

  document.getElementById("activityGrid").innerHTML = ACTIVITIES.map(act => {
    const aqi = currentAQI * (act.exertion ? profile.exertionFactor : profile.factor);
    const status = aqi <= act.limits[0] ? "allowed" : aqi <= act.limits[1] ? "caution" : "avoid";
    const badge = {
      allowed: ["badge-allowed", "Safe"],
      caution: ["badge-caution", "Caution"],
      avoid:   ["badge-avoid", "Avoid"]
    }[status];

    return `
      <div class="activity-card">
        <div class="activity-header">
          <div class="activity-title">
            <span class="activity-icon">${act.icon}</span>
            <span>${act.title}</span>
          </div>
          <span class="activity-badge ${badge[0]}">${badge[1]}</span>
        </div>
        <p class="activity-desc">${act.desc[status]}</p>
      </div>`;
  }).join("");
}

// 6. Forecast & Trend Charts (Chart.js)
function renderCharts() {
  const canvas = document.getElementById("mainChart");
  if (!canvas || !state.aqiData || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  if (state.mainChart) state.mainChart.destroy();

  let labels = [];
  let dataPoints = [];
  let chartTitle = "";

  if (state.activeChartTab === "hourly") {
    const hours = getNext24Hours();
    labels = hours.map((h, i) => (i === 0 ? "Now" : formatHourLabel(h.time)));
    dataPoints = hours.map(h => (h.aqi === null ? null : Math.round(h.aqi)));
    chartTitle = "Predicted US AQI (Next 24 Hours)";
  } else {
    // Group hourly values by local calendar day
    const times = state.aqiData.hourly?.time || [];
    const aqis = state.aqiData.hourly?.us_aqi || [];
    const days = new Map();
    times.forEach((t, i) => {
      if (!isValidNumber(aqis[i])) return;
      const day = String(t).slice(0, 10);
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(aqis[i]);
    });
    for (const [day, vals] of days) {
      labels.push(formatDayLabel(day));
      dataPoints.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
    }
    chartTitle = "Daily Average US AQI";
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.4)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

  state.mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: chartTitle,
        data: dataPoints,
        borderColor: "#3b82f6",
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        spanGaps: true,
        pointBackgroundColor: (c) => (isValidNumber(c.raw) ? getAQILevel(c.raw).color : "#ffffff"),
        pointBorderColor: cssVar("--bg-solid"),
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--bg-solid"),
          titleColor: cssVar("--text-main"),
          bodyColor: cssVar("--text-muted"),
          borderColor: cssVar("--border-highlight"),
          borderWidth: 1,
          titleFont: { family: "Plus Jakarta Sans", size: 13, weight: "bold" },
          bodyFont: { family: "Plus Jakarta Sans", size: 12 },
          callbacks: {
            label: (c) => ` US AQI: ${c.raw} (${getAQILevel(c.raw).category})`
          }
        }
      },
      scales: {
        x: {
          grid: { color: cssVar("--border-color") },
          ticks: { color: cssVar("--text-muted"), font: { family: "Plus Jakarta Sans", size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: cssVar("--border-color") },
          ticks: { color: cssVar("--text-muted"), font: { family: "Plus Jakarta Sans", size: 11 } }
        }
      }
    }
  });
}

// 7. Interactive Leaflet Map
function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer || typeof L === "undefined") return;

  state.map = L.map("map").setView([state.currentLat, state.currentLon], 11);

  setMapTheme(resolvedTheme());
}

// CARTO tiles: dark_all for dark mode, light_all for light mode
function setMapTheme(theme) {
  if (!state.map) return;
  const style = theme === "light" ? "light_all" : "dark_all";
  if (state.tileStyle === style) return;
  if (state.tileLayer) state.map.removeLayer(state.tileLayer);
  state.tileLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 18
  }).addTo(state.map);
  state.tileStyle = style;
}

function updateMap() {
  if (!state.map) return;

  let mapLat = state.currentLat;
  let mapLon = state.currentLon;
  const geo = state.stationMeta?.geo;
  if (state.stationMeta?.isStation && Array.isArray(geo) && geo.length === 2) {
    [mapLat, mapLon] = geo;
  }
  state.map.setView([mapLat, mapLon], 11);

  const currentAQI = getCurrentAQI();
  if (state.mapMarker) state.map.removeLayer(state.mapMarker);
  if (!isValidNumber(currentAQI)) return;
  const level = getAQILevel(currentAQI);

  const icon = L.divIcon({
    className: "custom-map-pin",
    html: `<div style="background: ${level.color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 20px ${level.color}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #000;">${level.value}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const placeName = state.stationMeta?.isStation ? state.stationMeta.name : state.currentCityName;
  const source = state.stationMeta?.isStation ? "WAQI monitoring station" : "Open-Meteo model estimate";
  const dominantPol = state.stationMeta?.dominantPol ? pollutantLabel(state.stationMeta.dominantPol) : "--";

  state.mapMarker = L.marker([mapLat, mapLon], { icon }).addTo(state.map);
  state.mapMarker.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #111; padding: 4px;">
      <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #0b0f19;">📍 ${escapeHTML(placeName)}</h4>
      <p style="margin: 6px 0 2px 0; font-size: 12px; color: #374151;"><strong>AQI:</strong> <span style="color: ${level.color}; font-weight: 800;">${level.value}</span> (${level.category})</p>
      <p style="margin: 0 0 2px 0; font-size: 11px; color: #6b7280;">⚡ Main Driver: <strong>${escapeHTML(dominantPol)}</strong></p>
      <p style="margin: 0; font-size: 11px; color: #9ca3af;">${source}</p>
    </div>
  `).openPopup();
}
