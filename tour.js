/* ==========================================================================
   AirWise Pro - Welcome screen & guided tour
   ========================================================================== */

// `tab` = which phone tab holds the element
const TOUR_STEPS = [
  { target: ".search-box", key: "search", tab: "now" },
  { target: ".aqi-hero-card", key: "hero", tab: "now" },
  { target: "#favBtn", key: "fav", tab: "now" },
  { target: ".profile-bar", key: "profile", tab: "now" },
  { target: "#personalPlanCard", key: "plan", tab: "now" },
  { target: ".outdoor-planner-hero", key: "planner", tab: "plan" },
  { target: ".bottom-nav", key: "nav" },
  { target: "#alertsBtn", key: "alerts" },
  { target: "#themeBtn", key: "theme" },
  { target: "#helpBtn", key: "help" }
];

state.tourIndex = -1;

function tourEls() {
  return {
    overlay: document.getElementById("tourOverlay"),
    spot: document.getElementById("tourSpotlight"),
    pop: document.getElementById("tourPopover")
  };
}

function startTour() {
  closeWelcome();
  document.querySelectorAll(".modal-backdrop.active").forEach(m => m.classList.remove("active"));
  state.tourIndex = 0;
  tourEls().overlay.classList.add("active");
  showTourStep();
}

function endTour() {
  state.tourIndex = -1;
  tourEls().overlay.classList.remove("active");
  storage.set("airwise_onboarded", "1");
}

function visibleTarget(step) {
  // On phones, switch to the tab that holds this element first
  if (step.tab && document.body.dataset.layout === "phone" && state.tab !== step.tab) setTab(step.tab, { push: false });
  const el = document.querySelector(step.target);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function showTourStep() {
  // Skip steps whose element isn't on screen (e.g. hidden on this layout)
  while (state.tourIndex < TOUR_STEPS.length && !visibleTarget(TOUR_STEPS[state.tourIndex])) state.tourIndex++;
  if (state.tourIndex >= TOUR_STEPS.length) return endTour();

  const step = TOUR_STEPS[state.tourIndex];
  const el = visibleTarget(step);
  const title = t(`tour.${step.key}.t`);
  const text = t(`tour.${step.key}.d`);
  const { pop } = tourEls();
  const isLast = state.tourIndex === TOUR_STEPS.length - 1;

  pop.innerHTML = `
    <div class="tour-count">${state.tourIndex + 1} / ${TOUR_STEPS.length}</div>
    <h4 id="tourTitle">${title}</h4>
    <p>${text}</p>
    <div class="tour-nav">
      <button class="tour-skip" data-tour="skip">${isLast ? "" : t("tour.skip")}</button>
      <div class="tour-nav-right">
        ${state.tourIndex > 0 ? `<button class="btn-icon-text btn-small" data-tour="back">${t("tour.back")}</button>` : ""}
        ${isLast && !state.quiz ? `<button class="btn-icon-text btn-small" data-tour="quiz">${t("tour.quiz")}</button>` : ""}
        <button class="btn-icon-text btn-primary btn-small" data-tour="next">${isLast ? t("tour.done") : t("tour.next")}</button>
      </div>
    </div>`;

  pop.querySelector('[data-tour="next"]').addEventListener("click", () => { state.tourIndex++; showTourStep(); });
  pop.querySelector('[data-tour="back"]')?.addEventListener("click", () => {
    state.tourIndex--;
    while (state.tourIndex > 0 && !visibleTarget(TOUR_STEPS[state.tourIndex])) state.tourIndex--;
    showTourStep();
  });
  pop.querySelector('[data-tour="skip"]').addEventListener("click", endTour);
  pop.querySelector('[data-tour="quiz"]')?.addEventListener("click", () => { endTour(); openQuiz(); });

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // Wait for the scroll to settle, then place spotlight and popover
  clearTimeout(state.tourPlaceTimer);
  placeTour(el);
  state.tourPlaceTimer = setTimeout(() => placeTour(el), 350);
  pop.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

function placeTour(el) {
  if (state.tourIndex < 0) return;
  const { spot, pop } = tourEls();
  const r = el.getBoundingClientRect();
  const pad = 8;
  spot.style.top = `${r.top - pad}px`;
  spot.style.left = `${r.left - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = Math.min(340, vw - 32);
  pop.style.width = `${pw}px`;
  const ph = pop.offsetHeight;

  let top = r.bottom + 16;
  if (top + ph > vh - 16) top = r.top - ph - 16;          // not enough room below: go above
  if (top < 16) top = Math.max(16, vh - ph - 16);          // big element: pin to bottom
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(16, Math.min(left, vw - pw - 16));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}

/* ---------- Welcome screen (first visit) ---------- */

function showWelcome() {
  document.getElementById("welcomeModal").classList.add("active");
}

function closeWelcome() {
  document.getElementById("welcomeModal").classList.remove("active");
}

function initTour() {
  document.getElementById("helpBtn").addEventListener("click", startTour);
  document.getElementById("welcomeTour").addEventListener("click", startTour);
  document.getElementById("welcomeQuiz").addEventListener("click", () => {
    closeWelcome();
    storage.set("airwise_onboarded", "1");
    openQuiz();
  });
  document.getElementById("welcomeSkip").addEventListener("click", () => {
    closeWelcome();
    storage.set("airwise_onboarded", "1");
  });

  document.addEventListener("keydown", (e) => {
    if (state.tourIndex < 0) return;
    if (e.key === "Escape") endTour();
    else if (e.key === "ArrowRight") { state.tourIndex++; showTourStep(); }
    else if (e.key === "ArrowLeft" && state.tourIndex > 0) { state.tourIndex--; showTourStep(); }
  });

  const replace = () => {
    if (state.tourIndex < 0) return;
    const el = visibleTarget(TOUR_STEPS[state.tourIndex]);
    if (el) placeTour(el);
  };
  window.addEventListener("resize", replace);
  window.addEventListener("scroll", replace, { passive: true });

  if (!storage.get("airwise_onboarded")) setTimeout(showWelcome, 600);
}
