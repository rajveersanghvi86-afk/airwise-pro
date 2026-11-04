/* ==========================================================================
   AirWise Pro - Health Quiz & Personal Plan
   A short questionnaire builds a personal sensitivity profile. The asthma
   questions follow the four GINA symptom-control questions. This is guidance,
   not a diagnosis.
   ========================================================================== */

const QUIZ_QUESTIONS = [
  {
    id: "age",
    title: "How old are you?",
    help: "Children and older adults breathe in more pollution relative to their size, or have less lung reserve.",
    options: [
      { value: "child", label: "Under 12", icon: "fa-child" },
      { value: "teen", label: "12 – 17", icon: "fa-person" },
      { value: "adult", label: "18 – 64", icon: "fa-user" },
      { value: "senior", label: "65 or older", icon: "fa-person-cane" }
    ]
  },
  {
    id: "conditions",
    title: "Do any of these apply to you?",
    help: "Pick all that apply. These raise sensitivity to polluted air.",
    multi: true,
    options: [
      { value: "asthma", label: "Asthma", icon: "fa-lungs" },
      { value: "copd", label: "COPD or chronic bronchitis", icon: "fa-lungs-virus" },
      { value: "heart", label: "Heart disease", icon: "fa-heart-pulse" },
      { value: "pregnant", label: "Pregnant", icon: "fa-person-pregnant" },
      { value: "allergies", label: "Allergies or hay fever", icon: "fa-head-side-cough" },
      { value: "diabetes", label: "Diabetes", icon: "fa-syringe" },
      { value: "none", label: "None of these", icon: "fa-circle-check", exclusive: true }
    ]
  },
  {
    id: "dayTime",
    when: a => a.conditions?.includes("asthma"),
    badge: "Asthma check · 1 of 4",
    title: "In the last 4 weeks, did you have asthma symptoms during the day more than twice a week?",
    help: "Symptoms include coughing, wheezing, a tight chest or shortness of breath.",
    options: [
      { value: "no", label: "No", icon: "fa-face-smile" },
      { value: "yes", label: "Yes", icon: "fa-face-frown" }
    ]
  },
  {
    id: "night",
    when: a => a.conditions?.includes("asthma"),
    badge: "Asthma check · 2 of 4",
    title: "In the last 4 weeks, did asthma wake you up at night?",
    options: [
      { value: "no", label: "No", icon: "fa-moon" },
      { value: "yes", label: "Yes", icon: "fa-bed" }
    ]
  },
  {
    id: "reliever",
    when: a => a.conditions?.includes("asthma"),
    badge: "Asthma check · 3 of 4",
    title: "In the last 4 weeks, did you need your reliever (rescue) inhaler more than twice a week?",
    help: "Don't count puffs taken before exercise to prevent symptoms.",
    options: [
      { value: "no", label: "No", icon: "fa-circle-check" },
      { value: "yes", label: "Yes", icon: "fa-spray-can" }
    ]
  },
  {
    id: "limited",
    when: a => a.conditions?.includes("asthma"),
    badge: "Asthma check · 4 of 4",
    title: "In the last 4 weeks, did asthma limit your daily activities?",
    help: "For example walking, climbing stairs, exercise or work.",
    options: [
      { value: "no", label: "No", icon: "fa-person-walking" },
      { value: "yes", label: "Yes", icon: "fa-person-falling" }
    ]
  },
  {
    id: "trigger",
    title: "Does smoky, dusty or polluted air make you cough or feel unwell?",
    options: [
      { value: "never", label: "Not really", icon: "fa-face-smile" },
      { value: "sometimes", label: "Sometimes", icon: "fa-face-meh" },
      { value: "often", label: "Often", icon: "fa-face-tired" }
    ]
  },
  {
    id: "activity",
    title: "How active are you outdoors?",
    help: "Hard breathing during exercise pulls more pollution deep into the lungs.",
    options: [
      { value: "indoor", label: "Mostly indoors", icon: "fa-couch" },
      { value: "light", label: "Walks and errands", icon: "fa-person-walking" },
      { value: "regular", label: "Regular exercise", icon: "fa-person-biking" },
      { value: "intense", label: "Intense training or sport", icon: "fa-person-running" }
    ]
  },
  {
    id: "outdoorHours",
    title: "How much time do you usually spend outside each day?",
    help: "Include commuting, outdoor work and school.",
    options: [
      { value: "low", label: "Less than 1 hour", icon: "fa-clock" },
      { value: "mid", label: "1 – 3 hours", icon: "fa-clock" },
      { value: "high", label: "More than 3 hours", icon: "fa-helmet-safety" }
    ]
  }
];

function loadQuiz() {
  try { return JSON.parse(storage.get("airwise_quiz")) || null; } catch (e) { return null; }
}

state.quiz = loadQuiz(); // { answers, result, completedAt }
state.quizDraft = null;   // in-progress answers while the quiz is open
state.quizStep = 0;

// Turn quiz answers into a sensitivity profile
function scoreQuiz(a) {
  const conditions = a.conditions || [];
  let factor = 1.0;
  const reasons = [];

  if (a.age === "child") { factor += 0.25; reasons.push("children's lungs are still developing"); }
  if (a.age === "senior") { factor += 0.25; reasons.push("age 65+"); }
  if (conditions.includes("asthma")) { factor += 0.25; reasons.push("asthma"); }
  if (conditions.includes("copd")) { factor += 0.35; reasons.push("COPD"); }
  if (conditions.includes("heart")) { factor += 0.3; reasons.push("heart disease"); }
  if (conditions.includes("pregnant")) { factor += 0.2; reasons.push("pregnancy"); }
  if (conditions.includes("allergies")) { factor += 0.1; reasons.push("allergies"); }
  if (conditions.includes("diabetes")) { factor += 0.1; reasons.push("diabetes"); }

  // GINA symptom control: count of "yes" answers
  let asthmaControl = null;
  if (conditions.includes("asthma")) {
    const yes = ["dayTime", "night", "reliever", "limited"].filter(k => a[k] === "yes").length;
    asthmaControl = yes === 0 ? "well" : yes <= 2 ? "partly" : "uncontrolled";
    factor += yes * 0.08;
    if (yes > 0) reasons.push(`asthma symptoms in the last 4 weeks`);
  }

  if (a.trigger === "often") { factor += 0.15; reasons.push("polluted air often triggers symptoms"); }
  if (a.trigger === "sometimes") factor += 0.07;
  if (a.outdoorHours === "high") { factor += 0.1; reasons.push("long hours outdoors"); }

  factor = Math.min(2.0, Math.round(factor * 100) / 100);
  const exertionBoost = { indoor: 0, light: 0.05, regular: 0.2, intense: 0.3 }[a.activity] || 0;
  const exertionFactor = Math.min(2.3, Math.round((factor + exertionBoost) * 100) / 100);

  const level = factor >= 1.75 ? "very high" : factor >= 1.4 ? "high" : factor >= 1.12 ? "raised" : "typical";
  const alertThreshold = factor >= 1.5 ? 50 : factor >= 1.15 ? 100 : 150;
  const cleanLimit = Math.max(30, Math.round(80 / factor));

  return { factor, exertionFactor, level, alertThreshold, cleanLimit, asthmaControl, reasons };
}

function applyPersonalProfile() {
  const chip = document.querySelector('.profile-chip[data-profile="personal"]');
  if (!state.quiz?.result) {
    delete PROFILES.personal;
    if (chip) chip.hidden = true;
    return;
  }
  const r = state.quiz.result;
  PROFILES.personal = {
    label: "your personal profile",
    factor: r.factor,
    exertionFactor: r.exertionFactor,
    cleanLimit: r.cleanLimit
  };
  if (chip) chip.hidden = false;
}

function selectProfile(profile) {
  const chip = document.querySelector(`.profile-chip[data-profile="${profile}"]`);
  if (chip) chip.click();
}

/* ---------- Quiz modal ---------- */

function visibleQuestions(answers) {
  return QUIZ_QUESTIONS.filter(q => !q.when || q.when(answers));
}

function openQuiz() {
  state.quizDraft = { ...(state.quiz?.answers || {}) };
  state.quizStep = 0;
  renderQuizStep();
  document.getElementById("quizModal").classList.add("active");
}

function closeQuiz() {
  document.getElementById("quizModal").classList.remove("active");
}

function renderQuizStep() {
  const body = document.getElementById("quizBody");
  const questions = visibleQuestions(state.quizDraft);
  const total = questions.length;
  const step = Math.min(state.quizStep, total);
  document.getElementById("quizProgressBar").style.width = `${Math.round((step / total) * 100)}%`;

  if (step >= total) {
    renderQuizResult();
    return;
  }

  const q = questions[step];
  const current = state.quizDraft[q.id];
  const isSelected = v => (q.multi ? (current || []).includes(v) : current === v);

  body.innerHTML = `
    <div class="quiz-step-label">${q.badge ? `<span class="quiz-badge">${q.badge}</span>` : ""}Question ${step + 1} of ${total}</div>
    <h4 class="quiz-question">${q.title}</h4>
    ${q.help ? `<p class="quiz-help">${q.help}</p>` : ""}
    <div class="quiz-options${q.options.length > 4 ? " quiz-options-wide" : ""}" role="${q.multi ? "group" : "radiogroup"}">
      ${q.options.map(o => `
        <button class="quiz-option${isSelected(o.value) ? " selected" : ""}" data-value="${o.value}"
          role="${q.multi ? "checkbox" : "radio"}" aria-checked="${isSelected(o.value)}">
          <i class="fa-solid ${o.icon}"></i>
          <span>${o.label}</span>
        </button>`).join("")}
    </div>
    <div class="quiz-nav">
      <button class="btn-icon-text" id="quizBack" ${step === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i> Back</button>
      ${q.multi ? `<button class="btn-icon-text btn-primary" id="quizNext" ${(current || []).length ? "" : "disabled"}>Next <i class="fa-solid fa-arrow-right"></i></button>` : ""}
    </div>`;

  body.querySelectorAll(".quiz-option").forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value;
      if (q.multi) {
        let list = [...(state.quizDraft[q.id] || [])];
        const opt = q.options.find(o => o.value === value);
        if (list.includes(value)) list = list.filter(v => v !== value);
        else if (opt.exclusive) list = [value];
        else list = [...list.filter(v => !q.options.find(o => o.value === v)?.exclusive), value];
        state.quizDraft[q.id] = list;
        renderQuizStep();
      } else {
        state.quizDraft[q.id] = value;
        state.quizStep = step + 1;
        renderQuizStep();
      }
    });
  });

  document.getElementById("quizBack")?.addEventListener("click", () => {
    state.quizStep = Math.max(0, step - 1);
    renderQuizStep();
  });
  document.getElementById("quizNext")?.addEventListener("click", () => {
    state.quizStep = step + 1;
    renderQuizStep();
  });

  body.querySelector(".quiz-option")?.focus({ preventScroll: true });
}

function renderQuizResult() {
  const body = document.getElementById("quizBody");
  const r = scoreQuiz(state.quizDraft);
  const controlText = {
    well: ["Well controlled", "#10b981", "Your answers suggest your asthma is well controlled. Keep following your treatment plan."],
    partly: ["Partly controlled", "#f59e0b", "Your answers suggest your asthma is only partly controlled. It's worth reviewing your treatment with your doctor."],
    uncontrolled: ["Not well controlled", "#ef4444", "Your answers suggest your asthma is not well controlled. Please talk to your doctor soon about your treatment plan."]
  }[r.asthmaControl];

  body.innerHTML = `
    <div class="quiz-result">
      <div class="quiz-result-icon"><i class="fa-solid fa-user-shield"></i></div>
      <h4 class="quiz-question">Your sensitivity to air pollution: <span class="sens-${r.level.replace(" ", "-")}">${r.level}</span></h4>
      <p class="quiz-help">${r.reasons.length ? `Based on: ${r.reasons.join(", ")}.` : "You don't have extra risk factors. Standard advice applies."}</p>

      ${controlText ? `
        <div class="quiz-control" style="border-left-color: ${controlText[1]};">
          <strong style="color: ${controlText[1]};"><i class="fa-solid fa-lungs"></i> Asthma: ${controlText[0]}</strong>
          <span>${controlText[2]}</span>
        </div>` : ""}

      <ul class="quiz-summary">
        <li><i class="fa-solid fa-sliders"></i> Advice will treat today's air as about <strong>${Math.round((r.factor - 1) * 100)}% worse</strong> than the number shows${r.exertionFactor > r.factor ? `, more during exercise` : ""}.</li>
        <li><i class="fa-solid fa-clock"></i> Clean hours for you are AQI <strong>${r.cleanLimit}</strong> or lower.</li>
        <li><i class="fa-solid fa-bell"></i> Suggested alert limit: AQI <strong>${r.alertThreshold}</strong>.</li>
      </ul>

      <label class="check-row quiz-alert-opt"><input type="checkbox" id="quizEnableAlerts" ${state.alerts?.enabled && state.alerts.threshold === r.alertThreshold ? "checked disabled" : "checked"}> Turn on alerts at AQI ${r.alertThreshold}</label>

      <p class="quiz-disclaimer"><i class="fa-solid fa-circle-info"></i> This is general guidance, not medical advice. Always follow your doctor's or asthma action plan.</p>

      <div class="quiz-nav">
        <button class="btn-icon-text" id="quizBack"><i class="fa-solid fa-arrow-left"></i> Back</button>
        <button class="btn-icon-text btn-primary" id="quizSave"><i class="fa-solid fa-check"></i> Save my profile</button>
      </div>
    </div>`;

  document.getElementById("quizBack").addEventListener("click", () => {
    state.quizStep = visibleQuestions(state.quizDraft).length - 1;
    renderQuizStep();
  });
  document.getElementById("quizSave").addEventListener("click", () => saveQuiz(r));
}

function saveQuiz(result) {
  // Drop answers to questions that no longer apply (e.g. asthma unticked)
  const allowed = new Set(visibleQuestions(state.quizDraft).map(q => q.id));
  const answers = {};
  Object.keys(state.quizDraft).forEach(k => { if (allowed.has(k)) answers[k] = state.quizDraft[k]; });
  state.quiz = { answers, result, completedAt: Date.now() };
  storage.set("airwise_quiz", JSON.stringify(state.quiz));

  const enableAlerts = document.getElementById("quizEnableAlerts");
  if (enableAlerts?.checked && !enableAlerts.disabled && state.alerts) {
    state.alerts.enabled = true;
    state.alerts.threshold = result.alertThreshold;
    saveAlertSettings();
    state.alertMemory = {};
    saveAlertMemory();
    renderAlertButton();
    if (notificationPermission() === "default") Notification.requestPermission().catch(() => {});
  }

  applyPersonalProfile();
  closeQuiz();
  selectProfile("personal");
  renderPersonalPlan();
  if (state.aqiData && enableAlerts?.checked) checkAlertsForCurrent();
  showToast("Personal profile saved", "Advice across the dashboard is now tuned to you.", "success");
  document.getElementById("personalPlanCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetQuiz() {
  state.quiz = null;
  storage.remove("airwise_quiz");
  applyPersonalProfile();
  if (state.currentProfile === "personal") selectProfile("general");
  renderPersonalPlan();
  showToast("Personal profile removed", "", "info");
}

/* ---------- Personal plan card ---------- */

function personalTips(answers, result, aqi) {
  const c = answers.conditions || [];
  const effective = aqi * result.factor;
  const bad = effective > 100;
  const veryBad = effective > 150;
  const tips = [];
  const best = typeof getNext24Hours === "function"
    ? getNext24Hours().filter(h => h.aqi !== null).reduce((a, b) => (!a || b.aqi < a.aqi ? b : a), null)
    : null;

  if (c.includes("asthma")) {
    tips.push({ icon: "fa-spray-can", text: "Keep your reliever inhaler with you whenever you go out." });
    if (bad) tips.push({ icon: "fa-file-medical", text: "Follow your asthma action plan. If symptoms start, use your reliever and move indoors." });
    if (result.asthmaControl && result.asthmaControl !== "well") {
      tips.push({ icon: "fa-user-doctor", text: "Your last check-in suggested asthma isn't fully controlled. A treatment review with your doctor can help.", warn: true });
    }
  }
  if (c.includes("copd")) tips.push({ icon: "fa-lungs-virus", text: bad ? "Stay indoors where possible and keep your medicines close." : "Pace yourself outdoors and keep medicines close." });
  if (c.includes("heart")) tips.push({ icon: "fa-heart-pulse", text: bad ? "Avoid strenuous activity today. Seek help for chest pain, palpitations or unusual tiredness." : "Moderate activity is fine. Avoid heavy exertion near busy roads." });
  if (c.includes("pregnant")) tips.push({ icon: "fa-person-pregnant", text: bad ? "Limit time outside today and avoid busy roads." : "Choose routes away from heavy traffic when walking." });
  if (c.includes("allergies")) tips.push({ icon: "fa-head-side-cough", text: "Dust and particles can make allergy symptoms worse. Rinse your face and change clothes after long trips outside." });

  if (answers.activity === "regular" || answers.activity === "intense") {
    if (best) {
      tips.push({ icon: "fa-person-running", text: `Best time to train: around ${formatHourLabel(best.time, true)} (AQI ${Math.round(best.aqi)}).${effective > 100 ? " Consider an indoor session instead." : ""}` });
    }
  } else if (best && bad) {
    tips.push({ icon: "fa-clock", text: `If you need to go out, the cleanest hour is around ${formatHourLabel(best.time, true)}.` });
  }

  if (answers.outdoorHours === "high" && effective > 80) {
    tips.push({ icon: "fa-head-side-mask", text: "You spend a lot of time outside. A well-fitted N95 helps on commutes and outdoor shifts." });
  }
  if (answers.age === "child") tips.push({ icon: "fa-child", text: bad ? "Keep outdoor play short and calm today. Indoor games are a better choice." : "Outdoor play is fine. Avoid playing near busy roads." });
  if (answers.age === "senior" && bad) tips.push({ icon: "fa-person-cane", text: "Plan errands for the cleanest hour and rest often." });

  tips.push(veryBad
    ? { icon: "fa-house", text: "Keep windows shut and run an air purifier if you have one." }
    : bad
      ? { icon: "fa-window-maximize", text: "Open windows only briefly, during the cleanest hour." }
      : { icon: "fa-window-maximize", text: "Good time to air out your home." });

  return tips.slice(0, 6);
}

function renderPersonalPlan() {
  const card = document.getElementById("personalPlanCard");
  if (!card) return;
  const body = document.getElementById("personalPlanBody");
  const actions = document.getElementById("personalPlanActions");

  if (!state.quiz?.result) {
    actions.innerHTML = "";
    body.innerHTML = `
      <div class="plan-cta">
        <div class="plan-cta-icon"><i class="fa-solid fa-clipboard-question"></i></div>
        <div class="plan-cta-text">
          <h4>Get advice made for you</h4>
          <p>Answer a few quick questions about your health, including an asthma check, and AirWise will tune every recommendation to you.</p>
        </div>
        <button class="btn-icon-text btn-primary" data-open-quiz><i class="fa-solid fa-play"></i> Take the 1-minute quiz</button>
      </div>`;
    body.querySelector("[data-open-quiz]").addEventListener("click", openQuiz);
    return;
  }

  const { answers, result } = state.quiz;
  actions.innerHTML = `
    <button class="btn-icon-text btn-small" data-open-quiz><i class="fa-solid fa-rotate"></i> Retake</button>
    <button class="btn-icon-text btn-small" data-reset-quiz title="Remove personal profile"><i class="fa-solid fa-trash-can"></i></button>`;
  actions.querySelector("[data-open-quiz]").addEventListener("click", openQuiz);
  actions.querySelector("[data-reset-quiz]").addEventListener("click", resetQuiz);

  const aqi = typeof getCurrentAQI === "function" ? getCurrentAQI() : null;
  if (!isValidNumber(aqi)) {
    body.innerHTML = `<p class="quiz-help">Waiting for air quality data...</p>`;
    return;
  }

  const effective = Math.min(500, aqi * result.factor);
  const feel = getAQILevel(effective);
  const risk = effective <= 50 ? "Low" : effective <= 100 ? "Moderate" : effective <= 150 ? "High" : effective <= 200 ? "Very high" : "Severe";
  const tips = personalTips(answers, result, aqi);

  body.innerHTML = `
    <div class="plan-layout">
      <div class="plan-risk" style="--risk-color: ${feel.color}; --risk-text: ${feel.text};">
        <span class="plan-risk-label">Your risk right now</span>
        <span class="plan-risk-value">${risk}</span>
        <span class="plan-risk-sub">AQI ${Math.round(aqi)} affects you like <strong>${feel.value}</strong> would affect most people</span>
        <span class="plan-sens">Sensitivity: <strong>${result.level}</strong></span>
      </div>
      <ul class="plan-tips">
        ${tips.map(t => `<li class="${t.warn ? "plan-tip-warn" : ""}"><i class="fa-solid ${t.icon}"></i><span>${t.text}</span></li>`).join("")}
      </ul>
    </div>
    <p class="quiz-disclaimer"><i class="fa-solid fa-circle-info"></i> General guidance, not medical advice. Follow your doctor's or asthma action plan.</p>`;
}

function initPersonal() {
  applyPersonalProfile();
  const modal = document.getElementById("quizModal");
  document.getElementById("closeQuizModal").addEventListener("click", closeQuiz);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeQuiz(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("active")) closeQuiz(); });
  document.querySelectorAll("[data-open-quiz]").forEach(el => el.addEventListener("click", openQuiz));
  renderPersonalPlan();
}
