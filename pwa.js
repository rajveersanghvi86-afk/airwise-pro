/* ==========================================================================
   AirWise Pro - Install as an app (PWA) & offline status
   ========================================================================== */

state.installPrompt = null;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function renderInstallUI() {
  const btn = document.getElementById("installBtn");
  const hint = document.getElementById("installHint");
  const canPrompt = !!state.installPrompt;
  if (btn) btn.hidden = isStandalone() || !canPrompt;

  if (!hint) return;
  if (isStandalone()) {
    hint.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#34d399;"></i> AirWise is installed on this device.`;
  } else if (canPrompt) {
    hint.innerHTML = `<button class="btn-icon-text btn-small btn-primary" id="installBtnSettings"><i class="fa-solid fa-download"></i> Install AirWise</button>`;
    document.getElementById("installBtnSettings").addEventListener("click", promptInstall);
  } else if (isIOS()) {
    hint.innerHTML = `On iPhone or iPad: tap <i class="fa-solid fa-arrow-up-from-bracket"></i> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.`;
  } else {
    hint.innerHTML = `Use your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.`;
  }
}

async function promptInstall() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  const { outcome } = await state.installPrompt.userChoice;
  state.installPrompt = null;
  renderInstallUI();
  if (outcome === "accepted") showToast("Installing AirWise", "You'll find it with your other apps.", "success");
}

function renderOnlineStatus() {
  const pill = document.getElementById("offlinePill");
  if (pill) pill.hidden = navigator.onLine;
}

function initPWA() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.installPrompt = e;
    renderInstallUI();
  });
  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    renderInstallUI();
  });
  document.getElementById("installBtn").addEventListener("click", promptInstall);

  window.addEventListener("online", () => {
    renderOnlineStatus();
    showToast("Back online", "Refreshing air quality data.", "success");
    refreshData();
  });
  window.addEventListener("offline", () => {
    renderOnlineStatus();
    showToast("You're offline", "Showing the last saved data.", "warn");
  });

  renderOnlineStatus();
  renderInstallUI();
}
