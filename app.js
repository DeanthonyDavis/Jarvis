import { buildCommandCenterIntelligence, normalizeConstraints } from "./intelligence.js";
import {
  createNotificationRecord,
  createUploadRecord,
  dismissNotificationRecord,
  ensureUserWorkspace,
  initAuthClient,
  loadNotificationRecords,
  loadUploadRecords,
  loadUserWorkspace,
  markNotificationRecordRead,
  saveUserWorkspace,
  signInWithPassword,
  signOut,
  signUpWithPassword,
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

const DOMAIN_ICONS = {
  command: "M8 2.5 3.5 9h4L5.5 17.5 14 7h-4l2-4.5Z",
  academy: "M2.5 7.5 10 3.5l7.5 4-7.5 4-7.5-4ZM5.5 10v3.2c1.5 1.5 7.5 1.5 9 0V10",
  works: "M5 6h10v10H5V6Zm3 0V4h4v2M5 10h10",
  life: "M3.5 9.5 10 4l6.5 5.5V16H5V9.5Zm4 6.5v-4h5v4",
  future: "M10 2.8c2 1.4 3.4 3.3 3.4 5.4 1.5.7 2.4 2.1 2.5 3.8-1.6-.2-3.1-1-4-2.4-1.8.7-3.8.7-5.8 0-.9 1.4-2.4 2.2-4 2.4.1-1.7 1-3.1 2.5-3.8 0-2.1 1.4-4 3.4-5.4Zm0 3.2v0",
  mind: "M7 15.5c-2 0-3.5-1.5-3.5-3.4 0-1 .4-1.9 1.1-2.5-.2-.4-.3-.8-.3-1.2 0-1.5 1.2-2.7 2.8-2.7.6-1.2 1.7-2 3-2s2.4.8 3 2c1.6 0 2.8 1.2 2.8 2.7 0 .4-.1.8-.3 1.2.7.6 1.1 1.5 1.1 2.5 0 1.9-1.5 3.4-3.5 3.4H7Z",
  notebook: "M5 3.5h9.5c.8 0 1.5.7 1.5 1.5v11.5H6.5c-.8 0-1.5-.7-1.5-1.5V3.5Zm3 0v13",
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
    noteSearch: "",
    activeNoteId: NOTES[0]?.id || null,
    uploadedFiles: [],
    brainDump: "",
    processedDump: null,
    checkin: { energy: 0, focus: 0, mood: 0, submitted: false },
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
      sourceConfig: { ...defaults.sourceConfig, ...(saved.sourceConfig || {}) },
      subTabs: { ...defaults.subTabs, ...(saved.subTabs || {}) },
      workspace: { ...defaults.workspace, ...(saved.workspace || {}) },
      notifications: Array.isArray(saved.notifications) ? saved.notifications : defaults.notifications,
      notificationPanelOpen: Boolean(saved.notificationPanelOpen),
      notificationStatus: saved.notificationStatus || defaults.notificationStatus,
      noteSearch: saved.noteSearch || "",
      activeNoteId: saved.activeNoteId ?? defaults.activeNoteId,
      uploadedFiles: Array.isArray(saved.uploadedFiles) ? saved.uploadedFiles : defaults.uploadedFiles,
      brainDump: saved.brainDump || "",
      processedDump: saved.processedDump || null,
      checkin: { ...defaults.checkin, ...(saved.checkin || {}) },
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
};

const app = doc?.querySelector("#app") || null;
const colorFor = (domain) => TOKENS[domain] || TOKENS.command;
const activeDomain = () => DOMAINS.find((domain) => domain.id === state.activeDomain);
const localId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const unreadNotifications = () => state.notifications.filter((item) => !item.read_at && !item.dismissed_at && !item.resolved_at);
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
const iconSvg = (id, label = "") =>
  `<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="${label ? "false" : "true"}" ${label ? `aria-label="${escapeHtml(label)}"` : ""}><path d="${DOMAIN_ICONS[id] || DOMAIN_ICONS.command}"></path></svg>`;
const sparkBars = (values, accent) => {
  const max = Math.max(...values, 1);
  return `<div class="spark-bars">${values.map((value, index) => `<span style="height:${Math.max(14, (value / max) * 100)}%; --accent:${accent}; --index:${index + 1};"></span>`).join("")}</div>`;
};

function gauge(value, accent, label, subtitle = "", displayValue = `${value}%`) {
  return `<div class="gauge"><div class="gauge-ring" style="--value:${value}; --accent:${accent};"><strong>${displayValue}</strong></div><div class="gauge-copy"><span>${label}</span>${subtitle ? `<small class="muted">${subtitle}</small>` : ""}</div></div>`;
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
      workspace: state.workspace,
      notifications: state.notifications,
      notificationPanelOpen: state.notificationPanelOpen,
      notificationStatus: state.notificationStatus,
      noteSearch: state.noteSearch,
      activeNoteId: state.activeNoteId,
      uploadedFiles: state.uploadedFiles,
      brainDump: state.brainDump,
      processedDump: state.processedDump,
      checkin: state.checkin,
      onboarding: state.onboarding,
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
    sourceConfig: state.sourceConfig,
    subTabs: state.subTabs,
    workspace: state.workspace,
    notifications: state.notifications,
    notificationStatus: state.notificationStatus,
    noteSearch: state.noteSearch,
    activeNoteId: state.activeNoteId,
    uploadedFiles: state.uploadedFiles,
    brainDump: state.brainDump,
    processedDump: state.processedDump,
    checkin: state.checkin,
    onboarding: state.onboarding,
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
  state.sourceConfig = { ...base.sourceConfig, ...(workspace?.sourceConfig || {}) };
  state.subTabs = { ...base.subTabs, ...(workspace?.subTabs || {}) };
  state.workspace = { ...base.workspace, ...(workspace?.workspace || {}) };
  state.notifications = Array.isArray(workspace?.notifications) ? workspace.notifications : base.notifications;
  state.notificationStatus = workspace?.notificationStatus || base.notificationStatus;
  state.notificationPanelOpen = Boolean(workspace?.notificationPanelOpen);
  state.noteSearch = workspace?.noteSearch || "";
  state.activeNoteId = workspace?.activeNoteId ?? null;
  state.uploadedFiles = Array.isArray(workspace?.uploadedFiles) ? workspace.uploadedFiles : [];
  state.brainDump = workspace?.brainDump || "";
  state.processedDump = workspace?.processedDump || null;
  state.checkin = { ...base.checkin, ...(workspace?.checkin || {}) };
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

function renderOnboarding() {
  if (!state.onboarding?.tutorialOpen) return "";
  const steps = [
    ["Start Clean", "Your account begins with no demo classes or tasks. APEX only schedules what you add or connect."],
    ["Add Syllabus Files", "Go to Notebook to attach syllabi, PDFs, notes, or assignment sheets as source files."],
    ["Connect School", "Use Academy and Live Data Sources to bring in LMS courses, assignments, and grade signals."],
    ["Connect Life & Work", "Use Works and Life to connect shifts, bills, finance, and calendar context when you are ready."],
    ["Tune Scheduling", "Set hard constraints for immovable commitments and soft preferences for how you like to work."],
  ];
  const index = Math.min(state.onboarding.activeStep || 0, steps.length - 1);
  const [title, text] = steps[index];
  return `<div class="onboarding-card"><div class="panel-label">setup ${index + 1}/${steps.length}</div><div class="setup-progress">${steps.map((_step, stepIndex) => `<span class="${stepIndex <= index ? "is-active" : ""}"></span>`).join("")}</div><h3>${title}</h3><p>${text}</p><div class="source-actions"><button class="surface-action" data-onboarding-back ${index === 0 ? "disabled" : ""}>Back</button><button class="primary-action" data-onboarding-next>${index === steps.length - 1 ? "Finish Setup" : "Next"}</button><button class="surface-action" data-onboarding-skip>Skip</button></div></div>`;
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

function renderSetupChecklist() {
  const items = [
    { title: "Upload Syllabus Files", text: "Attach syllabi, PDFs, or assignment sheets.", domain: "notebook", done: state.uploadedFiles.length > 0, action: "Open Notebook" },
    { title: "Connect School Accounts", text: "Bring in courses, assignments, and grade signals.", domain: "academy", done: state.courses.length > 0, action: "Open Academy" },
    { title: "Connect Calendar & Work", text: "Sync shifts, events, and project commitments.", domain: "works", done: state.schedule.length > 0, action: "Open Works" },
    { title: "Connect Finance", text: "Add bills or connect finance sources when ready.", domain: "life", done: state.bills.length > 0, action: "Open Life" },
    { title: "Tune Scheduler", text: "Set hard and soft constraints for the solver.", domain: "command", done: state.onboarding?.tutorialCompleted || state.onboarding?.tutorialSkipped, action: "Tune Constraints" },
  ];
  return `<article class="panel span-12 setup-panel" style="--accent:${TOKENS.command};"><div class="panel-label">first-time setup</div><div class="setup-list">${items.map((item) => `<button class="setup-item ${item.done ? "is-complete" : ""}" data-domain="${item.domain}" style="--accent:${colorFor(item.domain)};"><span class="setup-icon">${iconSvg(item.domain, item.title)}</span><span class="setup-copy"><strong>${item.title}</strong><small>${item.text}</small></span><span class="setup-status">${item.done ? "Ready" : "Not Started"}</span><span class="setup-action">${item.action}</span></button>`).join("")}</div></article>`;
}

function renderCommand(intel) {
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const dayIndex = intel.generatedAt.getDay();
  const topCourse = intel.courseInsights.slice().sort((a, b) => b.riskScore - a.riskScore)[0];
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${renderSetupChecklist()}<article class="panel span-8" style="--accent:${TOKENS.command};"><div class="panel-label">intelligence briefing</div><div class="list-rows">${intel.topPriorities.map((task, index) => `<div class="row is-hot" style="--accent:${colorFor(task.domain)};"><div class="row-badge">${index + 1}</div><div class="row-copy"><div class="row-title">${task.title}</div><div class="row-subtitle">Due ${task.due} &middot; ${task.reason}</div></div>${pill(task.domain, colorFor(task.domain))}</div>`).join("")}</div><div class="system-note" style="margin-top:1rem;">This stack is now driven by live task scoring plus the current constraint profile. Change the rules, and these priorities recompute.</div></article><article class="panel span-4" style="--accent:${intel.solverSummary.unscheduledUrgentCount ? TOKENS.danger : TOKENS.ok};"><div class="panel-label">solver summary</div><div class="solver-grid"><div class="metric-stack"><span>Scheduled</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="metric-stack"><span>Capacity</span><strong>${intel.solverSummary.flexibleCapacityMinutes}m</strong></div><div class="metric-stack"><span>Urgent unscheduled</span><strong>${intel.solverSummary.unscheduledUrgentCount}</strong></div><div class="metric-stack"><span>Search score</span><strong>${intel.solverSummary.score}</strong></div></div><div class="footer-note">${intel.solverSummary.unscheduledMinutes ? `${intel.solverSummary.unscheduledMinutes} minutes remain unscheduled under the current rules.` : "Every active chunk currently fits inside the remaining day."}</div></article><article class="panel span-4" style="--accent:${TOKENS.command};"><div class="panel-label">capacity gauge</div>${gauge(intel.loadScore, TOKENS.command, "load index", intel.loadLabel === "stabilize" ? "stabilize plan active" : intel.loadLabel, intel.loadDisplay || `${intel.loadScore}%`)}<div class="footer-note" style="margin-top:0.9rem;">${intel.loadExplanation}</div><div class="mini-breakdown">${intel.domainLoads.map((item) => `<div><div class="label-row"><span>${item.label}</span><span>${item.pct}%</span></div>${meter(item.pct, colorFor(item.domain))}</div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.academy};"><div class="panel-label">gpa tracker</div><div class="kpi"><div class="kpi-value accent-text">3.47</div><div class="kpi-copy"><div>Current GPA</div><div class="${topCourse?.status === "at-risk" ? "trend-down" : "trend-up"}">${topCourse?.status === "at-risk" ? "Watch " : "Stable "}${topCourse?.name || "semester profile"}</div></div></div>${sparkBars(state.courses.map((course) => course.grade / 10), TOKENS.academy)}<div class="section-list" style="margin-top:0.95rem;">${intel.courseInsights.map((course) => `<div class="meta-row"><span>${course.name}</span><strong style="color:${course.status === "at-risk" ? TOKENS.danger : course.status === "watch" ? TOKENS.warn : TOKENS.ok};">${course.grade}%</strong></div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.danger};"><div class="panel-label">conflict engine</div><div class="stack-list">${intel.conflicts.map((conflict) => `<div class="row" style="--accent:${conflict.severity === "crit" ? TOKENS.danger : conflict.severity === "warn" ? TOKENS.warn : TOKENS.command}; align-items:flex-start;"><div class="row-badge">${conflict.severity === "crit" ? "!" : conflict.severity === "warn" ? "~" : "i"}</div><div class="row-copy"><div class="row-title">${conflict.title}</div><div class="row-subtitle">${conflict.text}</div></div><button class="small-action">${conflict.action}</button></div>`).join("")}</div></article><article class="panel span-4" style="--accent:${TOKENS.notebook};"><div class="panel-label">this week</div><div class="calendar-grid">${dayLabels.map((label, index) => { const day = intel.weeklyOutlook[index]; const level = day.level === "high" ? TOKENS.danger : day.level === "medium" ? TOKENS.warn : TOKENS.ok; return `<div class="day-card ${index === dayIndex ? "is-today" : ""}" style="--accent:${level};"><small class="muted">${label}</small><strong>${day.date.getDate()}</strong><div class="dot-stack"><span style="background:${level};"></span><span style="background:${level}; opacity:.65;"></span><span style="background:${level}; opacity:.35;"></span></div></div>`; }).join("")}</div><div class="footer-note" style="margin-top:0.95rem;">Peak pressure day: ${intel.hottestDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}. The weekly view is driven by deadlines, exams, and bills.</div></article><article class="panel span-12" style="--accent:${TOKENS.future};"><div class="panel-label">next best moves</div><div class="courses-grid">${intel.recommendations.map((item) => `<article class="note-card"><h4>${item.title}</h4><p class="row-subtitle" style="margin-top:0.7rem;">${item.text}</p><div style="margin-top:0.8rem;">${pill(DOMAINS.find((domain) => domain.id === item.accent)?.label || item.accent, colorFor(item.accent))}</div></article>`).join("")}</div></article>${renderConstraintPanel(intel)}${renderSourcePanel()}<article class="panel span-12" style="--accent:${TOKENS.command};"><div class="panel-label">optimized schedule</div><div class="schedule-strip schedule-strip--solver">${intel.schedulePlan.map((item) => `<div class="schedule-block" style="--accent:${colorFor(item.domain)};"><div class="schedule-time">${item.time}</div><strong>${item.label}</strong><div class="row-subtitle" style="margin-top:0.45rem;">${item.note}</div><div style="margin-top:0.65rem;">${pill(item.status || item.kind, item.status === "locked" ? TOKENS.notebook : item.status === "assigned" ? colorFor(item.domain) : TOKENS.warn)}</div><div class="assignment-list">${item.assignments?.length ? item.assignments.map((assignment) => `<div class="assignment-pill"><span>${assignment.title}</span><strong>${assignment.minutes}m</strong></div>`).join("") : `<div class="empty-assignment">${item.status === "locked" ? "Reserved" : "No task assigned"}</div>`}</div><div class="row-subtitle">Remaining: ${item.remainingMinutes ?? 0}m</div></div>`).join("")}</div></article></div></section>`;
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
  const insights = MIND_INSIGHTS.map((item) => `<div class="row" style="--accent:${TOKENS.mind};"><div class="row-badge">${iconSvg("mind", item.title)}</div><div class="row-copy"><div class="row-title">${item.title}</div><div class="row-subtitle">${item.body}</div></div></div>`).join("");
  const risk = burnoutRisk(intel);
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid"><article class="panel span-5" style="--accent:${TOKENS.mind};"><div class="panel-label">daily check-in</div>${form}</article><article class="panel span-3" style="--accent:${TOKENS.notebook};"><div class="panel-label">burnout risk</div>${gauge(risk, risk > 55 ? TOKENS.warn : TOKENS.ok, "burnout risk", risk > 55 ? "load softening recommended" : "stable")}</article>${simpleListPanel("apex mind intelligence", TOKENS.mind, insights)}</div></section>`;
}

function renderNotebook(intel) {
  const filtered = NOTES.filter((note) => { const search = state.noteSearch.trim().toLowerCase(); return !search || note.title.toLowerCase().includes(search) || note.domain.toLowerCase().includes(search) || note.tags.some((tag) => tag.toLowerCase().includes(search)); });
  const activeNote = NOTES.find((note) => note.id === state.activeNoteId) || filtered[0] || null;
  const uploads = state.uploadedFiles.map(normalizeUpload);
  const uploadRows = uploads.map((file) => `<div class="row" style="--accent:${TOKENS.notebook};"><div class="row-badge">${iconSvg("notebook", "Source file")}</div><div class="row-copy"><div class="row-title">${escapeHtml(file.name)}</div><div class="row-subtitle">${escapeHtml(file.type)} &middot; ${Math.max(1, Math.round(file.size / 1024))} KB &middot; ${escapeHtml(file.uploadStatus)} / ${escapeHtml(file.textStatus)}</div></div>${pill(file.local ? "local" : "cloud", file.local ? TOKENS.warn : TOKENS.ok)}</div>`).join("");
  return `<section class="section-shell">${heroBand(intel)}<div class="notebook-layout"><aside class="panel panel--quiet" style="--accent:${TOKENS.notebook};"><div class="panel-label">search notes</div><input class="search-input" type="search" placeholder="Search all notes..." value="${escapeHtml(state.noteSearch)}" data-note-search /><div class="note-list" style="margin-top:1rem;">${filtered.map((note) => `<button class="note-button ${note.id === state.activeNoteId ? "is-active" : ""}" data-note-id="${note.id}" style="--accent:${colorFor(note.domain)};"><strong>${note.title}</strong><small>${note.updated} &middot; ${note.domain}</small></button>`).join("")}</div></aside><div class="section-shell"><article class="panel" style="--accent:${activeNote ? colorFor(activeNote.domain) : TOKENS.notebook};">${activeNote ? `<div class="section-list"><div><div class="panel-label">${iconSvg(activeNote.domain)} ${activeNote.domain}</div><h3 style="margin:0; font-family:Syne,system-ui,sans-serif; font-size:1.9rem;">${activeNote.title}</h3><div class="inline-chips" style="margin-top:0.9rem;">${activeNote.tags.map((tag) => pill(`#${tag}`, TOKENS.notebook)).join("")}</div></div><div class="note-content">${activeNote.summary}</div></div>` : `<div class="footer-note">No notes match that search yet.</div>`}</article><article class="panel" style="--accent:${TOKENS.notebook};"><div class="panel-label">source uploads</div><h3 class="empty-title">Upload syllabi, notes, and assignment sheets.</h3><p class="row-subtitle">APEX stores metadata now; text extraction, parsing, and review are the next pipeline step.</p><label class="upload-zone"><input type="file" multiple data-file-upload /><span>Choose files to attach</span><small>${uploads.length ? `${uploads.length} source file(s) tracked` : "No source files attached yet"}</small></label><div class="section-list" style="margin-top:1rem;">${uploadRows || `<div class="footer-note">No uploads yet. Start with a syllabus so Academy can eventually extract dates and assignments.</div>`}</div></article><article class="panel" style="--accent:${TOKENS.command};"><div class="panel-label">brain dump</div>${!state.processedDump ? `<textarea class="brain-dump" placeholder="Type anything: study thermo, email professor, pay rent, prep Friday quiz..." data-brain-dump>${escapeHtml(state.brainDump)}</textarea><div class="hero-actions"><button class="primary-action" data-process-dump>Process + sort</button></div>` : `<div class="processing-result"><div class="row is-hot" style="--accent:${TOKENS.ok};"><div class="row-badge">${iconSvg("command", "Processed")}</div><div class="row-copy"><div class="row-title">Dump routed into ${state.processedDump.domains.length} dashboards</div><div class="row-subtitle">${state.processedDump.summary}</div></div></div><div class="inline-chips">${state.processedDump.domains.map((domain) => pill(domain, colorFor(domain.toLowerCase()))).join("")}</div><button class="surface-action" data-clear-dump>New dump</button></div>`}</article></div></div></section>`;
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
  return `<section class="section-shell">${heroBand(intel)}<article class="panel span-12" style="--accent:${colorFor(domain.id)};"><div class="panel-label">fresh workspace</div><h3 class="empty-title">${guidance[0]}</h3><p class="row-subtitle">${guidance[1]}</p><div class="hero-actions"><button class="primary-action" data-domain="${guidance[3]}">${guidance[2]}</button><button class="surface-action" data-domain="${guidance[5]}">${guidance[4]}</button></div></article></section>`;
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
  app.innerHTML = `<div class="app-shell" style="--accent:${colorFor(domain.id)};"><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><aside class="sidebar ${state.sidebarCollapsed ? "is-collapsed" : ""}"><div class="brand"><div class="brand-mark">${iconSvg("command")}</div><div class="brand-copy"><h1>APEX</h1><p>Universal 2.0</p></div></div><nav class="sidebar-nav">${DOMAINS.map((item) => `<button class="nav-button ${state.activeDomain === item.id ? "is-active" : ""}" data-domain="${item.id}" style="--accent:${colorFor(item.id)};"><span class="nav-icon">${iconSvg(item.id, item.label)}</span><span class="nav-copy"><strong>${item.label}</strong><span>${item.blurb}</span></span></button>`).join("")}</nav><div class="sidebar-footer"><button class="collapse-button" data-collapse-sidebar aria-label="${state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}"><span>${state.sidebarCollapsed ? "&#9654;" : "&#9664;"}</span><span>${state.sidebarCollapsed ? "Expand" : "Collapse"}</span></button></div></aside><main class="main"><header class="topbar"><div class="topbar-title"><div class="topbar-icon">${iconSvg(domain.id, domain.label)}</div><div class="topbar-copy"><h2>APEX ${domain.label}</h2><p>${formatToday()} &middot; ${state.auth.user.email}</p></div></div><div class="topbar-metrics"><div class="metric-pill"><span class="metric-dot"></span><span>Load</span><strong data-shell-load>${intel.loadDisplay || `${intel.loadScore}%`}</strong></div><div class="metric-pill"><span class="metric-dot" style="background:${TOKENS.command};"></span><span>Cloud</span><strong data-shell-cloud>${state.cloudSaveStatus}</strong></div><div class="metric-pill"><span class="metric-dot" data-shell-source-dot style="background:${statusTone(state.sourceConfig.lastSyncStatus)};"></span><span>Source</span><strong data-shell-source>${state.sourceConfig.lastSyncStatus}</strong></div><button class="metric-pill metric-button ${unreadNotifications().length ? "has-unread" : ""}" data-notification-toggle type="button"><span class="metric-dot" data-shell-notification-dot style="background:${unreadNotifications().length ? TOKENS.warn : TOKENS.ok};"></span><span>Alerts</span><strong data-shell-notifications>${unreadNotifications().length}</strong></button><button class="surface-action" data-auth-signout>Sign Out</button><div class="mini-domain-rail">${DOMAINS.filter((item) => item.id !== "command").map((item) => `<button class="stat-dot-button ${item.id === state.activeDomain ? "is-active" : ""}" data-domain="${item.id}" style="--dot:${colorFor(item.id)};" title="${item.label}" aria-label="Open ${item.label}"></button>`).join("")}</div></div></header><div class="content">${renderContent(intel)}</div></main>${renderOnboarding()}${renderSectionHelp()}</div>`;
  renderToast();
  renderNotificationCenter();
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
  const fileInput = target.closest("[data-file-upload]");
  if (fileInput) {
    await attachSourceFiles(fileInput.files);
    return;
  }
  const email = target.closest("[data-auth-email]");
  if (email) { state.auth.email = email.value; return; }
  const password = target.closest("[data-auth-password]");
  if (password) { state.auth.password = password.value; }
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
    const uploads = await loadUploadRecords(state.auth.client, workspace.id);
    if (uploads.length) state.uploadedFiles = uploads.map(normalizeUpload);
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
  state.sourceConfig = next.sourceConfig;
  state.subTabs = next.subTabs;
  state.workspace = next.workspace;
  state.notifications = next.notifications;
  state.notificationPanelOpen = next.notificationPanelOpen;
  state.notificationStatus = next.notificationStatus;
  state.noteSearch = next.noteSearch;
  state.activeNoteId = next.activeNoteId;
  state.brainDump = next.brainDump;
  state.processedDump = next.processedDump;
  state.uploadedFiles = next.uploadedFiles;
  state.checkin = next.checkin;
  renderApp();
  scheduleAutoSync();
});

if (app) {
  renderApp();
  bootstrapAuth();
}
