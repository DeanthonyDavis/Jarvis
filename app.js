import {
  buildCommandCenterIntelligence,
  buildScheduleRunSnapshot,
  compareScheduleRunSnapshots,
  normalizeConstraints,
} from "./intelligence.js";
import {
  createIntegrationEventRecord,
  createNotificationRecord,
  createNoteRecord,
  createSyllabusRecord,
  createUploadRecord,
  dismissNotificationRecord,
  ensureUserWorkspace,
  initAuthClient,
  loadNotificationRecords,
  loadNoteRecords,
  loadIntegrationRecords,
  loadSyllabusRecords,
  loadUploadRecords,
  loadUserWorkspace,
  markNotificationRecordRead,
  saveUserWorkspace,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updateNoteRecord,
  updateSyllabusRecord,
  upsertIntegrationRecord,
} from "./auth.js";
import {
  TOKENS,
  DOMAINS,
  COURSES,
  INITIAL_TASKS,
  SCHEDULE,
  GOALS,
  CHECKINS,
  NOTES,
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
const CLOUD_SAVE_MS = 900;
const clone = (value) => JSON.parse(JSON.stringify(value));

const HELP_COPY = {
  command: ["Command Center", "Start here. Tune constraints, review setup progress, and sync sources before trusting the schedule."],
  academy: ["Academy", "Add courses or connect an LMS. If you have a syllabus, upload it from Notebook so deadlines can become tasks."],
  works: ["Works", "Connect shifts, project tasks, or job-search reminders so work pressure is blocked before it collides with school."],
  life: ["Life", "Add bills and finance sources only when you are ready. APEX treats this as sensitive, opt-in data."],
  future: ["Future", "Turn goals into scheduled action. Start with one target, then connect portfolio and learning sources."],
  mind: ["Mind", "Use check-ins as scheduler signals. Low energy should change the plan, not become another failure point."],
  notebook: ["Notebook", "Upload syllabi, PDFs, notes, and assignment sheets here. APEX will attach them as sources before deeper parsing is connected."],
};

const CONNECTOR_TEMPLATES = [
  { provider: "canvas", providerType: "lms", displayName: "Canvas LMS", domain: "academy", description: "Courses, assignments, deadlines, and grade signals.", scopes: ["courses", "assignments", "grades"] },
  { provider: "google_calendar", providerType: "calendar", displayName: "Google Calendar", domain: "command", description: "Fixed events, study windows, and calendar conflicts.", scopes: ["events.read", "events.write"] },
  { provider: "deputy", providerType: "workforce", displayName: "Deputy / shifts", domain: "works", description: "Shift changes and work-hour protection.", scopes: ["rosters", "timesheets"] },
  { provider: "plaid", providerType: "finance", displayName: "Plaid finance", domain: "life", description: "Balances, recurring bills, and budget pressure.", scopes: ["accounts", "transactions"] },
  { provider: "health_connect", providerType: "health", displayName: "Health signals", domain: "mind", description: "Sleep and recovery context for load softening.", scopes: ["sleep", "activity"] },
  { provider: "apex_webhook", providerType: "webhook", displayName: "APEX webhook", domain: "notebook", description: "Zapier/n8n/manual JSON events while OAuth connectors are built.", scopes: ["events", "tasks"] },
];

const SCHEDULE_MODES = {
  balanced: {
    label: "Balanced",
    description: "Default mode for normal weeks. Keeps study, work, future goals, and recovery in play.",
    bestFor: "Normal weeks with mixed school, work, life, and future-goal pressure.",
    tradeoffs: ["Keeps all domains in play.", "Avoids aggressive reshuffling unless the risk signals justify it."],
    watchFor: "May feel too gentle during finals or a true catch-up sprint.",
    hard: {},
    soft: {},
  },
  focus: {
    label: "Focus Week",
    description: "Prioritizes high-energy work earlier and protects longer focus chunks.",
    bestFor: "Project weeks, portfolio pushes, and demanding study blocks that need fewer context switches.",
    tradeoffs: ["Allows longer focus chunks.", "Moves heavier tasks earlier when possible.", "Protects less future-work time than Balanced."],
    watchFor: "Can feel intense if energy is low or the week is already overloaded.",
    hard: { maxFocusBlockMinutes: 110 },
    soft: { morningFocusBias: 7, batchShallowWork: 5, protectFutureWork: 4, keepEveningLight: 3 },
  },
  recovery: {
    label: "Light Recovery",
    description: "Lightens evenings, protects recovery, and penalizes hard work when energy is low.",
    bestFor: "Low-energy days, post-exam weeks, or times when burnout risk matters more than throughput.",
    tradeoffs: ["Shortens focus chunks.", "Protects evening wind-down.", "May leave more work as visible carryover."],
    watchFor: "Urgent work can remain unscheduled if the day is already constrained.",
    hard: { protectRecoveryBlocks: true, windDownHour: 21, maxFocusBlockMinutes: 60 },
    soft: { lowEnergyProtection: 8, keepEveningLight: 8, morningFocusBias: 4, protectFutureWork: 2, batchShallowWork: 6 },
  },
  finals: {
    label: "Finals Mode",
    description: "Biases academic urgency and morning deep work while still keeping sleep guardrails visible.",
    bestFor: "Exam-heavy weeks where academic risk should dominate the planner.",
    tradeoffs: ["Prioritizes academic urgency.", "Keeps class and recovery guardrails visible.", "Deprioritizes future goals temporarily."],
    watchFor: "Non-academic tasks may get pushed unless they are urgent or bill-related.",
    hard: { lockClasses: true, protectRecoveryBlocks: true, maxFocusBlockMinutes: 100 },
    soft: { morningFocusBias: 8, lowEnergyProtection: 4, keepEveningLight: 5, protectFutureWork: 1, batchShallowWork: 4 },
  },
  workHeavy: {
    label: "Work-Heavy",
    description: "Treats shifts as immovable and pushes school tasks into the clearest remaining slots.",
    bestFor: "Weeks with long shifts, changing rosters, or pay/hours pressure.",
    tradeoffs: ["Keeps work shifts locked.", "Compresses study into clearer remaining windows.", "Uses shorter focus blocks."],
    watchFor: "Academic work can become fragmented if shifts consume the best blocks.",
    hard: { lockWorkShifts: true, maxFocusBlockMinutes: 75 },
    soft: { morningFocusBias: 6, lowEnergyProtection: 6, keepEveningLight: 6, protectFutureWork: 1, batchShallowWork: 5 },
  },
  catchup: {
    label: "Catch-Up",
    description: "Makes room for overdue and urgent chunks while batching shallow admin work.",
    bestFor: "Backlog cleanup after missed work, travel, illness, or a noisy week.",
    tradeoffs: ["Batches shallow work harder.", "Makes more room for urgent backlog.", "Allows less protection for future goals."],
    watchFor: "Can over-prioritize backlog if you need a calmer recovery day.",
    hard: { maxFocusBlockMinutes: 80 },
    soft: { morningFocusBias: 5, lowEnergyProtection: 3, keepEveningLight: 3, protectFutureWork: 1, batchShallowWork: 8 },
  },
};

const DOMAIN_ICONS = {
  command: "M8 2.5 3.5 9h4L5.5 17.5 14 7h-4l2-4.5Z",
  academy: "M2.5 7.5 10 3.5l7.5 4-7.5 4-7.5-4ZM5.5 10v3.2c1.5 1.5 7.5 1.5 9 0V10",
  works: "M5 6h10v10H5V6Zm3 0V4h4v2M5 10h10",
  life: "M3.5 9.5 10 4l6.5 5.5V16H5V9.5Zm4 6.5v-4h5v4",
  future: "M10 2.8c2 1.4 3.4 3.3 3.4 5.4 1.5.7 2.4 2.1 2.5 3.8-1.6-.2-3.1-1-4-2.4-1.8.7-3.8.7-5.8 0-.9 1.4-2.4 2.2-4 2.4.1-1.7 1-3.1 2.5-3.8 0-2.1 1.4-4 3.4-5.4Zm0 3.2v0",
  mind: "M7 15.5c-2 0-3.5-1.5-3.5-3.4 0-1 .4-1.9 1.1-2.5-.2-.4-.3-.8-.3-1.2 0-1.5 1.2-2.7 2.8-2.7.6-1.2 1.7-2 3-2s2.4.8 3 2c1.6 0 2.8 1.2 2.8 2.7 0 .4-.1.8-.3 1.2.7.6 1.1 1.5 1.1 2.5 0 1.9-1.5 3.4-3.5 3.4H7Z",
  notebook: "M5 3.5h9.5c.8 0 1.5.7 1.5 1.5v11.5H6.5c-.8 0-1.5-.7-1.5-1.5V3.5Zm3 0v13",
};

const DEFAULT_PREFERENCES = {
  theme: "nebula",
  density: "comfortable",
  fontScale: "standard",
  accentProfile: "domain",
  layoutProfile: "guided",
};

const PREFERENCE_OPTIONS = {
  theme: [
    ["nebula", "Nebula"],
    ["contrast", "High Contrast"],
    ["daylight", "Daylight"],
  ],
  density: [
    ["compact", "Compact"],
    ["comfortable", "Comfortable"],
    ["spacious", "Spacious"],
  ],
  fontScale: [
    ["standard", "Standard"],
    ["large", "Large"],
    ["xl", "Extra Large"],
  ],
  accentProfile: [
    ["domain", "Domain"],
    ["command", "Command"],
    ["academy", "Academy"],
    ["works", "Works"],
    ["life", "Life"],
    ["future", "Future"],
    ["mind", "Mind"],
  ],
  layoutProfile: [
    ["guided", "Guided"],
    ["operator", "Operator"],
    ["focus", "Focus"],
  ],
};

const DEFAULT_COMMAND_WIDGETS = [
  { id: "setup", type: "system", title: "Setup States", visible: true, pinned: true, order: 10, size: "full", profile: "guided" },
  { id: "personalization", type: "system", title: "Personalization", visible: true, pinned: false, order: 20, size: "full", profile: "guided" },
  { id: "briefing", type: "intelligence", title: "Intelligence Briefing", visible: true, pinned: true, order: 30, size: "wide", profile: "all" },
  { id: "solver", type: "intelligence", title: "Solver Summary", visible: true, pinned: false, order: 40, size: "compact", profile: "operator" },
  { id: "capacity", type: "intelligence", title: "Capacity Gauge", visible: true, pinned: true, order: 50, size: "compact", profile: "all" },
  { id: "gpa", type: "academy", title: "GPA Tracker", visible: true, pinned: false, order: 60, size: "compact", profile: "all" },
  { id: "conflicts", type: "intelligence", title: "Conflict Engine", visible: true, pinned: true, order: 70, size: "compact", profile: "all" },
  { id: "week", type: "calendar", title: "This Week", visible: true, pinned: false, order: 80, size: "compact", profile: "all" },
  { id: "recommendations", type: "intelligence", title: "Next Best Moves", visible: true, pinned: false, order: 90, size: "full", profile: "all" },
  { id: "why", type: "explainability", title: "Why This Plan", visible: true, pinned: false, order: 100, size: "full", profile: "all" },
  { id: "modes", type: "scheduler", title: "Schedule Modes", visible: true, pinned: false, order: 110, size: "full", profile: "all" },
  { id: "constraints", type: "scheduler", title: "Constraint Studio", visible: true, pinned: false, order: 120, size: "full", profile: "all" },
  { id: "sources", type: "integrations", title: "Live Data Sources", visible: true, pinned: false, order: 130, size: "half", profile: "operator" },
  { id: "connectors", type: "integrations", title: "Connector Framework", visible: true, pinned: false, order: 140, size: "half", profile: "operator" },
  { id: "schedule", type: "scheduler", title: "Optimized Schedule", visible: true, pinned: true, order: 150, size: "full", profile: "all" },
];

const COMMAND_WIDGET_PROFILE_PRESETS = {
  guided: {
    label: "Guided",
    description: "Setup, personalization, priorities, conflicts, source connections, and the schedule stay visible for first-time users.",
    visible: ["setup", "personalization", "briefing", "capacity", "conflicts", "recommendations", "sources", "connectors", "schedule"],
    pinned: ["setup", "briefing", "capacity", "conflicts", "schedule"],
  },
  operator: {
    label: "Operator",
    description: "Daily operating panels stay visible: solver health, conflicts, week view, constraints, sources, connectors, and schedule.",
    visible: ["briefing", "solver", "capacity", "conflicts", "week", "why", "constraints", "sources", "connectors", "schedule"],
    pinned: ["briefing", "solver", "capacity", "conflicts", "schedule"],
  },
  focus: {
    label: "Focus",
    description: "Only the panels needed to understand load, risk, decisions, modes, and the next schedule stay prominent.",
    visible: ["briefing", "capacity", "conflicts", "why", "modes", "schedule"],
    pinned: ["capacity", "briefing", "conflicts", "schedule"],
  },
};

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
    scheduleMode: "balanced",
    sourceConfig: {
      ...clone(DEFAULT_SOURCE_CONFIG),
      remoteUrl: win && win.location.protocol.startsWith("http") ? "/api/source/live" : DEFAULT_SOURCE_CONFIG.remoteUrl,
    },
    subTabs: { academy: "grades", works: "shifts" },
    toast: null,
    workspace: { id: null, name: "Local workspace", phase2Enabled: false, error: "" },
    notifications: [],
    notificationPanelOpen: false,
    notificationStatus: "local",
    integrations: clone(CONNECTOR_TEMPLATES).map((item) => ({
      ...item,
      status: "disconnected",
      authState: "not_connected",
      webhookStatus: item.providerType === "webhook" ? "paused" : "not_configured",
      syncStatus: "disabled",
      refreshStatus: "not_required",
      tokenRef: null,
      refreshTokenRef: null,
      tokenExpiresAt: null,
      lastSyncedAt: null,
      nextSyncAt: null,
      lastTestedAt: null,
      lastSyncResult: {},
      errorCount: 0,
      lastError: "",
      metadata: { events: [] },
    })),
    noteSearch: "",
    activeNoteId: NOTES[0]?.id || null,
    notes: clone(NOTES),
    uploadedFiles: [],
    syllabusReviews: [],
    brainDump: "",
    processedDump: null,
    checkin: { energy: 0, focus: 0, mood: 0, submitted: false },
    lastPlanSnapshot: null,
    lastPlanChanges: null,
    preferences: clone(DEFAULT_PREFERENCES),
    widgets: normalizeWidgets(),
  };
}

function emptyUserSnapshot() {
  const snapshot = defaultSnapshot();
  return {
    ...snapshot,
    tasks: [],
    courses: [],
    schedule: [],
    bills: [],
    budget: { income: 0, spent: 0, saved: 0, left: 0 },
    paychecks: [],
    noteSearch: "",
    activeNoteId: null,
    notes: [],
    brainDump: "",
    processedDump: null,
    checkin: { energy: 0, focus: 0, mood: 0, submitted: false },
    onboarding: {
      tutorialOpen: true,
      tutorialSkipped: false,
      tutorialCompleted: false,
      activeStep: 0,
      sectionHelpSeen: {},
    },
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
      scheduleMode: SCHEDULE_MODES[saved.scheduleMode] ? saved.scheduleMode : defaults.scheduleMode,
      sourceConfig: { ...defaults.sourceConfig, ...(saved.sourceConfig || {}) },
      subTabs: { ...defaults.subTabs, ...(saved.subTabs || {}) },
      workspace: { ...defaults.workspace, ...(saved.workspace || {}) },
      notifications: Array.isArray(saved.notifications) ? saved.notifications : defaults.notifications,
      notificationPanelOpen: Boolean(saved.notificationPanelOpen),
      notificationStatus: saved.notificationStatus || defaults.notificationStatus,
      integrations: Array.isArray(saved.integrations) ? saved.integrations : defaults.integrations,
      noteSearch: saved.noteSearch || "",
      activeNoteId: saved.activeNoteId ?? defaults.activeNoteId,
      notes: Array.isArray(saved.notes) ? saved.notes : defaults.notes,
      uploadedFiles: Array.isArray(saved.uploadedFiles) ? saved.uploadedFiles : defaults.uploadedFiles,
      syllabusReviews: Array.isArray(saved.syllabusReviews) ? saved.syllabusReviews : defaults.syllabusReviews,
      brainDump: saved.brainDump || "",
      processedDump: saved.processedDump || null,
      checkin: { ...defaults.checkin, ...(saved.checkin || {}) },
      lastPlanSnapshot: saved.lastPlanSnapshot || null,
      lastPlanChanges: saved.lastPlanChanges || null,
      preferences: normalizePreferences(saved.preferences),
      widgets: normalizeWidgets(saved.widgets),
      onboarding: {
        tutorialOpen: Boolean(saved.onboarding?.tutorialOpen),
        tutorialSkipped: Boolean(saved.onboarding?.tutorialSkipped),
        tutorialCompleted: Boolean(saved.onboarding?.tutorialCompleted),
        activeStep: Number(saved.onboarding?.activeStep || 0),
        sectionHelpSeen: saved.onboarding?.sectionHelpSeen || {},
      },
    };
  } catch {
    return defaults;
  }
}

const state = {
  ...loadState(),
  auth: {
    ready: false,
    enabled: false,
    client: null,
    session: null,
    user: null,
    mode: "sign-in",
    email: "",
    password: "",
    error: "",
    message: "",
  },
  toastTimer: null,
  syncTimer: null,
  cloudSaveTimer: null,
  cloudSaveStatus: "idle",
  pendingScheduleMode: null,
  commandPaletteOpen: false,
  commandPaletteQuery: "",
  commandPaletteIndex: 0,
  mobileNavOpen: false,
};

const app = doc?.querySelector("#app") || null;
const colorFor = (domain) => TOKENS[domain] || TOKENS.command;
const activeDomain = () => DOMAINS.find((domain) => domain.id === state.activeDomain);
const localId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const unreadNotifications = () => state.notifications.filter((item) => !item.read_at && !item.dismissed_at && !item.resolved_at);
function constraintsForMode(modeKey = state.scheduleMode) {
  const mode = SCHEDULE_MODES[modeKey] || SCHEDULE_MODES.balanced;
  const base = normalizeConstraints(state.constraints);
  return normalizeConstraints({
    hard: { ...base.hard, ...(mode.hard || {}) },
    soft: { ...base.soft, ...(mode.soft || {}) },
  });
}

const getIntelForMode = (modeKey = state.scheduleMode, now = new Date()) =>
  buildCommandCenterIntelligence({
    now,
    tasks: state.tasks,
    schedule: state.schedule,
    courses: state.courses,
    bills: state.bills,
    checkin: state.checkin,
    constraints: constraintsForMode(modeKey),
    budget: state.budget,
    paychecks: state.paychecks,
  });
const getIntel = (now = new Date()) => getIntelForMode(state.scheduleMode, now);
const formatToday = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const meter = (percent, accent) => `<div class="meter"><div class="meter-fill" style="width:${percent}%; --accent:${accent};"></div></div>`;
const pill = (label, accent) => `<span class="pill" style="--pill:${accent};">${label}</span>`;
const tabButton = (group, value, active, accent) => `<button class="domain-tab ${active === value ? "is-active" : ""}" data-tab-group="${group}" data-tab-value="${value}" style="--accent:${accent};">${value}</button>`;
const iconSvg = (id, label = "") =>
  `<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="${label ? "false" : "true"}" ${label ? `aria-label="${escapeHtml(label)}"` : ""}><path d="${DOMAIN_ICONS[id] || DOMAIN_ICONS.command}"></path></svg>`;
const sparkBars = (values, accent) => {
  const max = Math.max(...values, 1);
  return `<div class="spark-bars">${values.map((value, index) => `<span style="height:${Math.max(14, (value / max) * 100)}%; --accent:${accent}; --index:${index + 1};"></span>`).join("")}</div>`;
};

function gauge(value, accent, label, subtitle = "", displayValue = `${value}%`) {
  return `<div class="gauge"><div class="gauge-ring" style="--value:${value}; --accent:${accent};"><strong>${displayValue}</strong></div><div class="gauge-copy"><span>${label}</span>${subtitle ? `<small class="muted">${subtitle}</small>` : ""}</div></div>`;
}

function emptyState({ domain = "command", title, body, primaryLabel = "Open setup", primaryDomain = "command", secondaryLabel = "", secondaryDomain = "notebook", compact = false } = {}) {
  return `<div class="empty-state ${compact ? "empty-state--compact" : ""}" style="--accent:${colorFor(domain)};"><div class="empty-state__icon">${iconSvg(domain, title || "Empty state")}</div><h3 class="empty-title">${escapeHtml(title || "Nothing here yet.")}</h3><p>${escapeHtml(body || "Add a source or complete setup to unlock this area.")}</p>${primaryLabel || secondaryLabel ? `<div class="empty-state__actions">${primaryLabel ? `<button class="primary-action" data-domain="${escapeHtml(primaryDomain)}">${escapeHtml(primaryLabel)}</button>` : ""}${secondaryLabel ? `<button class="surface-action" data-domain="${escapeHtml(secondaryDomain)}">${escapeHtml(secondaryLabel)}</button>` : ""}</div>` : ""}</div>`;
}

function stateNotice(kind, title, body, domain = "command") {
  return `<div class="state-notice state-notice--${kind}" style="--accent:${colorFor(domain)};"><div class="row-badge">${iconSvg(domain, title)}</div><div><strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div></div></div>`;
}

function listOrEmpty(rows, emptyConfig) {
  return rows || emptyState({ compact: true, ...emptyConfig });
}

function normalizePreferences(preferences = {}) {
  const isValid = (key, value) => PREFERENCE_OPTIONS[key]?.some(([option]) => option === value);
  return {
    theme: isValid("theme", preferences.theme) ? preferences.theme : DEFAULT_PREFERENCES.theme,
    density: isValid("density", preferences.density) ? preferences.density : DEFAULT_PREFERENCES.density,
    fontScale: isValid("fontScale", preferences.fontScale) ? preferences.fontScale : DEFAULT_PREFERENCES.fontScale,
    accentProfile: isValid("accentProfile", preferences.accentProfile) ? preferences.accentProfile : DEFAULT_PREFERENCES.accentProfile,
    layoutProfile: isValid("layoutProfile", preferences.layoutProfile) ? preferences.layoutProfile : DEFAULT_PREFERENCES.layoutProfile,
  };
}

function widgetProfileDefaults(profile = "guided") {
  const preset = COMMAND_WIDGET_PROFILE_PRESETS[profile] || COMMAND_WIDGET_PROFILE_PRESETS.guided;
  return DEFAULT_COMMAND_WIDGETS.map((widget) => ({
    ...widget,
    visible: preset.visible.includes(widget.id),
    pinned: preset.pinned.includes(widget.id),
    profile,
  }));
}

function normalizeWidgetList(list = [], profile = "guided") {
  const incoming = new Map(Array.isArray(list) ? list.map((item) => [item?.id, item]) : []);
  return widgetProfileDefaults(profile).map((defaults) => {
    const saved = incoming.get(defaults.id) || {};
    return {
      ...defaults,
      visible: typeof saved.visible === "boolean" ? saved.visible : defaults.visible,
      pinned: typeof saved.pinned === "boolean" ? saved.pinned : defaults.pinned,
      order: Number.isFinite(Number(saved.order)) ? Number(saved.order) : defaults.order,
      size: ["compact", "half", "wide", "full"].includes(saved.size) ? saved.size : defaults.size,
      profile: typeof saved.profile === "string" ? saved.profile : defaults.profile,
    };
  });
}

function normalizeWidgets(widgets = {}) {
  const profiles = widgets.commandProfiles || {};
  const legacy = Array.isArray(widgets.command) ? widgets.command : null;
  return {
    command: normalizeWidgetList(legacy || profiles.guided, "guided"),
    commandProfiles: {
      guided: normalizeWidgetList(profiles.guided || legacy, "guided"),
      operator: normalizeWidgetList(profiles.operator, "operator"),
      focus: normalizeWidgetList(profiles.focus, "focus"),
    },
  };
}

function commandWidgets() {
  const profile = activeWidgetProfile();
  return normalizeWidgetList(state.widgets?.commandProfiles?.[profile], profile);
}

function orderedCommandWidgets({ includeHidden = false } = {}) {
  return commandWidgets()
    .filter((widget) => includeHidden || widget.visible)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order || a.title.localeCompare(b.title));
}

function activeWidgetProfile() {
  return state.preferences?.layoutProfile || DEFAULT_PREFERENCES.layoutProfile;
}

function selectedAccent(domainId = activeDomain()?.id || "command") {
  const profile = state.preferences?.accentProfile || "domain";
  return profile === "domain" ? colorFor(domainId) : colorFor(profile);
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
      scheduleMode: state.scheduleMode,
      sourceConfig: state.sourceConfig,
      subTabs: state.subTabs,
      workspace: state.workspace,
      notifications: state.notifications,
      notificationPanelOpen: state.notificationPanelOpen,
      notificationStatus: state.notificationStatus,
      integrations: state.integrations,
      noteSearch: state.noteSearch,
      activeNoteId: state.activeNoteId,
      notes: state.notes,
      uploadedFiles: state.uploadedFiles,
      syllabusReviews: state.syllabusReviews,
      brainDump: state.brainDump,
      processedDump: state.processedDump,
      checkin: state.checkin,
      lastPlanSnapshot: state.lastPlanSnapshot,
      lastPlanChanges: state.lastPlanChanges,
      onboarding: state.onboarding,
      preferences: state.preferences,
      widgets: state.widgets,
    }),
  );
}

function userWorkspaceState() {
  return {
    tasks: state.tasks,
    courses: state.courses,
    schedule: state.schedule,
    bills: state.bills,
    budget: state.budget,
    paychecks: state.paychecks,
    constraints: state.constraints,
    scheduleMode: state.scheduleMode,
    sourceConfig: state.sourceConfig,
    subTabs: state.subTabs,
    workspace: state.workspace,
    notifications: state.notifications,
    notificationStatus: state.notificationStatus,
    integrations: state.integrations,
    noteSearch: state.noteSearch,
    activeNoteId: state.activeNoteId,
    notes: state.notes,
    uploadedFiles: state.uploadedFiles,
    syllabusReviews: state.syllabusReviews,
    brainDump: state.brainDump,
    processedDump: state.processedDump,
    checkin: state.checkin,
    lastPlanSnapshot: state.lastPlanSnapshot,
    lastPlanChanges: state.lastPlanChanges,
    onboarding: state.onboarding,
    preferences: state.preferences,
    widgets: state.widgets,
  };
}

function applyWorkspaceState(workspace) {
  const base = emptyUserSnapshot();
  state.tasks = Array.isArray(workspace?.tasks) ? workspace.tasks : base.tasks;
  state.courses = Array.isArray(workspace?.courses) ? workspace.courses : base.courses;
  state.schedule = Array.isArray(workspace?.schedule) ? workspace.schedule : base.schedule;
  state.bills = Array.isArray(workspace?.bills) ? workspace.bills : base.bills;
  state.budget = { ...base.budget, ...(workspace?.budget || {}) };
  state.paychecks = Array.isArray(workspace?.paychecks) ? workspace.paychecks : base.paychecks;
  state.constraints = normalizeConstraints(workspace?.constraints || base.constraints);
  state.scheduleMode = SCHEDULE_MODES[workspace?.scheduleMode] ? workspace.scheduleMode : base.scheduleMode;
  state.sourceConfig = { ...base.sourceConfig, ...(workspace?.sourceConfig || {}) };
  state.subTabs = { ...base.subTabs, ...(workspace?.subTabs || {}) };
  state.workspace = { ...base.workspace, ...(workspace?.workspace || {}) };
  state.notifications = Array.isArray(workspace?.notifications) ? workspace.notifications : base.notifications;
  state.notificationStatus = workspace?.notificationStatus || base.notificationStatus;
  state.notificationPanelOpen = Boolean(workspace?.notificationPanelOpen);
  state.integrations = Array.isArray(workspace?.integrations) ? workspace.integrations : base.integrations;
  state.noteSearch = workspace?.noteSearch || "";
  state.activeNoteId = workspace?.activeNoteId ?? null;
  state.notes = Array.isArray(workspace?.notes) ? workspace.notes : [];
  state.uploadedFiles = Array.isArray(workspace?.uploadedFiles) ? workspace.uploadedFiles : [];
  state.syllabusReviews = Array.isArray(workspace?.syllabusReviews) ? workspace.syllabusReviews : [];
  state.brainDump = workspace?.brainDump || "";
  state.processedDump = workspace?.processedDump || null;
  state.checkin = { ...base.checkin, ...(workspace?.checkin || {}) };
  state.lastPlanSnapshot = workspace?.lastPlanSnapshot || null;
  state.lastPlanChanges = workspace?.lastPlanChanges || null;
  state.preferences = normalizePreferences(workspace?.preferences || base.preferences);
  state.widgets = normalizeWidgets(workspace?.widgets || base.widgets);
  state.onboarding = {
    ...base.onboarding,
    ...(workspace?.onboarding || {}),
    sectionHelpSeen: workspace?.onboarding?.sectionHelpSeen || {},
  };
}

function scheduleCloudSave() {
  if (!state.auth.client || !state.auth.user) return;
  clearTimeout(state.cloudSaveTimer);
  state.cloudSaveStatus = "saving";
  renderShellStatus();
  state.cloudSaveTimer = setTimeout(async () => {
    try {
      await saveUserWorkspace(state.auth.client, state.auth.user.id, userWorkspaceState());
      state.cloudSaveStatus = "saved";
      renderShellStatus();
    } catch (error) {
      state.cloudSaveStatus = "error";
      state.auth.error = error instanceof Error ? error.message : "Unable to save workspace.";
      renderShellStatus();
      pushToast("Workspace save failed. Check your Supabase connection.");
    }
  }, CLOUD_SAVE_MS);
}

function rerender() {
  saveState();
  scheduleCloudSave();
  renderApp();
}

function persistPlanSnapshotOnly() {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...saved,
        lastPlanSnapshot: state.lastPlanSnapshot,
        lastPlanChanges: state.lastPlanChanges,
      }),
    );
  } catch {
    // Snapshot comparisons are helpful, but should never block the app shell.
  }
}

function pushToast(message) {
  state.toast = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = win?.setTimeout(() => {
    state.toast = null;
    renderToast();
  }, 5200);
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
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("role", "status");
  toast.style.setProperty("--accent", colorFor(state.activeDomain));
  toast.innerHTML = `<strong>APEX</strong><span>${escapeHtml(state.toast)}</span><button aria-label="Dismiss notification" data-dismiss-toast>&times;</button>`;
}

function renderShellStatus(intel = getIntel()) {
  const load = doc?.querySelector("[data-shell-load]");
  const cloud = doc?.querySelector("[data-shell-cloud]");
  const source = doc?.querySelector("[data-shell-source]");
  const sourceDot = doc?.querySelector("[data-shell-source-dot]");
  const notifications = doc?.querySelector("[data-shell-notifications]");
  const notificationDot = doc?.querySelector("[data-shell-notification-dot]");
  const notificationToggle = doc?.querySelector("[data-notification-toggle]");
  const unreadCount = unreadNotifications().length;
  if (load) load.textContent = intel.loadDisplay || `${intel.loadScore}%`;
  if (cloud) cloud.textContent = state.cloudSaveStatus;
  if (source) source.textContent = state.sourceConfig.lastSyncStatus;
  if (sourceDot) sourceDot.style.background = statusTone(state.sourceConfig.lastSyncStatus);
  if (notifications) notifications.textContent = String(unreadCount);
  if (notificationDot) notificationDot.style.background = unreadCount ? TOKENS.warn : TOKENS.ok;
  if (notificationToggle) notificationToggle.classList.toggle("has-unread", unreadCount > 0);
}

function normalizeNotification(record) {
  return {
    id: record.id || localId("note"),
    type: record.type || "app",
    title: record.title || "APEX notification",
    body: record.body || "",
    severity: record.severity || "info",
    source_entity_type: record.source_entity_type || record.sourceEntityType || null,
    source_entity_id: record.source_entity_id || record.sourceEntityId || null,
    action_payload: record.action_payload || record.actionPayload || {},
    created_at: record.created_at || new Date().toISOString(),
    read_at: record.read_at || null,
    resolved_at: record.resolved_at || null,
    dismissed_at: record.dismissed_at || null,
    local: Boolean(record.local),
  };
}

function normalizeUpload(record) {
  return {
    id: record.id || localId("upload"),
    name: record.name || record.original_filename || "Untitled upload",
    size: Number(record.size ?? record.file_size_bytes ?? 0),
    type: record.type || record.mime_type || "unknown type",
    addedAt: record.addedAt || record.created_at || new Date().toISOString(),
    uploadStatus: record.uploadStatus || record.upload_status || "uploaded",
    textStatus: record.textStatus || record.extracted_text_status || "pending",
    storagePath: record.storagePath || record.storage_path || "",
    local: Boolean(record.local),
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeSyllabusReview(record) {
  return {
    id: record.id || localId("syllabus"),
    uploadId: record.uploadId || record.upload_id || null,
    title: record.title || "Untitled syllabus review",
    parseStatus: record.parseStatus || record.parse_status || "needs_review",
    parsedSummary: record.parsedSummary || record.parsed_summary || {},
    confidence: Number(record.confidence ?? 0),
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    updatedAt: record.updatedAt || record.updated_at || record.createdAt || record.created_at || new Date().toISOString(),
    local: Boolean(record.local),
  };
}

function normalizeNote(record) {
  const body = record.body ?? record.summary ?? "";
  return {
    id: String(record.id || localId("note")),
    title: record.title || "Untitled note",
    domain: record.domain || "notebook",
    updated: record.updated || (record.updated_at ? new Date(record.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Just now"),
    updatedAt: record.updatedAt || record.updated_at || new Date().toISOString(),
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    tags: Array.isArray(record.tags) ? record.tags : [],
    summary: body || "Start writing here. APEX will use notes as source-grounded context in a later AI phase.",
    body,
    local: Boolean(record.local),
  };
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeIntegration(record) {
  const provider = record.provider;
  const template = CONNECTOR_TEMPLATES.find((item) => item.provider === provider) || {};
  const metadata = record.metadata || {};
  const status = record.status || "disconnected";
  const defaultWebhookStatus = provider === "apex_webhook" ? (status === "connected" ? "active" : "paused") : "not_configured";
  const defaultSyncStatus = status === "connected" ? "idle" : status === "error" ? "error" : "disabled";
  return {
    id: record.id || localId("integration"),
    provider,
    providerType: record.providerType || record.provider_type || template.providerType || "webhook",
    displayName: record.displayName || metadata.displayName || template.displayName || provider,
    domain: record.domain || metadata.domain || template.domain || "command",
    description: record.description || metadata.description || template.description || "External source connection.",
    status,
    authState: record.authState || record.auth_state || metadata.authState || (status === "connected" ? "connected" : status === "needs_reauth" ? "needs_reauth" : status === "error" ? "error" : "not_connected"),
    webhookStatus: record.webhookStatus || record.webhook_status || metadata.webhookStatus || defaultWebhookStatus,
    syncStatus: record.syncStatus || record.sync_status || metadata.syncStatus || defaultSyncStatus,
    scopes: Array.isArray(record.scopes) && record.scopes.length ? record.scopes : clone(template.scopes || []),
    tokenRef: record.tokenRef || record.token_ref || null,
    refreshTokenRef: record.refreshTokenRef || record.refresh_token_ref || null,
    tokenExpiresAt: record.tokenExpiresAt || record.token_expires_at || null,
    refreshStatus: record.refreshStatus || record.refresh_status || metadata.refreshStatus || (record.refreshTokenRef || record.refresh_token_ref ? "fresh" : "not_required"),
    lastSyncedAt: record.lastSyncedAt || record.last_synced_at || null,
    nextSyncAt: record.nextSyncAt || record.next_sync_at || metadata.nextSyncAt || null,
    lastTestedAt: record.lastTestedAt || record.last_tested_at || null,
    lastSyncResult: record.lastSyncResult || record.last_sync_result || metadata.lastSyncResult || {},
    errorCount: Number(record.errorCount ?? record.error_count ?? metadata.errorCount ?? 0),
    lastError: record.lastError || record.last_error || "",
    metadata,
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    updatedAt: record.updatedAt || record.updated_at || new Date().toISOString(),
    local: Boolean(record.local),
  };
}

function mergeIntegrationTemplates(records = state.integrations) {
  const byProvider = new Map(records.map((item) => [item.provider, normalizeIntegration(item)]));
  for (const template of CONNECTOR_TEMPLATES) {
    if (!byProvider.has(template.provider)) byProvider.set(template.provider, normalizeIntegration({ ...template, status: "disconnected", local: true }));
  }
  return [...byProvider.values()];
}

function integrationEndpoint(provider, { refresh = false } = {}) {
  const suffix = refresh ? "?refresh=1" : "";
  if (provider === "google_calendar") return `/api/connectors/calendar${suffix}`;
  if (provider === "canvas") return `/api/connectors/lms${suffix}`;
  if (provider === "apex_webhook") return "/api/source/live";
  return "";
}

function connectorEvent(type, status, message, result = {}) {
  return {
    type,
    status,
    message,
    result,
    createdAt: new Date().toISOString(),
  };
}

function mergeConnectorEvent(metadata = {}, event) {
  if (!event) return metadata;
  const events = Array.isArray(metadata.events) ? metadata.events : [];
  return {
    ...metadata,
    events: [event, ...events].slice(0, 6),
  };
}

function connectorTone(value) {
  const normalized = String(value || "").toLowerCase();
  if (["connected", "success", "active", "fresh", "idle"].includes(normalized)) return TOKENS.ok;
  if (["syncing", "refreshing", "reauth_requested"].includes(normalized)) return TOKENS.command;
  if (["needs_reauth", "expires_soon", "warning", "paused"].includes(normalized)) return TOKENS.warn;
  if (["error", "expired"].includes(normalized)) return TOKENS.danger;
  return TOKENS.notebook;
}

function summarizeConnectorResult(result = {}) {
  if (!result || !Object.keys(result).length) return "No sync result yet.";
  const parts = [];
  if (result.httpStatus) parts.push(`HTTP ${result.httpStatus}`);
  if (result.recordsImported != null) parts.push(`${result.recordsImported} records`);
  if (result.endpoint) parts.push(result.endpoint);
  if (result.message) parts.push(result.message);
  return parts.join(" | ") || "Result saved.";
}

function buildSyllabusDraft(upload) {
  const name = upload?.name || "Syllabus upload";
  const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const codeMatch = stem.match(/\b[A-Z]{2,5}\s?-?\d{3,4}[A-Z]?\b/i);
  return {
    uploadId: upload?.id || null,
    title: `${stem || "Syllabus"} review`,
    parseStatus: "needs_review",
    confidence: 0.35,
    parsedSummary: {
      courseName: codeMatch ? stem.replace(codeMatch[0], "").replace(/\s+/g, " ").trim() || stem : stem,
      courseCode: codeMatch ? codeMatch[0].toUpperCase().replace("-", " ") : "Needs review",
      extractedItems: [
        { type: "assignment", title: "Review assignment schedule", status: "needs_review" },
        { type: "exam", title: "Review exam dates", status: "needs_review" },
        { type: "policy", title: "Review grading policy", status: "needs_review" },
      ],
      warning: "Placeholder extraction from filename only. Confirm before scheduling.",
    },
  };
}

async function notifyUser(notification, { toast = true } = {}) {
  const localNotification = normalizeNotification({ ...notification, local: true });
  state.notifications = [localNotification, ...state.notifications].slice(0, 30);
  saveState();
  renderShellStatus();
  if (state.notificationPanelOpen) renderNotificationCenter();
  if (toast) pushToast(localNotification.title);

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client || !state.auth.user) return;
  try {
    const created = await createNotificationRecord(state.auth.client, state.workspace.id, state.auth.user.id, notification);
    state.notifications = state.notifications.map((item) => item.id === localNotification.id ? normalizeNotification(created) : item);
    saveState();
    renderShellStatus();
    if (state.notificationPanelOpen) renderNotificationCenter();
  } catch (error) {
    state.notificationStatus = "local";
    state.workspace = {
      ...state.workspace,
      phase2Enabled: false,
      error: error instanceof Error ? error.message : "Notification sync unavailable.",
    };
    saveState();
  }
}

async function attachSourceFiles(files) {
  const fileList = [...files];
  if (!fileList.length) return;
  const localUploads = fileList.map((file) => normalizeUpload({
    id: localId("upload"),
    name: file.name,
    size: file.size,
    type: file.type,
    addedAt: new Date().toISOString(),
    uploadStatus: "uploaded",
    textStatus: "pending",
    storagePath: "",
    local: true,
  }));
  state.uploadedFiles = [...localUploads, ...state.uploadedFiles].slice(0, 100);
  rerender();
  notifyUser({
    type: "upload",
    title: `${fileList.length} file${fileList.length === 1 ? "" : "s"} attached`,
    body: "Your files were added as source records. Text extraction and review are the next pipeline step.",
    severity: "success",
  });

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    const created = [];
    for (const file of fileList) {
      created.push(normalizeUpload(await createUploadRecord(state.auth.client, state.workspace.id, file)));
    }
    const localIds = new Set(localUploads.map((item) => item.id));
    state.uploadedFiles = [
      ...created,
      ...state.uploadedFiles.filter((item) => !localIds.has(item.id)),
    ].slice(0, 100);
    saveState();
    renderApp();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Upload metadata sync unavailable.",
    };
    notifyUser({
      type: "upload_sync_error",
      title: "Upload saved locally",
      body: "APEX could not write upload metadata to Supabase, so this file remains in local fallback state.",
      severity: "warning",
    });
  }
}

async function startSyllabusReview(uploadId) {
  const upload = state.uploadedFiles.map(normalizeUpload).find((item) => item.id === uploadId);
  if (!upload) return;
  const existing = state.syllabusReviews.find((item) => item.uploadId === uploadId);
  if (existing) {
    pushToast("This upload is already in the syllabus review queue.");
    return;
  }

  const draft = normalizeSyllabusReview({ ...buildSyllabusDraft(upload), id: localId("syllabus"), local: true });
  state.syllabusReviews = [draft, ...state.syllabusReviews].slice(0, 100);
  rerender();
  notifyUser({
    type: "syllabus_review",
    title: "Syllabus review started",
    body: "APEX created a review card. Confirm the extracted placeholders before they become schedule data.",
    severity: "info",
    sourceEntityType: "upload",
    sourceEntityId: upload.id,
  });

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    const cloudDraft = {
      ...draft,
      uploadId: isUuid(upload.id) ? upload.id : null,
    };
    const created = normalizeSyllabusReview(await createSyllabusRecord(state.auth.client, state.workspace.id, cloudDraft));
    state.syllabusReviews = state.syllabusReviews.map((item) => item.id === draft.id ? created : item);
    saveState();
    renderApp();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Syllabus review sync unavailable.",
    };
    notifyUser({
      type: "syllabus_sync_error",
      title: "Syllabus review saved locally",
      body: "APEX could not write the review to Supabase, so it remains local fallback state.",
      severity: "warning",
    });
  }
}

async function confirmSyllabusReview(reviewId) {
  const current = state.syllabusReviews.map(normalizeSyllabusReview).find((item) => item.id === reviewId);
  if (!current) return;
  const updated = normalizeSyllabusReview({
    ...current,
    parseStatus: "confirmed",
    confidence: Math.max(current.confidence, 0.75),
    updatedAt: new Date().toISOString(),
    local: current.local,
  });
  state.syllabusReviews = state.syllabusReviews.map((item) => item.id === reviewId ? updated : item);
  rerender();
  notifyUser({
    type: "syllabus_confirmed",
    title: "Syllabus review confirmed",
    body: "The syllabus is marked confirmed. Real assignment creation will come after document text extraction is connected.",
    severity: "success",
    sourceEntityType: "syllabus",
    sourceEntityId: reviewId,
  });

  if (!state.workspace.phase2Enabled || !state.auth.client || !isUuid(reviewId)) return;
  try {
    const cloud = normalizeSyllabusReview(await updateSyllabusRecord(state.auth.client, reviewId, {
      parseStatus: "confirmed",
      confidence: updated.confidence,
      parsedSummary: updated.parsedSummary,
    }));
    state.syllabusReviews = state.syllabusReviews.map((item) => item.id === reviewId ? cloud : item);
    saveState();
    renderApp();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Syllabus review update unavailable.",
    };
    saveState();
  }
}

async function createNotebookNote() {
  const note = normalizeNote({
    id: localId("note"),
    title: "Untitled note",
    domain: "notebook",
    tags: ["draft"],
    body: "",
    local: true,
  });
  state.notes = [note, ...state.notes].slice(0, 100);
  state.activeNoteId = note.id;
  rerender();
  notifyUser({
    type: "note_created",
    title: "New note created",
    body: "Your note is ready. It autosaves locally and syncs to Supabase when the Phase 2 schema is active.",
    severity: "success",
  });

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    const cloud = normalizeNote(await createNoteRecord(state.auth.client, state.workspace.id, note));
    state.notes = state.notes.map((item) => item.id === note.id ? cloud : item);
    state.activeNoteId = cloud.id;
    saveState();
    renderApp();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Note sync unavailable.",
    };
    saveState();
  }
}

async function syncNoteIfCloud(note) {
  if (!state.workspace.phase2Enabled || !state.auth.client || !isUuid(note.id)) return;
  try {
    const cloud = normalizeNote(await updateNoteRecord(state.auth.client, note.id, note));
    state.notes = state.notes.map((item) => item.id === note.id ? cloud : item);
    saveState();
    renderShellStatus();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Note update unavailable.",
    };
    saveState();
  }
}

async function updateActiveNote(patch, { syncCloud = false } = {}) {
  const activeId = state.activeNoteId;
  if (!activeId) return;
  let updatedNote = null;
  state.notes = state.notes.map((item) => {
    if (String(item.id) !== String(activeId)) return item;
    updatedNote = normalizeNote({
      ...item,
      ...patch,
      updatedAt: new Date().toISOString(),
      updated: "Just now",
    });
    return updatedNote;
  });
  saveState();
  renderShellStatus();
  if (syncCloud && updatedNote) await syncNoteIfCloud(updatedNote);
}

async function persistIntegration(integration) {
  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    const saved = normalizeIntegration(await upsertIntegrationRecord(state.auth.client, state.workspace.id, {
      ...integration,
      metadata: {
        ...(integration.metadata || {}),
        displayName: integration.displayName,
        domain: integration.domain,
        description: integration.description,
        events: integration.metadata?.events || [],
      },
    }));
    state.integrations = mergeIntegrationTemplates(state.integrations.map((item) => item.provider === saved.provider ? saved : item));
    saveState();
    renderShellStatus();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Integration sync unavailable.",
    };
    saveState();
  }
}

async function persistIntegrationEvent(integration, event) {
  if (!event || !state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    await createIntegrationEventRecord(state.auth.client, state.workspace.id, integration, event);
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Integration event log unavailable.",
    };
    saveState();
  }
}

async function updateIntegration(provider, patch, { toast = false, event = null } = {}) {
  const current = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!current) return;
  const metadata = mergeConnectorEvent({
    ...(current.metadata || {}),
    ...(patch.metadata || {}),
  }, event);
  const updated = normalizeIntegration({
    ...current,
    ...patch,
    metadata,
    updatedAt: new Date().toISOString(),
    local: current.local,
  });
  state.integrations = mergeIntegrationTemplates(state.integrations.map((item) => item.provider === provider ? updated : item));
  saveState();
  renderApp();
  await persistIntegration(updated);
  await persistIntegrationEvent(updated, event);
  if (toast) {
    notifyUser({
      type: "integration_update",
      title: `${updated.displayName} ${updated.status}`,
      body: updated.lastError || "Connector status updated.",
      severity: updated.status === "error" ? "warning" : "info",
      sourceEntityType: "integration",
      sourceEntityId: isUuid(updated.id) ? updated.id : null,
    });
  }
}

async function connectIntegration(provider) {
  const integration = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!integration) return;
  const now = new Date().toISOString();
  const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await updateIntegration(provider, {
    status: "connected",
    authState: "connected",
    syncStatus: "idle",
    webhookStatus: provider === "apex_webhook" ? "active" : "not_configured",
    refreshStatus: provider === "apex_webhook" ? "not_required" : "fresh",
    tokenRef: provider === "apex_webhook" ? null : `${provider}_stub_access_token`,
    refreshTokenRef: provider === "apex_webhook" ? null : `${provider}_stub_refresh_token`,
    tokenExpiresAt: provider === "apex_webhook" ? null : tokenExpiresAt,
    lastTestedAt: now,
    lastError: "",
    lastSyncResult: {
      message: provider === "apex_webhook" ? "Webhook source enabled." : "Connector auth placeholder created. Replace with provider OAuth flow.",
      endpoint: integrationEndpoint(provider) || "oauth-required",
      recordsImported: 0,
    },
  }, {
    toast: true,
    event: connectorEvent("connect", "success", `${integration.displayName} connector connected.`, { provider, connectedAt: now }),
  });
}

async function disconnectIntegration(provider) {
  const integration = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!integration) return;
  const now = new Date().toISOString();
  await updateIntegration(provider, {
    status: "disconnected",
    authState: "not_connected",
    syncStatus: "disabled",
    webhookStatus: provider === "apex_webhook" ? "paused" : "not_configured",
    refreshStatus: "not_required",
    tokenRef: null,
    refreshTokenRef: null,
    tokenExpiresAt: null,
    nextSyncAt: null,
    lastError: "",
    lastSyncResult: { message: "Connector disconnected.", recordsImported: 0 },
  }, {
    toast: true,
    event: connectorEvent("disconnect", "info", `${integration.displayName} connector disconnected.`, { provider, disconnectedAt: now }),
  });
}

async function reauthIntegration(provider) {
  const integration = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!integration) return;
  await updateIntegration(provider, {
    status: "needs_reauth",
    authState: "reauth_requested",
    syncStatus: "disabled",
    refreshStatus: "refreshing",
    tokenRef: null,
    refreshTokenRef: null,
    tokenExpiresAt: null,
    lastError: "Re-auth requested. The connector is waiting for the real OAuth redirect flow.",
    lastSyncResult: { message: "Re-auth requested. OAuth implementation is the next provider-specific step." },
  }, {
    toast: true,
    event: connectorEvent("reauth", "warning", `${integration.displayName} is ready for provider re-auth.`, { provider }),
  });
}

async function testIntegration(provider) {
  const integration = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!integration) return;
  const now = new Date().toISOString();
  const endpoint = integrationEndpoint(provider);
  if (integration.status !== "connected" && provider !== "apex_webhook") {
    await updateIntegration(provider, {
      status: "needs_reauth",
      authState: "needs_reauth",
      syncStatus: "disabled",
      lastTestedAt: now,
      lastError: "Connect this provider before testing it.",
      lastSyncResult: { message: "Connection test blocked because auth is not connected." },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("test", "warning", `${integration.displayName} test needs auth first.`, { provider }),
    });
    return;
  }
  if (!endpoint) {
    await updateIntegration(provider, {
      status: "needs_reauth",
      authState: "needs_reauth",
      syncStatus: "error",
      lastTestedAt: now,
      lastError: "This provider needs its OAuth/native connector implementation before tests can pass.",
      lastSyncResult: { message: "No test endpoint exists yet.", endpoint: "provider-oauth-required" },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("test", "warning", `${integration.displayName} has no live test endpoint yet.`, { provider }),
    });
    return;
  }
  await updateIntegration(provider, {
    syncStatus: "syncing",
    lastTestedAt: now,
    lastError: "Testing connection...",
  });
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Connector test returned ${response.status}`);
    await updateIntegration(provider, {
      status: "connected",
      authState: "connected",
      syncStatus: "success",
      lastTestedAt: new Date().toISOString(),
      lastError: "",
      lastSyncResult: { message: "Connection test passed.", endpoint, httpStatus: response.status, recordsImported: 0 },
    }, {
      toast: true,
      event: connectorEvent("test", "success", `${integration.displayName} test passed.`, { provider, endpoint, httpStatus: response.status }),
    });
  } catch (error) {
    await updateIntegration(provider, {
      status: "error",
      authState: "error",
      syncStatus: "error",
      lastTestedAt: now,
      lastError: error instanceof Error ? error.message : "Connector test failed.",
      lastSyncResult: { message: "Connection test failed.", endpoint },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("test", "error", `${integration.displayName} test failed.`, { provider, endpoint }),
    });
  }
}

async function syncIntegration(provider) {
  const integration = mergeIntegrationTemplates().find((item) => item.provider === provider);
  if (!integration) return;
  const now = new Date().toISOString();
  if (integration.status !== "connected" && provider !== "apex_webhook") {
    await updateIntegration(provider, {
      status: "needs_reauth",
      authState: "needs_reauth",
      syncStatus: "disabled",
      lastError: "Connect this provider before running a live sync.",
      lastSyncResult: { message: "Sync blocked because auth is not connected." },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("sync", "warning", `${integration.displayName} sync needs auth first.`, { provider }),
    });
    return;
  }

  const endpoint = integrationEndpoint(provider, { refresh: true });

  if (!endpoint) {
    await updateIntegration(provider, {
      status: "needs_reauth",
      authState: "needs_reauth",
      syncStatus: "error",
      lastError: "OAuth for this provider is not implemented yet. The connector record is ready for the real flow.",
      lastSyncedAt: now,
      lastSyncResult: { message: "No sync endpoint exists yet.", endpoint: "provider-oauth-required" },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("sync", "warning", `${integration.displayName} needs a provider-specific sync implementation.`, { provider }),
    });
    return;
  }

  await updateIntegration(provider, { status: "connected", authState: "connected", syncStatus: "syncing", lastError: "Syncing...", lastSyncedAt: now });
  try {
    const response = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Connector returned ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    const importedCount = Object.values(payload || {}).reduce((count, value) => count + (Array.isArray(value) ? value.length : 0), 0);
    const finishedAt = new Date().toISOString();
    await updateIntegration(provider, {
      status: "connected",
      authState: "connected",
      syncStatus: "success",
      refreshStatus: provider === "apex_webhook" ? "not_required" : "fresh",
      lastSyncedAt: finishedAt,
      nextSyncAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastSyncResult: { message: "Sync completed.", endpoint, httpStatus: response.status, recordsImported: importedCount },
      lastError: "",
    }, {
      toast: true,
      event: connectorEvent("sync", "success", `${integration.displayName} sync completed.`, { provider, endpoint, httpStatus: response.status, recordsImported: importedCount }),
    });
  } catch (error) {
    await updateIntegration(provider, {
      status: "error",
      authState: "error",
      syncStatus: "error",
      lastSyncedAt: now,
      lastError: error instanceof Error ? error.message : "Connector sync failed.",
      lastSyncResult: { message: "Sync failed.", endpoint },
      errorCount: integration.errorCount + 1,
    }, {
      toast: true,
      event: connectorEvent("sync", "error", `${integration.displayName} sync failed.`, { provider, endpoint }),
    });
  }
}

async function markNotificationRead(notificationId) {
  const now = new Date().toISOString();
  state.notifications = state.notifications.map((item) => item.id === notificationId ? { ...item, read_at: item.read_at || now } : item);
  saveState();
  renderShellStatus();
  renderNotificationCenter();
  if (!state.workspace.phase2Enabled || !state.auth.client || !state.auth.user) return;
  try {
    await markNotificationRecordRead(state.auth.client, notificationId, state.auth.user.id);
  } catch {
    state.notificationStatus = "local";
    saveState();
    renderNotificationCenter();
  }
}

async function dismissNotification(notificationId) {
  const now = new Date().toISOString();
  state.notifications = state.notifications.map((item) => item.id === notificationId ? { ...item, dismissed_at: item.dismissed_at || now } : item);
  saveState();
  renderShellStatus();
  renderNotificationCenter();
  if (!state.workspace.phase2Enabled || !state.auth.client || !state.auth.user) return;
  try {
    await dismissNotificationRecord(state.auth.client, notificationId, state.auth.user.id);
  } catch {
    state.notificationStatus = "local";
    saveState();
    renderNotificationCenter();
  }
}

async function markAllNotificationsRead() {
  const ids = unreadNotifications().map((item) => item.id);
  state.notifications = state.notifications.map((item) => item.dismissed_at || item.resolved_at ? item : { ...item, read_at: item.read_at || new Date().toISOString() });
  saveState();
  renderShellStatus();
  renderNotificationCenter();
  for (const id of ids) {
    if (state.workspace.phase2Enabled && state.auth.client && state.auth.user) {
      try {
        await markNotificationRecordRead(state.auth.client, id, state.auth.user.id);
      } catch {
        state.notificationStatus = "local";
        saveState();
        renderNotificationCenter();
        break;
      }
    }
  }
}

function formatHourLabel(hour) {
  if (Number(hour) === 24) return "12:00 AM";
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

function renderAuthShell() {
  const modeLabel = state.auth.mode === "sign-up" ? "Create account" : "Sign in";
  const altLabel = state.auth.mode === "sign-up" ? "Already have an account? Sign in" : "Create your first account";
  const body = !state.auth.ready
    ? `<div class="auth-card"><div class="panel-label">starting apex</div><h1>Loading your workspace...</h1><p>Checking Supabase Auth and preparing your private APEX state.</p></div>`
    : !state.auth.enabled
      ? `<div class="auth-card"><div class="panel-label">supabase setup required</div><h1>Connect Supabase to unlock first-user testing.</h1><p>${escapeHtml(state.auth.error || "Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and your local .env file, then run the Supabase schema.")}</p><div class="auth-hint"><strong>Next:</strong> run <code>supabase/schema.sql</code> in Supabase SQL Editor, then redeploy or restart the local server.</div></div>`
      : `<form class="auth-card" data-auth-form><div class="panel-label">private beta login</div><h1>${modeLabel} to APEX Universal</h1><p>New accounts start with a clean workspace: no demo classes, no preset tasks, and no inherited connector state.</p><label class="field-shell"><div class="field-row"><span>Email</span></div><input class="search-input" type="email" autocomplete="email" value="${escapeHtml(state.auth.email)}" data-auth-email /></label><label class="field-shell"><div class="field-row"><span>Password</span></div><input class="search-input" type="password" autocomplete="${state.auth.mode === "sign-up" ? "new-password" : "current-password"}" value="${escapeHtml(state.auth.password)}" data-auth-password /></label>${state.auth.error ? `<div class="auth-error">${escapeHtml(state.auth.error)}</div>` : ""}${state.auth.message ? `<div class="auth-hint">${escapeHtml(state.auth.message)}</div>` : ""}<div class="hero-actions"><button class="primary-action" type="submit">${modeLabel}</button><button class="surface-action" type="button" data-auth-toggle>${altLabel}</button></div></form>`;
  app.innerHTML = `<div class="auth-shell"><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><div class="auth-poster"><div class="eyebrow">${iconSvg("command")}<span>APEX Universal 2.0</span></div><h2>Your Life OS starts empty, then learns from your actual sources.</h2><p>Log in, take the guided first run, and connect files, LMS, calendar, and webhook data only when you're ready.</p></div>${body}</div>`;
}

function connectorIsConnected(providers, connectors = mergeIntegrationTemplates()) {
  return connectors.some((item) => providers.includes(item.provider) && item.status === "connected");
}

function setupProgress(checks) {
  const completed = checks.filter((item) => item.done).length;
  return {
    completed,
    total: checks.length,
    done: completed === checks.length,
    label: `${completed}/${checks.length} complete`,
  };
}

function buildSetupGuideItems() {
  const connectors = mergeIntegrationTemplates();
  const hasBudget = Number(state.budget?.income || 0) > 0 || Number(state.budget?.spent || 0) > 0 || Number(state.budget?.left || 0) > 0;
  const constraintsChanged = JSON.stringify(normalizeConstraints(state.constraints)) !== JSON.stringify(normalizeConstraints(DEFAULT_CONSTRAINTS));
  const item = (config) => {
    const progress = setupProgress(config.checks);
    const missing = config.checks.find((check) => !check.done)?.label || "Nothing missing right now.";
    return {
      ...config,
      ...progress,
      missing,
      status: progress.done ? "Ready" : progress.label,
    };
  };

  return [
    item({
      title: "Syllabus intake",
      headline: "Upload your syllabus",
      text: "Upload your syllabus so due dates can auto-populate after review.",
      domain: "notebook",
      action: "Upload in Notebook",
      unlocked: "APEX can start a review queue for course dates, policies, and assignment hints.",
      checks: [
        { label: "Upload a syllabus or assignment file", done: state.uploadedFiles.length > 0 },
        { label: "Start or confirm syllabus review", done: state.syllabusReviews.length > 0 },
      ],
    }),
    item({
      title: "School setup",
      headline: "Connect school tools",
      text: "Connect school tools so assignments, courses, and grade context can sync automatically.",
      domain: "academy",
      action: "Open Academy",
      unlocked: "Academic risk, priorities, and study blocks become grounded in real class context.",
      checks: [
        { label: "Add or import courses", done: state.courses.length > 0 },
        { label: "Connect Canvas or LMS source", done: connectorIsConnected(["canvas"], connectors) },
        { label: "Import academy tasks", done: state.tasks.some((task) => task.domain === "academy") },
        { label: "Attach a school source file", done: state.uploadedFiles.length > 0 || state.syllabusReviews.length > 0 },
      ],
    }),
    item({
      title: "Calendar and work",
      headline: "Connect calendar and shifts",
      text: "Connect calendar or work sources so study plans avoid conflicts before they happen.",
      domain: "works",
      action: "Open Works",
      unlocked: "The solver can protect shifts, meetings, and fixed commitments as hard constraints.",
      checks: [
        { label: "Add schedule blocks", done: state.schedule.length > 0 },
        { label: "Connect Google Calendar", done: connectorIsConnected(["google_calendar"], connectors) },
        { label: "Connect shifts or work source", done: connectorIsConnected(["deputy"], connectors) || state.schedule.some((item) => item.domain === "works") },
        { label: "Add work tasks", done: state.tasks.some((task) => task.domain === "works") },
      ],
    }),
    item({
      title: "Finance context",
      headline: "Add bills or finance",
      text: "Add bills so your schedule reflects financial pressure too.",
      domain: "life",
      action: "Open Life",
      unlocked: "Bill timing can influence warnings, weekly pressure, and next-best-move recommendations.",
      checks: [
        { label: "Add bills", done: state.bills.length > 0 },
        { label: "Connect Plaid finance", done: connectorIsConnected(["plaid"], connectors) },
        { label: "Add budget context", done: hasBudget },
        { label: "Add paycheck timing", done: state.paychecks.length > 0 },
      ],
    }),
    item({
      title: "Scheduler tuning",
      headline: "Tune scheduler guardrails",
      text: "Tune the scheduler so APEX respects your real-life boundaries and preferred work style.",
      domain: "command",
      action: "Tune Constraints",
      unlocked: "The planner can explain tradeoffs using your own windows, modes, and recovery rules.",
      checks: [
        { label: "Finish or skip tutorial", done: Boolean(state.onboarding?.tutorialCompleted || state.onboarding?.tutorialSkipped) },
        { label: "Review constraint settings", done: constraintsChanged },
        { label: "Choose or preview a schedule mode", done: state.scheduleMode !== "balanced" || Boolean(state.pendingScheduleMode) },
        { label: "Log a Mind check-in", done: Boolean(state.checkin?.submitted) },
      ],
    }),
  ];
}

function renderOnboarding() {
  if (!state.onboarding?.tutorialOpen) return "";
  const steps = buildSetupGuideItems();
  const index = Math.min(state.onboarding.activeStep || 0, steps.length - 1);
  const step = steps[index];
  const next = steps[index + 1];
  const feedback = step.done
    ? ["Your app just got smarter.", step.unlocked]
    : ["What this unlocks", step.unlocked];
  const smallFeedback = step.done
    ? "Still optional: keep connecting more sources when you are ready."
    : `Still missing: ${step.missing}`;
  const nextLabel = index === steps.length - 1 ? "Finish Setup" : `Next${next ? `: ${next.title}` : ""}`;
  return `<div class="onboarding-card" style="--accent:${colorFor(step.domain)};"><div class="panel-label">setup ${index + 1}/${steps.length}</div><div class="setup-progress">${steps.map((_step, stepIndex) => `<span class="${stepIndex <= index ? "is-active" : ""}"></span>`).join("")}</div><h3>${escapeHtml(step.headline)}</h3><p>${escapeHtml(step.text)}</p><div class="setup-feedback ${step.done ? "is-complete" : ""}"><strong>${escapeHtml(feedback[0])}</strong><span>${escapeHtml(feedback[1])}</span><small>${escapeHtml(smallFeedback)}</small></div><div class="source-actions"><button class="surface-action" data-onboarding-back ${index === 0 ? "disabled" : ""}>Back</button><button class="primary-action" data-onboarding-next>${escapeHtml(nextLabel)}</button><button class="surface-action" data-onboarding-skip>Skip</button></div></div>`;
}

function renderSectionHelp() {
  const domain = activeDomain();
  if (state.onboarding?.sectionHelpSeen?.[domain.id]) return "";
  const help = HELP_COPY[domain.id];
  if (!help) return "";
  return `<aside class="section-help" style="--accent:${colorFor(domain.id)};"><div class="help-icon">${iconSvg(domain.id)}</div><div><div class="panel-label">section guide</div><h4>${help[0]}</h4><p>${help[1]}</p></div><button aria-label="Dismiss help" data-help-dismiss>&times;</button></aside>`;
}

function renderNotificationCenter() {
  let panel = doc?.querySelector("[data-notification-center]");
  if (!state.notificationPanelOpen) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-notification-center", "");
    doc.body.appendChild(panel);
  }
  const activeItems = state.notifications.filter((item) => !item.dismissed_at).slice(0, 20);
  panel.className = "notification-center";
  panel.innerHTML = `<div class="notification-head"><div><div class="panel-label">notification center</div><h4>Action state</h4><p>${state.workspace.phase2Enabled ? "Backed by Supabase records." : "Local fallback until phase2_schema.sql is active."}</p></div><button aria-label="Close notifications" data-notification-toggle>&times;</button></div><div class="notification-actions"><button class="surface-action" data-notification-read-all>Mark all read</button>${pill(`${unreadNotifications().length} unread`, unreadNotifications().length ? TOKENS.warn : TOKENS.ok)}${pill(state.notificationStatus, state.notificationStatus === "cloud" ? TOKENS.ok : TOKENS.notebook)}</div><div class="notification-list">${activeItems.length ? activeItems.map((item) => `<article class="notification-item ${item.read_at ? "is-read" : "is-unread"}" style="--accent:${item.severity === "critical" ? TOKENS.danger : item.severity === "warning" ? TOKENS.warn : item.severity === "success" ? TOKENS.ok : TOKENS.command};"><div class="notification-dot"></div><div class="notification-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || "No additional detail.")}</p><small>${new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div><div class="notification-controls"><button class="small-action" data-notification-read="${item.id}">${item.read_at ? "Read" : "Mark Read"}</button><button class="small-action" data-notification-dismiss="${item.id}">Dismiss</button></div></article>`).join("") : `<div class="empty-notifications">No active notifications. When APEX creates a real alert, it will show here first and the toast will only mirror it briefly.</div>`}</div></aside>`;
}

function commandPaletteItems() {
  const domainItems = DOMAINS.map((domain) => ({
    id: `domain-${domain.id}`,
    title: `Open ${domain.label}`,
    subtitle: domain.blurb,
    domain: domain.id,
    keywords: `${domain.id} ${domain.label} ${domain.blurb}`,
  }));
  return [
    ...domainItems,
    { id: "personalization", title: "Open Personalization", subtitle: "Theme, density, type scale, accent, and layout profile.", domain: "command", scrollSelector: "[data-personalization-panel]", widgetId: "personalization", keywords: "theme density font scale accent layout profile personalize" },
    { id: "widgets", title: "Open Widget Layout", subtitle: "Pin, hide, restore, and reorder Command Center widgets.", domain: "command", scrollSelector: "[data-widget-manager-panel]", keywords: "widgets layout pin hide order dashboard customize" },
    { id: "connectors", title: "Open Connector Framework", subtitle: "Inspect auth, sync, webhooks, and provider lifecycle state.", domain: "command", scrollSelector: "[data-connector-panel]", widgetId: "connectors", keywords: "connect accounts canvas google calendar plaid deputy health webhook integrations" },
    { id: "sources", title: "Open Live Data Sources", subtitle: "Sync local JSON, manual payloads, and webhook-fed source data.", domain: "command", scrollSelector: "[data-source-panel]", widgetId: "sources", keywords: "live data sources json sync payload webhook" },
    { id: "constraints", title: "Open Constraint Studio", subtitle: "Tune hard guardrails, soft preferences, and human override rules.", domain: "command", scrollSelector: "[data-constraint-panel]", widgetId: "constraints", keywords: "constraints schedule guardrails overrides solver" },
    { id: "modes", title: "Open Schedule Modes", subtitle: "Preview Balanced, Focus Week, Recovery, Finals, Work-Heavy, and Catch-Up modes.", domain: "command", scrollSelector: "[data-schedule-mode-panel]", widgetId: "modes", keywords: "schedule modes focus recovery finals work heavy catch up" },
    { id: "why-plan", title: "Open Why This Plan", subtitle: "Review solver reasoning, tradeoffs, confidence, and schedule deltas.", domain: "command", scrollSelector: "[data-why-plan-panel]", widgetId: "why", keywords: "why this plan reasoning confidence tradeoffs deltas explanations" },
    { id: "uploads", title: "Upload Files", subtitle: "Go to Notebook source uploads for syllabi, notes, and assignment sheets.", domain: "notebook", scrollSelector: "[data-upload-panel]", keywords: "upload syllabus files notes pdf assignment sheet notebook" },
    { id: "syllabus-review", title: "Review Syllabus Queue", subtitle: "Confirm parsed syllabus placeholders before anything is scheduled.", domain: "notebook", scrollSelector: "[data-syllabus-review-panel]", keywords: "syllabus review confirm course assignments dates" },
    { id: "notifications", title: "Open Notifications", subtitle: "View unread, dismissed, and local/cloud notification state.", action: "notifications", domain: "command", keywords: "alerts notifications unread read dismissed" },
  ];
}

function filteredCommandPaletteItems() {
  const query = state.commandPaletteQuery.trim().toLowerCase();
  const items = commandPaletteItems();
  if (!query) return items;
  return items.filter((item) => `${item.title} ${item.subtitle} ${item.keywords || ""}`.toLowerCase().includes(query));
}

function renderCommandPalette() {
  let panel = doc?.querySelector("[data-command-palette]");
  if (!state.commandPaletteOpen) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-command-palette", "");
    doc.body.appendChild(panel);
  }
  const items = filteredCommandPaletteItems();
  state.commandPaletteIndex = Math.max(0, Math.min(state.commandPaletteIndex, Math.max(0, items.length - 1)));
  const prefs = normalizePreferences(state.preferences);
  panel.className = `command-palette theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<div class="command-palette__scrim" data-command-close></div><div class="command-palette__dialog" role="dialog" aria-modal="true" aria-label="Command palette"><div class="command-palette__head"><div><div class="panel-label">quick switcher</div><h4>Where do you want to go?</h4></div><button class="surface-action surface-action--small" data-command-close aria-label="Close command palette">Close</button></div><label class="command-search"><span>${iconSvg("command", "Search commands")}</span><input value="${escapeHtml(state.commandPaletteQuery)}" placeholder="Search sections, setup, uploads, connectors..." data-command-input autocomplete="off" /></label><div class="command-list" role="listbox" aria-label="Command results">${items.length ? items.map((item, index) => `<button class="command-item ${index === state.commandPaletteIndex ? "is-active" : ""}" role="option" aria-selected="${index === state.commandPaletteIndex}" data-command-action="${escapeHtml(item.id)}" style="--accent:${colorFor(item.domain || "command")};"><span class="command-item__icon">${iconSvg(item.domain || "command", item.title)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small></span><kbd>Enter</kbd></button>`).join("") : `<div class="empty-command-results">No command matched. Try "upload", "connect", "calendar", or "constraints".</div>`}</div><div class="command-palette__footer"><span>Ctrl/⌘ K opens this palette</span><span>Esc closes · ↑ ↓ moves · Enter opens</span></div></div>`;
  requestAnimationFrame(() => panel?.querySelector("[data-command-input]")?.focus());
}

function openCommandPalette() {
  if (!state.auth.user) return;
  state.commandPaletteOpen = true;
  state.commandPaletteIndex = 0;
  renderCommandPalette();
}

function closeCommandPalette() {
  state.commandPaletteOpen = false;
  state.commandPaletteQuery = "";
  state.commandPaletteIndex = 0;
  renderCommandPalette();
}

function scrollToSelectorAfterRender(selector) {
  if (!selector) return;
  requestAnimationFrame(() => doc?.querySelector(selector)?.scrollIntoView({ block: "start", behavior: "smooth" }));
}

function executeCommandPaletteAction(actionId) {
  const item = commandPaletteItems().find((candidate) => candidate.id === actionId);
  if (!item) return;
  closeCommandPalette();
  if (item.action === "notifications") {
    state.notificationPanelOpen = true;
    saveState();
    renderNotificationCenter();
    return;
  }
  if (item.widgetId && item.domain === "command") {
    state.widgets = normalizeWidgets(state.widgets);
    const profile = activeWidgetProfile();
    state.widgets.commandProfiles[profile] = commandWidgets().map((widget) => (widget.id === item.widgetId ? { ...widget, visible: true } : widget));
    state.widgets.command = state.widgets.commandProfiles.guided;
  }
  if (item.domain) state.activeDomain = item.domain;
  rerender();
  scrollToSelectorAfterRender(item.scrollSelector);
}

function renderMobileNavSheet() {
  let panel = doc?.querySelector("[data-mobile-nav-sheet]");
  if (!state.mobileNavOpen) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-mobile-nav-sheet", "");
    doc.body.appendChild(panel);
  }
  const prefs = normalizePreferences(state.preferences);
  const profile = COMMAND_WIDGET_PROFILE_PRESETS[activeWidgetProfile()] || COMMAND_WIDGET_PROFILE_PRESETS.guided;
  panel.className = `mobile-nav-sheet theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<div class="mobile-nav-sheet__scrim" data-mobile-nav-close></div><div class="mobile-nav-sheet__panel" role="dialog" aria-modal="true" aria-label="Mobile navigation"><div class="mobile-nav-grabber"></div><div class="mobile-nav-head"><div><div class="panel-label">navigation</div><h4>Move through APEX</h4><p>${escapeHtml(profile.label)} layout profile is active.</p></div><button class="surface-action surface-action--small" data-mobile-nav-close aria-label="Close mobile menu">Close</button></div><div class="mobile-nav-actions"><button class="primary-action" data-command-open data-mobile-nav-close>Search everything</button><button class="surface-action" data-domain="command" data-scroll-personalization data-mobile-nav-close>Personalize</button><button class="surface-action" data-command-action="uploads" data-mobile-nav-close>Upload files</button></div><nav class="mobile-nav-grid" aria-label="Mobile sections">${DOMAINS.map((domain) => `<button class="mobile-nav-item ${state.activeDomain === domain.id ? "is-active" : ""}" data-domain="${domain.id}" data-mobile-nav-close style="--accent:${colorFor(domain.id)};" aria-current="${state.activeDomain === domain.id ? "page" : "false"}"><span>${iconSvg(domain.id, domain.label)}</span><strong>${domain.label}</strong><small>${domain.blurb}</small></button>`).join("")}</nav></div>`;
}

function closeMobileNavSheet() {
  state.mobileNavOpen = false;
  renderMobileNavSheet();
}

function heroBand(intel) {
  const domain = activeDomain();
  const loadValue = intel.loadDisplay || `${intel.loadScore}%`;
  const loadMode = intel.loadLabel === "setup" ? "setup mode" : intel.loadScore >= 70 ? "stabilize mode" : "balanced mode";
  const titles = {
    command: ["Life operating system", "One command deck for school, work, money, recovery, and long-range ambition."],
    academy: ["Academic kernel", "Grades, deadlines, and study quality in one adaptive loop."],
    works: ["Operational income", "See shifts, interviews, and work pressure in the same planning engine."],
    life: ["Home + finance", "Bills and routines stay visible before they become background stress."],
    future: ["Trajectory", "Translate long-term ambition into repeatable weekly motion."],
    mind: ["Load awareness", "Energy, focus, and mood shape the plan instead of getting ignored."],
    notebook: ["Source-grounded memory", "Turn scattered notes and brain dumps into grounded action."],
  }[domain.id];
  return `<section class="hero-band" style="--accent:${colorFor(domain.id)};"><div class="hero-copy"><div class="eyebrow">${iconSvg(domain.id)}<span>${titles[0]}</span></div><h3>${titles[1]}</h3><p>APEX treats overwhelm as a systems problem. Hard constraints stay visible, the schedule is solver-backed, and live data can update the day without code edits.</p><div class="hero-actions"><button class="primary-action" data-focus-top>Focus Now</button><button class="surface-action" data-domain="notebook">Inspect Context</button>${pill(loadMode, intel.loadScore >= 70 ? TOKENS.warn : colorFor(domain.id))}</div></div><div class="hero-stats"><div class="hero-stat"><span>Load Index</span><strong>${loadValue}</strong></div><div class="hero-stat"><span>Urgent Open</span><strong>${intel.openUrgentCount}</strong></div><div class="hero-stat"><span>Solver Fit</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="hero-stat"><span>Guardrails</span><strong>${intel.solverSummary.hardGuardrails}</strong></div></div></section>`;
}

function renderConstraintPanel(intel) {
  const hard = intel.constraintsUsed.hard;
  const soft = intel.constraintsUsed.soft;
  const dayparts = [
    ["none", "No reserved daypart"],
    ["morning", "Reserve morning"],
    ["afternoon", "Reserve afternoon"],
    ["evening", "Reserve evening"],
  ];
  return `<article class="panel span-6" data-constraint-panel style="--accent:${TOKENS.command};"><div class="panel-label">constraint studio</div><div class="control-grid"><div class="control-card"><div class="subtle-label">Hard guardrails</div><div class="toggle-grid">${[
    ["lockClasses", "Lock classes"],
    ["lockWorkShifts", "Lock work shifts"],
    ["protectRecoveryBlocks", "Protect recovery"],
  ].map(([key, label]) => `<button class="toggle-chip ${hard[key] ? "is-active" : ""}" data-constraint-toggle-group="hard" data-constraint-toggle-key="${key}" style="--accent:${TOKENS.command};"><span>${label}</span><strong>${hard[key] ? "On" : "Off"}</strong></button>`).join("")}</div><div class="field-stack">${[
    ["minSleepHours", "Minimum sleep", hard.minSleepHours, 6, 9, 1, `${hard.minSleepHours}h`],
    ["windDownHour", "Wind-down hour", hard.windDownHour, 20, 24, 1, formatHourLabel(hard.windDownHour)],
    ["maxFocusBlockMinutes", "Max focus block", hard.maxFocusBlockMinutes, 30, 120, 15, `${hard.maxFocusBlockMinutes}m`],
  ].map(([key, label, value, min, max, step, display]) => `<label class="field-shell"><div class="field-row"><span>${label}</span><strong>${display}</strong></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-constraint-range-group="hard" data-constraint-range-key="${key}" /></label>`).join("")}</div></div><div class="control-card"><div class="subtle-label">Human override rules</div><div class="field-stack">${[
    ["earliestScheduleHour", "Never schedule before", hard.earliestScheduleHour, 0, 14, 1, formatHourLabel(hard.earliestScheduleHour)],
    ["latestScheduleHour", "Avoid scheduling after", hard.latestScheduleHour, 12, 24, 1, formatHourLabel(hard.latestScheduleHour)],
    ["maxDeepWorkBlocks", "Max deep-work blocks", hard.maxDeepWorkBlocks, 0, 6, 1, `${hard.maxDeepWorkBlocks}/day`],
  ].map(([key, label, value, min, max, step, display]) => `<label class="field-shell"><div class="field-row"><span>${label}</span><strong>${display}</strong></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-constraint-range-group="hard" data-constraint-range-key="${key}" /></label>`).join("")}</div><div class="toggle-grid toggle-grid--wide">${dayparts.map(([value, label]) => `<button class="toggle-chip ${hard.reservedDaypart === value ? "is-active" : ""}" data-override-daypart="${value}" style="--accent:${TOKENS.command};"><span>${label}</span><strong>${hard.reservedDaypart === value ? "On" : "Off"}</strong></button>`).join("")}</div></div><div class="control-card"><div class="subtle-label">Soft preferences</div><div class="field-stack">${[
    ["morningFocusBias", "Morning focus bias", soft.morningFocusBias],
    ["lowEnergyProtection", "Low-energy protection", soft.lowEnergyProtection],
    ["keepEveningLight", "Keep evenings light", soft.keepEveningLight],
    ["protectFutureWork", "Protect future work", soft.protectFutureWork],
    ["batchShallowWork", "Batch shallow work", soft.batchShallowWork],
  ].map(([key, label, value]) => `<label class="field-shell"><div class="field-row"><span>${label}</span><strong>${value}/8</strong></div><input type="range" min="0" max="8" step="1" value="${value}" data-constraint-range-group="soft" data-constraint-range-key="${key}" /></label>`).join("")}</div><div class="hero-actions"><button class="surface-action" data-reset-constraints>Reset defaults</button></div></div></div><div class="footer-note">Human override rules change feasibility directly. Use them for real-life boundaries like mornings, evenings, and reserved planning time.</div></article>`;
}

function renderScheduleModePanel(intel) {
  const activeMode = SCHEDULE_MODES[state.scheduleMode] || SCHEDULE_MODES.balanced;
  const previewKey = SCHEDULE_MODES[state.pendingScheduleMode] ? state.pendingScheduleMode : state.scheduleMode;
  const previewMode = SCHEDULE_MODES[previewKey] || activeMode;
  const isPreviewing = previewKey !== state.scheduleMode;
  const previewIntel = isPreviewing ? getIntelForMode(previewKey, intel.generatedAt) : intel;
  const currentSnapshot = buildScheduleRunSnapshot({ intel, scheduleMode: state.scheduleMode, createdAt: intel.generatedAt });
  const previewSnapshot = buildScheduleRunSnapshot({ intel: previewIntel, scheduleMode: previewKey, createdAt: intel.generatedAt });
  const previewDelta = compareScheduleRunSnapshots(currentSnapshot, previewSnapshot);
  const previewItems = previewDelta.items || [];
  const statTone = isPreviewing ? TOKENS.warn : TOKENS.ok;
  return `<article class="panel span-12" data-schedule-mode-panel style="--accent:${TOKENS.command};"><div class="panel-label">schedule modes</div><div class="mode-panel-head"><div><h3 class="empty-title">${isPreviewing ? `Preview: ${previewMode.label}` : activeMode.label}</h3><p class="row-subtitle">${isPreviewing ? "Review the tradeoffs before applying this mode." : activeMode.description}</p></div>${pill(isPreviewing ? "preview not applied" : "active mode", statTone)}</div><div class="mode-grid">${Object.entries(SCHEDULE_MODES).map(([key, item]) => `<button class="mode-card ${state.scheduleMode === key ? "is-active" : ""} ${previewKey === key && isPreviewing ? "is-preview" : ""}" data-schedule-mode="${key}" style="--accent:${TOKENS.command};"><strong>${item.label}</strong><span>${item.description}</span><small>${key === state.scheduleMode ? "Active" : previewKey === key ? "Previewing" : item.bestFor}</small></button>`).join("")}</div><div class="mode-preview-shell" style="--accent:${statTone};"><div class="mode-preview-copy"><div class="subtle-label">mode preview</div><h4>${escapeHtml(previewMode.label)}</h4><p>${escapeHtml(previewMode.bestFor)}</p><div class="inline-chips">${pill(`Load ${previewIntel.loadDisplay || `${previewIntel.loadScore}%`}`, TOKENS.command)}${pill(`${previewIntel.solverSummary.unscheduledUrgentCount} urgent carryover`, previewIntel.solverSummary.unscheduledUrgentCount ? TOKENS.warn : TOKENS.ok)}${pill(`${previewIntel.solverSummary.scheduledMinutes}m scheduled`, TOKENS.academy)}</div></div><div class="mode-preview-grid"><div><div class="subtle-label">Expected tradeoffs</div><div class="why-list why-list--compact">${previewMode.tradeoffs.map((item) => `<div><span>Tradeoff</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div></div><div><div class="subtle-label">Preview deltas</div><div class="why-list why-list--compact">${previewItems.slice(0, 4).map((item) => `<div><span>${isPreviewing ? "Preview" : "Current"}</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div><div class="footer-note" style="margin-top:0.75rem;">Watch for: ${escapeHtml(previewMode.watchFor)}</div></div></div><div class="mode-preview-actions"><button class="primary-action" data-mode-apply ${!isPreviewing ? "disabled" : ""}>Apply ${escapeHtml(previewMode.label)}</button><button class="surface-action" data-mode-cancel ${!isPreviewing ? "disabled" : ""}>Keep ${escapeHtml(activeMode.label)}</button><button class="surface-action" data-mode-reset ${state.scheduleMode === "balanced" && !isPreviewing ? "disabled" : ""}>Preview Balanced</button></div></div><div class="footer-note">Modes are overlays. They adjust solver weights for this planning context without deleting your custom hard/soft constraint settings.</div></article>`;
}

function renderWhyPlanPanel(intel) {
  const explanation = intel.planExplanation;
  const unscheduled = explanation.unscheduled || [];
  const changes = intel.planChanges || {};
  const changeTone = changes.status === "changed" ? TOKENS.warn : changes.status === "stable" ? TOKENS.ok : TOKENS.command;
  const changedAt = changes.previousAt
    ? `Compared with ${formatTimestamp(changes.previousAt)}`
    : "Baseline captured now";
  return `<article class="panel span-12" data-why-plan-panel style="--accent:${TOKENS.command};"><div class="panel-label">why this plan?</div><div class="why-plan-layout"><div class="why-plan-main"><h3 class="empty-title">${escapeHtml(explanation.primaryReason)}</h3><p class="row-subtitle">Confidence ${explanation.confidence}% &middot; ${SCHEDULE_MODES[state.scheduleMode]?.label || "Balanced"} mode</p><div class="why-list">${explanation.supportingReasons.map((reason) => `<div><span>Reason</span><strong>${escapeHtml(reason)}</strong></div>`).join("")}</div></div><div class="why-plan-side"><div class="subtle-label">Constraints applied</div><div class="inline-chips">${explanation.constraintsApplied.map((item) => pill(item, TOKENS.command)).join("")}</div><div class="subtle-label" style="margin-top:1rem;">Tradeoffs</div><div class="why-list why-list--compact">${explanation.tradeoffs.map((item) => `<div><span>Tradeoff</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div></div></div><div class="plan-change-card" style="--accent:${changeTone};"><div><div class="subtle-label">what changed since last plan</div><h4>${escapeHtml(changes.summary || "Plan comparison is warming up.")}</h4><p class="row-subtitle">${escapeHtml(changedAt)}</p></div><div class="why-list why-list--compact">${(changes.items || ["APEX will compare the next schedule recalculation against this baseline."]).map((item) => `<div><span>Delta</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div></div>${unscheduled.length ? `<div class="unscheduled-strip"><div class="subtle-label">unscheduled carryover</div>${unscheduled.slice(0, 4).map((chunk) => `<div class="row" style="--accent:${colorFor(chunk.domain)};"><div class="row-badge">${chunk.urgent ? "!" : "~"}</div><div class="row-copy"><div class="row-title">${escapeHtml(chunk.title)}</div><div class="row-subtitle">${escapeHtml(chunk.why)}</div></div>${pill(`${chunk.minutes}m`, colorFor(chunk.domain))}</div>`).join("")}</div>` : `<div class="footer-note">No unscheduled carryover under the current guardrails.</div>`}</article>`;
}

function renderSourcePanel() {
  const source = state.sourceConfig;
  return `<article class="panel span-6" data-source-panel style="--accent:${TOKENS.notebook};"><div class="panel-label">live data sources</div><div class="source-shell"><label class="field-shell"><div class="field-row"><span>Remote JSON URL</span><strong>${source.lastSyncStatus}</strong></div><input class="search-input" type="url" value="${escapeHtml(source.remoteUrl)}" placeholder="https://example.com/apex.json" data-source-url /></label><div class="source-actions"><button class="surface-action" data-use-local-source>Use local live source</button>${pill("/api/source/live", TOKENS.command)}</div><div class="field-row"><span>Auto-sync every minute</span><button class="toggle-chip ${source.autoSync ? "is-active" : ""}" data-source-toggle="autoSync" style="--accent:${TOKENS.command};"><strong>${source.autoSync ? "On" : "Off"}</strong></button></div><div class="source-actions"><button class="primary-action" data-sync-source>Sync now</button><button class="surface-action" data-reset-source>Status reset</button>${pill(source.lastSyncStatus, statusTone(source.lastSyncStatus))}</div><div class="meta-grid"><div class="metric-stack"><span>Last sync</span><strong>${formatTimestamp(source.lastSyncAt)}</strong></div><div class="metric-stack"><span>Error</span><strong>${escapeHtml(source.lastError || "None")}</strong></div></div><label class="field-shell"><div class="field-row"><span>Manual payload</span><strong>JSON merge</strong></div><textarea class="brain-dump source-draft" placeholder='{"tasks":[...],"constraints":{"soft":{"keepEveningLight":7}}}' data-source-draft>${escapeHtml(source.draftPayload)}</textarea></label><div class="source-actions"><button class="primary-action" data-apply-source>Apply payload</button></div></div><div class="footer-note">Supported keys: <code>tasks</code>, <code>courses</code>, <code>schedule</code>, <code>bills</code>, <code>budget</code>, <code>paychecks</code>, <code>checkin</code>, and <code>constraints</code>. The bundled local server also exposes calendar, LMS, and webhook routes behind this source path.</div></article>`;
}

function renderConnectorPanel() {
  const connectors = mergeIntegrationTemplates();
  return `<article class="panel span-6" data-connector-panel style="--accent:${TOKENS.command};"><div class="panel-label">connector framework</div><h3 class="empty-title">Every integration has an inspectable lifecycle.</h3><p class="row-subtitle">Connectors now track auth, webhooks, sync health, token refresh, last result, and event history instead of relying on one-off button state.</p><div class="connector-grid">${connectors.map((item) => {
    const events = Array.isArray(item.metadata?.events) ? item.metadata.events : [];
    return `<div class="connector-card" style="--accent:${colorFor(item.domain)};"><div class="connector-card__head"><div class="row-badge">${iconSvg(item.domain, item.displayName)}</div><div><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.providerType)} &middot; ${escapeHtml(item.status)}</small></div></div><p>${escapeHtml(item.description)}</p><div class="connector-status-grid">${pill(`Auth: ${item.authState}`, connectorTone(item.authState))}${pill(`Sync: ${item.syncStatus}`, connectorTone(item.syncStatus))}${pill(`Webhook: ${item.webhookStatus}`, connectorTone(item.webhookStatus))}${pill(`Refresh: ${item.refreshStatus}`, connectorTone(item.refreshStatus))}</div><div class="inline-chips">${item.scopes.slice(0, 3).map((scope) => pill(scope, colorFor(item.domain))).join("")}${pill(item.local ? "local" : "cloud", item.local ? TOKENS.warn : TOKENS.ok)}</div><div class="meta-grid connector-meta-grid"><div class="metric-stack"><span>Last sync</span><strong>${formatTimestamp(item.lastSyncedAt)}</strong></div><div class="metric-stack"><span>Next sync</span><strong>${formatTimestamp(item.nextSyncAt)}</strong></div><div class="metric-stack"><span>Last test</span><strong>${formatTimestamp(item.lastTestedAt)}</strong></div><div class="metric-stack"><span>Token expires</span><strong>${formatTimestamp(item.tokenExpiresAt)}</strong></div><div class="metric-stack"><span>Errors</span><strong>${item.errorCount}</strong></div><div class="metric-stack"><span>Token ref</span><strong>${item.tokenRef ? "stored" : "none"}</strong></div></div><div class="connector-result"><span>Last result</span><strong>${escapeHtml(summarizeConnectorResult(item.lastSyncResult))}</strong></div>${item.lastError ? `<div class="connector-error">${escapeHtml(item.lastError)}</div>` : ""}<div class="connector-log">${events.length ? events.slice(0, 3).map((event) => `<div><span>${escapeHtml(event.type || "event")} &middot; ${formatTimestamp(event.createdAt)}</span><strong>${escapeHtml(event.message || "Connector event recorded.")}</strong></div>`).join("") : `<div><span>No events yet</span><strong>Use Connect, Test, or Sync to create the first connector event.</strong></div>`}</div><div class="source-actions connector-actions"><button class="surface-action surface-action--small" data-integration-connect="${escapeHtml(item.provider)}">${item.status === "connected" ? "Reconnect" : "Connect"}</button><button class="surface-action surface-action--small" data-integration-test="${escapeHtml(item.provider)}">Test</button><button class="surface-action surface-action--small" data-integration-sync="${escapeHtml(item.provider)}">Sync now</button><button class="surface-action surface-action--small" data-integration-reauth="${escapeHtml(item.provider)}">Re-auth</button><button class="surface-action surface-action--small" data-integration-disconnect="${escapeHtml(item.provider)}">Disconnect</button></div></div>`;
  }).join("")}</div><div class="footer-note">Canvas, Google Calendar, and APEX webhook can call local endpoints now. Plaid, Deputy, and Health now have lifecycle records and logs so the real provider flows can plug in cleanly.</div></article>`;
}

function preferenceButtons(key) {
  const current = state.preferences?.[key] || DEFAULT_PREFERENCES[key];
  return `<div class="preference-button-row">${PREFERENCE_OPTIONS[key].map(([value, label]) => `<button class="preference-chip ${current === value ? "is-active" : ""}" data-preference-key="${key}" data-preference-value="${value}" aria-pressed="${current === value}" style="--accent:${selectedAccent()};">${escapeHtml(label)}</button>`).join("")}</div>`;
}

function renderPersonalizationPanel() {
  const prefs = state.preferences || DEFAULT_PREFERENCES;
  const layoutCopy = {
    guided: "Setup and help stay prominent while you are still wiring sources.",
    operator: "More widgets stay visible at once for daily command-center use.",
    focus: "Lower-priority chrome is visually quieter so the current plan stands out.",
  }[prefs.layoutProfile] || "Guided defaults are active.";
  return `<article class="panel span-12 personalization-panel" data-personalization-panel style="--accent:${selectedAccent()};"><div class="setup-head"><div><div class="panel-label">personalization</div><h3 class="empty-title">Tune the workspace before the full layout builder lands.</h3><p class="row-subtitle">These preferences persist now and become the compatibility layer for saved layouts, profiles, and drag-reordered widgets later.</p></div>${pill(`${prefs.theme} / ${prefs.density}`, selectedAccent())}</div><div class="preference-grid"><div><div class="subtle-label">Theme</div>${preferenceButtons("theme")}</div><div><div class="subtle-label">Density</div>${preferenceButtons("density")}</div><div><div class="subtle-label">Type Scale</div>${preferenceButtons("fontScale")}</div><div><div class="subtle-label">Accent</div>${preferenceButtons("accentProfile")}</div><div><div class="subtle-label">Layout Profile</div>${preferenceButtons("layoutProfile")}</div><div class="state-notice" style="--accent:${selectedAccent()};"><div class="row-badge">${iconSvg("command", "Layout profile")}</div><div><strong>${escapeHtml(PREFERENCE_OPTIONS.layoutProfile.find(([value]) => value === prefs.layoutProfile)?.[1] || "Guided")}</strong><div>${escapeHtml(layoutCopy)}</div></div></div></div><div class="source-actions" style="margin-top:1rem;"><button class="surface-action" data-preference-reset>Reset Preferences</button>${pill("Saved to workspace", TOKENS.ok)}</div></article>`;
}

function widgetManagerRow(widget, widgets) {
  const group = widgets.filter((item) => item.pinned === widget.pinned);
  const groupIndex = group.findIndex((item) => item.id === widget.id);
  return `<div class="widget-manager-row ${widget.visible ? "" : "is-hidden"}" style="--accent:${selectedAccent()};"><div><strong>${escapeHtml(widget.title)}</strong><small>${escapeHtml(widget.type)} &middot; ${escapeHtml(widget.size)} &middot; ${widget.pinned ? "pinned" : "standard"}</small></div><div class="widget-manager-actions"><button class="surface-action surface-action--small" data-widget-pin="${escapeHtml(widget.id)}" aria-pressed="${widget.pinned}" aria-label="${widget.pinned ? "Unpin" : "Pin"} ${escapeHtml(widget.title)}">${widget.pinned ? "Pinned" : "Pin"}</button><button class="surface-action surface-action--small" data-widget-move="${escapeHtml(widget.id)}" data-widget-direction="up" ${groupIndex <= 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(widget.title)} up">Up</button><button class="surface-action surface-action--small" data-widget-move="${escapeHtml(widget.id)}" data-widget-direction="down" ${groupIndex === group.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(widget.title)} down">Down</button><button class="surface-action surface-action--small" data-widget-toggle="${escapeHtml(widget.id)}" aria-pressed="${widget.visible}" aria-label="${widget.visible ? "Hide" : "Show"} ${escapeHtml(widget.title)}">${widget.visible ? "Hide" : "Show"}</button></div></div>`;
}

function renderWidgetManager() {
  const profile = activeWidgetProfile();
  const preset = COMMAND_WIDGET_PROFILE_PRESETS[profile] || COMMAND_WIDGET_PROFILE_PRESETS.guided;
  const widgets = orderedCommandWidgets({ includeHidden: true });
  const visible = widgets.filter((widget) => widget.visible).length;
  const pinned = widgets.filter((widget) => widget.pinned).length;
  return `<article class="panel span-12 widget-manager-panel" data-widget-manager-panel style="--accent:${selectedAccent()};"><div class="setup-head"><div><div class="panel-label">widget layout</div><h3 class="empty-title">Choose what ${escapeHtml(preset.label)} shows first.</h3><p class="row-subtitle">${escapeHtml(preset.description)}</p></div><div class="inline-chips">${pill(`${visible}/${widgets.length} visible`, selectedAccent())}${pill(`${pinned} pinned`, TOKENS.warn)}${pill(`${preset.label} profile`, selectedAccent())}</div></div><div class="state-notice widget-profile-notice" style="--accent:${selectedAccent()};"><div class="row-badge">${iconSvg("command", "Layout profile")}</div><div><strong>Profile-specific layout is active.</strong><div>Switch Layout Profile in Personalization to edit a different Command Center layout without overwriting this one.</div></div></div><div class="widget-manager-list">${widgets.map((widget) => widgetManagerRow(widget, widgets)).join("")}</div><div class="source-actions" style="margin-top:1rem;"><button class="surface-action" data-widget-reset>Reset ${escapeHtml(preset.label)} Widgets</button>${pill("Saved to workspace", TOKENS.ok)}</div></article>`;
}

function renderVisibleCommandWidgets(widgetPanels) {
  const rendered = orderedCommandWidgets()
    .map((widget) => widgetPanels[widget.id] || "")
    .filter(Boolean)
    .join("");
  return rendered || emptyState({
    domain: "command",
    title: "All widgets are hidden.",
    body: "Use Widget Layout to show at least one Command Center panel again.",
    primaryLabel: "",
  });
}

function renderSetupChecklist() {
  const items = buildSetupGuideItems();
  const completed = items.filter((item) => item.done).length;
  return `<article class="panel span-12 setup-panel" style="--accent:${TOKENS.command};"><div class="setup-head"><div><div class="panel-label">setup states</div><h3 class="empty-title">Make APEX useful in the fewest steps.</h3><p class="row-subtitle">Each setup state explains what value unlocks and what is still missing, so the fresh app does not feel empty or mysterious.</p></div>${pill(`${completed}/${items.length} ready`, completed === items.length ? TOKENS.ok : TOKENS.warn)}</div><div class="setup-list">${items.map((item) => `<button class="setup-item ${item.done ? "is-complete" : ""}" data-domain="${item.domain}" style="--accent:${colorFor(item.domain)};"><span class="setup-icon">${iconSvg(item.domain, item.title)}</span><span class="setup-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></span><span class="setup-meter"><span style="width:${Math.round((item.completed / item.total) * 100)}%;"></span></span><span class="setup-feedback-line">${item.done ? "Unlocked: " : "Missing: "}${escapeHtml(item.done ? item.unlocked : item.missing)}</span><span class="setup-status">${escapeHtml(item.status)}</span><span class="setup-action">${escapeHtml(item.action)}</span></button>`).join("")}</div></article>`;
}

function renderCommand(intel) {
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const dayIndex = intel.generatedAt.getDay();
  const topCourse = intel.courseInsights.slice().sort((a, b) => b.riskScore - a.riskScore)[0];
  const priorities = intel.topPriorities.map((task, index) => `<div class="row is-hot" style="--accent:${colorFor(task.domain)};"><div class="row-badge">${index + 1}</div><div class="row-copy"><div class="row-title">${escapeHtml(task.title)}</div><div class="row-subtitle">Due ${escapeHtml(task.due)} &middot; ${escapeHtml(task.reason)}</div></div>${pill(task.domain, colorFor(task.domain))}</div>`).join("");
  const domainLoads = intel.domainLoads.map((item) => `<div><div class="label-row"><span>${escapeHtml(item.label)}</span><span>${item.pct}%</span></div>${meter(item.pct, colorFor(item.domain))}</div>`).join("");
  const courses = intel.courseInsights.map((course) => `<div class="meta-row"><span>${escapeHtml(course.name)}</span><strong style="color:${course.status === "at-risk" ? TOKENS.danger : course.status === "watch" ? TOKENS.warn : TOKENS.ok};">${course.grade}%</strong></div>`).join("");
  const conflicts = intel.conflicts.map((conflict) => `<div class="row" style="--accent:${conflict.severity === "crit" ? TOKENS.danger : conflict.severity === "warn" ? TOKENS.warn : TOKENS.command}; align-items:flex-start;"><div class="row-badge">${conflict.severity === "crit" ? "!" : conflict.severity === "warn" ? "~" : "i"}</div><div class="row-copy"><div class="row-title">${escapeHtml(conflict.title)}</div><div class="row-subtitle">${escapeHtml(conflict.text)}</div></div><button class="small-action">${escapeHtml(conflict.action)}</button></div>`).join("");
  const recommendations = intel.recommendations.map((item) => `<article class="note-card"><h4>${escapeHtml(item.title)}</h4><p class="row-subtitle" style="margin-top:0.7rem;">${escapeHtml(item.text)}</p><div style="margin-top:0.8rem;">${pill(DOMAINS.find((domain) => domain.id === item.accent)?.label || item.accent, colorFor(item.accent))}</div></article>`).join("");
  const scheduleBlocks = intel.schedulePlan.map((item) => `<div class="schedule-block" style="--accent:${colorFor(item.domain)};"><div class="schedule-time">${escapeHtml(item.time)}</div><strong>${escapeHtml(item.label)}</strong><div class="row-subtitle" style="margin-top:0.45rem;">${escapeHtml(item.note)}</div><div style="margin-top:0.65rem;">${pill(item.status || item.kind, item.status === "locked" ? TOKENS.notebook : item.status === "assigned" ? colorFor(item.domain) : TOKENS.warn)}</div><div class="assignment-list">${item.assignments?.length ? item.assignments.map((assignment) => `<div class="assignment-pill assignment-pill--explain"><span>${escapeHtml(assignment.title)}</span><strong>${assignment.minutes}m</strong><small>${escapeHtml(assignment.why || assignment.placement || "Placed by solver score.")}</small></div>`).join("") : `<div class="empty-assignment">${item.status === "locked" ? "Reserved" : "No task assigned"}</div>`}</div><div class="row-subtitle">Remaining: ${item.remainingMinutes ?? 0}m</div></div>`).join("");
  const widgetPanels = {
    setup: renderSetupChecklist(),
    personalization: renderPersonalizationPanel(),
    briefing: `<article class="panel span-8" style="--accent:${TOKENS.command};"><div class="panel-label">intelligence briefing</div><div class="list-rows">${listOrEmpty(priorities, { domain: "command", title: "Not enough data for a briefing yet.", body: "Add tasks, classes, bills, or a calendar source so APEX can rank what matters first.", primaryLabel: "Review setup", primaryDomain: "command", secondaryLabel: "Upload files", secondaryDomain: "notebook" })}</div><div class="system-note" style="margin-top:1rem;">This stack is driven by live task scoring plus the current constraint profile. Change the rules, and these priorities recompute.</div></article>`,
    solver: `<article class="panel span-4" style="--accent:${intel.solverSummary.unscheduledUrgentCount ? TOKENS.danger : TOKENS.ok};"><div class="panel-label">solver summary</div><div class="solver-grid"><div class="metric-stack"><span>Scheduled</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="metric-stack"><span>Capacity</span><strong>${intel.solverSummary.flexibleCapacityMinutes}m</strong></div><div class="metric-stack"><span>Urgent unscheduled</span><strong>${intel.solverSummary.unscheduledUrgentCount}</strong></div><div class="metric-stack"><span>Search score</span><strong>${intel.solverSummary.score}</strong></div></div><div class="footer-note">${intel.solverSummary.unscheduledMinutes ? `${intel.solverSummary.unscheduledMinutes} minutes remain unscheduled under the current rules.` : "Every active chunk currently fits inside the remaining day."}</div></article>`,
    capacity: `<article class="panel span-4" style="--accent:${TOKENS.command};"><div class="panel-label">capacity gauge</div>${gauge(intel.loadScore, TOKENS.command, "load index", intel.loadLabel === "stabilize" ? "stabilize plan active" : intel.loadLabel, intel.loadDisplay || `${intel.loadScore}%`)}<div class="footer-note" style="margin-top:0.9rem;">${intel.loadExplanation}</div><div class="mini-breakdown">${listOrEmpty(domainLoads, { domain: "command", title: "Setup mode is active.", body: "APEX will show real domain load once you add source data.", primaryLabel: "Review setup", primaryDomain: "command" })}</div></article>`,
    gpa: `<article class="panel span-4" style="--accent:${TOKENS.academy};"><div class="panel-label">gpa tracker</div>${state.courses.length ? `<div class="kpi"><div class="kpi-value accent-text">3.47</div><div class="kpi-copy"><div>Current GPA</div><div class="${topCourse?.status === "at-risk" ? "trend-down" : "trend-up"}">${topCourse?.status === "at-risk" ? "Watch " : "Stable "}${escapeHtml(topCourse?.name || "semester profile")}</div></div></div>${sparkBars(state.courses.map((course) => course.grade / 10), TOKENS.academy)}<div class="section-list" style="margin-top:0.95rem;">${listOrEmpty(courses, { domain: "academy", title: "No classes imported yet.", body: "Upload a syllabus or connect school tools so grades and deadlines can show here.", primaryLabel: "Upload syllabus", primaryDomain: "notebook" })}</div>` : emptyState({ domain: "academy", title: "No classes imported yet.", body: "Upload a syllabus or connect Canvas when ready. APEX will not invent grade data.", primaryLabel: "Upload syllabus", primaryDomain: "notebook", secondaryLabel: "Open connectors", secondaryDomain: "command", compact: true })}</article>`,
    conflicts: `<article class="panel span-4" style="--accent:${TOKENS.danger};"><div class="panel-label">conflict engine</div><div class="stack-list">${listOrEmpty(conflicts, { domain: "command", title: "No conflicts detected yet.", body: "That can mean you are clear, or that APEX needs more real sources before it can compare commitments.", primaryLabel: "Add sources", primaryDomain: "command" })}</div></article>`,
    week: `<article class="panel span-4" style="--accent:${TOKENS.notebook};"><div class="panel-label">this week</div><div class="calendar-grid">${dayLabels.map((label, index) => { const day = intel.weeklyOutlook[index]; const level = day.level === "high" ? TOKENS.danger : day.level === "medium" ? TOKENS.warn : TOKENS.ok; return `<div class="day-card ${index === dayIndex ? "is-today" : ""}" style="--accent:${level};"><small class="muted">${label}</small><strong>${day.date.getDate()}</strong><div class="dot-stack"><span style="background:${level};"></span><span style="background:${level}; opacity:.65;"></span><span style="background:${level}; opacity:.35;"></span></div></div>`; }).join("")}</div><div class="footer-note" style="margin-top:0.95rem;">Peak pressure day: ${intel.hottestDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}. The weekly view is driven by deadlines, exams, and bills.</div></article>`,
    recommendations: `<article class="panel span-12" style="--accent:${TOKENS.future};"><div class="panel-label">next best moves</div><div class="courses-grid">${listOrEmpty(recommendations, { domain: "future", title: "No recommendations yet.", body: "APEX needs source data before it can safely recommend next moves.", primaryLabel: "Review setup", primaryDomain: "command" })}</div></article>`,
    why: renderWhyPlanPanel(intel),
    modes: renderScheduleModePanel(intel),
    constraints: renderConstraintPanel(intel),
    sources: renderSourcePanel(),
    connectors: renderConnectorPanel(),
    schedule: `<article class="panel span-12" style="--accent:${TOKENS.command};"><div class="panel-label">optimized schedule</div><div class="schedule-strip schedule-strip--solver">${scheduleBlocks || emptyState({ domain: "command", title: "No schedule blocks yet.", body: "Connect your calendar or add tasks to let the solver build a real day plan.", primaryLabel: "Open connectors", primaryDomain: "command", secondaryLabel: "Upload files", secondaryDomain: "notebook" })}</div></article>`,
  };
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${renderWidgetManager()}${renderVisibleCommandWidgets(widgetPanels)}</div></section>`;
}

function simpleListPanel(title, accent, rows, emptyConfig = null) {
  const body = rows || (emptyConfig ? emptyState({ compact: true, ...emptyConfig }) : stateNotice("loading", "No data yet", "Connect a source or add an item to activate this panel."));
  return `<article class="panel span-12" style="--accent:${accent};"><div class="panel-label">${title}</div><div class="section-list">${body}</div></article>`;
}

function renderAcademy(intel) {
  const tab = state.subTabs.academy;
  const grades = state.courses.map((course) => `<div class="row" style="--accent:${course.color || TOKENS.academy};"><div class="row-copy"><div class="row-title">${course.name}</div><div class="row-subtitle">${course.code} &middot; ${course.platform || course.plat || ""}</div></div><strong style="color:${course.grade >= course.target ? TOKENS.ok : TOKENS.warn};">${course.grade}%</strong></div>`).join("");
  const planner = intel.schedulePlan.filter((item) => item.domain === "academy").map((item) => `<div class="row" style="--accent:${TOKENS.academy};"><div class="row-badge mono">${item.time}</div><div class="row-copy"><div class="row-title">${item.label}</div><div class="row-subtitle">${item.note}</div></div></div>`).join("");
  const courses = state.tasks.filter((task) => task.domain === "academy").map((task) => taskMarkup(task)).join("");
  return `<section class="section-shell">${heroBand(intel)}<div class="tab-strip" style="--accent:${TOKENS.academy};">${tabButton("academy", "grades", tab, TOKENS.academy)}${tabButton("academy", "planner", tab, TOKENS.academy)}${tabButton("academy", "courses", tab, TOKENS.academy)}</div>${tab === "grades" ? simpleListPanel("grades", TOKENS.academy, grades, { domain: "academy", title: "No classes imported yet.", body: "Upload a syllabus or connect Canvas so grades can be grounded in real school data.", primaryLabel: "Upload syllabus", primaryDomain: "notebook", secondaryLabel: "Open connectors", secondaryDomain: "command" }) : ""}${tab === "planner" ? simpleListPanel("study plan", TOKENS.academy, planner, { domain: "academy", title: "No study plan yet.", body: "APEX needs academic tasks or class times before it can schedule study blocks.", primaryLabel: "Upload syllabus", primaryDomain: "notebook" }) : ""}${tab === "courses" ? simpleListPanel("deadlines", TOKENS.warn, courses, { domain: "academy", title: "No academic deadlines yet.", body: "Deadlines will appear after a syllabus review, LMS sync, or manual source payload.", primaryLabel: "Upload syllabus", primaryDomain: "notebook", secondaryLabel: "Open live sources", secondaryDomain: "command" }) : ""}</section>`;
}

function renderWorks(intel) {
  const tab = state.subTabs.works;
  const hasWorkSource = connectorIsConnected(["deputy"]) || state.tasks.some((task) => task.domain === "works");
  const shifts = hasWorkSource ? SHIFTS.map((shift) => `<div class="row" style="--accent:${TOKENS.works};"><div class="row-badge">${shift.day}</div><div class="row-copy"><div class="row-title">${shift.hours}</div><div class="row-subtitle">Campus Research Lab</div></div>${pill(`$${shift.pay}`, TOKENS.works)}</div>`).join("") : "";
  const tasks = state.tasks.filter((task) => task.domain === "works").map((task) => taskMarkup(task)).join("");
  const pipeline = hasWorkSource ? PIPELINE.map((item) => `<div class="row" style="--accent:${item.color};"><div class="row-copy"><div class="row-title">${item.company} - ${item.role}</div><div class="row-subtitle">${item.note}</div></div>${pill(item.stage, item.color)}</div>`).join("") : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="tab-strip" style="--accent:${TOKENS.works};">${tabButton("works", "shifts", tab, TOKENS.works)}${tabButton("works", "tasks", tab, TOKENS.works)}${tabButton("works", "pipeline", tab, TOKENS.works)}</div>${tab === "shifts" ? simpleListPanel("shifts", TOKENS.works, shifts, { domain: "works", title: "No work schedule connected yet.", body: "Connect Deputy or feed shifts through a webhook so APEX can protect work time.", primaryLabel: "Open connectors", primaryDomain: "command" }) : ""}${tab === "tasks" ? simpleListPanel("tasks", TOKENS.works, tasks, { domain: "works", title: "No work tasks yet.", body: "Add project tasks or sync a work source before they appear here.", primaryLabel: "Open live sources", primaryDomain: "command" }) : ""}${tab === "pipeline" ? simpleListPanel("pipeline", TOKENS.future, pipeline, { domain: "future", title: "No career pipeline yet.", body: "When you add job applications or career tasks, APEX will keep follow-ups visible here.", primaryLabel: "Open live sources", primaryDomain: "command" }) : ""}</section>`;
}

function renderLife(intel) {
  const bills = intel.billInsights.map((bill) => `<div class="row ${bill.daysUntilDue !== null && bill.daysUntilDue <= 3 ? "is-hot" : ""}" style="--accent:${bill.covered ? TOKENS.warn : TOKENS.danger};"><div class="row-copy"><div class="row-title">${bill.name}</div><div class="row-subtitle">Due ${bill.due} &middot; ${bill.covered ? "covered" : "needs attention"}</div></div><strong>${bill.amount}</strong></div>`).join("");
  const hasBudget = Number(state.budget.income || 0) > 0 || Number(state.budget.spent || 0) > 0 || Number(state.budget.left || 0) > 0;
  const budget = hasBudget ? `<div class="row"><div class="row-copy"><div class="row-title">Monthly budget</div><div class="row-subtitle">Income ${state.budget.income} &middot; Left ${state.budget.left}</div></div>${pill(`$${state.budget.left}`, TOKENS.life)}</div>` : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("budget snapshot", TOKENS.life, budget, { domain: "life", title: "No budget data yet.", body: "Finance is opt-in. Add a safe payload or connect finance later when you are ready.", primaryLabel: "Open live sources", primaryDomain: "command" })}${simpleListPanel("bills due", TOKENS.warn, bills, { domain: "life", title: "No bills added yet.", body: "Bills will help the scheduler understand financial pressure without needing bank data first.", primaryLabel: "Open live sources", primaryDomain: "command" })}${simpleListPanel("personal tasks", TOKENS.life, state.tasks.filter((task) => task.domain === "life").map((task) => taskMarkup(task)).join(""), { domain: "life", title: "No life tasks yet.", body: "Add chores, bills, errands, or reminders when you want Life to affect the plan.", primaryLabel: "Open live sources", primaryDomain: "command" })}</div></section>`;
}

function renderFuture(intel) {
  const hasFutureContext = state.tasks.some((task) => task.domain === "future") || state.notes.some((note) => normalizeNote(note).domain === "future");
  const goals = hasFutureContext ? GOALS.map((goal) => `<div class="row" style="--accent:${colorFor(goal.domain)};"><div class="row-copy"><div class="row-title">${goal.title}</div><div class="row-subtitle">${goal.done}/${goal.tasks} complete</div></div><strong>${goal.pct}%</strong></div>`).join("") : "";
  const milestones = hasFutureContext ? MILESTONES.map((milestone) => `<div class="row ${milestone.hot ? "is-hot" : ""}" style="--accent:${milestone.hot ? TOKENS.future : TOKENS.notebook};"><div class="row-copy"><div class="row-title">${milestone.label}</div><div class="row-subtitle">${milestone.hot ? "High urgency" : "Forward-looking checkpoint"}</div></div><strong>${milestone.date}</strong></div>`).join("") : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("goals", TOKENS.future, goals, { domain: "future", title: "No goals linked yet.", body: "Create a future note or add a career task so APEX can turn a goal into scheduled action.", primaryLabel: "Create note", primaryDomain: "notebook", secondaryLabel: "Open setup", secondaryDomain: "command" })}${simpleListPanel("milestones", TOKENS.future, milestones, { domain: "future", title: "No milestones yet.", body: "Milestones should come from your real goals, school path, or career sources before they drive the plan.", primaryLabel: "Upload sources", primaryDomain: "notebook" })}</div></section>`;
}

function renderMind(intel) {
  const form = !state.checkin.submitted
    ? `<div class="slider-group">${[{ key: "energy", label: "Energy level" }, { key: "focus", label: "Focus confidence" }, { key: "mood", label: "Mood" }].map((field) => `<div class="slider-row"><strong>${field.label}</strong><div class="slider-values">${[1, 2, 3, 4, 5].map((value) => `<button class="score-button ${state.checkin[field.key] === value ? "is-active" : ""}" data-score-field="${field.key}" data-score-value="${value}" style="--accent:${TOKENS.mind};">${value}</button>`).join("")}</div></div>`).join("")}</div><button class="primary-action" data-submit-checkin style="margin-top:1rem;">Submit check-in</button>`
    : `<div class="processing-result"><div class="footer-note">Check-in logged. The kernel softened the next 24 hours because energy and focus are real scheduling inputs.</div><button class="surface-action" data-reset-checkin>Check in again</button></div>`;
  const insights = MIND_INSIGHTS.map((item) => `<div class="row" style="--accent:${TOKENS.mind};"><div class="row-badge">${iconSvg("mind", item.title)}</div><div class="row-copy"><div class="row-title">${item.title}</div><div class="row-subtitle">${item.body}</div></div></div>`).join("");
  const risk = burnoutRisk(intel);
  const hasMindSignals = state.checkin.submitted || state.checkin.energy || state.checkin.focus || state.checkin.mood;
  const riskBody = hasMindSignals
    ? gauge(risk, risk > 55 ? TOKENS.warn : TOKENS.ok, "burnout risk", risk > 55 ? "load softening recommended" : "stable")
    : emptyState({ domain: "mind", title: "No wellness signal yet.", body: "Submit a quick check-in before APEX estimates burnout risk. This is scheduler context, not clinical diagnosis.", primaryLabel: "Start check-in", primaryDomain: "mind", compact: true });
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid"><article class="panel span-5" style="--accent:${TOKENS.mind};"><div class="panel-label">daily check-in</div>${form}</article><article class="panel span-3" style="--accent:${TOKENS.notebook};"><div class="panel-label">burnout risk</div>${riskBody}</article>${simpleListPanel("apex mind intelligence", TOKENS.mind, hasMindSignals ? insights : "", { domain: "mind", title: "Not enough data for Mind insights yet.", body: "Once you submit check-ins, APEX can explain how recovery signals are affecting the schedule.", primaryLabel: "Start check-in", primaryDomain: "mind" })}</div></section>`;
}

function renderNotebook(intel) {
  const notes = state.notes.map(normalizeNote);
  const filtered = notes.filter((note) => { const search = state.noteSearch.trim().toLowerCase(); return !search || note.title.toLowerCase().includes(search) || note.domain.toLowerCase().includes(search) || note.tags.some((tag) => tag.toLowerCase().includes(search)) || note.body.toLowerCase().includes(search); });
  const activeNote = notes.find((note) => String(note.id) === String(state.activeNoteId)) || filtered[0] || null;
  const uploads = state.uploadedFiles.map(normalizeUpload);
  const reviews = state.syllabusReviews.map(normalizeSyllabusReview);
  const uploadRows = uploads.map((file) => {
    const hasReview = reviews.some((review) => review.uploadId === file.id);
    return `<div class="row" style="--accent:${TOKENS.notebook};"><div class="row-badge">${iconSvg("notebook", "Source file")}</div><div class="row-copy"><div class="row-title">${escapeHtml(file.name)}</div><div class="row-subtitle">${escapeHtml(file.type)} &middot; ${Math.max(1, Math.round(file.size / 1024))} KB &middot; ${escapeHtml(file.uploadStatus)} / ${escapeHtml(file.textStatus)}</div></div><div class="row-actions">${pill(file.local ? "local" : "cloud", file.local ? TOKENS.warn : TOKENS.ok)}<button class="surface-action surface-action--small" data-syllabus-start="${escapeHtml(file.id)}" ${hasReview ? "disabled" : ""}>${hasReview ? "In review" : "Review as syllabus"}</button></div></div>`;
  }).join("");
  const reviewRows = reviews.map((review) => {
    const summary = review.parsedSummary || {};
    const items = Array.isArray(summary.extractedItems) ? summary.extractedItems : [];
    return `<div class="review-card" style="--accent:${review.parseStatus === "confirmed" ? TOKENS.ok : TOKENS.academy};"><div class="review-card__head"><div><div class="panel-label">${review.parseStatus === "confirmed" ? "confirmed syllabus" : "needs review"}</div><h4>${escapeHtml(review.title)}</h4></div>${pill(`${Math.round((review.confidence || 0) * 100)}% confidence`, review.parseStatus === "confirmed" ? TOKENS.ok : TOKENS.warn)}</div><div class="review-grid"><span>Course</span><strong>${escapeHtml(summary.courseName || "Needs review")}</strong><span>Code</span><strong>${escapeHtml(summary.courseCode || "Needs review")}</strong></div><div class="extraction-list">${items.map((item) => `<div><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(item.title)}</strong></div>`).join("")}</div><p class="footer-note">${escapeHtml(summary.warning || "Review before scheduling assignments.")}</p><button class="primary-action" data-syllabus-confirm="${escapeHtml(review.id)}" ${review.parseStatus === "confirmed" ? "disabled" : ""}>${review.parseStatus === "confirmed" ? "Confirmed" : "Confirm review"}</button></div>`;
  }).join("");
  const noteButtons = filtered.map((note) => `<button class="note-button ${String(note.id) === String(state.activeNoteId) ? "is-active" : ""}" data-note-id="${escapeHtml(note.id)}" style="--accent:${colorFor(note.domain)};"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.updated)} &middot; ${escapeHtml(note.domain)}</small></button>`).join("");
  const editor = activeNote
    ? `<div class="note-editor"><div class="panel-label">${iconSvg(activeNote.domain)} editable note</div><input class="note-title-input" value="${escapeHtml(activeNote.title)}" placeholder="Note title" data-note-title /><div class="note-meta-grid"><label><span>Domain</span><select data-note-domain>${DOMAINS.filter((domain) => domain.id !== "command").map((domain) => `<option value="${domain.id}" ${activeNote.domain === domain.id ? "selected" : ""}>${domain.label}</option>`).join("")}</select></label><label><span>Tags</span><input value="${escapeHtml(activeNote.tags.join(", "))}" placeholder="exam-prep, ideas" data-note-tags /></label></div><textarea class="note-body-input" placeholder="Write notes, links, questions, or source-grounded context here..." data-note-body>${escapeHtml(activeNote.body || activeNote.summary || "")}</textarea><p class="footer-note">Autosaves locally. Cloud sync updates on field change when apex_notes is available.</p></div>`
    : `<div class="empty-note-state">${emptyState({ domain: "notebook", title: "No notes yet.", body: "Create a note to capture source-grounded context before the AI/RAG layer lands.", primaryLabel: "", compact: true })}<button class="primary-action" data-note-create type="button">Create first note</button></div>`;
  const uploadEmpty = emptyState({ domain: "notebook", title: "No source files attached yet.", body: "Start with a syllabus, lecture note, or assignment sheet. APEX will keep the file as a safe source stub until parsing is ready.", primaryLabel: "", compact: true });
  const reviewEmpty = emptyState({ domain: "academy", title: "No syllabus reviews yet.", body: "Upload a syllabus, then choose Review as syllabus. Nothing gets scheduled until you confirm it.", primaryLabel: "Upload syllabus", primaryDomain: "notebook", compact: true });
  return `<section class="section-shell">${heroBand(intel)}<div class="notebook-layout"><aside class="panel panel--quiet" style="--accent:${TOKENS.notebook};"><div class="panel-label">search notes</div><input class="search-input" type="search" placeholder="Search all notes..." value="${escapeHtml(state.noteSearch)}" data-note-search /><button class="primary-action note-create-action" data-note-create type="button">New note</button><div class="note-list" style="margin-top:1rem;">${noteButtons || stateNotice("loading", "No notes yet", "Create your first note to make Notebook useful.", "notebook")}</div></aside><div class="section-shell"><article class="panel" style="--accent:${activeNote ? colorFor(activeNote.domain) : TOKENS.notebook};">${editor}</article><article class="panel" data-upload-panel style="--accent:${TOKENS.notebook};"><div class="panel-label">source uploads</div><h3 class="empty-title">Upload syllabi, notes, and assignment sheets.</h3><p class="row-subtitle">APEX stores metadata now and can start a review queue for syllabi before real text extraction is connected.</p><label class="upload-zone"><input type="file" multiple data-file-upload /><span>Choose files to attach</span><small>${uploads.length ? `${uploads.length} source file(s) tracked` : "No source files attached yet"}</small></label><div class="section-list" style="margin-top:1rem;">${uploadRows || uploadEmpty}</div></article><article class="panel" data-syllabus-review-panel style="--accent:${TOKENS.academy};"><div class="panel-label">syllabus review queue</div><h3 class="empty-title">Confirm before APEX schedules anything.</h3><p class="row-subtitle">This is a safe placeholder pipeline: APEX creates review cards from upload metadata, then waits for your confirmation.</p><div class="review-list">${reviewRows || reviewEmpty}</div></article><article class="panel" style="--accent:${TOKENS.command};"><div class="panel-label">brain dump</div>${!state.processedDump ? `<textarea class="brain-dump" placeholder="Type anything: study thermo, email professor, pay rent, prep Friday quiz..." data-brain-dump>${escapeHtml(state.brainDump)}</textarea><div class="hero-actions"><button class="primary-action" data-process-dump>Process + sort</button></div>` : `<div class="processing-result"><div class="row is-hot" style="--accent:${TOKENS.ok};"><div class="row-badge">${iconSvg("command", "Processed")}</div><div class="row-copy"><div class="row-title">Dump routed into ${state.processedDump.domains.length} dashboards</div><div class="row-subtitle">${escapeHtml(state.processedDump.summary)}</div></div></div><div class="inline-chips">${state.processedDump.domains.map((domain) => pill(domain, colorFor(domain.toLowerCase()))).join("")}</div><button class="surface-action" data-clear-dump>New dump</button></div>`}</article></div></div></section>`;
}

function renderFreshDomainState(intel) {
  const domain = activeDomain();
  const guidance = {
    academy: ["Connect your school context.", "Upload a syllabus in Notebook or use Live Data Sources in Command Center to bring in LMS assignments and grade signals.", "Upload Syllabus", "notebook", "Open Live Sources", "command"],
    works: ["Connect work before it collides with school.", "Use Live Data Sources to add calendar events, shifts, or webhook-fed project tasks. APEX will block them as hard context.", "Open Live Sources", "command", "Upload Work Files", "notebook"],
    life: ["Add life admin only when you are ready.", "Bills and finance are sensitive, opt-in data. Start by adding bill payloads in Live Data Sources or keep this area empty.", "Open Live Sources", "command", "Review Setup", "command"],
    future: ["Turn one goal into a scheduled action.", "Start from Command Center, then connect portfolio, course, or career resources as sources when you want APEX to reason over them.", "Review Setup", "command", "Upload Sources", "notebook"],
    mind: ["Start with one check-in.", "Mind signals are scheduler inputs, not a clinical record. Add energy, focus, and mood when you want the plan to soften intelligently.", "Review Setup", "command", "Upload Context", "notebook"],
  }[domain.id] || ["Start by adding your real sources.", "Use the Command Center setup checklist to upload syllabi, connect school/work sources, and tune the scheduler in a clear order.", "Review Setup", "command", "Upload Files", "notebook"];
  return `<section class="section-shell">${heroBand(intel)}<article class="panel panel--empty span-12" style="--accent:${colorFor(domain.id)};"><div class="panel-label">fresh workspace</div>${emptyState({ domain: domain.id, title: guidance[0], body: guidance[1], primaryLabel: guidance[2], primaryDomain: guidance[3], secondaryLabel: guidance[4], secondaryDomain: guidance[5] })}</article></section>`;
}

function renderContent(intel) {
  if (!state.tasks.length && !state.courses.length && !state.schedule.length && !state.bills.length) {
    if (state.activeDomain === "command") {
      return renderCommand(intel);
    }
    if (state.activeDomain === "notebook") {
      return renderNotebook(intel);
    }
    return renderFreshDomainState(intel);
  }
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
  if (!state.auth.ready || !state.auth.user) {
    renderAuthShell();
    renderToast();
    renderNotificationCenter();
    return;
  }
  const domain = activeDomain();
  const intel = getIntel();
  const nextPlanSnapshot = buildScheduleRunSnapshot({ intel, scheduleMode: state.scheduleMode });
  const latestPlanChanges = compareScheduleRunSnapshots(state.lastPlanSnapshot, nextPlanSnapshot);
  if (latestPlanChanges.status !== "stable") state.lastPlanChanges = latestPlanChanges;
  intel.planChanges = state.lastPlanChanges || latestPlanChanges;
  const prefs = normalizePreferences(state.preferences);
  const shellClass = `theme-${prefs.theme} density-${prefs.density} text-${prefs.fontScale} layout-${prefs.layoutProfile}`;
  app.innerHTML = `<div class="app-shell ${shellClass}" style="--accent:${selectedAccent(domain.id)};"><a class="skip-link" href="#main-content">Skip to content</a><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><aside class="sidebar ${state.sidebarCollapsed ? "is-collapsed" : ""}"><div class="brand"><div class="brand-mark">${iconSvg("command")}</div><div class="brand-copy"><h1>APEX</h1><p>Universal 2.0</p></div></div><nav class="sidebar-nav" aria-label="Primary sections">${DOMAINS.map((item) => `<button class="nav-button ${state.activeDomain === item.id ? "is-active" : ""}" data-domain="${item.id}" style="--accent:${colorFor(item.id)};" aria-current="${state.activeDomain === item.id ? "page" : "false"}"><span class="nav-icon">${iconSvg(item.id, item.label)}</span><span class="nav-copy"><strong>${item.label}</strong><span>${item.blurb}</span></span></button>`).join("")}</nav><div class="sidebar-footer"><button class="collapse-button" data-collapse-sidebar aria-label="${state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}"><span>${state.sidebarCollapsed ? "&#9654;" : "&#9664;"}</span><span>${state.sidebarCollapsed ? "Expand" : "Collapse"}</span></button></div></aside><main class="main" id="main-content"><header class="topbar"><div class="topbar-title"><div class="topbar-icon">${iconSvg(domain.id, domain.label)}</div><div class="topbar-copy"><h2>APEX ${domain.label}</h2><p>${formatToday()} &middot; ${state.auth.user.email}</p></div></div><div class="topbar-metrics"><button class="mobile-menu-trigger" data-mobile-nav-open aria-label="Open mobile menu"><span>${iconSvg(domain.id, "Mobile menu")}</span><strong>Menu</strong></button><button class="command-trigger" data-command-open aria-label="Open command palette"><span>${iconSvg("command", "Command palette")}</span><strong>Search</strong><kbd>Ctrl K</kbd></button><div class="metric-pill"><span class="metric-dot"></span><span>Load</span><strong data-shell-load>${intel.loadDisplay || `${intel.loadScore}%`}</strong></div><div class="metric-pill"><span class="metric-dot" style="background:${TOKENS.command};"></span><span>Cloud</span><strong data-shell-cloud>${state.cloudSaveStatus}</strong></div><div class="metric-pill"><span class="metric-dot" data-shell-source-dot style="background:${statusTone(state.sourceConfig.lastSyncStatus)};"></span><span>Source</span><strong data-shell-source>${state.sourceConfig.lastSyncStatus}</strong></div><button class="metric-pill metric-button ${unreadNotifications().length ? "has-unread" : ""}" data-notification-toggle type="button" aria-label="Open notification center"><span class="metric-dot" data-shell-notification-dot style="background:${unreadNotifications().length ? TOKENS.warn : TOKENS.ok};"></span><span>Alerts</span><strong data-shell-notifications>${unreadNotifications().length}</strong></button><button class="surface-action" data-domain="command" data-scroll-personalization>Personalize</button><button class="surface-action" data-auth-signout>Sign Out</button><div class="mini-domain-rail" aria-label="Quick sections">${DOMAINS.filter((item) => item.id !== "command").map((item) => `<button class="stat-dot-button ${item.id === state.activeDomain ? "is-active" : ""}" data-domain="${item.id}" style="--dot:${colorFor(item.id)};" title="${item.label}" aria-label="Open ${item.label}"></button>`).join("")}</div></div></header><div class="content">${renderContent(intel)}</div></main>${renderOnboarding()}${renderSectionHelp()}</div>`;
  state.lastPlanSnapshot = nextPlanSnapshot;
  persistPlanSnapshotOnly();
  renderToast();
  renderNotificationCenter();
  renderCommandPalette();
  renderMobileNavSheet();
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

function updatePreference(key, value) {
  state.preferences = normalizePreferences({
    ...(state.preferences || DEFAULT_PREFERENCES),
    [key]: value,
  });
  rerender();
}

function updateCommandWidget(widgetId, patch) {
  state.widgets = normalizeWidgets(state.widgets);
  const profile = activeWidgetProfile();
  state.widgets.commandProfiles[profile] = commandWidgets().map((widget) => (widget.id === widgetId ? { ...widget, ...patch } : widget));
  state.widgets.command = state.widgets.commandProfiles.guided;
  rerender();
}

function moveCommandWidget(widgetId, direction) {
  state.widgets = normalizeWidgets(state.widgets);
  const profile = activeWidgetProfile();
  const widgets = orderedCommandWidgets({ includeHidden: true });
  const current = widgets.find((widget) => widget.id === widgetId);
  if (!current) return;
  const group = widgets.filter((widget) => widget.pinned === current.pinned);
  const index = group.findIndex((widget) => widget.id === widgetId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= group.length) return;
  const target = group[targetIndex];
  const next = widgets.map((widget) => {
    if (widget.id === current.id) return { ...widget, order: target.order };
    if (widget.id === target.id) return { ...widget, order: current.order };
    return widget;
  });
  state.widgets.commandProfiles[profile] = next;
  state.widgets.command = state.widgets.commandProfiles.guided;
  rerender();
}

function resetCommandWidgets() {
  const profile = activeWidgetProfile();
  const widgets = normalizeWidgets(state.widgets);
  state.widgets = {
    ...widgets,
    commandProfiles: {
      ...widgets.commandProfiles,
      [profile]: normalizeWidgetList([], profile),
    },
  };
  state.widgets.command = state.widgets.commandProfiles.guided;
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
  notifyUser({
    type: "sync",
    title: `${origin} applied`,
    body: `Updated ${applied.join(", ")} from an APEX source payload.`,
    severity: "success",
  });
}

async function syncRemoteSource() {
  if (!state.sourceConfig.remoteUrl.trim()) {
    notifyUser({
      type: "setup",
      title: "Add a remote JSON URL",
      body: "The source panel needs a URL before APEX can run a remote sync.",
      severity: "warning",
    });
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
    notifyUser({
      type: "sync_error",
      title: "Remote sync failed",
      body: "Check the source panel for details before trusting the imported data.",
      severity: "warning",
    });
  }
}

doc?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const shouldCloseMobileNav = Boolean(target.closest("[data-mobile-nav-close]"));
  if (target.closest("[data-mobile-nav-open]")) { state.mobileNavOpen = true; renderMobileNavSheet(); return; }
  if (target.matches("[data-mobile-nav-close]") || target.closest(".mobile-nav-sheet__scrim")) { closeMobileNavSheet(); return; }
  if (target.closest("[data-command-open]")) { if (shouldCloseMobileNav) state.mobileNavOpen = false; openCommandPalette(); renderMobileNavSheet(); return; }
  if (target.closest("[data-command-close]")) { closeCommandPalette(); return; }
  const commandAction = target.closest("[data-command-action]");
  if (commandAction) { if (shouldCloseMobileNav) state.mobileNavOpen = false; executeCommandPaletteAction(commandAction.dataset.commandAction); renderMobileNavSheet(); return; }
  const domainButton = target.closest("[data-domain]");
  if (domainButton) {
    state.activeDomain = domainButton.dataset.domain;
    if (shouldCloseMobileNav) state.mobileNavOpen = false;
    rerender();
    if (domainButton.matches("[data-scroll-personalization]")) {
      requestAnimationFrame(() => doc?.querySelector("[data-personalization-panel]")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    return;
  }
  if (target.closest("[data-collapse-sidebar]")) { state.sidebarCollapsed = !state.sidebarCollapsed; rerender(); return; }
  const preferenceButton = target.closest("[data-preference-key]");
  if (preferenceButton) { updatePreference(preferenceButton.dataset.preferenceKey, preferenceButton.dataset.preferenceValue); return; }
  if (target.closest("[data-preference-reset]")) { state.preferences = clone(DEFAULT_PREFERENCES); rerender(); return; }
  const widgetToggle = target.closest("[data-widget-toggle]");
  if (widgetToggle) {
    const widget = commandWidgets().find((item) => item.id === widgetToggle.dataset.widgetToggle);
    if (widget) updateCommandWidget(widget.id, { visible: !widget.visible });
    return;
  }
  const widgetPin = target.closest("[data-widget-pin]");
  if (widgetPin) {
    const widget = commandWidgets().find((item) => item.id === widgetPin.dataset.widgetPin);
    if (widget) updateCommandWidget(widget.id, { pinned: !widget.pinned });
    return;
  }
  const widgetMove = target.closest("[data-widget-move]");
  if (widgetMove) { moveCommandWidget(widgetMove.dataset.widgetMove, widgetMove.dataset.widgetDirection); return; }
  if (target.closest("[data-widget-reset]")) { resetCommandWidgets(); return; }
  const tab = target.closest("[data-tab-group]");
  if (tab) { state.subTabs[tab.dataset.tabGroup] = tab.dataset.tabValue; rerender(); return; }
  const task = target.closest("[data-task-id]");
  if (task) { const id = Number(task.dataset.taskId); state.tasks = state.tasks.map((item) => item.id === id ? { ...item, done: !item.done } : item); rerender(); return; }
  const noteButton = target.closest("[data-note-id]");
  if (noteButton) { state.activeNoteId = noteButton.dataset.noteId; rerender(); return; }
  if (target.closest("[data-note-create]")) { await createNotebookNote(); return; }
  const syllabusStart = target.closest("[data-syllabus-start]");
  if (syllabusStart) { await startSyllabusReview(syllabusStart.dataset.syllabusStart); return; }
  const syllabusConfirm = target.closest("[data-syllabus-confirm]");
  if (syllabusConfirm) { await confirmSyllabusReview(syllabusConfirm.dataset.syllabusConfirm); return; }
  const integrationConnect = target.closest("[data-integration-connect]");
  if (integrationConnect) { await connectIntegration(integrationConnect.dataset.integrationConnect); return; }
  const integrationTest = target.closest("[data-integration-test]");
  if (integrationTest) { await testIntegration(integrationTest.dataset.integrationTest); return; }
  const integrationSync = target.closest("[data-integration-sync]");
  if (integrationSync) { await syncIntegration(integrationSync.dataset.integrationSync); return; }
  const integrationReauth = target.closest("[data-integration-reauth]");
  if (integrationReauth) { await reauthIntegration(integrationReauth.dataset.integrationReauth); return; }
  const integrationDisconnect = target.closest("[data-integration-disconnect]");
  if (integrationDisconnect) { await disconnectIntegration(integrationDisconnect.dataset.integrationDisconnect); return; }
  const scheduleMode = target.closest("[data-schedule-mode]");
  if (scheduleMode) {
    state.pendingScheduleMode = scheduleMode.dataset.scheduleMode;
    renderApp();
    return;
  }
  if (target.closest("[data-mode-apply]")) {
    if (SCHEDULE_MODES[state.pendingScheduleMode] && state.pendingScheduleMode !== state.scheduleMode) {
      state.scheduleMode = state.pendingScheduleMode;
      state.pendingScheduleMode = null;
      rerender();
      notifyUser({
        type: "schedule_mode",
        title: `${SCHEDULE_MODES[state.scheduleMode]?.label || "Schedule"} mode enabled`,
        body: SCHEDULE_MODES[state.scheduleMode]?.description || "The solver mode was updated.",
        severity: "info",
      });
    }
    return;
  }
  if (target.closest("[data-mode-cancel]")) {
    state.pendingScheduleMode = null;
    renderApp();
    return;
  }
  if (target.closest("[data-mode-reset]")) {
    state.pendingScheduleMode = "balanced";
    renderApp();
    return;
  }
  const score = target.closest("[data-score-field]");
  if (score) { state.checkin[score.dataset.scoreField] = Number(score.dataset.scoreValue); rerender(); return; }
  const toggle = target.closest("[data-constraint-toggle-key]");
  if (toggle) { updateConstraint(toggle.dataset.constraintToggleGroup, toggle.dataset.constraintToggleKey, !state.constraints[toggle.dataset.constraintToggleGroup][toggle.dataset.constraintToggleKey]); return; }
  const daypart = target.closest("[data-override-daypart]");
  if (daypart) { updateConstraint("hard", "reservedDaypart", daypart.dataset.overrideDaypart); return; }
  if (target.closest("[data-reset-constraints]")) { state.constraints = clone(DEFAULT_CONSTRAINTS); rerender(); return; }
  if (target.closest("[data-source-toggle='autoSync']")) { state.sourceConfig = { ...state.sourceConfig, autoSync: !state.sourceConfig.autoSync }; rerender(); scheduleAutoSync(); return; }
  if (target.closest("[data-use-local-source]")) { state.sourceConfig = { ...state.sourceConfig, remoteUrl: "/api/source/live" }; rerender(); scheduleAutoSync(); return; }
  if (target.closest("[data-apply-source]")) { try { applySourcePayload(state.sourceConfig.draftPayload, "manual payload"); } catch (error) { state.sourceConfig = { ...state.sourceConfig, lastSyncStatus: "error", lastError: error instanceof Error ? error.message : "Invalid payload" }; rerender(); } return; }
  if (target.closest("[data-sync-source]")) { await syncRemoteSource(); scheduleAutoSync(); return; }
  if (target.closest("[data-reset-source]")) { state.sourceConfig = { ...state.sourceConfig, lastSyncStatus: "idle", lastError: "" }; rerender(); return; }
  if (target.closest("[data-submit-checkin]")) { if (state.checkin.energy && state.checkin.focus && state.checkin.mood) { state.checkin.submitted = true; rerender(); notifyUser({ type: "mind_checkin", title: "Mind check-in logged", body: "The solver softened the next 24 hours using your energy, focus, and mood signals.", severity: "success" }); } return; }
  if (target.closest("[data-reset-checkin]")) { state.checkin = { energy: 0, focus: 0, mood: 0, submitted: false }; rerender(); return; }
  if (target.closest("[data-process-dump]")) { if (state.brainDump.trim()) { state.processedDump = processBrainDump(state.brainDump); rerender(); } return; }
  if (target.closest("[data-clear-dump]")) { state.brainDump = ""; state.processedDump = null; rerender(); return; }
  if (target.closest("[data-focus-top]")) { const intel = getIntel(); if (intel.topPriorities[0]) notifyUser({ type: "focus_target", title: "Focus target selected", body: intel.topPriorities[0].title, severity: "info" }); return; }
  if (target.closest("[data-auth-toggle]")) { state.auth.mode = state.auth.mode === "sign-up" ? "sign-in" : "sign-up"; state.auth.error = ""; renderApp(); return; }
  if (target.closest("[data-auth-signout]")) { await handleSignOut(); return; }
  if (target.closest("[data-notification-toggle]")) { state.notificationPanelOpen = !state.notificationPanelOpen; saveState(); renderNotificationCenter(); return; }
  if (target.closest("[data-notification-read-all]")) { await markAllNotificationsRead(); return; }
  const readNotification = target.closest("[data-notification-read]");
  if (readNotification) { await markNotificationRead(readNotification.dataset.notificationRead); return; }
  const dismissNotificationButton = target.closest("[data-notification-dismiss]");
  if (dismissNotificationButton) { await dismissNotification(dismissNotificationButton.dataset.notificationDismiss); return; }
  if (target.closest("[data-onboarding-skip]")) { state.onboarding = { ...state.onboarding, tutorialOpen: false, tutorialSkipped: true }; rerender(); return; }
  if (target.closest("[data-onboarding-next]")) { advanceOnboarding(); return; }
  if (target.closest("[data-onboarding-back]")) { retreatOnboarding(); return; }
  if (target.closest("[data-help-dismiss]")) { state.onboarding = { ...state.onboarding, sectionHelpSeen: { ...(state.onboarding?.sectionHelpSeen || {}), [state.activeDomain]: true } }; rerender(); return; }
  if (target.closest("[data-dismiss-toast]")) { state.toast = null; clearTimeout(state.toastTimer); renderToast(); }
});

doc?.addEventListener("submit", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.matches("[data-auth-form]")) return;
  event.preventDefault();
  await handleAuthSubmit();
});

doc?.addEventListener("input", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const commandInput = target.closest("[data-command-input]");
  if (commandInput) {
    state.commandPaletteQuery = commandInput.value;
    state.commandPaletteIndex = 0;
    renderCommandPalette();
    return;
  }
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
  const noteTitle = target.closest("[data-note-title]");
  if (noteTitle) { await updateActiveNote({ title: noteTitle.value }); return; }
  const noteBody = target.closest("[data-note-body]");
  if (noteBody) { await updateActiveNote({ body: noteBody.value, summary: noteBody.value }); return; }
  const noteTags = target.closest("[data-note-tags]");
  if (noteTags) { await updateActiveNote({ tags: parseTags(noteTags.value) }); return; }
  const range = target.closest("[data-constraint-range-key]");
  if (range) { updateConstraint(range.dataset.constraintRangeGroup, range.dataset.constraintRangeKey, Number(range.value)); return; }
  const sourceUrl = target.closest("[data-source-url]");
  if (sourceUrl) { state.sourceConfig = { ...state.sourceConfig, remoteUrl: sourceUrl.value }; saveState(); scheduleAutoSync(); return; }
  const sourceDraft = target.closest("[data-source-draft]");
  if (sourceDraft) { state.sourceConfig = { ...state.sourceConfig, draftPayload: sourceDraft.value }; saveState(); }
  const email = target.closest("[data-auth-email]");
  if (email) { state.auth.email = email.value; return; }
  const password = target.closest("[data-auth-password]");
  if (password) { state.auth.password = password.value; }
});

doc?.addEventListener("keydown", (event) => {
  const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
  if (isPaletteShortcut) {
    event.preventDefault();
    if (state.commandPaletteOpen) closeCommandPalette();
    else openCommandPalette();
    return;
  }
  if (state.commandPaletteOpen && event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  if (state.mobileNavOpen && event.key === "Escape") {
    event.preventDefault();
    closeMobileNavSheet();
    return;
  }
  if (!state.commandPaletteOpen) return;
  const items = filteredCommandPaletteItems();
  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.commandPaletteIndex = items.length ? (state.commandPaletteIndex + 1) % items.length : 0;
    renderCommandPalette();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.commandPaletteIndex = items.length ? (state.commandPaletteIndex - 1 + items.length) % items.length : 0;
    renderCommandPalette();
    return;
  }
  if (event.key === "Enter" && doc?.activeElement?.matches("[data-command-input]")) {
    event.preventDefault();
    const item = items[state.commandPaletteIndex];
    if (item) executeCommandPaletteAction(item.id);
  }
});

doc?.addEventListener("change", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const fileInput = target.closest("[data-file-upload]");
  if (fileInput) {
    await attachSourceFiles(fileInput.files);
    return;
  }
  const noteDomain = target.closest("[data-note-domain]");
  if (noteDomain) {
    await updateActiveNote({ domain: noteDomain.value }, { syncCloud: true });
    renderApp();
    return;
  }
  if (target.closest("[data-note-title]") || target.closest("[data-note-body]") || target.closest("[data-note-tags]")) {
    const active = state.notes.map(normalizeNote).find((note) => String(note.id) === String(state.activeNoteId));
    if (active) await syncNoteIfCloud(active);
  }
});

function scheduleAutoSync() {
  clearInterval(state.syncTimer);
  if (!win || !state.sourceConfig.autoSync || !state.sourceConfig.remoteUrl.trim()) return;
  state.syncTimer = win.setInterval(() => {
    syncRemoteSource();
  }, AUTO_SYNC_MS);
}

function advanceOnboarding() {
  const nextStep = (state.onboarding?.activeStep || 0) + 1;
  if (nextStep >= 5) {
    state.onboarding = {
      ...state.onboarding,
      activeStep: 4,
      tutorialOpen: false,
      tutorialCompleted: true,
    };
  } else {
    state.onboarding = {
      ...state.onboarding,
      activeStep: nextStep,
    };
  }
  rerender();
}

function retreatOnboarding() {
  state.onboarding = {
    ...state.onboarding,
    activeStep: Math.max(0, (state.onboarding?.activeStep || 0) - 1),
  };
  rerender();
}

async function loadRelationalWorkspaceForUser(user) {
  if (!state.auth.client) return;
  try {
    const workspace = await ensureUserWorkspace(state.auth.client, user.id);
    state.workspace = {
      id: workspace.id,
      name: workspace.name || "My APEX Workspace",
      phase2Enabled: true,
      error: "",
    };
    state.notificationStatus = "cloud";
    const notifications = await loadNotificationRecords(state.auth.client, workspace.id, user.id);
    state.notifications = notifications.map(normalizeNotification);
    const integrations = await loadIntegrationRecords(state.auth.client, workspace.id);
    state.integrations = mergeIntegrationTemplates(integrations.map(normalizeIntegration));
    const notes = await loadNoteRecords(state.auth.client, workspace.id);
    if (notes.length) {
      state.notes = notes.map(normalizeNote);
      state.activeNoteId = state.notes[0]?.id || null;
    }
    const uploads = await loadUploadRecords(state.auth.client, workspace.id);
    if (uploads.length) state.uploadedFiles = uploads.map(normalizeUpload);
    const syllabi = await loadSyllabusRecords(state.auth.client, workspace.id);
    if (syllabi.length) state.syllabusReviews = syllabi.map(normalizeSyllabusReview);
  } catch (error) {
    state.workspace = {
      id: null,
      name: "Local workspace",
      phase2Enabled: false,
      error: error instanceof Error ? error.message : "Phase 2 schema unavailable.",
    };
    state.notificationStatus = "local";
  }
}

async function loadWorkspaceForUser(user) {
  try {
    const workspace = await loadUserWorkspace(state.auth.client, user.id);
    if (workspace) {
      applyWorkspaceState(workspace);
      state.cloudSaveStatus = "loaded";
    } else {
      applyWorkspaceState(emptyUserSnapshot());
      await saveUserWorkspace(state.auth.client, user.id, userWorkspaceState());
      state.cloudSaveStatus = "ready";
    }
    await loadRelationalWorkspaceForUser(user);
    saveState();
  } catch (error) {
    state.auth.error = error instanceof Error ? error.message : "Unable to load your workspace.";
    applyWorkspaceState(emptyUserSnapshot());
  }
}

async function bootstrapAuth() {
  const auth = await initAuthClient();
  state.auth = {
    ...state.auth,
    ready: true,
    enabled: auth.enabled,
    client: auth.client,
    session: auth.session,
    user: auth.user,
    error: auth.error || "",
  };
  if (state.auth.client) {
    state.auth.client.auth.onAuthStateChange(async (_event, session) => {
      state.auth.session = session;
      state.auth.user = session?.user || null;
      if (state.auth.user) await loadWorkspaceForUser(state.auth.user);
      renderApp();
    });
  }
  if (state.auth.user) await loadWorkspaceForUser(state.auth.user);
  renderApp();
  scheduleAutoSync();
}

async function handleAuthSubmit() {
  if (!state.auth.client) return;
  state.auth.error = "";
  state.auth.message = "";
  renderApp();
  try {
    const action = state.auth.mode === "sign-up" ? signUpWithPassword : signInWithPassword;
    const data = await action(state.auth.client, state.auth.email.trim(), state.auth.password);
    state.auth.session = data.session;
    state.auth.user = data.user || data.session?.user || null;
    if (state.auth.user) {
      await loadWorkspaceForUser(state.auth.user);
      notifyUser({
        type: "welcome",
        title: "Welcome to your APEX workspace",
        body: "Start with the setup checklist, then add your own sources when you are ready.",
        severity: "success",
      });
    } else {
      state.auth.message = "Check your email to confirm the account, then sign in.";
    }
  } catch (error) {
    state.auth.error = error instanceof Error ? error.message : "Authentication failed.";
  } finally {
    renderApp();
  }
}

async function handleSignOut() {
  try {
    if (state.auth.client) await signOut(state.auth.client);
  } finally {
    state.auth.session = null;
    state.auth.user = null;
    state.auth.password = "";
    state.cloudSaveStatus = "idle";
    state.workspace = { id: null, name: "Local workspace", phase2Enabled: false, error: "" };
    state.notifications = [];
    state.integrations = mergeIntegrationTemplates([]);
    state.notes = [];
    state.syllabusReviews = [];
    state.lastPlanSnapshot = null;
    state.lastPlanChanges = null;
    state.notificationPanelOpen = false;
    state.notificationStatus = "local";
    renderApp();
  }
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
  state.scheduleMode = next.scheduleMode;
  state.sourceConfig = next.sourceConfig;
  state.subTabs = next.subTabs;
  state.workspace = next.workspace;
  state.notifications = next.notifications;
  state.notificationPanelOpen = next.notificationPanelOpen;
  state.notificationStatus = next.notificationStatus;
  state.integrations = next.integrations;
  state.noteSearch = next.noteSearch;
  state.activeNoteId = next.activeNoteId;
  state.notes = next.notes;
  state.brainDump = next.brainDump;
  state.processedDump = next.processedDump;
  state.uploadedFiles = next.uploadedFiles;
  state.syllabusReviews = next.syllabusReviews;
  state.checkin = next.checkin;
  state.lastPlanSnapshot = next.lastPlanSnapshot;
  state.lastPlanChanges = next.lastPlanChanges;
  renderApp();
  scheduleAutoSync();
});

if (app) {
  renderApp();
  bootstrapAuth();
}
