# AirWise Pro

Live air quality for any city: the AQI right now, the best time to go outside, mask and activity advice, a 7-day forecast, an interactive map and alerts. It works on phones and computers, offline, and in 28 languages:

- **Indian:** हिन्दी, বাংলা, తెలుగు, मराठी, தமிழ், ગુજરાતી, ಕನ್ನಡ, മലയാളം, ଓଡ଼ିଆ, ਪੰਜਾਬੀ, اردو
- **World:** English, Español, 中文, Français, العربية, Português, Русский, 日本語, Deutsch, 한국어, Türkçe, Italiano, Bahasa Indonesia, Tiếng Việt, ไทย, Kiswahili, فارسی

Live site: https://rajveersanghvi86-afk.github.io/airwise-pro/

## Editing the app

The page loads two built files, `app.min.js` and `app.min.css`. After changing any `.js` file or `style.css`, rebuild them:

```bash
npm install
npm run build
```

Commit the rebuilt `app.min.*` files too, since GitHub Pages serves them directly. When you deploy changes, also raise `VERSION` in `sw.js` so installed copies update.

| File | What it does |
| --- | --- |
| `i18n.js` | Language list, English text, loading other languages, date and time formatting |
| `lang/*.json` | One file per language, downloaded only when chosen. `npm run build` checks that every file has every string and the same `{placeholders}` as English |
| `script.js` | Data loading, AQI maths, the main dashboard cards |
| `ui.js` | Phone and computer layouts, bottom tabs, lite mode, dialogs, vibration |
| `search.js` | Typo-tolerant and offline city search |
| `map.js` | Interactive map |
| `favorites.js`, `alerts.js`, `personal.js`, `tour.js`, `prefs.js`, `pwa.js` | Saved places, alerts, health quiz, guided tour, theme and units, install |
| `sw.js` | Offline support and notifications |

Data comes from [Open-Meteo](https://open-meteo.com/) and, optionally, [WAQI](https://aqicn.org/). AQI uses the US EPA scale (0–500) for the selected place.
