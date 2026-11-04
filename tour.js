/* ==========================================================================
   AirWise Pro - Welcome screen & guided tour
   ========================================================================== */

const TOUR_STEPS = [
  { target: ".search-box", title: "Find any city", text: "Search for a city, or tap the location button to use where you are now." },
  { target: ".aqi-hero-card", title: "Today's air at a glance", text: "The dial shows the US AQI. Green is good, red and purple mean stay careful. You'll also see the main pollutant and the weather." },
  { target: "#favBtn", title: "Save your places", text: "Tap the star to save a city. Saved places appear in the Favorites bar with their live AQI." },
  { target: ".profile-bar", title: "Pick who the advice is for", text: "Choose a health profile and every recommendation adapts. Take the quiz to build your own." },
  { target: "#personalPlanCard", title: "Your personal plan", text: "After the quiz, this card shows your own risk level and tips, including an asthma check." },
  { target: ".outdoor-planner-hero", title: "Plan the best time to go out", text: "The cleanest hour in the next 24 hours is marked with a star." },
  { target: "#alertsBtn", title: "Get alerts", text: "Turn on notifications to hear when the air gets unhealthy, or when it's about to." },
  { target: "#themeBtn", title: "Light or dark", text: "Switch the look anytime. By default AirWise follows your device." },
  { target: "#helpBtn", title: "That's it!", text: "You can replay this tour from here anytime." }
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
  const { pop } = tourEls();
  const isLast = state.tourIndex === TOUR_STEPS.length - 1;

  pop.innerHTML = `
    <div class="tour-count">${state.tourIndex + 1} / ${TOUR_STEPS.length}</div>
    <h4 id="tourTitle">${step.title}</h4>
    <p>${step.text}</p>
    <div class="tour-nav">
      <button class="tour-skip" data-tour="skip">${isLast ? "" : "Skip tour"}</button>
      <div class="tour-nav-right">
        ${state.tourIndex > 0 ? `<button class="btn-icon-text btn-small" data-tour="back">Back</button>` : ""}
        ${isLast && !state.quiz ? `<button class="btn-icon-text btn-small" data-tour="quiz">Take the quiz</button>` : ""}
        <button class="btn-icon-text btn-primary btn-small" data-tour="next">${isLast ? "Done" : "Next"}</button>
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
