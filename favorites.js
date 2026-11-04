/* ==========================================================================
   AirWise Pro - Favorite Locations
   Saved cities appear as chips under the profile bar, each with its live AQI.
   ========================================================================== */

const MAX_FAVORITES = 10;

function loadFavorites() {
  try {
    const list = JSON.parse(storage.get("airwise_favorites"));
    return Array.isArray(list) ? list.filter(f => isValidNumber(f.lat) && isValidNumber(f.lon) && f.city) : [];
  } catch (e) {
    return [];
  }
}

state.favorites = loadFavorites();
state.favoriteAQI = {}; // place id -> latest AQI

// Same id for the same spot (about 1 km), so searching a city twice still matches
function placeId(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

function currentPlaceId() {
  return placeId(state.currentLat, state.currentLon);
}

function saveFavorites() {
  storage.set("airwise_favorites", JSON.stringify(state.favorites));
}

function isCurrentFavorite() {
  const id = currentPlaceId();
  return state.favorites.some(f => f.id === id);
}

function toggleCurrentFavorite() {
  const id = currentPlaceId();
  const idx = state.favorites.findIndex(f => f.id === id);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    showToast(t("fav.removed", { city: state.currentCityName }), "", "info");
  } else {
    if (state.favorites.length >= MAX_FAVORITES) {
      showToast(t("fav.full", { n: MAX_FAVORITES }), "", "warn");
      buzz([30, 40, 30]);
      return;
    }
    state.favorites.push({
      id,
      lat: state.currentLat,
      lon: state.currentLon,
      city: state.currentCityName,
      country: state.currentCountry || ""
    });
    // We already know this place's AQI, no need to wait for the next fetch
    const aqi = getCurrentAQI();
    if (isValidNumber(aqi)) state.favoriteAQI[id] = aqi;
    showToast(t("fav.saved", { city: state.currentCityName }), "", "success");
  }
  buzz();
  saveFavorites();
  renderFavButton();
  renderFavorites();
}

function removeFavorite(id) {
  const fav = state.favorites.find(f => f.id === id);
  state.favorites = state.favorites.filter(f => f.id !== id);
  delete state.favoriteAQI[id];
  saveFavorites();
  renderFavButton();
  renderFavorites();
  if (fav) showToast(t("fav.removed", { city: fav.city }), "", "info");
  buzz();
}

function renderFavButton() {
  const btn = document.getElementById("favBtn");
  if (!btn) return;
  const saved = isCurrentFavorite();
  btn.classList.toggle("is-saved", saved);
  btn.innerHTML = `<i class="fa-${saved ? "solid" : "regular"} fa-star" aria-hidden="true"></i>`;
  btn.title = saved ? t("fav.remove") : t("fav.save");
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-pressed", saved ? "true" : "false");
}

function renderFavorites() {
  const list = document.getElementById("favoritesList");
  if (!list) return;
  if (typeof renderMapFavorites === "function") renderMapFavorites();
  list.closest(".favorites-bar")?.classList.toggle("is-empty", state.favorites.length === 0);

  if (state.favorites.length === 0) {
    list.innerHTML = `<li class="favorites-empty">${escapeHTML(t("fav.empty"))}</li>`;
    return;
  }

  const activeId = currentPlaceId();
  list.innerHTML = state.favorites.map(f => {
    const aqi = state.favoriteAQI[f.id];
    const lvl = isValidNumber(aqi) ? getAQILevel(aqi) : null;
    const badge = lvl
      ? `<span class="fav-aqi" style="background: ${lvl.color}22; color: ${lvl.text}; border-color: ${lvl.color}55;" title="${lvl.category}">${lvl.value}</span>`
      : `<span class="fav-aqi fav-aqi-empty">--</span>`;
    const aqiText = lvl ? `, ${t("aqi.label")} ${lvl.value}, ${lvl.category}` : "";
    return `
      <li class="fav-item">
        <div class="fav-chip${f.id === activeId ? " active" : ""}" data-id="${escapeHTML(f.id)}" role="button" tabindex="0"
          aria-label="${escapeHTML(f.city)}${aqiText}"${f.id === activeId ? ' aria-current="true"' : ""}>
          ${badge}
          <span class="fav-name">${escapeHTML(f.city)}</span>
          <button class="fav-remove" data-remove="${escapeHTML(f.id)}" aria-label="${escapeHTML(t("fav.removeOne", { city: f.city }))}" title="${escapeHTML(t("fav.removeOne", { city: f.city }))}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </li>`;
  }).join("");
}

// One request for all favorites: Open-Meteo accepts comma-separated coordinates
async function fetchFavoritesAQI() {
  if (state.favorites.length === 0) return [];
  const favs = [...state.favorites];
  const lats = favs.map(f => f.lat).join(",");
  const lons = favs.map(f => f.lon).join(",");
  try {
    const data = await fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi&timezone=auto`);
    const results = Array.isArray(data) ? data : [data];
    const out = [];
    favs.forEach((f, i) => {
      const aqi = results[i]?.current?.us_aqi;
      if (isValidNumber(aqi)) {
        state.favoriteAQI[f.id] = aqi;
        out.push({ fav: f, aqi });
      }
    });
    // The main view may have a more precise reading (e.g. a WAQI station)
    const cur = getCurrentAQI();
    if (isValidNumber(cur) && isCurrentFavorite()) state.favoriteAQI[currentPlaceId()] = cur;
    renderFavorites();
    return out;
  } catch (e) {
    console.warn("Could not refresh favorites AQI", e);
    return [];
  }
}

function initFavorites() {
  const list = document.getElementById("favoritesList");
  document.getElementById("favBtn")?.addEventListener("click", toggleCurrentFavorite);

  const openChip = (chip) => {
    const fav = state.favorites.find(f => f.id === chip.dataset.id);
    if (fav) { buzz(); loadData(fav.lat, fav.lon, fav.city, fav.country); }
  };

  list?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      e.stopPropagation();
      removeFavorite(removeBtn.dataset.remove);
      return;
    }
    const chip = e.target.closest(".fav-chip");
    if (chip) openChip(chip);
  });

  list?.addEventListener("keydown", (e) => {
    const chip = e.target.closest(".fav-chip");
    if (!chip || e.target.closest("[data-remove]")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChip(chip);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      removeFavorite(chip.dataset.id);
    }
  });

  renderFavorites();
  renderFavButton();
}
