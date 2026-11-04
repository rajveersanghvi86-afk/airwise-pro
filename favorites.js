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
    showToast(`Removed ${state.currentCityName} from favorites`, "", "info");
  } else {
    if (state.favorites.length >= MAX_FAVORITES) {
      showToast("Favorites are full", `You can save up to ${MAX_FAVORITES} places. Remove one first.`, "warn");
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
    showToast(`Saved ${state.currentCityName} to favorites`, "", "success");
  }
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
  if (fav) showToast(`Removed ${fav.city} from favorites`, "", "info");
}

function renderFavButton() {
  const btn = document.getElementById("favBtn");
  if (!btn) return;
  const saved = isCurrentFavorite();
  btn.classList.toggle("is-saved", saved);
  btn.innerHTML = `<i class="fa-${saved ? "solid" : "regular"} fa-star"></i>`;
  btn.title = saved ? "Remove from favorites" : "Save to favorites";
  btn.setAttribute("aria-label", btn.title);
  btn.setAttribute("aria-pressed", saved ? "true" : "false");
}

function renderFavorites() {
  const list = document.getElementById("favoritesList");
  if (!list) return;

  if (state.favorites.length === 0) {
    list.innerHTML = `<span class="favorites-empty">Tap <i class="fa-regular fa-star"></i> next to a city name to save it here.</span>`;
    return;
  }

  const activeId = currentPlaceId();
  list.innerHTML = state.favorites.map(f => {
    const aqi = state.favoriteAQI[f.id];
    const lvl = isValidNumber(aqi) ? getAQILevel(aqi) : null;
    const badge = lvl
      ? `<span class="fav-aqi" style="background: ${lvl.color}22; color: ${lvl.color}; border-color: ${lvl.color}55;" title="${lvl.category}">${lvl.value}</span>`
      : `<span class="fav-aqi fav-aqi-empty">--</span>`;
    return `
      <div class="fav-chip${f.id === activeId ? " active" : ""}" data-id="${escapeHTML(f.id)}" role="button" tabindex="0" title="${escapeHTML(f.city)}${f.country ? ", " + escapeHTML(f.country) : ""}">
        ${badge}
        <span class="fav-name">${escapeHTML(f.city)}</span>
        <button class="fav-remove" data-remove="${escapeHTML(f.id)}" aria-label="Remove ${escapeHTML(f.city)} from favorites" title="Remove">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`;
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
    if (fav) loadData(fav.lat, fav.lon, fav.city, fav.country);
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
