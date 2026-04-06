import { buildCommandCenterIntelligence, normalizeConstraints } from "./intelligence.js";
import {
  TOKENS,
  DOMAINS,
  COURSES,
  INITIAL_TASKS,
  SCHEDULE,
  GOALS,
  CHECKINS,
  NOTES,
  TOASTS,
  PIPELINE,
  SHIFTS,
  BILLS,
  CAREER_SKILLS,
  MILESTONES,
  MIND_INSIGHTS,
  DEFAULT_BUDGET,
  DEFAULT_PAYCHECKS,
  DEFAULT_CONSTRAINTS,
  DEFAULT_SOURCE_CONFIG,
} from "./apex-data.js";

const doc = typeof document !== "undefined" ? document : null;
const win = typeof window !== "undefined" ? window : null;
const storage =
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
      };

const STORAGE_KEY = "apex-universal-state";
const AUTO_SYNC_MS = 60 * 1000;
const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultSnapshot() {
  return {
    activeDomain: "command",
    sidebarCollapsed: false,
    tasks: clone(INITIAL_TASKS),
    courses: clone(COURSES),
    schedule: clone(SCHEDULE),
    bills: clone(BILLS),
    budget: clone(DEFAULT_BUDGET),
    paychecks: clone(DEFAULT_PAYCHECKS),
    constraints: clone(DEFAULT_CONSTRAINTS),
    sourceConfig: {
      ...clone(DEFAULT_SOURCE_CONFIG),
      remoteUrl: win && win.location.protocol.startsWith("http") ? "/api/source/live" : DEFAULT_SOURCE_CONFIG.remoteUrl,
    },
    subTabs: { academy: "grades", works: "shifts" },
    toast: null,
    toastIndex: 0,
    noteSearch: "",
    activeNoteId: NOTES[0]?.id || null,
    brainDump: "",
    processedDump: null,
    checkin: { energy: 0, focus: 0, mood: 0, submitted: false },
  };
}

function loadState() {
  const defaults = defaultSnapshot();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    return {
      ...defaults,
      activeDomain: saved.activeDomain || defaults.activeDomain,
      sidebarCollapsed: Boolean(saved.sidebarCollapsed),
      tasks: Array.isArray(saved.tasks) ? saved.tasks : defaults.tasks,
      courses: Array.isArray(saved.courses) ? saved.courses : defaults.courses,
      schedule: Array.isArray(saved.schedule) ? saved.schedule : defaults.schedule,
      bills: Array.isArray(saved.bills) ? saved.bills : defaults.bills,
      budget: { ...defaults.budget, ...(saved.budget || {}) },
      paychecks: Array.isArray(saved.paychecks) ? saved.paychecks : defaults.paychecks,
      constraints: normalizeConstraints(saved.constraints),
      sourceConfig: { ...defaults.sourceConfig, ...(saved.sourceConfig || {}) },
      subTabs: { ...defaults.subTabs, ...(saved.subTabs || {}) },
      toastIndex: Number(saved.toastIndex) || 0,
      noteSearch: saved.noteSearch || "",
      activeNoteId: saved.activeNoteId ?? defaults.activeNoteId,
      brainDump: saved.brainDump || "",
      processedDump: saved.processedDump || null,
      checkin: { ...defaults.checkin, ...(saved.checkin || {}) },
    };
  } catch {
    return defaults;
  }
}

const state = {
  ...loadState(),
  toastTimer: null,
  syncTimer: null,
};

const app = doc?.querySelector("#app") || null;
const colorFor = (domain) => TOKENS[domain] || TOKENS.command;
const activeDomain = () => DOMAINS.find((domain) => domain.id === state.activeDomain);
const getIntel = (now = new Date()) =>
  buildCommandCenterIntelligence({
    now,
    tasks: state.tasks,
    schedule: state.schedule,
    courses: state.courses,
    bills: state.bills,
    checkin: state.checkin,
    constraints: state.constraints,
    budget: state.budget,
    paychecks: state.paychecks,
  });
const formatToday = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const meter = (percent, accent) => `<div class="meter"><div class="meter-fill" style="width:${percent}%; --accent:${accent};"></div></div>`;
const pill = (label, accent) => `<span class="pill" style="--pill:${accent};">${label}</span>`;
const tabButton = (group, value, active, accent) => `<button class="domain-tab ${active === value ? "is-active" : ""}" data-tab-group="${group}" data-tab-value="${value}" style="--accent:${accent};">${value}</button>`;
const sparkBars = (values, accent) => {
  const max = Math.max(...values, 1);
  return `<div class="spark-bars">${values.map((value, index) => `<span style="height:${Math.max(14, (value / max) * 100)}%; --accent:${accent}; --index:${index + 1};"></span>`).join("")}</div>`;
};

function gauge(value, accent, label, subtitle = "") {
  return `<div class="gauge"><div class="gauge-ring" style="--value:${value}; --accent:${accent};"><strong>${value}%</strong></div><div class="gauge-copy"><span>${label}</span>${subtitle ? `<small class="muted">${subtitle}</small>` : ""}</div></div>`;
}

function saveState() {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeDomain: state.activeDomain,
      sidebarCollapsed: state.sidebarCollapsed,
      tasks: state.tasks,
      courses: state.courses,
      schedule: state.schedule,
      bills: state.bills,
      budget: state.budget,
      paychecks: state.paychecks,
      constraints: state.constraints,
      sourceConfig: state.sourceConfig,
      subTabs: state.subTabs,
      toastIndex: state.toastIndex,
      noteSearch: state.noteSearch,
      activeNoteId: state.activeNoteId,
      brainDump: state.brainDump,
      processedDump: state.processedDump,
      checkin: state.checkin,
    }),
  );
}

function rerender() {
  saveState();
  renderApp();
}

function pushToast(message) {
  state.toast = message;
  renderToast();
}

function renderToast() {
  if (!doc?.body) return;
  let toast = doc.querySelector("[data-toast-root]");
  if (!state.toast) {
    toast?.remove();
    return;
  }
  if (!toast) {
    toast = doc.createElement("div");
    toast.setAttribute("data-toast-root", "");
    doc.body.appendChild(toast);
  }
  toast.className = "toast";
  toast.style.setProperty("--accent", colorFor(state.activeDomain));
  toast.innerHTML = `<strong>APEX</strong><span>${escapeHtml(state.toast)}</span><button aria-label="Dismiss notification" data-dismiss-toast>&times;</button>`;
}

function formatHourLabel(hour) {
  const normalized = hour % 12 || 12;
  return `${normalized}:00 ${hour >= 12 ? "PM" : "AM"}`;
}

function formatTimestamp(value) {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status) {
  if (status === "ready") return TOKENS.ok;
  if (status === "syncing") return TOKENS.command;
  if (status === "error") return TOKENS.danger;
  return TOKENS.notebook;
}

function burnoutRisk(intel) {
  const energyPenalty = state.checkin.submitted ? (6 - state.checkin.energy) * 4 + (6 - state.checkin.mood) * 2 : 10;
  return Math.max(18, Math.min(88, Math.round(intel.loadScore * 0.44 + energyPenalty)));
}

function taskMarkup(task) {
  return `<button class="task-item ${task.done ? "is-done" : ""} ${task.urgent && !task.done ? "is-urgent" : ""}" data-task-id="${task.id}" style="--accent:${colorFor(task.domain)};"><span class="check">${task.done ? "&#10003;" : ""}</span><span class="task-copy"><span class="task-title">${task.title}</span><span class="task-due">${task.due}${task.course ? ` &middot; ${task.course}` : ""}</span></span>${task.urgent && !task.done ? pill("urgent", TOKENS.danger) : ""}</button>`;
}

function heroBand(intel) {
  const domain = activeDomain();
  const titles = {
    command: ["Life operating system", "One command deck for school, work, money, recovery, and long-range ambition."],
    academy: ["Academic kernel", "Grades, deadlines, and study quality in one adaptive loop."],
    works: ["Operational income", "See shifts, interviews, and work pressure in the same planning engine."],
    life: ["Home + finance", "Bills and routines stay visible before they become background stress."],
    future: ["Trajectory", "Translate long-term ambition into repeatable weekly motion."],
    mind: ["Load awareness", "Energy, focus, and mood shape the plan instead of getting ignored."],
    notebook: ["Source-grounded memory", "Turn scattered notes and brain dumps into grounded action."],
  }[domain.id];
  return `<section class="hero-band" style="--accent:${colorFor(domain.id)};"><div class="hero-copy"><div class="eyebrow"><span>${domain.icon}</span><span>${titles[0]}</span></div><h3>${titles[1]}</h3><p>APEX treats overwhelm as a systems problem. Hard constraints stay visible, the schedule is solver-backed, and live data can update the day without code edits.</p><div class="hero-actions"><button class="primary-action" data-focus-top>Focus now</button><button class="surface-action" data-domain="notebook">Inspect context</button>${pill(intel.loadScore >= 70 ? "stabilize mode" : "balanced mode", intel.loadScore >= 70 ? TOKENS.warn : colorFor(domain.id))}</div></div><div class="hero-stats"><div class="hero-stat"><span>Load Index</span><strong>${intel.loadScore}%</strong></div><div class="hero-stat"><span>Urgent Open</span><strong>${intel.openUrgentCount}</strong></div><div class="hero-stat"><span>Solver Fit</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="hero-stat"><span>Guardrails</span><strong>${intel.solverSummary.hardGuardrails}</strong></div></div></section>`;
}

function renderConstraintPanel(intel) {
  const hard = intel.constraintsUsed.hard;
  const soft = intel.constraintsUsed.soft;
  return `<article class="panel span-6" style="--accent:${TOKENS.command};"><div class="panel-label">constraint studio</div><div class="control-grid"><div class="control-card"><div class="subtle-label">Hard guardrails</div><div class="toggle-grid">${[
    ["lockClasses", "Lock classes"],
    ["lockWorkShifts", "Lock work shifts"],
    ["protectRecoveryBlocks", "Protect recovery"],
  ].map(([key, label]) => `<button class="toggle-chip ${hard[key] ? "is-active" : ""}" data-constraint-toggle-group="hard" data-constraint-toggle-key="${key}" style="--accent:${TOKENS.command};"><span>${label}</span><strong>${hard[key] ? "On" : "Off"}</strong></button>`).join("")}</div><div class="field-stack">${[
    ["minSleepHours", "Minimum sleep", hard.minSleepHours, 6, 9, 1, `${hard.minSleepHours}h`],
    ["windDownHour", "Wind-down hour", hard.windDownHour, 20, 24, 1, formatHourLabel(hard.windDownHour)],
    ["maxFocusBlockMinutes", "Max focus block", hard.maxFocusBlockMinutes, 30, 120, 15, `${hard.maxFocusBlockMinutes}m`],
  ].map(([key, label, value, min, max, step, display]) => `<label class="field-shell"><div class="field-row"><span>${label}</span><strong>${display}</strong></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-constraint-range-group="hard" data-constraint-range-key="${key}" /></label>`).join("")}</div></div><div class="control-card"><div class="subtle-label">Soft preferences</div><div class="field-stack">${[
    ["morningFocusBias", "Morning focus bias", soft.morningFocusBias],
    ["lowEnergyProtection", "Low-energy protection", soft.lowEnergyProtection],
    ["keepEveningLight", "Keep evenings light", soft.keepEveningLight],
    ["protectFutureWork", "Protect future work", soft.protectFutureWork],
    ["batchShallowWork", "Batch shallow work", soft.batchShallowWork],
  ].map(([key, label, value]) => `<label class="field-shell"><div class="field-row"><span>${label}</span><strong>${value}/8</strong></div><input type="range" min="0" max="8" step="1" value="${value}" data-constraint-range-group="soft" data-constraint-range-key="${key}" /></label>`).join("")}</div><div class="hero-actions"><button class="surface-action" data-reset-constraints>Reset defaults</button></div></div></div><div class="footer-note">Hard rules change feasibility. Soft rules tell the solver which valid option feels most like your actual operating style.</div></article>`;
}

function renderSourcePanel() {
  const source = state.sourceConfig;
  return `<article class="panel span-6" style="--accent:${TOKENS.notebook};"><div class="panel-label">live data sources</div><div class="source-shell"><label class="field-shell"><div class="field-row"><span>Remote JSON URL</span><strong>${source.lastSyncStatus}</strong></div><input class="search-input" type="url" value="${escapeHtml(source.remoteUrl)}" placeholder="https://example.com/apex.json" data-source-url /></label><div class="source-actions"><button class="surface-action" data-use-local-source>Use local live source</button>${pill("/api/source/live", TOKENS.command)}</div><div class="field-row"><span>Auto-sync every minute</span><button class="toggle-chip ${source.autoSync ? "is-active" : ""}" data-source-toggle="autoSync" style="--accent:${TOKENS.command};"><strong>${source.autoSync ? "On" : "Off"}</strong></button></div><div class="source-actions"><button class="primary-action" data-sync-source>Sync now</button><button class="surface-action" data-reset-source>Status reset</button>${pill(source.lastSyncStatus, statusTone(source.lastSyncStatus))}</div><div class="meta-grid"><div class="metric-stack"><span>Last sync</span><strong>${formatTimestamp(source.lastSyncAt)}</strong></div><div class="metric-stack"><span>Error</span><strong>${escapeHtml(source.lastError || "None")}</strong></div></div><label class="field-shell"><div class="field-row"><span>Manual payload</span><strong>JSON merge</strong></div><textarea class="brain-dump source-draft" placeholder='{"tasks":[...],"constraints":{"soft":{"keepEveningLight":7}}}' data-source-draft>${escapeHtml(source.draftPayload)}</textarea></label><div class="source-actions"><button class="primary-action" data-apply-source>Apply payload</button></div></div><div class="footer-note">Supported keys: <code>tasks</code>, <code>courses</code>, <code>schedule</code>, <code>bills</code>, <code>budget</code>, <code>paychecks</code>, <code>checkin</code>, and <code>constraints</code>. The bundled local server also exposes calendar, LMS, and webhook routes behind this source path.</div></article>`;
}

function renderCommand(intel) {
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const dayIndex = intel.generatedAt.getDay();
  const topCourse = intel.courseInsights.slice().sort((a, b) => b.riskScore - a.riskScore)[0];
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid"><article class="panel span-8" style="--accent:${TOKENS.command};"><div class="panel-label">intelligence briefing</div><div class="list-rows">${intel.topPriorities.map((task, index) => `<div class="row is-hot" style="--accent:${colorFor(task.domain)};"><div class="row-badge">${index + 1}</div><div class="row-copy"><div class="row-title">${task.title}</div><div class="row-subtitle">Due ${task.due} &middot; ${task.reason}</div></div>${pill(task.domain, colorFor(task.domain))}</div>`).join("")}</div><div class="system-note" style="margin-top:1rem;">This stack is now driven by live task scoring plus the current constraint profile. Change the rules, and these priorities recompute.</div></article><article class="panel span-4" style="--accent:${intel.solverSummary.unscheduledUrgentCount ? TOKENS.danger : TOKENS.ok};"><div class="panel-label">solver summary</div><div class="solver-grid"><div class="metric-stack"><span>Scheduled</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="metric-stack"><span>Capacity</span><strong>${intel.solverSummary.flexibleCapacityMinutes}m</strong></div><div class="metric-stack"><span>Urgent unscheduled</span><strong>${intel.solverSummary.unscheduledUrgentCount}</strong></div><div class="metric-stack"><span>Search score</span><strong>${intel.solverSummary.score}</strong></div></div><div class="footer-note">${intel.solverSummary.unscheduledMinutes ? `${intel.solverSummary.unscheduledMinutes} minutes remain unscheduled under the current rules.` : "Every active chunk currently fits inside the remaining day."}</div></article><article class="panel span-4" style="--accent:${TOKENS.command};"><div class="panel-label">capacity gauge</div>${gauge(intel.loadScore, TOKENS.command, "load index", intel.loadLabel === "stabilize" ? "stabilize plan active" : intel.loadLabel)}<div class="mini-breakdown">${intel.domainLoads.map((item) => `<div><div class="label-row"><span>${item.label}</span><span>${item.pct}%</span></div>${meter(item.pct, colorFor(item.domain))}</div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.academy};"><div class="panel-label">gpa tracker</div><div class="kpi"><div class="kpi-value accent-text">3.47</div><div class="kpi-copy"><div>Current GPA</div><div class="${topCourse?.status === "at-risk" ? "trend-down" : "trend-up"}">${topCourse?.status === "at-risk" ? "Watch " : "Stable "}${topCourse?.name || "semester profile"}</div></div></div>${sparkBars(state.courses.map((course) => course.grade / 10), TOKENS.academy)}<div class="section-list" style="margin-top:0.95rem;">${intel.courseInsights.map((course) => `<div class="meta-row"><span>${course.name}</span><strong style="color:${course.status === "at-risk" ? TOKENS.danger : course.status === "watch" ? TOKENS.warn : TOKENS.ok};">${course.grade}%</strong></div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.danger};"><div class="panel-label">conflict engine</div><div class="stack-list">${intel.conflicts.map((conflict) => `<div class="row" style="--accent:${conflict.severity === "crit" ? TOKENS.danger : conflict.severity === "warn" ? TOKENS.warn : TOKENS.command}; align-items:flex-start;"><div class="row-badge">${conflict.severity === "crit" ? "!" : conflict.severity === "warn" ? "~" : "i"}</div><div class="row-copy"><div class="row-title">${conflict.title}</div><div class="row-subtitle">${conflict.text}</div></div><button class="small-action">${conflict.action}</button></div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.notebook};"><div class="panel-label">this week</div><div class="calendar-grid">${dayLabels.map((label, index) => { const day = intel.weeklyOutlook[index]; const level = day.level === "high" ? TOKENS.danger : day.level === "medium" ? TOKENS.warn : TOKENS.ok; return `<div class="day-card ${index === dayIndex ? "is-today" : ""}" style="--accent:${level};"><small class="muted">${label}</small><strong>${day.date.getDate()}</strong><div class="dot-stack"><span style="background:${level};"></span><span style="background:${level}; opacity:.65;"></span><span style="background:${level}; opacity:.35;"></span></div></div>`; }).join("")}</div><div class="footer-note" style="margin-top:0.95rem;">Peak pressure day: ${intel.hottestDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}. The weekly view is driven by deadlines, exams, and bills.</div></article><article class="panel span-12" style="--accent:${TOKENS.future};"><div class="panel-label">next best moves</div><div class="courses-grid">${intel.recommendations.map((item) => `<article class="note-card"><h4>${item.title}</h4><p class="row-subtitle" style="margin-top:0.7rem;">${item.text}</p><div style="margin-top:0.8rem;">${pill(DOMAINS.find((domain) => domain.id === item.accent)?.label || item.accent, colorFor(item.accent))}</div></article>`).join("")}</div></article>${renderConstraintPanel(intel)}${renderSourcePanel()}<article class="panel span-12" style="--accent:${TOKENS.command};"><div class="panel-label">optimized schedule</div><div class="schedule-strip schedule-strip--solver">${intel.schedulePlan.map((item) => `<div class="schedule-block" style="--accent:${colorFor(item.domain)};"><div class="schedule-time">${item.time}</div><strong>${item.label}</strong><div class="row-subtitle" style="margin-top:0.45rem;">${item.note}</div><div style="margin-top:0.65rem;">${pill(item.status || item.kind, item.status === "locked" ? TOKENS.notebook : item.status === "assigned" ? colorFor(item.domain) : TOKENS.warn)}</div><div class="assignment-list">${item.assignments?.length ? item.assignments.map((assignment) => `<div class="assignment-pill"><span>${assignment.title}</span><strong>${assignment.minutes}m</strong></div>`).join("") : `<div class="empty-assignment">${item.status === "locked" ? "Reserved" : "No task assigned"}</div>`}</div><div class="row-subtitle">Remaining: ${item.remainingMinutes ?? 0}m</div></div>`).join("")}</div></article></div></section>`;
}

function simpleListPanel(title, accent, rows) {
  return `<article class="panel span-12" style="--accent:${accent};"><div class="panel-label">${title}</div><div class="section-list">${rows}</div></article>`;
}

function renderAcademy(intel) {
  const tab = state.subTabs.academy;
  const grades = state.courses.map((course) => `<div class="row" style="--accent:${course.color || TOKENS.academy};"><div class="row-copy"><div class="row-title">${course.name}</div><div class="row-subtitle">${course.code} &middot; ${course.platform || course.plat || ""}</div></div><strong style="color:${course.grade >= course.target ? TOKENS.ok : TOKENS.warn};">${course.grade}%</strong></div>`).join("");
  const planner = intel.schedulePlan.filter((item) => item.domain === "academy").map((item) => `<div class="row" style="--accent:${TOKENS.academy};"><div class="row-badge mono">${item.time}</div><div class="row-copy"><div class="row-title">${item.label}</div><div class="row-subtitle">${item.note}</div></div></div>`).join("");
  const courses = state.tasks.filter((task) => task.domain === "academy").map((task) => taskMarkup(task)).join("");
  return `<section class="section-shell">${heroBand(intel)}<div class="tab-strip" style="--accent:${TOKENS.academy};">${tabButton("academy", "grades", tab, TOKENS.academy)}${tabButton("academy", "planner", tab, TOKENS.academy)}${tabButton("academy", "courses", tab, TOKENS.academy)}</div>${tab === "grades" ? simpleListPanel("grades", TOKENS.academy, grades) : ""}${tab === "planner" ? simpleListPanel("study plan", TOKENS.academy, planner) : ""}${tab === "courses" ? simpleListPanel("deadlines", TOKENS.warn, courses) : ""}</section>`;
}

function renderWorks(intel) {
  const tab = state.subTabs.works;
  const shifts = SHIFTS.map((shift) => `<div class="row" style="--accent:${TOKENS.works};"><div class="row-badge">${shift.day}</div><div class="row-copy"><div class="row-title">${shift.hours}</div><div class="row-subtitle">Campus Research Lab</div></div>${pill(`$${shift.pay}`, TOKENS.works)}</div>`).join("");
  const tasks = state.tasks.filter((task) => task.domain === "works").map((task) => taskMarkup(task)).join("");
  const pipeline = PIPELINE.map((item) => `<div class="row" style="--accent:${item.color};"><div class="row-copy"><div class="row-title">${item.company} - ${item.role}</div><div class="row-subtitle">${item.note}</div></div>${pill(item.stage, item.color)}</div>`).join("");
  return `<section class="section-shell">${heroBand(intel)}<div class="tab-strip" style="--accent:${TOKENS.works};">${tabButton("works", "shifts", tab, TOKENS.works)}${tabButton("works", "tasks", tab, TOKENS.works)}${tabButton("works", "pipeline", tab, TOKENS.works)}</div>${tab === "shifts" ? simpleListPanel("shifts", TOKENS.works, shifts) : ""}${tab === "tasks" ? simpleListPanel("tasks", TOKENS.works, tasks) : ""}${tab === "pipeline" ? simpleListPanel("pipeline", TOKENS.future, pipeline) : ""}</section>`;
}

function renderLife(intel) {
  const bills = intel.billInsights.map((bill) => `<div class="row ${bill.daysUntilDue !== null && bill.daysUntilDue <= 3 ? "is-hot" : ""}" style="--accent:${bill.covered ? TOKENS.warn : TOKENS.danger};"><div class="row-copy"><div class="row-title">${bill.name}</div><div class="row-subtitle">Due ${bill.due} &middot; ${bill.covered ? "covered" : "needs attention"}</div></div><strong>${bill.amount}</strong></div>`).join("");
  const budget = `<div class="row"><div class="row-copy"><div class="row-title">Monthly budget</div><div class="row-subtitle">Income ${state.budget.income} &middot; Left ${state.budget.left}</div></div>${pill(`$${state.budget.left}`, TOKENS.life)}</div>`;
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("budget snapshot", TOKENS.life, budget)}${simpleListPanel("bills due", TOKENS.warn, bills)}${simpleListPanel("personal tasks", TOKENS.life, state.tasks.filter((task) => task.domain === "life").map((task) => taskMarkup(task)).join(""))}</div></section>`;
}

function renderFuture(intel) {
  const goals = GOALS.map((goal) => `<div class="row" style="--accent:${colorFor(goal.domain)};"><div class="row-copy"><div class="row-title">${goal.title}</div><div class="row-subtitle">${goal.done}/${goal.tasks} complete</div></div><strong>${goal.pct}%</strong></div>`).join("");
  const milestones = MILESTONES.map((milestone) => `<div class="row ${milestone.hot ? "is-hot" : ""}" style="--accent:${milestone.hot ? TOKENS.future : TOKENS.notebook};"><div class="row-copy"><div class="row-title">${milestone.label}</div><div class="row-subtitle">${milestone.hot ? "High urgency" : "Forward-looking checkpoint"}</div></div><strong>${milestone.date}</strong></div>`).join("");
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("goals", TOKENS.future, goals)}${simpleListPanel("milestones", TOKENS.future, milestones)}</div></section>`;
}

function renderMind(intel) {
  const form = !state.checkin.submitted
    ? `<div class="slider-group">${[{ key: "energy", label: "Energy level" }, { key: "focus", label: "Focus confidence" }, { key: "mood", label: "Mood" }].map((field) => `<div class="slider-row"><strong>${field.label}</strong><div class="slider-values">${[1, 2, 3, 4, 5].map((value) => `<button class="score-button ${state.checkin[field.key] === value ? "is-active" : ""}" data-score-field="${field.key}" data-score-value="${value}" style="--accent:${TOKENS.mind};">${value}</button>`).join("")}</div></div>`).join("")}</div><button class="primary-action" data-submit-checkin style="margin-top:1rem;">Submit check-in</button>`
    : `<div class="processing-result"><div class="footer-note">Check-in logged. The kernel softened the next 24 hours because energy and focus are real scheduling inputs.</div><button class="surface-action" data-reset-checkin>Check in again</button></div>`;
  const insights = MIND_INSIGHTS.map((item) => `<div class="row"><div class="row-badge">${item.icon}</div><div class="row-copy"><div class="row-title">${item.title}</div><div class="row-subtitle">${item.body}</div></div></div>`).join("");
  const risk = burnoutRisk(intel);
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid"><article class="panel span-5" style="--accent:${TOKENS.mind};"><div class="panel-label">daily check-in</div>${form}</article><article class="panel span-3" style="--accent:${TOKENS.notebook};"><div class="panel-label">burnout risk</div>${gauge(risk, risk > 55 ? TOKENS.warn : TOKENS.ok, "burnout risk", risk > 55 ? "load softening recommended" : "stable")}</article>${simpleListPanel("apex mind intelligence", TOKENS.mind, insights)}</div></section>`;
}

function renderNotebook(intel) {
  const filtered = NOTES.filter((note) => { const search = state.noteSearch.trim().toLowerCase(); return !search || note.title.toLowerCase().includes(search) || note.domain.toLowerCase().includes(search) || note.tags.some((tag) => tag.toLowerCase().includes(search)); });
  const activeNote = NOTES.find((note) => note.id === state.activeNoteId) || filtered[0] || null;
  return `<section class="section-shell">${heroBand(intel)}<div class="notebook-layout"><aside class="panel panel--quiet" style="--accent:${TOKENS.notebook};"><div class="panel-label">search notes</div><input class="search-input" type="search" placeholder="Search all notes..." value="${escapeHtml(state.noteSearch)}" data-note-search /><div class="note-list" style="margin-top:1rem;">${filtered.map((note) => `<button class="note-button ${note.id === state.activeNoteId ? "is-active" : ""}" data-note-id="${note.id}" style="--accent:${colorFor(note.domain)};"><strong>${note.title}</strong><small>${note.updated} &middot; ${note.domain}</small></button>`).join("")}</div></aside><div class="section-shell"><article class="panel" style="--accent:${activeNote ? colorFor(activeNote.domain) : TOKENS.notebook};">${activeNote ? `<div class="section-list"><div><div class="panel-label">${DOMAINS.find((domain) => domain.id === activeNote.domain)?.icon || "&#8226;"} ${activeNote.domain}</div><h3 style="margin:0; font-family:Syne,system-ui,sans-serif; font-size:1.9rem;">${activeNote.title}</h3><div class="inline-chips" style="margin-top:0.9rem;">${activeNote.tags.map((tag) => pill(`#${tag}`, TOKENS.notebook)).join("")}</div></div><div class="note-content">${activeNote.summary}</div></div>` : `<div class="footer-note">No notes match that search yet.</div>`}</article><article class="panel" style="--accent:${TOKENS.command};"><div class="panel-label">brain dump</div>${!state.processedDump ? `<textarea class="brain-dump" placeholder="Type anything: study thermo, email professor, pay rent, prep Friday quiz..." data-brain-dump>${escapeHtml(state.brainDump)}</textarea><div class="hero-actions"><button class="primary-action" data-process-dump>Process + sort</button></div>` : `<div class="processing-result"><div class="row is-hot" style="--accent:${TOKENS.ok};"><div class="row-badge">&#10003;</div><div class="row-copy"><div class="row-title">Dump routed into ${state.processedDump.domains.length} dashboards</div><div class="row-subtitle">${state.processedDump.summary}</div></div></div><div class="inline-chips">${state.processedDump.domains.map((domain) => pill(domain, colorFor(domain.toLowerCase()))).join("")}</div><button class="surface-action" data-clear-dump>New dump</button></div>`}</article></div></div></section>`;
}

function renderContent(intel) {
  switch (state.activeDomain) {
    case "academy": return renderAcademy(intel);
    case "works": return renderWorks(intel);
    case "life": return renderLife(intel);
    case "future": return renderFuture(intel);
    case "mind": return renderMind(intel);
    case "notebook": return renderNotebook(intel);
    default: return renderCommand(intel);
  }
}

function renderApp() {
  if (!app) return;
  const domain = activeDomain();
  const intel = getIntel();
  app.innerHTML = `<div class="app-shell" style="--accent:${colorFor(domain.id)};"><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><aside class="sidebar ${state.sidebarCollapsed ? "is-collapsed" : ""}"><div class="brand"><div class="brand-mark">&#9889;</div><div class="brand-copy"><h1>APEX</h1><p>Universal 2.0</p></div></div><nav class="sidebar-nav">${DOMAINS.map((item) => `<button class="nav-button ${state.activeDomain === item.id ? "is-active" : ""}" data-domain="${item.id}" style="--accent:${colorFor(item.id)};"><span class="nav-icon">${item.icon}</span><span class="nav-copy"><strong>${item.label}</strong><span>${item.blurb}</span></span></button>`).join("")}</nav><div class="sidebar-footer"><button class="collapse-button" data-collapse-sidebar><span>${state.sidebarCollapsed ? "&#9654;" : "&#9664;"}</span><span>${state.sidebarCollapsed ? "Expand" : "Collapse"}</span></button></div></aside><main class="main"><header class="topbar"><div class="topbar-title"><div class="topbar-icon">${domain.icon}</div><div class="topbar-copy"><h2>APEX ${domain.label}</h2><p>${formatToday()} &middot; Life OS command deck</p></div></div><div class="topbar-metrics"><div class="metric-pill"><span class="metric-dot"></span><span>Load</span><strong>${intel.loadScore}%</strong></div><div class="metric-pill"><span class="metric-dot" style="background:${TOKENS.command};"></span><span>Solver</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="metric-pill"><span class="metric-dot" style="background:${statusTone(state.sourceConfig.lastSyncStatus)};"></span><span>Source</span><strong>${state.sourceConfig.lastSyncStatus}</strong></div><div class="mini-domain-rail">${DOMAINS.filter((item) => item.id !== "command").map((item) => `<button class="stat-dot-button ${item.id === state.activeDomain ? "is-active" : ""}" data-domain="${item.id}" style="--dot:${colorFor(item.id)};" title="${item.label}" aria-label="Open ${item.label}"></button>`).join("")}</div></div></header><div class="content">${renderContent(intel)}</div></main></div>`;
  renderToast();
}

function processBrainDump(text) {
  const lower = text.toLowerCase();
  const matches = new Set();
  if (/(study|quiz|exam|class|prof|syllabus|calc|orgo|statics)/.test(lower)) matches.add("Academy");
  if (/(interview|resume|shift|github|portfolio|job|lab|work)/.test(lower)) matches.add("Works");
  if (/(rent|budget|grocery|bill|phone|electric|laundry|home)/.test(lower)) matches.add("Life");
  if (/(future|vision|career|internship|leetcode|project|goal)/.test(lower)) matches.add("Future");
  if (/(sleep|journal|mood|rest|burnout|therapy|energy)/.test(lower)) matches.add("Mind");
  if (!matches.size) matches.add("Notebook");
  return { domains: [...matches], summary: "The capture was interpreted as actions, reminders, and context objects that can be scheduled or summarized later." };
}

function updateConstraint(group, key, value) {
  state.constraints = normalizeConstraints({
    ...state.constraints,
    [group]: {
      ...state.constraints[group],
      [key]: value,
    },
  });
  rerender();
}

function applySourcePayload(rawPayload, origin = "manual payload") {
  const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  const payload = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  const applied = [];

  if (Array.isArray(payload.tasks)) {
    state.tasks = payload.tasks;
    applied.push("tasks");
  }
  if (Array.isArray(payload.courses)) {
    state.courses = payload.courses;
    applied.push("courses");
  }
  if (Array.isArray(payload.schedule)) {
    state.schedule = payload.schedule;
    applied.push("schedule");
  }
  if (Array.isArray(payload.bills)) {
    state.bills = payload.bills;
    applied.push("bills");
  }
  if (Array.isArray(payload.paychecks)) {
    state.paychecks = payload.paychecks;
    applied.push("paychecks");
  }
  if (payload.budget && typeof payload.budget === "object") {
    state.budget = { ...state.budget, ...payload.budget };
    applied.push("budget");
  }
  if (payload.checkin && typeof payload.checkin === "object") {
    state.checkin = { ...state.checkin, ...payload.checkin };
    applied.push("checkin");
  }
  if (payload.constraints && typeof payload.constraints === "object") {
    state.constraints = normalizeConstraints({
      hard: { ...state.constraints.hard, ...(payload.constraints.hard || {}) },
      soft: { ...state.constraints.soft, ...(payload.constraints.soft || {}) },
    });
    applied.push("constraints");
  }

  if (!applied.length) {
    throw new Error("Payload did not contain any supported APEX keys.");
  }

  state.sourceConfig = {
    ...state.sourceConfig,
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: "ready",
    lastError: "",
  };
  rerender();
  pushToast(`${origin} applied: ${applied.join(", ")}.`);
}

async function syncRemoteSource() {
  if (!state.sourceConfig.remoteUrl.trim()) {
    pushToast("Add a remote JSON URL before syncing.");
    return;
  }
  state.sourceConfig = {
    ...state.sourceConfig,
    lastSyncStatus: "syncing",
    lastError: "",
  };
  rerender();
  try {
    const remoteUrl = state.sourceConfig.remoteUrl.trim();
    const requestUrl = remoteUrl.includes("/api/source/live")
      ? `${remoteUrl}${remoteUrl.includes("?") ? "&" : "?"}refresh=1`
      : remoteUrl;
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Remote source returned ${response.status}.`);
    const text = await response.text();
    applySourcePayload(text, "remote sync");
  } catch (error) {
    state.sourceConfig = {
      ...state.sourceConfig,
      lastSyncStatus: "error",
      lastError: error instanceof Error ? error.message : "Unknown sync error",
    };
    rerender();
    pushToast("Remote sync failed. Check the source panel for details.");
  }
}

doc?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const domainButton = target.closest("[data-domain]");
  if (domainButton) { state.activeDomain = domainButton.dataset.domain; rerender(); return; }
  if (target.closest("[data-collapse-sidebar]")) { state.sidebarCollapsed = !state.sidebarCollapsed; rerender(); return; }
  const tab = target.closest("[data-tab-group]");
  if (tab) { state.subTabs[tab.dataset.tabGroup] = tab.dataset.tabValue; rerender(); return; }
  const task = target.closest("[data-task-id]");
  if (task) { const id = Number(task.dataset.taskId); state.tasks = state.tasks.map((item) => item.id === id ? { ...item, done: !item.done } : item); rerender(); return; }
  const noteButton = target.closest("[data-note-id]");
  if (noteButton) { state.activeNoteId = Number(noteButton.dataset.noteId); rerender(); return; }
  const score = target.closest("[data-score-field]");
  if (score) { state.checkin[score.dataset.scoreField] = Number(score.dataset.scoreValue); rerender(); return; }
  const toggle = target.closest("[data-constraint-toggle-key]");
  if (toggle) { updateConstraint(toggle.dataset.constraintToggleGroup, toggle.dataset.constraintToggleKey, !state.constraints[toggle.dataset.constraintToggleGroup][toggle.dataset.constraintToggleKey]); return; }
  if (target.closest("[data-reset-constraints]")) { state.constraints = clone(DEFAULT_CONSTRAINTS); rerender(); return; }
  if (target.closest("[data-source-toggle='autoSync']")) { state.sourceConfig = { ...state.sourceConfig, autoSync: !state.sourceConfig.autoSync }; rerender(); scheduleAutoSync(); return; }
  if (target.closest("[data-use-local-source]")) { state.sourceConfig = { ...state.sourceConfig, remoteUrl: "/api/source/live" }; rerender(); scheduleAutoSync(); return; }
  if (target.closest("[data-apply-source]")) { try { applySourcePayload(state.sourceConfig.draftPayload, "manual payload"); } catch (error) { state.sourceConfig = { ...state.sourceConfig, lastSyncStatus: "error", lastError: error instanceof Error ? error.message : "Invalid payload" }; rerender(); } return; }
  if (target.closest("[data-sync-source]")) { await syncRemoteSource(); scheduleAutoSync(); return; }
  if (target.closest("[data-reset-source]")) { state.sourceConfig = { ...state.sourceConfig, lastSyncStatus: "idle", lastError: "" }; rerender(); return; }
  if (target.closest("[data-submit-checkin]")) { if (state.checkin.energy && state.checkin.focus && state.checkin.mood) { state.checkin.submitted = true; rerender(); pushToast("Mind check-in logged. The solver softened the next 24 hours."); } return; }
  if (target.closest("[data-reset-checkin]")) { state.checkin = { energy: 0, focus: 0, mood: 0, submitted: false }; rerender(); return; }
  if (target.closest("[data-process-dump]")) { if (state.brainDump.trim()) { state.processedDump = processBrainDump(state.brainDump); rerender(); } return; }
  if (target.closest("[data-clear-dump]")) { state.brainDump = ""; state.processedDump = null; rerender(); return; }
  if (target.closest("[data-focus-top]")) { const intel = getIntel(); if (intel.topPriorities[0]) pushToast(`Focus target: ${intel.topPriorities[0].title}.`); return; }
  if (target.closest("[data-dismiss-toast]")) { state.toast = null; renderToast(); }
});

doc?.addEventListener("input", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const search = target.closest("[data-note-search]");
  if (search) {
    const value = search.value;
    const start = search.selectionStart ?? value.length;
    const end = search.selectionEnd ?? value.length;
    state.noteSearch = value;
    saveState();
    renderApp();
    const next = doc.querySelector("[data-note-search]");
    if (next) { next.focus(); next.setSelectionRange(start, end); }
    return;
  }
  const dump = target.closest("[data-brain-dump]");
  if (dump) { state.brainDump = dump.value; saveState(); return; }
  const range = target.closest("[data-constraint-range-key]");
  if (range) { updateConstraint(range.dataset.constraintRangeGroup, range.dataset.constraintRangeKey, Number(range.value)); return; }
  const sourceUrl = target.closest("[data-source-url]");
  if (sourceUrl) { state.sourceConfig = { ...state.sourceConfig, remoteUrl: sourceUrl.value }; saveState(); scheduleAutoSync(); return; }
  const sourceDraft = target.closest("[data-source-draft]");
  if (sourceDraft) { state.sourceConfig = { ...state.sourceConfig, draftPayload: sourceDraft.value }; saveState(); }
});

function startToastLoop() {
  clearInterval(state.toastTimer);
  state.toastTimer = setInterval(() => {
    state.toast = TOASTS[state.toastIndex % TOASTS.length];
    state.toastIndex += 1;
    saveState();
    renderToast();
  }, 8000);
}

function scheduleAutoSync() {
  clearInterval(state.syncTimer);
  if (!win || !state.sourceConfig.autoSync || !state.sourceConfig.remoteUrl.trim()) return;
  state.syncTimer = win.setInterval(() => {
    syncRemoteSource();
  }, AUTO_SYNC_MS);
}

win?.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  const next = loadState();
  state.activeDomain = next.activeDomain;
  state.sidebarCollapsed = next.sidebarCollapsed;
  state.tasks = next.tasks;
  state.courses = next.courses;
  state.schedule = next.schedule;
  state.bills = next.bills;
  state.budget = next.budget;
  state.paychecks = next.paychecks;
  state.constraints = next.constraints;
  state.sourceConfig = next.sourceConfig;
  state.subTabs = next.subTabs;
  state.toastIndex = next.toastIndex;
  state.noteSearch = next.noteSearch;
  state.activeNoteId = next.activeNoteId;
  state.brainDump = next.brainDump;
  state.processedDump = next.processedDump;
  state.checkin = next.checkin;
  renderApp();
  scheduleAutoSync();
});

if (app) {
  renderApp();
  startToastLoop();
  scheduleAutoSync();
}
