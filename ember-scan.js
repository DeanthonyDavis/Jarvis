import { DEFAULT_BUDGET, DEFAULT_CONSTRAINTS, DEFAULT_PAYCHECKS } from "./apex-data.js";
import { buildCommandCenterIntelligence, normalizeConstraints } from "./intelligence.js";
import { buildEmberIntelligence } from "./ember-engine.js";

const STATE_TABLE = "apex_user_state";
const WORKSPACE_TABLE = "apex_workspaces";
const EMBER_STATE_TABLE = "apex_ember_states";
const EMBER_MESSAGE_TABLE = "apex_ember_messages";
const EMBER_NOTIFICATION_EVENT_TABLE = "apex_ember_notification_events";

const stateDefaults = {
  tasks: [],
  courses: [],
  schedule: [],
  bills: [],
  budget: DEFAULT_BUDGET,
  paychecks: DEFAULT_PAYCHECKS,
  checkin: { energy: 0, focus: 0, mood: 0, note: "", submitted: false },
  constraints: DEFAULT_CONSTRAINTS,
  syllabusReviews: [],
};

function normalizedWorkspaceState(raw = {}) {
  const workspace = raw?.state && typeof raw.state === "object" ? raw.state : raw;
  return {
    ...stateDefaults,
    ...workspace,
    tasks: Array.isArray(workspace.tasks) ? workspace.tasks : [],
    courses: Array.isArray(workspace.courses) ? workspace.courses : [],
    schedule: Array.isArray(workspace.schedule) ? workspace.schedule : [],
    bills: Array.isArray(workspace.bills) ? workspace.bills : [],
    budget: { ...DEFAULT_BUDGET, ...(workspace.budget || {}) },
    paychecks: Array.isArray(workspace.paychecks) ? workspace.paychecks : DEFAULT_PAYCHECKS,
    checkin: { ...stateDefaults.checkin, ...(workspace.checkin || {}) },
    constraints: normalizeConstraints(workspace.constraints || DEFAULT_CONSTRAINTS),
    syllabusReviews: Array.isArray(workspace.syllabusReviews) ? workspace.syllabusReviews : [],
  };
}

function messageForSurface(ember, surface) {
  if (surface === "planner") return ember.planner;
  if (surface === "upload_review") return ember.upload;
  return ember.dashboard;
}

function dateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function buildMessagePayload(ember, surface = "dashboard", { briefingType = "hourly", now = new Date() } = {}) {
  const primary = ember.primaryState || ember.states?.[0] || { stateKey: "steady", severity: "low", context: {} };
  const message = messageForSurface(ember, surface);
  const cadenceSuffix = briefingType === "hourly" ? "" : `:${briefingType}:${dateKey(now)}`;
  return {
    surface,
    state: {
      state_key: primary.stateKey || primary.state_key || "steady",
      severity: primary.severity || "low",
      context: primary.context || {},
      is_active: true,
      detected_at: new Date().toISOString(),
    },
    message: {
      surface,
      message_type: primary.severity === "high" ? "warning" : "guidance",
      title: message.title || null,
      body: message.body || "",
      cta_label: message.ctaLabel || null,
      cta_action: message.ctaAction || null,
      metadata: {
        stateKey: primary.stateKey || primary.state_key || "steady",
        severity: primary.severity || "low",
        note: message.note || "",
      },
    },
    eventKey: `${surface}:${primary.stateKey || primary.state_key || "steady"}${cadenceSuffix}`,
  };
}

export function buildEmberHourlyScan({ userId = null, workspaceId = null, state, now = new Date(), surface = "dashboard", briefingType = "hourly" }) {
  const normalized = normalizedWorkspaceState(state);
  const intel = buildCommandCenterIntelligence({
    now,
    tasks: normalized.tasks,
    schedule: normalized.schedule,
    courses: normalized.courses,
    bills: normalized.bills,
    checkin: normalized.checkin,
    constraints: normalized.constraints,
    budget: normalized.budget,
    paychecks: normalized.paychecks,
  });
  const ember = buildEmberIntelligence({ state: normalized, intel, now });
  const payload = buildMessagePayload(ember, surface, { briefingType, now });
  return {
    userId,
    workspaceId,
    surface,
    briefingType,
    generatedAt: now.toISOString(),
    primaryState: ember.primaryState,
    states: ember.states,
    dashboard: ember.dashboard,
    planner: ember.planner,
    upload: ember.upload,
    topThree: ember.topThree,
    load: {
      score: intel.loadScore,
      display: intel.loadDisplay,
      label: intel.loadLabel,
    },
    persist: payload,
  };
}

function serviceConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
  };
}

function authHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path, init = {}) {
  const { url, key } = serviceConfig();
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for persisted scans.");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: authHeaders(key, init.headers || {}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text || response.statusText}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadWorkspaceIdForUser(userId) {
  const rows = await supabaseFetch(`${WORKSPACE_TABLE}?select=id&owner_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  return rows?.[0]?.id || null;
}

async function recentEventExists(userId, eventKey, hours = 6) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = await supabaseFetch(`${EMBER_NOTIFICATION_EVENT_TABLE}?select=id&user_id=eq.${encodeURIComponent(userId)}&event_key=eq.${encodeURIComponent(eventKey)}&sent_at=gte.${encodeURIComponent(since)}&limit=1`);
  return Boolean(rows?.length);
}

async function persistScanResult(scan, { cooldownHours = 6 } = {}) {
  const userId = scan.userId;
  if (!userId) throw new Error("userId is required to persist Ember scan results.");
  const eventKey = scan.persist.eventKey;
  if (await recentEventExists(userId, eventKey, cooldownHours)) {
    return { skipped: true, reason: "recent_event_guardrail", eventKey };
  }

  const stateRows = await supabaseFetch(EMBER_STATE_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ ...scan.persist.state, user_id: userId, workspace_id: scan.workspaceId || null }]),
  });
  const stateId = stateRows?.[0]?.id || null;

  const messageRows = await supabaseFetch(EMBER_MESSAGE_TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ ...scan.persist.message, user_id: userId, workspace_id: scan.workspaceId || null, state_id: stateId }]),
  });
  const messageId = messageRows?.[0]?.id || null;

  await supabaseFetch(EMBER_NOTIFICATION_EVENT_TABLE, {
    method: "POST",
    body: JSON.stringify([{
      user_id: userId,
      workspace_id: scan.workspaceId || null,
      message_id: messageId,
      channel: "in_app",
      event_key: eventKey,
      status: "sent",
      metadata: {
        surface: scan.surface,
        briefingType: scan.briefingType,
        severity: scan.persist.state.severity,
        stateKey: scan.persist.state.state_key,
      },
    }]),
  });

  return { skipped: false, eventKey, stateId, messageId };
}

async function loadUserStateRows(limit = 25) {
  return supabaseFetch(`${STATE_TABLE}?select=user_id,state&order=updated_at.desc&limit=${Number(limit) || 25}`);
}

export function scanIsAuthorized(req) {
  const { key } = serviceConfig();
  if (!key) return true;
  const secret = process.env.EMBER_SCAN_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const authorization = req.headers?.authorization || req.headers?.Authorization || "";
  const headerSecret = req.headers?.["x-ember-scan-secret"] || req.headers?.["X-Ember-Scan-Secret"] || "";
  return authorization === `Bearer ${secret}` || headerSecret === secret;
}

export async function runEmberHourlyScan({ state = null, userId = null, workspaceId = null, surface = "dashboard", persist = false, limit = 25, now = new Date(), briefingType = "hourly", cooldownHours = 6 } = {}) {
  if (state) {
    const scan = buildEmberHourlyScan({ userId, workspaceId, state, now, surface, briefingType });
    return {
      mode: persist ? `single-${briefingType}-persist` : `single-${briefingType}-dry-run`,
      scanned: 1,
      results: [{ ...scan, persistence: persist ? await persistScanResult(scan, { cooldownHours }) : { skipped: true, reason: "dry_run" } }],
    };
  }

  const rows = await loadUserStateRows(limit);
  const results = [];
  for (const row of rows || []) {
    const scan = buildEmberHourlyScan({
      userId: row.user_id,
      workspaceId: await loadWorkspaceIdForUser(row.user_id),
      state: row.state || {},
      now,
      surface,
      briefingType,
    });
    results.push({ ...scan, persistence: persist ? await persistScanResult(scan, { cooldownHours }) : { skipped: true, reason: "dry_run" } });
  }
  return { mode: persist ? `batch-${briefingType}-persist` : `batch-${briefingType}-dry-run`, scanned: results.length, results };
}
