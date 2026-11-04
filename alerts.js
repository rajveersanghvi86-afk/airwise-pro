/* ==========================================================================
   AirWise Pro - Air Quality Alerts & Notifications
   Checks the AQI on every refresh and notifies when it crosses your limit.
   Works while AirWise is open (a background tab is fine). Browsers do not let
   a website without a server check the air while it is closed.
   ========================================================================== */

const DEFAULT_ALERT_SETTINGS = {
  enabled: false,
  threshold: 100,       // notify when AQI goes above this
  notifyImprove: true,  // also notify when it drops back below
  forecastWarn: true,   // warn when the next hours are forecast to go above
  watchFavorites: true  // check saved places too, not just the one on screen
};

function loadAlertSettings() {
  try {
    return { ...DEFAULT_ALERT_SETTINGS, ...(JSON.parse(storage.get("airwise_alerts")) || {}) };
  } catch (e) {
    return { ...DEFAULT_ALERT_SETTINGS };
  }
}

function loadAlertMemory() {
  try { return JSON.parse(storage.get("airwise_alert_memory")) || {}; } catch (e) { return {}; }
}

state.alerts = loadAlertSettings();
state.alertMemory = loadAlertMemory(); // place id -> { above: bool, warnedFor: "time string" }
state.swRegistration = null;

function saveAlertSettings() {
  storage.set("airwise_alerts", JSON.stringify(state.alerts));
}

function saveAlertMemory() {
  storage.set("airwise_alert_memory", JSON.stringify(state.alertMemory));
}

function notificationsSupported() {
  return "Notification" in window;
}

function notificationPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

// Service worker is needed for notifications on Android, and lets a click
// on a notification bring the AirWise tab back to the front.
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return null;
  try {
    state.swRegistration = await navigator.serviceWorker.register("sw.js");
    return state.swRegistration;
  } catch (e) {
    console.warn("Service worker registration failed", e);
    return null;
  }
}

/* ---------- In-app toasts (always shown, even without permission) ---------- */

function showToast(title, body = "", kind = "info", color = null) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = { info: "fa-circle-info", success: "fa-circle-check", warn: "fa-triangle-exclamation", alert: "fa-bell" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.setAttribute("role", kind === "alert" || kind === "warn" ? "alert" : "status");
  if (color) toast.style.borderLeftColor = color;
  toast.innerHTML = `
    <i class="fa-solid ${icons[kind] || icons.info} toast-icon"${color ? ` style="color: ${color};"` : ""} aria-hidden="true"></i>
    <div class="toast-text">
      <strong>${escapeHTML(title)}</strong>
      ${body ? `<span>${escapeHTML(body)}</span>` : ""}
    </div>
    <button class="toast-close" aria-label="${escapeHTML(t("toast.dismiss"))}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;

  const remove = () => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector(".toast-close").addEventListener("click", remove);
  container.appendChild(toast);

  // Give people time to read: pause while hovered or focused
  const delay = kind === "alert" ? 12000 : 6000;
  let timer = setTimeout(remove, delay);
  const pause = () => clearTimeout(timer);
  const resume = () => { clearTimeout(timer); timer = setTimeout(remove, 3000); };
  toast.addEventListener("mouseenter", pause);
  toast.addEventListener("focusin", pause);
  toast.addEventListener("mouseleave", resume);
  toast.addEventListener("focusout", resume);

  // Keep the stack short
  while (container.children.length > 4) container.firstElementChild.remove();
}

/* ---------- System notifications ---------- */

async function sendNotification(title, body, tag, color) {
  showToast(title, body, "alert", color);

  if (!state.alerts.enabled || notificationPermission() !== "granted") return;
  const options = {
    body,
    tag,                 // same tag replaces the older notification for that place
    renotify: true,
    icon: "icon.svg",
    badge: "icon.svg",
    data: { url: location.href }
  };
  try {
    const reg = state.swRegistration || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      const n = new Notification(title, options);
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch (e) {
    console.warn("Notification failed", e);
  }
}

/* ---------- Alert checks ---------- */

// Decide whether a place needs a notification. `forecast` is an optional
// list of { time, aqi } for the coming hours (only for the place on screen).
function checkPlaceAlert(id, name, aqi, forecast = null) {
  if (!state.alerts.enabled || !isValidNumber(aqi)) return;

  const limit = state.alerts.threshold;
  const memory = state.alertMemory[id] || {};
  const lvl = getAQILevel(aqi);
  const isAbove = lvl.value > limit;

  if (isAbove && !memory.above) {
    sendNotification(
      t("alert.above", { name }),
      t("alert.aboveBody", { aqi: lvl.value, cat: lvl.category, limit }),
      `aqi-${id}`, lvl.color
    );
  } else if (!isAbove && memory.above && state.alerts.notifyImprove) {
    sendNotification(
      t("alert.better", { name }),
      t("alert.betterBody", { aqi: lvl.value, cat: lvl.category, limit }),
      `aqi-${id}`, lvl.color
    );
  }
  memory.above = isAbove;

  // Heads-up when air is fine now but forecast to get worse within 6 hours
  if (!isAbove && forecast && state.alerts.forecastWarn) {
    const upcoming = forecast.slice(1, 7).find(h => isValidNumber(h.aqi) && h.aqi > limit);
    if (upcoming && memory.warnedFor !== upcoming.time) {
      const fl = getAQILevel(upcoming.aqi);
      sendNotification(
        t("alert.soon", { name }),
        t("alert.soonBody", { aqi: fl.value, cat: fl.category, time: formatHourLabel(upcoming.time, true) }),
        `forecast-${id}`, fl.color
      );
      memory.warnedFor = upcoming.time;
    }
  }

  state.alertMemory[id] = memory;
  saveAlertMemory();
}

// Called after the main view loads new data
function checkAlertsForCurrent() {
  checkPlaceAlert(currentPlaceId(), state.currentCityName, getCurrentAQI(), getNext24Hours());
}

// Called after favorite AQIs refresh
function checkAlertsForFavorites(results) {
  if (!state.alerts.watchFavorites) return;
  const curId = currentPlaceId();
  results.forEach(({ fav, aqi }) => {
    if (fav.id !== curId) checkPlaceAlert(fav.id, fav.city, aqi);
  });
}

/* ---------- Alerts modal ---------- */

function renderAlertButton() {
  const btn = document.getElementById("alertsBtn");
  if (!btn) return;
  const on = state.alerts.enabled;
  btn.classList.toggle("alerts-on", on);
  btn.innerHTML = `<i class="fa-${on ? "solid" : "regular"} fa-bell" aria-hidden="true"></i>`;
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.title = on ? t("alert.btnOn", { limit: state.alerts.threshold }) : t("btn.alerts");
  btn.setAttribute("aria-label", btn.title);
}

function renderPermissionStatus() {
  const el = document.getElementById("notifPermissionStatus");
  if (!el) return;
  const perm = notificationPermission();
  const messages = {
    granted: ["perm-ok", "fa-circle-check", t("perm.granted")],
    denied: ["perm-bad", "fa-circle-xmark", t("perm.denied")],
    default: ["perm-wait", "fa-circle-question", t("perm.default")],
    unsupported: ["perm-bad", "fa-circle-xmark", t("perm.unsupported")]
  };
  const [cls, icon, text] = messages[perm] || messages.default;
  el.className = `perm-status ${cls}`;
  el.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
}

function fillAlertForm() {
  document.getElementById("alertsEnabled").checked = state.alerts.enabled;
  document.getElementById("alertThreshold").value = String(state.alerts.threshold);
  document.getElementById("alertImprove").checked = state.alerts.notifyImprove;
  document.getElementById("alertForecast").checked = state.alerts.forecastWarn;
  document.getElementById("alertFavorites").checked = state.alerts.watchFavorites;
  updateAlertFormState();
  renderPermissionStatus();
}

function updateAlertFormState() {
  const on = document.getElementById("alertsEnabled").checked;
  document.querySelectorAll(".alert-option").forEach(el => el.classList.toggle("is-disabled", !on));
}

async function saveAlertForm() {
  const wasEnabled = state.alerts.enabled;
  const oldThreshold = state.alerts.threshold;

  state.alerts.enabled = document.getElementById("alertsEnabled").checked;
  state.alerts.threshold = parseInt(document.getElementById("alertThreshold").value, 10) || 100;
  state.alerts.notifyImprove = document.getElementById("alertImprove").checked;
  state.alerts.forecastWarn = document.getElementById("alertForecast").checked;
  state.alerts.watchFavorites = document.getElementById("alertFavorites").checked;
  saveAlertSettings();

  if (state.alerts.enabled && notificationPermission() === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
  }

  // Start fresh so the current state is reported once under the new settings
  if (!wasEnabled || oldThreshold !== state.alerts.threshold) {
    state.alertMemory = {};
    saveAlertMemory();
  }

  renderAlertButton();
  renderPermissionStatus();
  document.getElementById("alertsModal").classList.remove("active");

  if (state.alerts.enabled) {
    showToast(t("alert.on"), t("alert.onBody", { limit: state.alerts.threshold }), "success");
    buzz();
    checkAlertsForCurrent();
    if (state.alerts.watchFavorites) checkAlertsForFavorites(await fetchFavoritesAQI());
  } else if (wasEnabled) {
    showToast(t("alert.off"), "", "info");
  }
}

async function sendTestNotification() {
  if (notificationPermission() === "default") {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    renderPermissionStatus();
  }
  const aqi = getCurrentAQI();
  const lvl = isValidNumber(aqi) ? getAQILevel(aqi) : null;
  const body = lvl ? t("alert.testBody", { place: state.currentCityName, aqi: lvl.value, cat: lvl.category }) : "";
  // Send even if alerts are not saved as enabled yet
  const prev = state.alerts.enabled;
  state.alerts.enabled = true;
  await sendNotification(t("alert.test"), body, "airwise-test", lvl?.color);
  state.alerts.enabled = prev;
}

function initAlerts() {
  const modal = document.getElementById("alertsModal");
  document.getElementById("alertsBtn").addEventListener("click", () => {
    fillAlertForm();
    modal.classList.add("active");
  });
  document.getElementById("closeAlertsModal").addEventListener("click", () => modal.classList.remove("active"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("active"); });

  document.getElementById("alertsEnabled").addEventListener("change", updateAlertFormState);
  document.getElementById("saveAlertsBtn").addEventListener("click", saveAlertForm);
  document.getElementById("testAlertBtn").addEventListener("click", sendTestNotification);

  renderAlertButton();
  registerServiceWorker();
}
