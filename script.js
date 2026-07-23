/* ==========================================================================
   AirWise Pro - Modern AQI Intelligence & Health Safety Engine
   ========================================================================== */

// Global State
const state = {
  currentLat: 28.6139,  // Default: New Delhi
  currentLon: 77.2090,
  currentCityName: "New Delhi",
  currentCountry: "India",
  currentProfile: "general", // general, sensitive, respiratory, athlete
  aqiData: null,
  weatherData: null,
  waqiData: null,
  stationMeta: null,
  activeChartTab: "hourly",
  waqiToken: localStorage.getItem("airwise_waqi_token") || "",
  mainChart: null,
  map: null,
  mapMarker: null
};

// AQI Threshold Definitions
const AQI_THRESHOLDS = [
  { max: 50,  category: "Good",                   class: "aqi-status-good",           color: "#10b981", glow: "rgba(16, 185, 129, 0.3)" },
  { max: 100, category: "Moderate",               class: "aqi-status-moderate",       color: "#f59e0b", glow: "rgba(245, 158, 11, 0.3)" },
  { max: 150, category: "Unhealthy for Sensitive", class: "aqi-status-sensitive",      color: "#f97316", glow: "rgba(249, 115, 22, 0.3)" },
  { max: 200, category: "Unhealthy",              class: "aqi-status-unhealthy",      color: "#ef4444", glow: "rgba(239, 68, 68, 0.3)" },
  { max: 300, category: "Very Unhealthy",         class: "aqi-status-very-unhealthy", color: "#a855f7", glow: "rgba(168, 85, 247, 0.3)" },
  { max: 500, category: "Hazardous",              class: "aqi-status-hazardous",      color: "#e11d48", glow: "rgba(225, 29, 72, 0.4)" }
];

function getAQILevel(aqi) {
  let val = Math.max(0, Math.min(500, Math.round(aqi || 0)));
  for (let t of AQI_THRESHOLDS) {
    if (val <= t.max) return { ...t, value: val };
  }
  return { ...AQI_THRESHOLDS[AQI_THRESHOLDS.length - 1], value: val };
}

// Official US EPA Piecewise AQI Calculation Engine
function calcSubAQI(pollutant, conc) {
  if (conc === undefined || conc === null || isNaN(conc) || conc < 0) return null;

  const calculate = (c, cLo, cHi, iLo, iHi) => {
    return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  };

  if (pollutant === "PM25") { // ug/m3
    if (conc <= 12.0) return calculate(conc, 0.0, 12.0, 0, 50);
    if (conc <= 35.4) return calculate(conc, 12.1, 35.4, 51, 100);
    if (conc <= 55.4) return calculate(conc, 35.5, 55.4, 101, 150);
    if (conc <= 150.4) return calculate(conc, 55.5, 150.4, 151, 200);
    if (conc <= 250.4) return calculate(conc, 150.5, 250.4, 201, 300);
    if (conc <= 500.4) return calculate(conc, 250.5, 500.4, 301, 500);
    return 500;
  }
  if (pollutant === "PM10") { // ug/m3
    if (conc <= 54) return calculate(conc, 0, 54, 0, 50);
    if (conc <= 154) return calculate(conc, 55, 154, 51, 100);
    if (conc <= 254) return calculate(conc, 155, 254, 101, 150);
    if (conc <= 354) return calculate(conc, 255, 354, 151, 200);
    if (conc <= 424) return calculate(conc, 355, 424, 201, 300);
    if (conc <= 604) return calculate(conc, 425, 604, 301, 500);
    return 500;
  }
  if (pollutant === "NO2") { // ug/m3 (approx 1.88 ug/m3 per ppb)
    const ppb = conc / 1.88;
    if (ppb <= 53) return calculate(ppb, 0, 53, 0, 50);
    if (ppb <= 100) return calculate(ppb, 54, 100, 51, 100);
    if (ppb <= 360) return calculate(ppb, 101, 360, 101, 150);
    if (ppb <= 649) return calculate(ppb, 361, 649, 151, 200);
    if (ppb <= 1249) return calculate(ppb, 650, 1249, 201, 300);
    return 300;
  }
  if (pollutant === "O3") { // ug/m3 (approx 2.0 ug/m3 per ppb)
    const ppb = conc / 2.0;
    if (ppb <= 54) return calculate(ppb, 0, 54, 0, 50);
    if (ppb <= 70) return calculate(ppb, 55, 70, 51, 100);
    if (ppb <= 85) return calculate(ppb, 71, 85, 101, 150);
    if (ppb <= 105) return calculate(ppb, 86, 105, 151, 200);
    if (ppb <= 200) return calculate(ppb, 106, 200, 201, 300);
    return 300;
  }
  if (pollutant === "SO2") { // ug/m3 (approx 2.62 ug/m3 per ppb)
    const ppb = conc / 2.62;
    if (ppb <= 35) return calculate(ppb, 0, 35, 0, 50);
    if (ppb <= 75) return calculate(ppb, 36, 75, 51, 100);
    if (ppb <= 185) return calculate(ppb, 76, 185, 101, 150);
    if (ppb <= 304) return calculate(ppb, 186, 304, 151, 200);
    return 200;
  }
  if (pollutant === "CO") { // ug/m3 (approx 1145 ug/m3 per ppm)
    const ppm = conc / 1145;
    if (ppm <= 4.4) return calculate(ppm, 0, 4.4, 0, 50);
    if (ppm <= 9.4) return calculate(ppm, 4.5, 9.4, 51, 100);
    if (ppm <= 12.4) return calculate(ppm, 9.5, 12.4, 101, 150);
    if (ppm <= 15.4) return calculate(ppm, 12.5, 15.4, 151, 200);
    if (ppm <= 30.4) return calculate(ppm, 15.5, 30.4, 201, 300);
    return 300;
  }
  return null;
}

// Convert Wind Bearing Angle to Cardinal Compass String
function getWindCardinal(degree) {
  if (degree === undefined || degree === null) return "";
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const val = Math.floor((degree / 22.5) + 0.5);
  return directions[val % 16];
}

// Get UV Safety Risk Level
function getUvRiskCategory(uv) {
  if (uv === undefined || uv === null) return "";
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  initMap();

  // Load saved token if present
  if (state.waqiToken) {
    document.getElementById("waqiTokenInput").value = state.waqiToken;
  }

  // Attempt Geolocation or load default city
  detectLocation();
});

// Event Listeners Setup
function initEventListeners() {
  // Search Input & Debounce
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

    searchTimeout = setTimeout(() => {
      fetchCitySuggestions(query);
    }, 300);
  });

  // Close search dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) {
      searchResults.style.display = "none";
    }
  });

  // Geolocation Button
  document.getElementById("geoBtn").addEventListener("click", () => {
    detectLocation();
  });

  // Health Profile Chips
  document.querySelectorAll(".profile-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      document.querySelectorAll(".profile-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.currentProfile = chip.dataset.profile;
      if (state.aqiData) {
        renderPlanner();
        renderActivities();
      }
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

  // Settings Modal Toggle
  const modal = document.getElementById("settingsModal");
  document.getElementById("settingsBtn").addEventListener("click", () => {
    modal.classList.add("active");
  });

  document.getElementById("closeModal").addEventListener("click", () => {
    modal.classList.remove("active");
  });

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    const token = document.getElementById("waqiTokenInput").value.trim();
    const cityStr = document.getElementById("defaultCityInput").value.trim();
    state.waqiToken = token;
    localStorage.setItem("airwise_waqi_token", token);
    modal.classList.remove("active");

    if (cityStr) {
      fetchCitySuggestions(cityStr, true);
    } else {
      loadData(state.currentLat, state.currentLon, state.currentCityName, state.currentCountry);
    }
  });
}

// Geolocation Detection
function detectLocation() {
  const locNameEl = document.getElementById("locName");
  locNameEl.innerText = "Locating...";

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // Reverse Geocode
        const locationName = await reverseGeocode(lat, lon);
        loadData(lat, lon, locationName.city, locationName.country);
      },
      (err) => {
        console.warn("Geolocation denied/failed. Falling back to default city.", err);
        loadData(28.6139, 77.2090, "New Delhi", "India");
      },
      { timeout: 8000 }
    );
  } else {
    loadData(28.6139, 77.2090, "New Delhi", "India");
  }
}

// City Search Suggestions (Open-Meteo Geocoding)
async function fetchCitySuggestions(query, autoSelectFirst = false) {
  const searchResults = document.getElementById("searchResults");
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      searchResults.innerHTML = `<div class="search-item" style="color: var(--text-dim);">No locations found</div>`;
      searchResults.style.display = "block";
      return;
    }

    if (autoSelectFirst) {
      const first = data.results[0];
      loadData(first.latitude, first.longitude, first.name, first.country || "");
      searchResults.style.display = "none";
      return;
    }

    searchResults.innerHTML = data.results.map(item => `
      <div class="search-item" data-lat="${item.latitude}" data-lon="${item.longitude}" data-name="${item.name}" data-country="${item.country || ''}">
        <i class="fa-solid fa-location-dot" style="color: var(--accent-primary);"></i>
        <span><strong>${item.name}</strong> ${item.admin1 ? ', ' + item.admin1 : ''}</span>
        <span class="search-item-country">${item.country || ''}</span>
      </div>
    `).join("");

    searchResults.style.display = "block";

    // Bind click events to search items
    searchResults.querySelectorAll(".search-item").forEach(el => {
      el.addEventListener("click", () => {
        const lat = parseFloat(el.dataset.lat);
        const lon = parseFloat(el.dataset.lon);
        const name = el.dataset.name;
        const country = el.dataset.country;
        document.getElementById("searchInput").value = name;
        searchResults.style.display = "none";
        loadData(lat, lon, name, country);
      });
    });

  } catch (err) {
    console.error("City search error:", err);
  }
}

// Reverse Geocode (BigDataCloud or Open-Meteo fallback)
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const data = await res.json();
    const city = data.city || data.locality || data.principalSubdivision || "Current Location";
    const country = data.countryName || "";
    return { city, country };
  } catch (e) {
    return { city: "Current Location", country: "" };
  }
}

// Load Data Strategy (WAQI Live Station + Open-Meteo Air Quality & Weather)
async function loadData(lat, lon, cityName, country) {
  state.currentLat = lat;
  state.currentLon = lon;
  state.currentCityName = cityName;
  state.currentCountry = country;

  document.getElementById("locName").innerText = `${cityName}${country ? ', ' + country : ''}`;
  document.getElementById("updatedTime").innerText = `• Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  try {
    // 1. Fetch Real Live Station Feed from WAQI API
    let waqiData = null;
    try {
      const waqiTokenToUse = state.waqiToken || "demo";
      const waqiRes = await fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${waqiTokenToUse}`);
      const waqiJson = await waqiRes.json();
      if (waqiJson.status === "ok" && waqiJson.data) {
        waqiData = waqiJson.data;
      }
    } catch (e) {
      console.warn("WAQI API fetch failed, using Open-Meteo fallback", e);
    }
    state.waqiData = waqiData;

    // 2. Fetch Atmospheric Pollutants from Open-Meteo Air Quality API
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&hourly=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&forecast_days=7`;
    const aqRes = await fetch(aqUrl);
    const aqData = await aqRes.json();

    // 3. Fetch Weather Metrics from Open-Meteo Weather API
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,uv_index`;
    const wxRes = await fetch(wxUrl);
    const wxData = await wxRes.json();

    state.aqiData = aqData;
    state.weatherData = wxData;

    // Set Station Metadata
    if (waqiData && waqiData.city && waqiData.city.name) {
      const dominant = waqiData.dominentpol || "";
      state.stationMeta = {
        name: waqiData.city.name,
        dominantPol: dominant.toUpperCase().replace(".", ""),
        geo: waqiData.city.geo,
        isStation: true
      };
    } else {
      state.stationMeta = {
        name: `${cityName} Regional Monitor`,
        dominantPol: "PM25",
        geo: [lat, lon],
        isStation: false
      };
    }

    // Render UI Components
    renderHeroAQI();
    renderPollutants();
    renderPlanner();
    renderMaskGuidance();
    renderActivities();
    renderCharts();
    updateMap();

  } catch (err) {
    console.error("Failed to load air quality data:", err);
    document.getElementById("heroSummary").innerText = "Error loading atmospheric data. Please check internet connection.";
  }
}

// 1. Hero Speedometer & Status Pill
function renderHeroAQI() {
  // Determine primary US AQI (prefer WAQI real station aqi if available, else Open-Meteo)
  let currentAQI = state.aqiData?.current?.us_aqi ?? 45;
  if (state.waqiData && typeof state.waqiData.aqi === "number" && !isNaN(state.waqiData.aqi)) {
    currentAQI = state.waqiData.aqi;
  }

  const level = getAQILevel(currentAQI);

  // Set station name tag if available
  const stationTag = document.getElementById("stationName");
  if (state.stationMeta && state.stationMeta.name) {
    stationTag.innerText = `Station: ${state.stationMeta.name}`;
    stationTag.style.display = "inline-block";
  } else {
    stationTag.style.display = "none";
  }

  // Set numerical AQI
  const aqiNumEl = document.getElementById("aqiNum");
  aqiNumEl.innerText = level.value;
  aqiNumEl.style.color = level.color;

  // Set Status Pill
  const pill = document.getElementById("aqiPill");
  pill.className = `aqi-status-pill ${level.class}`;
  document.getElementById("aqiCategory").innerText = level.category;

  // Set Dominant Pollutant Tag
  const dominantTag = document.getElementById("dominantTag");
  if (state.stationMeta && state.stationMeta.dominantPol) {
    let domName = state.stationMeta.dominantPol;
    if (domName === "PM25") domName = "PM2.5";
    dominantTag.innerText = `⚡ Primary Driver: ${domName}`;
    dominantTag.style.display = "inline-block";
  } else {
    dominantTag.style.display = "none";
  }

  // Animate Gauge Needle (-90deg to +90deg based on AQI 0-500)
  const needle = document.getElementById("gaugeNeedle");
  const angle = -90 + (Math.min(level.value, 500) / 500) * 180;
  needle.style.transform = `rotate(${angle}deg)`;

  // Animate Gauge Arc Stroke
  const arc = document.getElementById("gaugeArc");
  const maxDash = 345.5;
  const offset = maxDash - (Math.min(level.value, 500) / 500) * maxDash;
  arc.style.strokeDashoffset = offset;
  arc.style.stroke = level.color;

  // Hero Text Summary
  const heroSummary = document.getElementById("heroSummary");
  if (level.value <= 50) {
    heroSummary.innerText = "Air quality is considered satisfactory, and air pollution poses little or no risk.";
  } else if (level.value <= 100) {
    heroSummary.innerText = "Air quality is acceptable. However, sensitive individuals may experience minor symptoms.";
  } else if (level.value <= 150) {
    heroSummary.innerText = "Members of sensitive groups may experience health effects. General public is unlikely to be affected.";
  } else if (level.value <= 200) {
    heroSummary.innerText = "Everyone may begin to experience health effects. Limit prolonged outdoor exposure.";
  } else {
    heroSummary.innerText = "Health warnings of emergency conditions. Entire population is more likely to be affected.";
  }

  // Weather Metrics
  const wx = state.weatherData?.current || {};
  const windCardinal = getWindCardinal(wx.wind_direction_10m);
  const uvCategory = getUvRiskCategory(wx.uv_index);

  document.getElementById("tempVal").innerText = wx.temperature_2m !== undefined ? `${Math.round(wx.temperature_2m)}°C` : "--°C";
  document.getElementById("humidityVal").innerText = wx.relative_humidity_2m !== undefined ? `${Math.round(wx.relative_humidity_2m)}%` : "--%";
  document.getElementById("windVal").innerText = wx.wind_speed_10m !== undefined ? `${Math.round(wx.wind_speed_10m)} km/h ${windCardinal}`.trim() : "-- km/h";
  document.getElementById("uvVal").innerText = wx.uv_index !== undefined ? `${wx.uv_index.toFixed(1)} (${uvCategory})` : "--";
}

// 2. Pollutants Breakdown (EPA Sub-AQI & Concentrations)
function renderPollutants() {
  const cur = state.aqiData?.current || {};
  const iaqi = state.waqiData?.iaqi || {};

  const dominant = (state.stationMeta?.dominantPol || "PM25").toUpperCase().replace(".", "");

  const pollutantDefs = [
    { id: "PM25", key: "pm25", conc: cur.pm2_5, unit: "µg/m³" },
    { id: "PM10", key: "pm10", conc: cur.pm10, unit: "µg/m³" },
    { id: "NO2",  key: "no2",  conc: cur.nitrogen_dioxide, unit: "µg/m³" },
    { id: "O3",   key: "o3",   conc: cur.ozone, unit: "µg/m³" },
    { id: "SO2",  key: "so2",  conc: cur.sulphur_dioxide, unit: "µg/m³" },
    { id: "CO",   key: "co",   conc: cur.carbon_monoxide, unit: "µg/m³" }
  ];

  pollutantDefs.forEach(p => {
    const cardEl = document.getElementById(`card${p.id}`);
    const valEl = document.getElementById(`val${p.id}`);
    const badgeEl = document.getElementById(`badge${p.id}`);
    const catEl = document.getElementById(`cat${p.id}`);
    const barEl = document.getElementById(`bar${p.id}`);

    // Determine Sub-AQI
    let subAQI = null;
    if (iaqi[p.key] && typeof iaqi[p.key].v === "number") {
      subAQI = iaqi[p.key].v;
    } else {
      subAQI = calcSubAQI(p.id, p.conc);
    }

    // Set concentration value
    if (p.conc !== undefined && p.conc !== null) {
      valEl.innerText = p.conc >= 100 ? Math.round(p.conc) : p.conc.toFixed(1);
    } else if (subAQI !== null) {
      valEl.innerText = subAQI;
    } else {
      valEl.innerText = "--";
    }

    if (subAQI !== null) {
      const level = getAQILevel(subAQI);
      badgeEl.innerText = `Sub-AQI ${level.value}`;
      badgeEl.style.color = level.color;
      badgeEl.style.background = `${level.color}22`;
      badgeEl.style.border = `1px solid ${level.color}44`;

      catEl.innerText = level.category;
      catEl.style.color = level.color;

      // Scale progress bar (0 to 300 Sub-AQI scale)
      const pct = Math.min(100, Math.max(5, Math.round((level.value / 300) * 100)));
      barEl.style.width = `${pct}%`;
      barEl.style.background = level.color;

    } else {
      badgeEl.innerText = "Sub-AQI --";
      badgeEl.style.color = "var(--text-muted)";
      badgeEl.style.background = "rgba(255, 255, 255, 0.08)";
      badgeEl.style.border = "none";

      catEl.innerText = "N/A";
      catEl.style.color = "var(--text-dim)";
      barEl.style.width = "0%";
    }

    // Highlight dominant pollutant card
    if (p.id === dominant || (dominant === "PM2.5" && p.id === "PM25")) {
      cardEl.classList.add("dominant-card-highlight");
    } else {
      cardEl.classList.remove("dominant-card-highlight");
    }
  });
}

// 3. Best Outdoor Time Planner
function renderPlanner() {
  const hourly = state.aqiData.hourly || {};
  const aqiList = hourly.us_aqi || [];
  const timeList = hourly.time || [];

  if (aqiList.length === 0) return;

  const currentHourIndex = new Date().getHours();
  const next24AQI = aqiList.slice(currentHourIndex, currentHourIndex + 24);
  const next24Time = timeList.slice(currentHourIndex, currentHourIndex + 24);

  // Find best windows (hours where AQI is lowest)
  const cleanHours = [];
  next24AQI.forEach((aqi, idx) => {
    if (aqi <= 80) {
      const dateObj = new Date(next24Time[idx]);
      const hourStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      cleanHours.push(hourStr);
    }
  });

  const headline = document.getElementById("plannerHeadline");
  const detail = document.getElementById("plannerDetail");
  const icon = document.getElementById("plannerIcon");

  const minAQI = Math.min(...next24AQI);
  const minIdx = next24AQI.indexOf(minAQI);
  const bestTimeStr = new Date(next24Time[minIdx]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (minAQI <= 50) {
    icon.innerHTML = `<i class="fa-solid fa-face-smile"></i>`;
    icon.style.background = "#10b981";
    headline.innerText = `Optimal Time for Outdoors: Around ${bestTimeStr}`;
    detail.innerText = `Air pollution will hit lowest levels (AQI ~${Math.round(minAQI)}). Ideal window for sports, running & outdoor errands.`;
  } else if (minAQI <= 100) {
    icon.innerHTML = `<i class="fa-solid fa-face-meh"></i>`;
    icon.style.background = "#f59e0b";
    headline.innerText = `Best Window: Early Morning around ${bestTimeStr}`;
    detail.innerText = `Moderate pollution expected (Best AQI ~${Math.round(minAQI)}). Limit intense exertion if in sensitive group.`;
  } else {
    icon.innerHTML = `<i class="fa-solid fa-face-frown"></i>`;
    icon.style.background = "#ef4444";
    headline.innerText = `Avoid Prolonged Outdoor Activity Today`;
    detail.innerText = `Lowest predicted AQI is elevated (${Math.round(minAQI)}). Stay indoors or wear an N95 respirator if stepping out.`;
  }

  // Render 24-Hour Timeline Strip
  const strip = document.getElementById("hourlyTimeline");
  strip.innerHTML = next24AQI.map((aqi, i) => {
    const t = new Date(next24Time[i]);
    const hourLabel = t.toLocaleTimeString([], { hour: 'numeric' });
    const lvl = getAQILevel(aqi);

    return `
      <div class="timeline-hour-card" style="border-top: 3px solid ${lvl.color};">
        <span class="timeline-time">${hourLabel}</span>
        <span class="timeline-aqi" style="color: ${lvl.color};">${Math.round(aqi)}</span>
        <span class="timeline-badge" style="background: ${lvl.color}22; color: ${lvl.color};">${lvl.category}</span>
      </div>
    `;
  }).join("");
}

// 4. Mask Guidance & Respirator Selector
function renderMaskGuidance() {
  const currentAQI = state.aqiData.current?.us_aqi ?? 45;

  const titleEl = document.getElementById("maskDecisionTitle");
  const descEl = document.getElementById("maskDecisionDesc");
  const iconEl = document.getElementById("maskIcon");

  // Reset mask cards
  document.querySelectorAll(".mask-type-card").forEach(c => c.classList.remove("active-recommended"));

  if (currentAQI <= 50) {
    iconEl.innerHTML = `<i class="fa-solid fa-wind" style="color: #10b981;"></i>`;
    titleEl.innerText = "No Mask Required";
    titleEl.style.color = "#34d399";
    descEl.innerText = "Air quality is pristine. Enjoy fresh air without respiratory restriction.";
    
    document.getElementById("tagCloth").className = "mask-tag tag-not-needed";
    document.getElementById("tagCloth").innerText = "Not Needed";
    document.getElementById("tagSurgical").innerText = "Not Needed";
    document.getElementById("tagN95").innerText = "Not Needed";
    document.getElementById("tagP100").innerText = "Not Needed";

  } else if (currentAQI <= 100) {
    iconEl.innerHTML = `<i class="fa-solid fa-head-side-mask" style="color: #f59e0b;"></i>`;
    titleEl.innerText = "Mask Optional";
    titleEl.style.color = "#fbbf24";
    descEl.innerText = "Acceptable air. Sensitive individuals or asthmatics may opt for a light cloth or surgical mask.";
    
    document.getElementById("maskCloth").classList.add("active-recommended");
    document.getElementById("tagCloth").className = "mask-tag tag-recommended";
    document.getElementById("tagCloth").innerText = "Optional";
    document.getElementById("tagSurgical").className = "mask-tag tag-optional";
    document.getElementById("tagSurgical").innerText = "Optional";

  } else if (currentAQI <= 150) {
    iconEl.innerHTML = `<i class="fa-solid fa-shield-virus" style="color: #f97316;"></i>`;
    titleEl.innerText = "N95 / KN95 Recommended";
    titleEl.style.color = "#fb923c";
    descEl.innerText = "Particulate pollution elevated (PM2.5). N95 mask advised for outdoor commutes.";
    
    document.getElementById("maskN95").classList.add("active-recommended");
    document.getElementById("tagN95").className = "mask-tag tag-recommended";
    document.getElementById("tagN95").innerText = "Recommended";

  } else if (currentAQI <= 200) {
    iconEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color: #ef4444;"></i>`;
    titleEl.innerText = "N95 Respirator Required";
    titleEl.style.color = "#f87171";
    descEl.innerText = "Unhealthy air. A tight-fitting N95 or KN95 respirator is strictly required outdoors.";
    
    document.getElementById("maskN95").classList.add("active-recommended");
    document.getElementById("tagN95").className = "mask-tag tag-recommended";
    document.getElementById("tagN95").innerText = "REQUIRED";

  } else {
    iconEl.innerHTML = `<i class="fa-solid fa-gas-mask" style="color: #a855f7;"></i>`;
    titleEl.innerText = "P100 / Heavy Duty Required";
    titleEl.style.color = "#c084fc";
    descEl.innerText = "Severe toxic smog alert. Stay indoors. Use P100 / N95 with tight face seal if exiting.";
    
    document.getElementById("maskP100").classList.add("active-recommended");
    document.getElementById("tagP100").className = "mask-tag tag-recommended";
    document.getElementById("tagP100").innerText = "CRITICAL";
  }
}

// 5. Activity Safety Matrix
function renderActivities() {
  const currentAQI = state.aqiData.current?.us_aqi ?? 45;
  const profile = state.currentProfile;

  const activities = [
    {
      title: "Outdoor Running & Sports",
      icon: "🏃",
      eval: (aqi) => aqi <= 50 ? "allowed" : aqi <= 100 ? "caution" : "avoid",
      desc: {
        allowed: "Safe for high-intensity workouts and outdoor running.",
        caution: "Reduce exertion. Take frequent breaks or train indoors.",
        avoid: "Avoid intense outdoor exercise. Rapid breathing increases pollutant intake."
      }
    },
    {
      title: "Cycling & Commuting",
      icon: "🚴",
      eval: (aqi) => aqi <= 60 ? "allowed" : aqi <= 120 ? "caution" : "avoid",
      desc: {
        allowed: "Great conditions for cycling and outdoor commutes.",
        caution: "Stick to low-traffic secondary roads. Wear an N95 mask.",
        avoid: "Avoid open-air cycling. Prefer enclosed air-conditioned vehicles."
      }
    },
    {
      title: "Kids Playground & Park",
      icon: "🛝",
      eval: (aqi) => aqi <= 50 ? "allowed" : aqi <= 90 ? "caution" : "avoid",
      desc: {
        allowed: "Perfect time for outdoor play and park visits.",
        caution: "Limit outdoor play duration for children.",
        avoid: "Keep children indoors. Playgrounds expose vulnerable lungs to PM2.5."
      }
    },
    {
      title: "Outdoor Dining & Patios",
      icon: "☕",
      eval: (aqi) => aqi <= 80 ? "allowed" : aqi <= 140 ? "caution" : "avoid",
      desc: {
        allowed: "Enjoy outdoor seating and cafe patio dining.",
        caution: "Consider indoor seating if sensitive to dust.",
        avoid: "Dine indoors with active HEPA air filtration."
      }
    },
    {
      title: "Ventilate House (Open Windows)",
      icon: "🪟",
      eval: (aqi) => aqi <= 70 ? "allowed" : aqi <= 100 ? "caution" : "avoid",
      desc: {
        allowed: "Open windows to refresh indoor room air.",
        caution: "Open windows briefly during early morning only.",
        avoid: "Keep windows closed. Turn on indoor HEPA air purifiers."
      }
    },
    {
      title: "Walking & Light Stroll",
      icon: "🚶",
      eval: (aqi) => aqi <= 100 ? "allowed" : aqi <= 160 ? "caution" : "avoid",
      desc: {
        allowed: "Safe for walking, errands, and casual strolls.",
        caution: "Wear a protective mask if walking near traffic.",
        avoid: "Minimize all walking outdoors. Stay in filtered indoor air."
      }
    }
  ];

  const grid = document.getElementById("activityGrid");
  grid.innerHTML = activities.map(act => {
    let status = act.eval(currentAQI);
    // If user selected sensitive/respiratory profile, tighten restrictions
    if ((profile === "sensitive" || profile === "respiratory") && status === "allowed" && currentAQI > 50) {
      status = "caution";
    }

    let badgeClass = "badge-allowed";
    let badgeText = "Safe";
    if (status === "caution") {
      badgeClass = "badge-caution";
      badgeText = "Caution";
    } else if (status === "avoid") {
      badgeClass = "badge-avoid";
      badgeText = "Avoid";
    }

    return `
      <div class="activity-card">
        <div class="activity-header">
          <div class="activity-title">
            <span class="activity-icon">${act.icon}</span>
            <span>${act.title}</span>
          </div>
          <span class="activity-badge ${badgeClass}">${badgeText}</span>
        </div>
        <p class="activity-desc">${act.desc[status]}</p>
      </div>
    `;
  }).join("");
}

// 6. Forecast & Trend Charts (Chart.js)
function renderCharts() {
  const canvas = document.getElementById("mainChart");
  if (!canvas || !state.aqiData) return;

  const ctx = canvas.getContext("2d");
  if (state.mainChart) state.mainChart.destroy();

  const hourly = state.aqiData.hourly || {};
  let labels = [];
  let dataPoints = [];
  let chartTitle = "";

  if (state.activeChartTab === "hourly") {
    const timeList = hourly.time || [];
    const aqiList = hourly.us_aqi || [];
    const currentHourIndex = new Date().getHours();

    labels = timeList.slice(currentHourIndex, currentHourIndex + 24).map(t => new Date(t).toLocaleTimeString([], { hour: 'numeric' }));
    dataPoints = aqiList.slice(currentHourIndex, currentHourIndex + 24);
    chartTitle = "Predicted US AQI (Next 24 Hours)";
  } else {
    // 7-Day Daily Forecast
    const timeList = hourly.time || [];
    const aqiList = hourly.us_aqi || [];

    // Group into 7 days (24-hour chunks)
    const days = [];
    const dailyAqi = [];
    for (let i = 0; i < 7; i++) {
      const chunk = aqiList.slice(i * 24, (i + 1) * 24);
      if (chunk.length > 0) {
        const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
        const dateObj = new Date(timeList[i * 24]);
        days.push(dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
        dailyAqi.push(Math.round(avg));
      }
    }

    labels = days;
    dataPoints = dailyAqi;
    chartTitle = "7-Day Average Air Quality Trend";
  }

  // Create Gradient Fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.4)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

  state.mainChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: chartTitle,
        data: dataPoints,
        borderColor: "#3b82f6",
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#3b82f6",
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
          backgroundColor: "#111827",
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1,
          titleFont: { family: 'Plus Jakarta Sans', size: 13, weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
          callbacks: {
            label: (context) => ` US AQI: ${context.raw}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#9ca3af", font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#9ca3af", font: { family: 'Plus Jakarta Sans', size: 11 } }
        }
      }
    }
  });
}

// 7. Interactive Leaflet Map
function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  state.map = L.map('map').setView([state.currentLat, state.currentLon], 11);

  // Dark Tiles (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 18
  }).addTo(state.map);

  const customIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 15px #3b82f6;"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  state.mapMarker = L.marker([state.currentLat, state.currentLon], { icon: customIcon }).addTo(state.map);
  state.mapMarker.bindPopup(`<b>${state.currentCityName}</b><br>AQI Monitoring Station`).openPopup();
}

function updateMap() {
  if (!state.map) return;

  let mapLat = state.currentLat;
  let mapLon = state.currentLon;
  if (state.stationMeta && Array.isArray(state.stationMeta.geo) && state.stationMeta.geo.length === 2) {
    mapLat = state.stationMeta.geo[0];
    mapLon = state.stationMeta.geo[1];
  }

  state.map.setView([mapLat, mapLon], 11);

  let currentAQI = state.aqiData?.current?.us_aqi ?? 45;
  if (state.waqiData && typeof state.waqiData.aqi === "number" && !isNaN(state.waqiData.aqi)) {
    currentAQI = state.waqiData.aqi;
  }
  const level = getAQILevel(currentAQI);

  if (state.mapMarker) {
    state.map.removeLayer(state.mapMarker);
  }

  const customIcon = L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background: ${level.color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 20px ${level.color}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #000;">${Math.round(level.value)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const stationName = state.stationMeta?.name || state.currentCityName;
  const dominantPol = state.stationMeta?.dominantPol || "PM2.5";

  state.mapMarker = L.marker([mapLat, mapLon], { icon: customIcon }).addTo(state.map);
  state.mapMarker.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; color: #111; padding: 4px;">
      <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #0b0f19;">📍 ${stationName}</h4>
      <p style="margin: 6px 0 2px 0; font-size: 12px; color: #374151;"><strong>AQI:</strong> <span style="color: ${level.color}; font-weight: 800;">${Math.round(level.value)}</span> (${level.category})</p>
      <p style="margin: 0; font-size: 11px; color: #6b7280;">⚡ Main Driver: <strong>${dominantPol}</strong></p>
    </div>
  `).openPopup();
}
