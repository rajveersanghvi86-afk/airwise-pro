# AirWise Pro

Live air quality for any city: the AQI right now, the best time to go outside, mask and activity advice, a 7-day forecast, an interactive map and alerts. It works on phones and computers, in English, हिन्दी and Español, and offline.

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
| `i18n.js` | All interface text in each language, plus date and time formatting |
| `script.js` | Data loading, AQI maths, the main dashboard cards |
| `ui.js` | Phone and computer layouts, bottom tabs, lite mode, dialogs, vibration |
| `search.js` | Typo-tolerant and offline city search |
| `map.js` | Interactive map |
| `favorites.js`, `alerts.js`, `personal.js`, `tour.js`, `prefs.js`, `pwa.js` | Saved places, alerts, health quiz, guided tour, theme and units, install |
| `sw.js` | Offline support and notifications |

Data comes from [Open-Meteo](https://open-meteo.com/) and, optionally, [WAQI](https://aqicn.org/). AQI uses the US EPA scale (0–500) for the selected place.
