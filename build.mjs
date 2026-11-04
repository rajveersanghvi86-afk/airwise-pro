// Build: bundle and minify the app for fast loading on any device.
//   npm install   (once)
//   npm run build
// Produces app.min.js (one file, rewritten for older browsers: Chrome 61+,
// Safari 11+, Firefox 60+) and app.min.css. index.html loads only these.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { transform } from "esbuild";

// Order matters: later files use globals from earlier ones
const JS_FILES = [
  "i18n.js", "script.js", "ui.js", "search.js", "favorites.js",
  "alerts.js", "personal.js", "tour.js", "prefs.js", "pwa.js", "map.js"
];
const TARGET = ["chrome61", "safari11", "firefox60", "edge79", "ios11"];

const js = JS_FILES.map(f => `/* ${f} */\n${readFileSync(f, "utf8")}`).join("\n;\n");
const outJs = await transform(js, { loader: "js", minify: true, target: TARGET, legalComments: "none" });
writeFileSync("app.min.js", outJs.code);

const css = readFileSync("style.css", "utf8");
const outCss = await transform(css, { loader: "css", minify: true, target: TARGET });
writeFileSync("app.min.css", outCss.code);

const kb = n => (n / 1024).toFixed(1) + " KB";
console.log(`app.min.js  ${kb(js.length)} -> ${kb(outJs.code.length)}`);
console.log(`app.min.css ${kb(css.length)} -> ${kb(outCss.code.length)}`);
[...outJs.warnings, ...outCss.warnings].forEach(w => console.warn("warning:", w.text));

// Check every language file: same keys and same {placeholders} as English
const en = new Function(readFileSync("i18n.js", "utf8").replace(/function detectLanguage[\s\S]*$/, "") + "; return STRINGS.en;")();
const holes = s => (s.match(/\{\w+\}/g) || []).sort().join(",");
let problems = 0;
for (const file of readdirSync("lang").filter(f => f.endsWith(".json"))) {
  const dict = JSON.parse(readFileSync(`lang/${file}`, "utf8"));
  const missing = Object.keys(en).filter(k => !(k in dict));
  const extra = Object.keys(dict).filter(k => !(k in en));
  const badVars = Object.keys(en).filter(k => k in dict && holes(en[k]) !== holes(dict[k]));
  if (missing.length || extra.length || badVars.length) {
    problems++;
    console.warn(`lang/${file}: ${missing.length} missing, ${extra.length} unknown, ${badVars.length} placeholder mismatches`,
      [...missing, ...extra, ...badVars].slice(0, 8).join(" "));
  }
}
console.log(problems ? `${problems} language file(s) need fixes (missing text falls back to English)` : "All language files complete");
