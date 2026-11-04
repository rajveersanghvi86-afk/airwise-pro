/* ==========================================================================
   AirWise Pro - Forgiving city search
   - Typos get "Did you mean" suggestions
   - "City, Country" narrows results
   - Works offline with saved places and a built-in list of popular cities
   - Full keyboard support (arrows, Enter, Escape) for screen readers
   ========================================================================== */

// [name, country, lat, lon, other names]
const POPULAR_CITIES = [
  ["New Delhi", "India", 28.6139, 77.209, "delhi dilli दिल्ली"],
  ["Mumbai", "India", 19.076, 72.8777, "bombay मुंबई"],
  ["Bengaluru", "India", 12.9716, 77.5946, "bangalore बेंगलुरु"],
  ["Kolkata", "India", 22.5726, 88.3639, "calcutta कोलकाता"],
  ["Chennai", "India", 13.0827, 80.2707, "madras चेन्नई"],
  ["Hyderabad", "India", 17.385, 78.4867, "हैदराबाद"],
  ["Pune", "India", 18.5204, 73.8567, "poona पुणे"],
  ["Ahmedabad", "India", 23.0225, 72.5714, "अहमदाबाद"],
  ["Jaipur", "India", 26.9124, 75.7873, "जयपुर"],
  ["Lucknow", "India", 26.8467, 80.9462, "लखनऊ"],
  ["Kanpur", "India", 26.4499, 80.3319, "कानपुर"],
  ["Surat", "India", 21.1702, 72.8311, "सूरत"],
  ["Nagpur", "India", 21.1458, 79.0882, "नागपुर"],
  ["Patna", "India", 25.5941, 85.1376, "पटना"],
  ["Bhopal", "India", 23.2599, 77.4126, "भोपाल"],
  ["Indore", "India", 22.7196, 75.8577, "इंदौर"],
  ["Chandigarh", "India", 30.7333, 76.7794, "चंडीगढ़"],
  ["Gurugram", "India", 28.4595, 77.0266, "gurgaon गुरुग्राम"],
  ["Noida", "India", 28.5355, 77.391, "नोएडा"],
  ["Varanasi", "India", 25.3176, 82.9739, "banaras benares वाराणसी"],
  ["Kochi", "India", 9.9312, 76.2673, "cochin"],
  ["Guwahati", "India", 26.1445, 91.7362, ""],
  ["Thiruvananthapuram", "India", 8.5241, 76.9366, "trivandrum"],
  ["Karachi", "Pakistan", 24.8607, 67.0011, ""],
  ["Lahore", "Pakistan", 31.5204, 74.3587, ""],
  ["Dhaka", "Bangladesh", 23.8103, 90.4125, "dacca"],
  ["Kathmandu", "Nepal", 27.7172, 85.324, ""],
  ["Colombo", "Sri Lanka", 6.9271, 79.8612, ""],
  ["Dubai", "United Arab Emirates", 25.2048, 55.2708, ""],
  ["Riyadh", "Saudi Arabia", 24.7136, 46.6753, ""],
  ["Tehran", "Iran", 35.6892, 51.389, ""],
  ["Istanbul", "Türkiye", 41.0082, 28.9784, ""],
  ["Cairo", "Egypt", 30.0444, 31.2357, ""],
  ["Lagos", "Nigeria", 6.5244, 3.3792, ""],
  ["Nairobi", "Kenya", -1.2921, 36.8219, ""],
  ["Johannesburg", "South Africa", -26.2041, 28.0473, ""],
  ["London", "United Kingdom", 51.5074, -0.1278, "londres"],
  ["Paris", "France", 48.8566, 2.3522, ""],
  ["Berlin", "Germany", 52.52, 13.405, ""],
  ["Madrid", "Spain", 40.4168, -3.7038, ""],
  ["Barcelona", "Spain", 41.3874, 2.1686, ""],
  ["Rome", "Italy", 41.9028, 12.4964, "roma"],
  ["Milan", "Italy", 45.4642, 9.19, "milano"],
  ["Amsterdam", "Netherlands", 52.3676, 4.9041, ""],
  ["Warsaw", "Poland", 52.2297, 21.0122, "varsovia"],
  ["Moscow", "Russia", 55.7558, 37.6173, "moscu"],
  ["New York", "United States", 40.7128, -74.006, "nyc nueva york"],
  ["Los Angeles", "United States", 34.0522, -118.2437, "la"],
  ["Chicago", "United States", 41.8781, -87.6298, ""],
  ["Houston", "United States", 29.7604, -95.3698, ""],
  ["San Francisco", "United States", 37.7749, -122.4194, ""],
  ["Toronto", "Canada", 43.6532, -79.3832, ""],
  ["Mexico City", "Mexico", 19.4326, -99.1332, "ciudad de mexico cdmx"],
  ["Bogotá", "Colombia", 4.711, -74.0721, "bogota"],
  ["Lima", "Peru", -12.0464, -77.0428, ""],
  ["Santiago", "Chile", -33.4489, -70.6693, ""],
  ["Buenos Aires", "Argentina", -34.6037, -58.3816, ""],
  ["São Paulo", "Brazil", -23.5505, -46.6333, "sao paulo"],
  ["Rio de Janeiro", "Brazil", -22.9068, -43.1729, ""],
  ["Beijing", "China", 39.9042, 116.4074, "peking pekin"],
  ["Shanghai", "China", 31.2304, 121.4737, ""],
  ["Hong Kong", "China", 22.3193, 114.1694, ""],
  ["Tokyo", "Japan", 35.6762, 139.6503, "tokio"],
  ["Seoul", "South Korea", 37.5665, 126.978, "seul"],
  ["Bangkok", "Thailand", 13.7563, 100.5018, ""],
  ["Singapore", "Singapore", 1.3521, 103.8198, "singapur"],
  ["Jakarta", "Indonesia", -6.2088, 106.8456, ""],
  ["Manila", "Philippines", 14.5995, 120.9842, ""],
  ["Hanoi", "Vietnam", 21.0278, 105.8342, ""],
  ["Sydney", "Australia", -33.8688, 151.2093, ""],
  ["Melbourne", "Australia", -37.8136, 144.9631, ""]
];

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // é -> e
    .replace(/[!-\/:-@\[-`{-~\u2018\u2019\u201c\u201d]/g, " ")  // punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Edit distance (how many letters differ)
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Score a local city against the query: lower is better, null = no match
function matchScore(query, names) {
  let best = null;
  names.forEach(n => {
    if (!n) return;
    let score;
    if (n === query) score = 0;
    else if (n.startsWith(query)) score = 0.5;
    else {
      const d = editDistance(query, n.slice(0, Math.max(query.length, Math.min(n.length, query.length + 1))));
      const allowed = query.length <= 4 ? 1 : query.length <= 8 ? 2 : 3;
      if (d <= allowed) score = 1 + d;
    }
    if (score !== undefined && (best === null || score < best)) best = score;
  });
  return best;
}

function localMatches(query, limit = 5) {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const pool = [
    ...state.favorites.map(f => ({ name: f.city, country: f.country, lat: f.lat, lon: f.lon, saved: true, names: [normalizeText(f.city)] })),
    ...POPULAR_CITIES.map(([name, country, lat, lon, alt]) => ({
      name, country, lat, lon,
      names: [normalizeText(name), ...normalizeText(alt).split(" ").filter(Boolean)]
    }))
  ];
  const seen = new Set();
  return pool
    .map(c => ({ c, s: matchScore(q, c.names) }))
    .filter(x => x.s !== null)
    .sort((a, b) => a.s - b.s)
    .map(x => x.c)
    .filter(c => {
      const k = placeId(c.lat, c.lon);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

async function geocodeCity(query) {
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${currentLang}&format=json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.warn("City search error:", err);
    return null; // null = search unavailable (offline, server down)
  }
}

function fromApi(item) {
  return {
    name: item.name,
    country: item.country || "",
    region: item.admin1 || "",
    lat: item.latitude,
    lon: item.longitude
  };
}

// "Pune, India" -> base "Pune", qualifier "india"
function splitQuery(raw) {
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  return { base: parts[0] || raw.trim(), qualifier: normalizeText(parts.slice(1).join(" ")) };
}

function applyQualifier(list, qualifier) {
  if (!qualifier) return list;
  const filtered = list.filter(r => normalizeText(`${r.country} ${r.region}`).includes(qualifier));
  return filtered.length ? filtered : list;
}

async function searchPlaces(raw) {
  const { base, qualifier } = splitQuery(raw);
  const results = await geocodeCity(base);

  if (results === null) {
    return { items: localMatches(base, 6), note: navigator.onLine === false ? t("search.offline") : t("search.unavailable"), kind: "local" };
  }
  if (results.length) {
    return { items: applyQualifier(results.map(fromApi), qualifier), kind: "exact" };
  }

  // Nothing found: suggest close spellings from our list, then try a shorter query
  let suggestions = localMatches(base, 4);
  if (suggestions.length < 3 && base.length > 4) {
    const retry = await geocodeCity(base.slice(0, -1));
    if (retry && retry.length) suggestions = suggestions.concat(retry.slice(0, 4 - suggestions.length).map(fromApi));
  }
  return { items: suggestions, note: t("search.noResults", { q: raw }), kind: "suggest" };
}

/* ---------- UI ---------- */

function initSearch() {
  const input = document.getElementById("searchInput");
  const box = document.getElementById("searchResults");
  const form = document.getElementById("searchForm");
  let timer = null;
  let active = -1;
  let lastQuery = "";

  const options = () => [...box.querySelectorAll('[role="option"]')];
  const close = () => {
    box.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };
  const highlight = (i) => {
    const opts = options();
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, j) => o.setAttribute("aria-selected", j === active ? "true" : "false"));
    input.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView({ block: "nearest" });
  };
  const choose = (el) => {
    const { lat, lon, name, country } = el.dataset;
    input.value = name;
    close();
    buzz();
    loadData(parseFloat(lat), parseFloat(lon), name, country || "");
    if (typeof setTab === "function") setTab("now");
  };

  const render = ({ items, note, kind }) => {
    const header = note
      ? `<div class="search-note">${escapeHTML(note)}${kind === "suggest" && items.length ? ` <strong>${escapeHTML(t("search.didYouMean"))}</strong>` : ""}</div>`
      : "";
    const empty = !items.length ? `<div class="search-note">${escapeHTML(t("search.hint"))}</div>` : "";
    box.innerHTML = header + items.map((r, i) => `
      <div class="search-item" role="option" id="search-opt-${i}" aria-selected="false"
        data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escapeHTML(r.name)}" data-country="${escapeHTML(r.country || "")}">
        <i class="fa-solid ${r.saved ? "fa-star" : "fa-location-dot"}" aria-hidden="true"></i>
        <span class="search-item-name"><strong>${escapeHTML(r.name)}</strong>${r.region ? ", " + escapeHTML(r.region) : ""}</span>
        <span class="search-item-country">${escapeHTML(r.country || "")}${r.saved ? ` · ${escapeHTML(t("search.saved"))}` : ""}</span>
      </div>`).join("") + empty;
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
    if (kind === "suggest" || kind === "local") announce(note || "");
  };

  const run = async (q) => {
    lastQuery = q;
    const res = await searchPlaces(q);
    if (q !== lastQuery) return; // a newer search started
    render(res);
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    // Show instant local matches, then real results
    const instant = localMatches(q, 5);
    if (instant.length) render({ items: instant, kind: "instant" });
    timer = setTimeout(() => run(q), 280);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (box.hidden && input.value.trim().length >= 2) run(input.value.trim()); else highlight(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
    else if (e.key === "Escape") { close(); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    const opts = options();
    if (active >= 0 && opts[active]) { choose(opts[active]); return; }
    clearTimeout(timer);
    const res = await searchPlaces(q);
    // Exact single best match: go straight there
    if (res.kind === "exact" && res.items.length) {
      const r = res.items[0];
      input.value = r.name;
      close();
      buzz();
      loadData(r.lat, r.lon, r.name, r.country);
      if (typeof setTab === "function") setTab("now");
    } else {
      render(res);
      buzz([20, 40, 20]);
    }
  });

  box.addEventListener("click", (e) => {
    const opt = e.target.closest('[role="option"]');
    if (opt) choose(opt);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) close();
  });
}
