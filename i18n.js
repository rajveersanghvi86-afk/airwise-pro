/* ==========================================================================
   AirWise Pro - Languages
   t("key", { vars }) returns the text in the chosen language, falling back
   to English. Static HTML uses data-i18n / data-i18n-placeholder /
   data-i18n-label / data-i18n-title attributes.
   ========================================================================== */

// English is built in. Every other language is a small file in lang/
// that's downloaded only when someone picks it (then cached for offline).
// `en` is the English name, shown next to the native name in the picker.
const LANGUAGES = {
  en: { name: "English", en: "English", locale: "en", group: "world" },
  // Indian languages
  hi: { name: "हिन्दी", en: "Hindi", locale: "hi-IN", group: "india" },
  bn: { name: "বাংলা", en: "Bengali", locale: "bn-IN", group: "india" },
  te: { name: "తెలుగు", en: "Telugu", locale: "te-IN", group: "india" },
  mr: { name: "मराठी", en: "Marathi", locale: "mr-IN", group: "india" },
  ta: { name: "தமிழ்", en: "Tamil", locale: "ta-IN", group: "india" },
  gu: { name: "ગુજરાતી", en: "Gujarati", locale: "gu-IN", group: "india" },
  kn: { name: "ಕನ್ನಡ", en: "Kannada", locale: "kn-IN", group: "india" },
  ml: { name: "മലയാളം", en: "Malayalam", locale: "ml-IN", group: "india" },
  or: { name: "ଓଡ଼ିଆ", en: "Odia", locale: "or-IN", group: "india" },
  pa: { name: "ਪੰਜਾਬੀ", en: "Punjabi", locale: "pa-IN", group: "india" },
  ur: { name: "اردو", en: "Urdu", locale: "ur-IN", group: "india", dir: "rtl" },
  // Other major languages
  es: { name: "Español", en: "Spanish", locale: "es", group: "world" },
  zh: { name: "中文（简体）", en: "Chinese", locale: "zh-CN", group: "world" },
  fr: { name: "Français", en: "French", locale: "fr", group: "world" },
  ar: { name: "العربية", en: "Arabic", locale: "ar", group: "world", dir: "rtl" },
  pt: { name: "Português", en: "Portuguese", locale: "pt-BR", group: "world" },
  ru: { name: "Русский", en: "Russian", locale: "ru", group: "world" },
  ja: { name: "日本語", en: "Japanese", locale: "ja", group: "world" },
  de: { name: "Deutsch", en: "German", locale: "de", group: "world" },
  ko: { name: "한국어", en: "Korean", locale: "ko", group: "world" },
  tr: { name: "Türkçe", en: "Turkish", locale: "tr", group: "world" },
  it: { name: "Italiano", en: "Italian", locale: "it", group: "world" },
  id: { name: "Bahasa Indonesia", en: "Indonesian", locale: "id", group: "world" },
  vi: { name: "Tiếng Việt", en: "Vietnamese", locale: "vi", group: "world" },
  th: { name: "ไทย", en: "Thai", locale: "th", group: "world" },
  sw: { name: "Kiswahili", en: "Swahili", locale: "sw", group: "world" },
  fa: { name: "فارسی", en: "Persian", locale: "fa", group: "world", dir: "rtl" }
};

const STRINGS = {
  en: {
    "skip": "Skip to main content",
    "search.placeholder": "Search city or place...",
    "search.label": "Search for a city",
    "btn.myLocation": "My location",
    "btn.alerts": "Air quality alerts",
    "btn.theme": "Switch light or dark mode",
    "btn.help": "Take the tour",
    "btn.install": "Install",
    "btn.installLong": "Install AirWise as an app",
    "btn.settings": "Settings",
    "btn.close": "Close",
    "btn.save": "Save",
    "btn.saveChanges": "Save changes",
    "profile.label": "Advice for:",
    "profile.general": "General public",
    "profile.sensitive": "Children & seniors",
    "profile.respiratory": "Asthma & breathing",
    "profile.athlete": "Outdoor athletes",
    "profile.personal": "My profile",
    "fav.label": "Saved places:",
    "fav.empty": "Tap ☆ next to a city name to save it here.",
    "fav.save": "Save to favorites",
    "fav.remove": "Remove from favorites",
    "fav.removeOne": "Remove {city}",
    "fav.saved": "Saved {city}",
    "fav.removed": "Removed {city}",
    "fav.full": "You can save up to {n} places. Remove one first.",
    "share": "Share",
    "share.copied": "Link copied. Paste it anywhere to share.",
    "share.failed": "Couldn't copy the link.",
    "share.text": "Air quality in {place} right now: AQI {aqi} ({cat}).",
    "offline": "Offline",
    "loc.detecting": "Finding your location...",
    "loc.locating": "Finding your location...",
    "loc.denied": "Location is off, so we're showing {city}. Search to pick your city.",
    "loc.current": "Current location",
    "aqi.label": "AQI",
    "aqi.scale": "US EPA scale",
    "aqi.what": "What is AQI?",
    "aqi.explain": "AQI (Air Quality Index) is a score from 0 to 500 for how polluted the air is. Lower is better. The numbers are for your selected place. AirWise uses the US EPA scale, a common international standard.",
    "hero.loading": "Getting live air quality for your area...",
    "source.model": "Source: Open-Meteo model",
    "source.station": "Station: {name}",
    "updated": "Updated {time}",
    "refreshing": "Refreshing...",
    "driver": "Main pollutant: {pol}",
    "weather.temp": "Temp",
    "weather.humidity": "Humidity",
    "weather.wind": "Wind",
    "weather.uv": "UV index",
    "uv.low": "Low", "uv.moderate": "Moderate", "uv.high": "High", "uv.veryHigh": "Very high", "uv.extreme": "Extreme",
    "cat.good": "Good",
    "cat.moderate": "Moderate",
    "cat.sensitive": "Unhealthy for sensitive groups",
    "cat.unhealthy": "Unhealthy",
    "cat.veryUnhealthy": "Very unhealthy",
    "cat.hazardous": "Hazardous",
    "summary.good": "Air quality is good. Enjoy your time outside.",
    "summary.moderate": "Air quality is acceptable. Very sensitive people may notice mild symptoms.",
    "summary.sensitive": "Children, older adults and people with asthma or heart conditions should take it easier outside.",
    "summary.unhealthy": "Everyone may start to feel effects. Keep outdoor time short.",
    "summary.veryUnhealthy": "Health alert: avoid outdoor exercise and stay indoors when you can.",
    "summary.hazardous": "Emergency conditions. Everyone should stay indoors and keep activity low.",
    "err.load": "We couldn't load air quality data. Check your internet connection and try again.",
    "err.noData": "No air quality data is available for this place right now.",
    "err.retry": "Try again",
    "nodata": "No data",
    "na": "N/A",
    "subaqi": "AQI {v}",
    "card.pollutants": "Pollutant breakdown",
    "card.pollutantsSub": "What's in the air right now",
    "card.plan": "Your personal plan",
    "card.planSub": "Advice tuned to your health, age and activity",
    "card.planner": "Best time to go out",
    "card.plannerSub": "Cleanest hours in the next 24 hours, in local time",
    "planner.loading": "Finding the cleanest hours...",
    "planner.loadingDetail": "Checking the 24-hour forecast.",
    "planner.unavailable": "Hourly forecast unavailable",
    "planner.unavailableDetail": "There's no hourly forecast for this place.",
    "planner.goodTitle": "Best time to go out: {period}, around {time}",
    "planner.goodDetail": "Pollution is lowest then (AQI about {aqi}). A good window for sports, running and errands.",
    "planner.modTitle": "Best window: {period}, around {time}",
    "planner.modDetail": "Moderate pollution expected (best AQI about {aqi}). Go easy on hard exercise if you're sensitive.",
    "planner.badTitle": "Avoid long outdoor activity today",
    "planner.badDetail": "Even the cleanest hour ({time}) is high at AQI {aqi}. Stay indoors, or wear an N95 mask if you go out.",
    "planner.cleanNote": "{n} of the next {total} hours are below AQI {limit} for {profile}.",
    "planner.best": "Cleanest hour",
    "time.now": "Now",
    "time.tomorrow": "Tomorrow",
    "time.lateNight": "late night",
    "time.morning": "morning",
    "time.afternoon": "afternoon",
    "time.evening": "evening",
    "time.night": "night",
    "card.mask": "Mask guidance",
    "card.maskSub": "Which mask, if any, you need today",
    "mask.cloth": "Cloth mask", "mask.clothDesc": "Stops dust and large droplets",
    "mask.surgical": "Surgical mask", "mask.surgicalDesc": "Filters about 60% of PM2.5",
    "mask.n95": "N95 / KN95", "mask.n95Desc": "Filters 95% or more of fine particles",
    "mask.p100": "P100 respirator", "mask.p100Desc": "Filters 99.97% of particles",
    "mask.evaluating": "Checking...",
    "mask.evaluatingDesc": "Looking at the particles in the air.",
    "mask.t1": "No mask needed", "mask.d1": "The air is clean. Enjoy it without a mask{note}.",
    "mask.t2": "Mask optional", "mask.d2": "Acceptable air{note}. Sensitive people may prefer a surgical mask or N95 near traffic.",
    "mask.t3": "N95 / KN95 recommended", "mask.d3": "Particle pollution is raised{note}. An N95 is advised outdoors. Cloth masks don't stop fine particles.",
    "mask.t4": "N95 strongly advised", "mask.d4": "Unhealthy air{note}. Wear a tight-fitting N95 or KN95 outdoors and keep trips short.",
    "mask.t5": "Stay indoors · N95 / P100 outside", "mask.d5": "Very unhealthy air{note}. Stay indoors. If you must go out, use a well-sealed N95 or P100.",
    "mask.note": " (adjusted for {profile})",
    "tag.notEnough": "Not enough", "tag.notNeeded": "Not needed", "tag.optional": "Optional",
    "tag.recommended": "Recommended", "tag.strongly": "Strongly advised", "tag.severeOnly": "Severe only",
    "tag.minimum": "Minimum", "tag.best": "Best",
    "card.activities": "Is it safe to...?",
    "card.activitiesSub": "Everyday activities, checked against today's air",
    "badge.safe": "Safe", "badge.caution": "Caution", "badge.avoid": "Avoid",
    "act.run": "Running & sports",
    "act.run.allowed": "Safe for hard workouts and running outside.",
    "act.run.caution": "Go easier. Take breaks, or train indoors.",
    "act.run.avoid": "Skip hard exercise outside. Fast breathing pulls in more pollution.",
    "act.cycle": "Cycling & commuting",
    "act.cycle.allowed": "Great conditions for cycling and walking to work.",
    "act.cycle.caution": "Use quieter roads and consider an N95 mask.",
    "act.cycle.avoid": "Avoid open-air cycling. Use closed, filtered transport.",
    "act.kids": "Kids' playground & park",
    "act.kids.allowed": "A good time for outdoor play and park visits.",
    "act.kids.caution": "Keep outdoor play time shorter for children.",
    "act.kids.avoid": "Keep children indoors. Their lungs are more sensitive.",
    "act.dining": "Outdoor dining",
    "act.dining.allowed": "Enjoy outdoor seating.",
    "act.dining.caution": "Sit indoors if dust bothers you.",
    "act.dining.avoid": "Eat indoors, ideally with air filtering.",
    "act.windows": "Open windows",
    "act.windows.allowed": "Open windows to freshen indoor air.",
    "act.windows.caution": "Open them briefly, during the cleanest hour.",
    "act.windows.avoid": "Keep windows closed. Run an air purifier if you have one.",
    "act.walk": "Walking & errands",
    "act.walk.allowed": "Safe for walks, errands and strolls.",
    "act.walk.caution": "Wear a mask if walking near heavy traffic.",
    "act.walk.avoid": "Keep walking outside to a minimum.",
    "card.forecast": "Air quality forecast",
    "card.forecastFor": "Air quality forecast for {city}",
    "card.forecastSub": "AQI on the US EPA scale (0–500). Lower is better.",
    "chart.hourly": "Next 24 hours",
    "chart.daily": "Next 7 days",
    "chart.hourlyTitle": "Hourly AQI for {city}, next 24 hours",
    "chart.dailyTitle": "Daily average AQI for {city}",
    "chart.tooltip": "AQI {v} · {cat}",
    "chart.summary": "{title}. Lowest {min} at {minAt}, highest {max} at {maxAt}.",
    "card.map": "Air quality map",
    "card.mapSub": "Tap anywhere to check the air. Colored dots show AQI across the area.",
    "map.loading": "Loading map...",
    "map.tap": "Tap any spot on the map to check its air.",
    "map.zoomIn": "Zoom in to see AQI readings across the area.",
    "map.loadingN": "Loading {n} readings...",
    "map.none": "No readings for this area.",
    "map.failed": "Couldn't load area readings. Tap the map to check one spot.",
    "map.checking": "Checking the air here...",
    "map.noSpot": "No air quality data for this spot. Try somewhere on land, or check your connection.",
    "map.details": "Full details & forecast",
    "map.mainPol": "Main pollutant: {pol}",
    "map.onDashboard": "Showing on the dashboard",
    "map.station": "Monitoring station (WAQI)",
    "map.favorite": "Saved place",
    "map.grid": "AQI grid",
    "map.favorites": "Saved places",
    "map.stations": "Monitoring stations",
    "map.recenter": "Back to {city}",
    "map.fullscreen": "Full screen map",
    "map.scrollHint": "Click the map to zoom with the scroll wheel",
    "map.loadArea": "Load area readings",
    "map.liteNote": "Data saver is on. Area readings load when you ask.",
    "map.unavailable": "The map couldn't load. Check your connection and refresh the page.",
    "footer": "AirWise Pro · Live air quality from Open-Meteo and WAQI.",
    "nav.label": "Main",
    "nav.now": "Now",
    "nav.plan": "Plan",
    "nav.forecast": "Forecast",
    "nav.map": "Map",
    "nav.settings": "Settings",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.layout": "Layout",
    "settings.layoutAuto": "Automatic (detect my device)",
    "settings.layoutPhone": "Phone (tabs at the bottom)",
    "settings.layoutDesktop": "Computer (one long page)",
    "settings.detected": "This device looks like a {device}.",
    "settings.devicePhone": "phone or small tablet",
    "settings.deviceDesktop": "computer or large tablet",
    "settings.appearance": "Appearance",
    "settings.themeSystem": "Match my device",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.units": "Units",
    "settings.lite": "Data saver & lite mode",
    "settings.liteAuto": "Automatic",
    "settings.liteOn": "On (fewer effects, less data)",
    "settings.liteOff": "Off",
    "settings.liteHelp": "Turns off animations and blur, loads less data and checks less often. Automatic turns it on for older phones and data saver.",
    "settings.token": "WAQI token (optional)",
    "settings.tokenHelp": "Adds readings from the nearest real monitoring station (within 50 km). Get a free token at aqicn.org. Leave blank to use Open-Meteo only.",
    "settings.tokenPlaceholder": "Paste your WAQI token here...",
    "settings.defaultCity": "Default city",
    "settings.defaultCityHelp": "Opens on startup instead of your GPS location. Leave blank to use your location.",
    "settings.defaultCityPlaceholder": "e.g. Delhi, London, Tokyo",
    "settings.cityNotFound": "We couldn't find “{q}”. Check the spelling, or try just the city name.",
    "settings.personalize": "Personalize",
    "settings.quiz": "Health quiz",
    "settings.tour": "Replay tour",
    "settings.install": "Install as an app",
    "settings.saved": "Settings saved",
    "alerts.title": "Air quality alerts",
    "alerts.turnOn": "Turn on alerts",
    "alerts.turnOnSub": "Get notified when the air gets unhealthy",
    "alerts.threshold": "Alert me when AQI goes above",
    "alerts.opt50": "50 · Leaving “Good”",
    "alerts.opt100": "100 · Unhealthy for sensitive groups",
    "alerts.opt150": "150 · Unhealthy for everyone",
    "alerts.opt200": "200 · Very unhealthy",
    "alerts.opt300": "300 · Hazardous",
    "alerts.forecast": "Warn me up to 6 hours before it gets bad",
    "alerts.improve": "Tell me when the air gets better again",
    "alerts.favorites": "Also watch my saved places",
    "alerts.note": "AirWise checks every 15 minutes while it's open, even in a background tab. Alerts can't arrive while it's closed.",
    "alerts.test": "Send test",
    "welcome.title": "Welcome to AirWise",
    "welcome.text": "Live air quality, the best time to go outside, and health advice that fits you.",
    "welcome.language": "Language",
    "welcome.quiz": "Personalize my advice",
    "welcome.quizSub": "1-minute health quiz, with an asthma check",
    "welcome.tour": "Show me around",
    "welcome.tourSub": "A quick tour of the app",
    "welcome.skip": "Skip for now",
    "tour.skip": "Skip tour", "tour.back": "Back", "tour.next": "Next", "tour.done": "Done", "tour.quiz": "Take the quiz",
    "tour.search.t": "Find any city", "tour.search.d": "Search for a city, or tap the location button to use where you are.",
    "tour.hero.t": "Today's air at a glance", "tour.hero.d": "The dial shows the AQI. Green is good. Red and purple mean take care.",
    "tour.fav.t": "Save your places", "tour.fav.d": "Tap the star to save a city. Saved places show their live AQI.",
    "tour.profile.t": "Who is the advice for?", "tour.profile.d": "Pick a health profile and every tip adapts. The quiz builds your own.",
    "tour.plan.t": "Your personal plan", "tour.plan.d": "After the quiz, this shows your own risk level and tips.",
    "tour.planner.t": "Best time to go out", "tour.planner.d": "The cleanest hour in the next 24 hours is marked with a star.",
    "tour.nav.t": "Move around", "tour.nav.d": "Use the tabs at the bottom: Now, Plan, Forecast and Map.",
    "tour.alerts.t": "Get alerts", "tour.alerts.d": "Turn on notifications to hear when the air gets unhealthy.",
    "tour.theme.t": "Light or dark", "tour.theme.d": "Switch the look anytime. Language and layout are in Settings.",
    "tour.help.t": "That's it!", "tour.help.d": "You can replay this tour from here anytime.",
    "search.noResults": "No places found for “{q}”.",
    "search.didYouMean": "Did you mean:",
    "search.hint": "Check the spelling, or try just the city name (for example “Pune”).",
    "search.offline": "You're offline. Showing saved and popular places.",
    "search.unavailable": "Search isn't working right now. Showing popular places instead.",
    "search.saved": "Saved",
    "search.popular": "Popular",
    "announce.aqi": "Air quality in {place}: AQI {aqi}, {cat}.",
    "online.back": "Back online. Refreshing data.",
    "alert.above": "Air quality alert: {name}",
    "alert.aboveBody": "AQI is {aqi} ({cat}), above your limit of {limit}.",
    "alert.better": "Air is better in {name}",
    "alert.betterBody": "AQI dropped to {aqi} ({cat}), back under your limit of {limit}.",
    "alert.soon": "Air getting worse in {name}",
    "alert.soonBody": "AQI may reach {aqi} ({cat}) around {time}. Plan outdoor time before then.",
    "alert.on": "Alerts are on",
    "alert.onBody": "We'll tell you when AQI goes above {limit}.",
    "alert.off": "Alerts are off",
    "alert.btnOn": "Alerts on (AQI above {limit})",
    "alert.test": "AirWise test alert",
    "alert.testBody": "{place}: AQI {aqi} ({cat}). Alerts are working.",
    "perm.granted": "System notifications are allowed.",
    "perm.denied": "Notifications are blocked for this site. You'll still see alerts in the app. To allow them, open your browser's site settings.",
    "perm.default": "Your browser will ask for permission when you save with alerts on.",
    "perm.unsupported": "This browser doesn't support notifications. You'll still see alerts in the app.",
    "toast.dismiss": "Dismiss",
    "online.off": "You're offline. Showing the last saved data.",
    "lang.failed": "Couldn't download that language. Check your connection and try again."
  }
};

function detectLanguage() {
  let saved = null;
  try { saved = localStorage.getItem("airwise_lang"); } catch (e) { /* ignore */ }
  if (saved && LANGUAGES[saved]) return saved;
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]);
  for (const l of prefs) {
    const code = String(l).toLowerCase().split("-")[0];
    if (LANGUAGES[code]) return code;
  }
  return "en";
}

let currentLang = detectLanguage();

// Download a language file once (the service worker keeps it for offline use)
const languageLoads = {};
function loadLanguage(code) {
  if (!LANGUAGES[code]) return Promise.reject(new Error("Unknown language " + code));
  if (STRINGS[code]) return Promise.resolve();
  if (!languageLoads[code]) {
    languageLoads[code] = fetch(`lang/${code}.json`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(dict => { STRINGS[code] = dict; })
      .catch(err => { delete languageLoads[code]; throw err; });
  }
  return languageLoads[code];
}

function t(key, vars) {
  let s = (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.en[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? vars[k] : m));
  return s;
}

function currentLocale() {
  return LANGUAGES[currentLang].locale;
}

// Translate static page text
// Translate static page text and set direction (Arabic, Urdu, Persian read right to left)
function applyTranslations(root = document) {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = LANGUAGES[currentLang].dir || "ltr";
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll("[data-i18n-label]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nLabel)); });
  root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

// Native name first, English name after, grouped Indian / world
function languageOptionsHTML() {
  const opt = ([code, l]) => `<option value="${code}" lang="${code}">${l.name}${l.name !== l.en ? ` · ${l.en}` : ""}</option>`;
  const all = Object.entries(LANGUAGES);
  return `<optgroup label="भारतीय भाषाएँ · Indian languages">${all.filter(([, l]) => l.group === "india").map(opt).join("")}</optgroup>` +
    `<optgroup label="World languages">${all.filter(([, l]) => l.group === "world").map(opt).join("")}</optgroup>`;
}

async function setLanguage(lang) {
  if (!LANGUAGES[lang]) return;
  document.querySelectorAll(".lang-select").forEach(s => { s.disabled = true; });
  try {
    await loadLanguage(lang);
  } catch (e) {
    // Offline and not downloaded yet: keep the current language and explain
    document.querySelectorAll(".lang-select").forEach(s => { s.disabled = false; s.value = currentLang; });
    if (typeof showToast === "function") showToast(t("lang.failed"), "", "warn");
    return;
  }
  currentLang = lang;
  try { localStorage.setItem("airwise_lang", lang); } catch (e) { /* ignore */ }
  applyTranslations();
  document.querySelectorAll(".lang-select").forEach(s => { s.disabled = false; s.value = lang; });
  if (typeof renderAll === "function") renderAll();
}

/* ---------- Locale-aware dates ----------
   Hourly times come as "YYYY-MM-DDTHH:MM" in the place's local time. We
   format them as if UTC so the browser's own time zone can't shift them. */

function isoParts(str) {
  const s = String(str);
  return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10), h: +s.slice(11, 13) || 0 };
}

function formatHourLabel(str, withMinutes = false) {
  const p = isoParts(str);
  if (isNaN(p.h)) return "--";
  const opts = { hour: "numeric", timeZone: "UTC" };
  if (withMinutes) opts.minute = "2-digit";
  try {
    return new Intl.DateTimeFormat(currentLocale(), opts).format(new Date(Date.UTC(p.y, p.m - 1, p.d, p.h)));
  } catch (e) {
    const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
    return `${h12}${withMinutes ? ":00" : ""} ${p.h < 12 ? "AM" : "PM"}`;
  }
}

function formatDayLabel(str) {
  const p = isoParts(str);
  try {
    return new Intl.DateTimeFormat(currentLocale(), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(p.y, p.m - 1, p.d)));
  } catch (e) {
    return String(str).slice(0, 10);
  }
}

function formatClock(date) {
  try {
    return date.toLocaleTimeString(currentLocale(), { hour: "numeric", minute: "2-digit" });
  } catch (e) {
    return date.toLocaleTimeString();
  }
}
