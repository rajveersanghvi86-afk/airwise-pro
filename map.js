/* ==========================================================================
   AirWise Pro - Interactive Air Quality Map
   - Tap anywhere to check the air at that spot
   - Colored AQI grid across the visible area (Open-Meteo, one batched request)
   - Real monitoring stations when a WAQI token is set
   - Favorites, legend, fullscreen, recenter
   ========================================================================== */

const GRID_STEPS = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2];
const GRID_MIN_ZOOM = 6;
const GRID_CACHE_MS = 30 * 60 * 1000;
const MAX_GRID_POINTS = 60;

state.gridCache = new Map();   // "lat,lon" -> { aqi, t }
state.mapCenteredOn = null;    // place id the map was last centered on

function mapUnavailable(msg) {
  const el = document.getElementById("map");
  if (el) el.innerHTML = `<div class="map-fallback"><i class="fa-solid fa-map"></i><span>${msg}</span></div>`;
}

// Leaflet (~150 KB) is only downloaded when the map card comes into view
function initMapLazy() {
  const card = document.getElementById("mapCard");
  whenVisible(card, () => {
    loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js")
      .then(() => {
        initMap();
        if (state.aqiData) updateMap();
      })
      .catch(() => mapUnavailable(t("map.unavailable")));
  });
}

function initMap() {
  const el = document.getElementById("map");
  if (!el || state.map) return;
  if (typeof L === "undefined") {
    mapUnavailable(t("map.unavailable"));
    return;
  }
  el.innerHTML = "";

  state.map = L.map("map", {
    center: [state.currentLat, state.currentLon],
    zoom: 10,
    scrollWheelZoom: false,   // don't hijack page scrolling; enabled after a click
    worldCopyJump: true
  });
  setMapTheme(resolvedTheme());

  state.gridLayer = L.layerGroup().addTo(state.map);
  state.stationLayer = L.layerGroup().addTo(state.map);
  state.favLayer = L.layerGroup().addTo(state.map);
  state.mainLayer = L.layerGroup().addTo(state.map);

  state.layerControl = L.control.layers(null, {
    [t("map.grid")]: state.gridLayer,
    [t("map.favorites")]: state.favLayer
  }, { position: "topright", collapsed: true }).addTo(state.map);

  addLegendControl();
  addButtonsControl();
  addScrollHint(el);

  state.map.on("click", (e) => showSpotPopup(e.latlng));
  state.refreshOverlaysSoon = debounce(refreshMapOverlays, 450);
  state.map.on("moveend", state.refreshOverlaysSoon);
  state.map.on("overlayadd", refreshMapOverlays);

  // Open buttons inside popups
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-spot]");
    if (!btn) return;
    e.preventDefault();
    const { lat, lon, name, country } = btn.dataset;
    state.map.closePopup();
    loadData(parseFloat(lat), parseFloat(lon), name, country || "");
    document.querySelector(".aqi-hero-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Keep Leaflet's size right when the card resizes (layout changes, fullscreen)
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => state.map.invalidateSize()).observe(el);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// CARTO tiles: dark_all for dark mode, light_all for light mode
function setMapTheme(theme) {
  if (!state.map) return;
  const style = theme === "light" ? "light_all" : "dark_all";
  if (state.tileStyle === style) return;
  if (state.tileLayer) state.map.removeLayer(state.tileLayer);
  state.tileLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 18
  }).addTo(state.map);
  state.tileLayer.bringToBack();
  state.tileStyle = style;
}

/* ---------- Controls ---------- */

function addLegendControl() {
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "map-legend");
    div.setAttribute("aria-hidden", "true");
    div.innerHTML = `<strong>${t("aqi.label")}</strong>` + AQI_THRESHOLDS.map((th, i) => {
      const lo = i === 0 ? 0 : AQI_THRESHOLDS[i - 1].max + 1;
      return `<span title="${escapeHTML(t("cat." + th.key))}"><i style="background:${th.color}"></i>${lo}–${th.max}</span>`;
    }).join("");
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legend.addTo(state.map);
  state.legendControl = legend;
}

function addButtonsControl() {
  const ctrl = L.control({ position: "topleft" });
  ctrl.onAdd = () => {
    const div = L.DomUtil.create("div", "leaflet-bar map-buttons");
    div.innerHTML = `
      <a href="#" role="button" data-map="recenter" title="${escapeHTML(t("map.recenter", { city: state.currentCityName }))}" aria-label="${escapeHTML(t("map.recenter", { city: state.currentCityName }))}"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i></a>
      <a href="#" role="button" data-map="fullscreen" title="${escapeHTML(t("map.fullscreen"))}" aria-label="${escapeHTML(t("map.fullscreen"))}" aria-pressed="false"><i class="fa-solid fa-expand" aria-hidden="true"></i></a>`;
    L.DomEvent.disableClickPropagation(div);
    div.addEventListener("click", (e) => {
      const a = e.target.closest("[data-map]");
      if (!a) return;
      e.preventDefault();
      if (a.dataset.map === "recenter") state.map.setView([state.currentLat, state.currentLon], Math.max(state.map.getZoom(), 10));
      if (a.dataset.map === "fullscreen") toggleMapFullscreen();
    });
    return div;
  };
  ctrl.addTo(state.map);
  state.buttonsControl = ctrl;
}

function toggleMapFullscreen(force) {
  const card = document.getElementById("mapCard");
  const on = typeof force === "boolean" ? force : !card.classList.contains("map-fullscreen");
  card.classList.toggle("map-fullscreen", on);
  document.body.classList.toggle("map-open", on);
  const icon = card.querySelector('[data-map="fullscreen"] i');
  if (icon) icon.className = `fa-solid ${on ? "fa-compress" : "fa-expand"}`;
  card.querySelector('[data-map="fullscreen"]')?.setAttribute("aria-pressed", on ? "true" : "false");
  if (on) state.map.scrollWheelZoom.enable();
  setTimeout(() => state.map.invalidateSize(), 50);
}

function addScrollHint(el) {
  const hint = document.createElement("div");
  hint.className = "map-scroll-hint";
  hint.textContent = t("map.scrollHint");
  el.appendChild(hint);
  let timer;
  el.addEventListener("wheel", () => {
    if (state.map.scrollWheelZoom.enabled()) return;
    hint.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => hint.classList.remove("show"), 1200);
  }, { passive: true });
  state.map.on("click focus", () => state.map.scrollWheelZoom.enable());
  el.addEventListener("mouseleave", () => {
    if (!document.getElementById("mapCard").classList.contains("map-fullscreen")) state.map.scrollWheelZoom.disable();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("mapCard").classList.contains("map-fullscreen")) toggleMapFullscreen(false);
  });
}

/* ---------- Markers ---------- */

function aqiIcon(aqi, kind = "grid") {
  const lvl = getAQILevel(aqi);
  const size = kind === "main" ? 40 : kind === "station" ? 30 : kind === "fav" ? 30 : 26;
  return L.divIcon({
    className: `aqi-marker aqi-marker-${kind}`,
    html: `<div style="--c:${lvl.color}">${kind === "fav" ? '<i class="fa-solid fa-star"></i>' : ""}${lvl.value}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function popupHTML({ name, sub, aqi, extra = "", lat, lon, country = "", openable = true }) {
  const lvl = getAQILevel(aqi);
  return `
    <div class="map-popup">
      <div class="map-popup-title">${escapeHTML(name)}</div>
      ${sub ? `<div class="map-popup-sub">${escapeHTML(sub)}</div>` : ""}
      <div class="map-popup-aqi">
        <span class="map-popup-num" style="color:${lvl.text}">${lvl.value}</span>
        <span class="map-popup-cat" style="background:${lvl.color}22;color:${lvl.text}">${lvl.category}</span>
      </div>
      ${extra}
      ${openable ? `<button class="map-popup-btn" data-open-spot data-lat="${lat}" data-lon="${lon}" data-name="${escapeHTML(name)}" data-country="${escapeHTML(country)}">
        <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> ${escapeHTML(t("map.details"))}
      </button>` : ""}
    </div>`;
}

function renderMainMarker() {
  if (!state.map) return;
  state.mainLayer.clearLayers();
  const aqi = getCurrentAQI();
  if (!isValidNumber(aqi)) return;

  let lat = state.currentLat, lon = state.currentLon;
  const geo = state.stationMeta?.geo;
  if (state.stationMeta?.isStation && Array.isArray(geo) && geo.length === 2) [lat, lon] = geo;

  const marker = L.marker([lat, lon], { icon: aqiIcon(aqi, "main"), zIndexOffset: 1000, keyboard: true, title: state.currentCityName });
  const dominant = state.stationMeta?.dominantPol ? pollutantLabel(state.stationMeta.dominantPol) : null;
  marker.bindPopup(popupHTML({
    name: state.stationMeta?.isStation ? state.stationMeta.name : state.currentCityName,
    sub: state.stationMeta?.isStation ? t("map.station") : t("map.onDashboard"),
    aqi,
    extra: dominant ? `<div class="map-popup-row">${escapeHTML(t("map.mainPol", { pol: dominant }))}</div>` : "",
    openable: false
  }));
  state.mainLayer.addLayer(marker);
}

function renderMapFavorites() {
  if (!state.map || !state.favLayer) return;
  state.favLayer.clearLayers();
  const curId = currentPlaceId();
  state.favorites.forEach(f => {
    if (f.id === curId) return; // the main marker already covers it
    const aqi = state.favoriteAQI[f.id];
    if (!isValidNumber(aqi)) return;
    L.marker([f.lat, f.lon], { icon: aqiIcon(aqi, "fav"), zIndexOffset: 500, title: f.city })
      .bindPopup(popupHTML({ name: f.city, sub: t("map.favorite"), aqi, lat: f.lat, lon: f.lon, country: f.country }))
      .addTo(state.favLayer);
  });
}

/* ---------- Tap anywhere ---------- */

async function showSpotPopup(latlng) {
  const lat = Math.round(latlng.lat * 1e4) / 1e4;
  const lon = Math.round(L.Util.wrapNum(latlng.lng, [-180, 180], true) * 1e4) / 1e4;
  const popup = L.popup({ maxWidth: 260 })
    .setLatLng(latlng)
    .setContent(`<div class="map-popup"><div class="map-popup-sub"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHTML(t("map.checking"))}</div></div>`)
    .openOn(state.map);

  try {
    const [aq, place] = await Promise.all([
      fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,us_aqi_pm2_5,us_aqi_pm10,us_aqi_nitrogen_dioxide,us_aqi_ozone&timezone=auto`),
      reverseGeocode(lat, lon)
    ]);
    const cur = aq.current || {};
    if (!isValidNumber(cur.us_aqi)) throw new Error("No AQI");
    state.gridCache.set(`${lat},${lon}`, { aqi: cur.us_aqi, t: Date.now() });

    const subs = { "PM2.5": cur.us_aqi_pm2_5, "PM10": cur.us_aqi_pm10, "NO₂": cur.us_aqi_nitrogen_dioxide, "O₃": cur.us_aqi_ozone };
    const main = Object.entries(subs).filter(([, v]) => isValidNumber(v)).sort((a, b) => b[1] - a[1])[0];
    const name = place.city && place.city !== t("loc.current") ? place.city : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

    popup.setContent(popupHTML({
      name,
      sub: place.country || t("source.model"),
      aqi: cur.us_aqi,
      extra: `
        ${isValidNumber(cur.pm2_5) ? `<div class="map-popup-row">PM2.5: <strong>${cur.pm2_5.toFixed(1)} µg/m³</strong></div>` : ""}
        ${main ? `<div class="map-popup-row">Main pollutant: <strong>${main[0]}</strong></div>` : ""}`,
      lat, lon, country: place.country
    }));
  } catch (e) {
    popup.setContent(`<div class="map-popup"><div class="map-popup-sub">No air quality data for this spot. Try somewhere on land, or check your connection.</div></div>`);
  }
}

/* ---------- AQI grid & stations for the visible area ---------- */

function gridPoints() {
  const b = state.map.getBounds().pad(-0.04);
  const latSpan = b.getNorth() - b.getSouth();
  const lonSpan = b.getEast() - b.getWest();
  let step = GRID_STEPS.find(s => s >= Math.max(latSpan, lonSpan) / 8) || GRID_STEPS[GRID_STEPS.length - 1];

  let points;
  for (;;) {
    points = [];
    for (let lat = Math.ceil(b.getSouth() / step) * step; lat <= b.getNorth(); lat += step) {
      for (let lon = Math.ceil(b.getWest() / step) * step; lon <= b.getEast(); lon += step) {
        if (Math.abs(lat) > 85) continue;
        points.push([Math.round(lat * 1e4) / 1e4, Math.round(L.Util.wrapNum(lon, [-180, 180], true) * 1e4) / 1e4]);
      }
    }
    if (points.length <= MAX_GRID_POINTS) break;
    const next = GRID_STEPS.find(s => s > step);
    if (!next) { points = points.slice(0, MAX_GRID_POINTS); break; }
    step = next;
  }
  return points;
}

async function refreshGrid() {
  if (!state.map.hasLayer(state.gridLayer)) return;
  // One load at a time; if the map moves meanwhile, run again afterwards
  if (state.gridLoading) { state.gridPending = true; return; }
  state.gridLoading = true;
  try {
    await loadGrid();
  } finally {
    state.gridLoading = false;
    if (state.gridPending) { state.gridPending = false; refreshGrid(); }
  }
}

async function loadGrid() {
  if (state.lite && !state.gridRequested) {
    state.gridLayer.clearLayers();
    setMapStatus(`${escapeHTML(t("map.liteNote"))} <button class="btn-icon-text btn-small" id="loadAreaBtn">${escapeHTML(t("map.loadArea"))}</button>`);
    document.getElementById("loadAreaBtn")?.addEventListener("click", () => {
      state.gridRequested = true;
      buzz();
      refreshGrid();
    });
    return;
  }
  if (state.map.getZoom() < GRID_MIN_ZOOM) {
    state.gridLayer.clearLayers();
    setMapStatus(escapeHTML(t("map.zoomIn")));
    return;
  }

  const points = gridPoints();
  const now = Date.now();
  const key = p => `${p[0]},${p[1]}`;
  const missing = points.filter(p => {
    const c = state.gridCache.get(key(p));
    return !c || now - c.t > GRID_CACHE_MS;
  });

  if (missing.length) {
    setMapStatus(`<i class="fa-solid fa-spinner fa-spin"></i> Loading ${missing.length} readings...`);
    try {
      const data = await fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${missing.map(p => p[0]).join(",")}&longitude=${missing.map(p => p[1]).join(",")}&current=us_aqi&timezone=auto`);
      const list = Array.isArray(data) ? data : [data];
      missing.forEach((p, i) => {
        const aqi = list[i]?.current?.us_aqi;
        state.gridCache.set(key(p), { aqi: isValidNumber(aqi) ? aqi : null, t: now });
      });
    } catch (e) {
      setMapStatus(escapeHTML(t("map.failed")));
      return;
    }
  }

  state.gridLayer.clearLayers();
  let shown = 0;
  // Skip dots that would sit under the main marker or a favorite
  const taken = [[state.currentLat, state.currentLon], ...state.favorites.map(f => [f.lat, f.lon])]
    .map(ll => state.map.latLngToContainerPoint(ll));
  points.forEach(p => {
    const aqi = state.gridCache.get(key(p))?.aqi;
    if (!isValidNumber(aqi)) return;
    const pt = state.map.latLngToContainerPoint(p);
    if (taken.some(t => t.distanceTo(pt) < 34)) return;
    shown++;
    L.marker(p, { icon: aqiIcon(aqi, "grid"), keyboard: false })
      .on("click", (e) => { L.DomEvent.stopPropagation(e); showSpotPopup(e.latlng); })
      .addTo(state.gridLayer);
  });
  setMapStatus(escapeHTML(shown ? t("map.tap") : t("map.none")));
}

async function refreshStations() {
  if (!state.waqiToken) {
    if (state.stationsInControl) {
      state.layerControl.removeLayer(state.stationLayer);
      state.stationsInControl = false;
    }
    state.stationLayer.clearLayers();
    return;
  }
  if (!state.stationsInControl) {
    state.layerControl.addOverlay(state.stationLayer, t("map.stations"));
    state.stationsInControl = true;
  }
  if (!state.map.hasLayer(state.stationLayer)) return;

  const b = state.map.getBounds();
  try {
    const json = await fetchJSON(`https://api.waqi.info/map/bounds/?latlng=${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}&token=${encodeURIComponent(state.waqiToken)}`);
    if (json.status !== "ok" || !Array.isArray(json.data)) return;
    state.stationLayer.clearLayers();
    json.data.slice(0, 150).forEach(s => {
      const aqi = parseInt(s.aqi, 10);
      if (!isValidNumber(aqi)) return;
      const name = s.station?.name || t("map.stations");
      L.marker([s.lat, s.lon], { icon: aqiIcon(aqi, "station"), zIndexOffset: 200, title: name })
        .bindPopup(popupHTML({ name, sub: t("map.station"), aqi, lat: s.lat, lon: s.lon }))
        .addTo(state.stationLayer);
    });
  } catch (e) {
    console.warn("Station fetch failed", e);
  }
}

function refreshMapOverlays() {
  if (!state.map) return;
  refreshGrid();
  refreshStations();
}

function setMapStatus(html) {
  const el = document.getElementById("mapStatus");
  if (el) el.innerHTML = html;
}

// Called after the dashboard loads data for a place
function updateMap() {
  if (!state.map) return;
  const id = currentPlaceId();
  if (state.mapCenteredOn !== id) {
    // New place: recenter. A plain refresh keeps wherever the user panned to.
    state.map.setView([state.currentLat, state.currentLon], 10);
    state.mapCenteredOn = id;
    state.refreshOverlaysSoon();
    const recenter = document.querySelector('[data-map="recenter"]');
    if (recenter) {
      recenter.title = t("map.recenter", { city: state.currentCityName });
      recenter.setAttribute("aria-label", recenter.title);
    }
  } else {
    // Refresh: drop cached grid values so they update
    state.gridCache.clear();
    state.refreshOverlaysSoon();
  }
  renderMainMarker();
  renderMapFavorites();
}

// Language changed: swap the translated controls in place and redraw popups
function refreshMapLanguage() {
  if (!state.map) return;
  [state.layerControl, state.legendControl, state.buttonsControl].forEach(c => c && state.map.removeControl(c));
  state.layerControl = L.control.layers(null, {
    [t("map.grid")]: state.gridLayer,
    [t("map.favorites")]: state.favLayer
  }, { position: "topright", collapsed: true }).addTo(state.map);
  if (state.stationsInControl) state.layerControl.addOverlay(state.stationLayer, t("map.stations"));
  addLegendControl();
  addButtonsControl();
  const hint = document.querySelector(".map-scroll-hint");
  if (hint) hint.textContent = t("map.scrollHint");
  renderMainMarker();
  renderMapFavorites();
  refreshMapOverlays();
}
