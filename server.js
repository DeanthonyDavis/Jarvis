import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, access } from "node:fs/promises";

import {
  INITIAL_TASKS,
  COURSES,
  SCHEDULE,
  BILLS,
  DEFAULT_BUDGET,
  DEFAULT_PAYCHECKS,
  DEFAULT_CONSTRAINTS,
} from "./apex-data.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.join(ROOT, ".apex-connectors.json");
const ENV_FILE = path.join(ROOT, ".env");

async function hydrateEnv() {
  try {
    const raw = await readFile(ENV_FILE, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {}
}

await hydrateEnv();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const WEBHOOK_SECRET = process.env.APEX_WEBHOOK_SECRET || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultStore() {
  return {
    firstUser: {
      id: "first-user",
      name: "Dean",
      role: "Founder beta user",
      createdAt: null,
    },
    manualPayload: {},
    calendar: { configured: false, lastSyncAt: null, lastError: "", events: [] },
    lms: { configured: false, lastSyncAt: null, lastError: "", courses: [], assignments: [] },
    webhooks: [],
  };
}

async function loadStore() {
  try {
    await access(STORE_FILE);
    const raw = await readFile(STORE_FILE, "utf8");
    return { ...defaultStore(), ...JSON.parse(raw) };
  } catch {
    return defaultStore();
  }
}

async function saveStore(store) {
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": MIME[".json"] });
  res.end(JSON.stringify(data, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function webhookAuthorized(req) {
  return !WEBHOOK_SECRET || req.headers["x-apex-secret"] === WEBHOOK_SECRET;
}

function formatDueLabel(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${month} ${day} · ${time}`;
}

function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function minutesBetween(start, end) {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 60;
  return Math.max(15, Math.round((b.getTime() - a.getTime()) / 60000));
}

function normalizeCalendarEvent(event) {
  const start = event.start?.dateTime || event.start?.date || event.startTime || event.start;
  const end = event.end?.dateTime || event.end?.date || event.endTime || event.end;
  return {
    id: event.id || `${event.summary || event.title}-${start || "event"}`,
    title: event.summary || event.title || "Calendar event",
    start,
    end,
    location: event.location || "",
    source: event.source || "calendar",
  };
}

function normalizeCanvasCourse(course) {
  const enrollment = Array.isArray(course.enrollments) ? course.enrollments[0] : null;
  const grade =
    enrollment?.computed_current_score ??
    enrollment?.computed_final_score ??
    course.grade ??
    course.score ??
    null;
  return {
    id: course.id,
    name: course.name || course.courseName || "Canvas course",
    code: course.course_code || course.code || course.sis_course_id || course.name,
    grade: grade === null ? null : Math.round(Number(grade)),
    platform: "Canvas",
  };
}

function normalizeCanvasAssignment(assignment, course) {
  return {
    id: assignment.id || `${course.code}-${assignment.name}`,
    title: assignment.name || assignment.title || "Canvas assignment",
    domain: "academy",
    due: formatDueLabel(assignment.due_at || assignment.dueDate),
    urgent: Boolean(assignment.urgent),
    done: false,
    course: course.code,
  };
}

function dedupeBy(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function mergeCourses(baseCourses, lmsCourses) {
  const byCode = new Map(baseCourses.map((course) => [course.code, { ...course }]));
  for (const course of lmsCourses) {
    if (!course.code) continue;
    const existing = byCode.get(course.code);
    byCode.set(course.code, {
      ...(existing || {}),
      ...course,
      color: existing?.color,
      hist: existing?.hist || [course.grade || 0],
      target: existing?.target || 90,
      trend: existing?.trend || 0,
      exam: existing?.exam || null,
    });
  }
  return [...byCode.values()];
}

function buildCalendarSchedule(events, now) {
  return events
    .filter((event) => event.start)
    .filter((event) => {
      const start = new Date(event.start);
      return !Number.isNaN(start.getTime()) && start.toDateString() === now.toDateString();
    })
    .map((event) => ({
      time: formatClock(event.start),
      label: event.title,
      domain: /interview|meeting|lab|shift/i.test(event.title) ? "works" : "life",
      mins: minutesBetween(event.start, event.end),
    }))
    .filter((item) => item.time);
}

function buildLivePayload(store) {
  const manual = store.manualPayload || {};
  const tasks = dedupeBy(
    [
      ...clone(INITIAL_TASKS),
      ...store.lms.assignments,
      ...(manual.tasks || []),
    ],
    (task) => `${task.title}|${task.due || ""}|${task.course || ""}`,
  );
  const courses = mergeCourses(clone(COURSES), [...store.lms.courses, ...(manual.courses || [])]);
  const schedule = dedupeBy(
    [
      ...clone(SCHEDULE),
      ...buildCalendarSchedule(store.calendar.events, new Date()),
      ...(manual.schedule || []),
    ],
    (item) => `${item.time}|${item.label}`,
  );

  return {
    user: store.firstUser,
    tasks,
    courses,
    schedule,
    bills: manual.bills || clone(BILLS),
    budget: { ...clone(DEFAULT_BUDGET), ...(manual.budget || {}) },
    paychecks: manual.paychecks || clone(DEFAULT_PAYCHECKS),
    constraints: {
      hard: { ...clone(DEFAULT_CONSTRAINTS).hard, ...(manual.constraints?.hard || {}) },
      soft: { ...clone(DEFAULT_CONSTRAINTS).soft, ...(manual.constraints?.soft || {}) },
    },
    sourceMeta: {
      calendar: {
        configured: store.calendar.configured,
        lastSyncAt: store.calendar.lastSyncAt,
        lastError: store.calendar.lastError,
        eventCount: store.calendar.events.length,
      },
      lms: {
        configured: store.lms.configured,
        lastSyncAt: store.lms.lastSyncAt,
        lastError: store.lms.lastError,
        courseCount: store.lms.courses.length,
        assignmentCount: store.lms.assignments.length,
      },
      webhookCount: store.webhooks.length,
    },
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function refreshCalendar(store) {
  try {
    let payload = null;
    if (process.env.CALENDAR_CONNECTOR_URL) {
      payload = await fetchJson(process.env.CALENDAR_CONNECTOR_URL);
    } else if (process.env.GOOGLE_CALENDAR_ID && (process.env.GOOGLE_CALENDAR_API_KEY || process.env.GOOGLE_CALENDAR_BEARER_TOKEN)) {
      const headers = {};
      if (process.env.GOOGLE_CALENDAR_BEARER_TOKEN) {
        headers.authorization = `Bearer ${process.env.GOOGLE_CALENDAR_BEARER_TOKEN}`;
      }
      const query = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "12",
        timeMin: new Date().toISOString(),
      });
      if (process.env.GOOGLE_CALENDAR_API_KEY) query.set("key", process.env.GOOGLE_CALENDAR_API_KEY);
      payload = await fetchJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events?${query.toString()}`,
        { headers },
      );
    }
    if (!payload) return store;
    store.calendar = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: "",
      events: (payload.items || payload.events || payload || []).map(normalizeCalendarEvent),
    };
  } catch (error) {
    store.calendar = {
      ...store.calendar,
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Calendar sync failed",
    };
  }
  return store;
}

async function refreshLms(store) {
  try {
    let courses = [];
    let assignments = [];

    if (process.env.LMS_CONNECTOR_URL) {
      const payload = await fetchJson(process.env.LMS_CONNECTOR_URL);
      courses = (payload.courses || []).map(normalizeCanvasCourse);
      assignments = (payload.assignments || []).map((assignment) =>
        normalizeCanvasAssignment(assignment, { code: assignment.course || assignment.courseCode || "ACADEMY" }),
      );
    } else if (process.env.CANVAS_BASE_URL && process.env.CANVAS_TOKEN) {
      const headers = { authorization: `Bearer ${process.env.CANVAS_TOKEN}` };
      const baseUrl = process.env.CANVAS_BASE_URL.replace(/\/$/, "");
      const courseRows = await fetchJson(
        `${baseUrl}/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=8`,
        { headers },
      );
      courses = courseRows.map(normalizeCanvasCourse);
      for (const course of courses.slice(0, 6)) {
        const assignmentRows = await fetchJson(
          `${baseUrl}/api/v1/courses/${course.id}/assignments?bucket=upcoming&per_page=8`,
          { headers },
        );
        assignments.push(...assignmentRows.map((assignment) => normalizeCanvasAssignment(assignment, course)));
      }
    }

    if (!courses.length && !assignments.length) return store;
    store.lms = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: "",
      courses,
      assignments,
    };
  } catch (error) {
    store.lms = {
      ...store.lms,
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "LMS sync failed",
    };
  }
  return store;
}

async function refreshConnectors(store) {
  await refreshCalendar(store);
  await refreshLms(store);
  await saveStore(store);
  return store;
}

async function serveStatic(res, pathname) {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(ROOT, relative);
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const store = await loadStore();

  if (pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (pathname === "/api/source/live" && req.method === "GET") {
    if (url.searchParams.get("refresh") === "1") await refreshConnectors(store);
    sendJson(res, 200, buildLivePayload(store));
    return;
  }

  if (pathname === "/api/user/first" && req.method === "GET") {
    sendJson(res, 200, store.firstUser);
    return;
  }

  if (pathname === "/api/user/first" && req.method === "POST") {
    const payload = await readJson(req);
    store.firstUser = {
      id: "first-user",
      name: String(payload.name || store.firstUser.name || "Dean"),
      role: String(payload.role || store.firstUser.role || "Founder beta user"),
      createdAt: store.firstUser.createdAt || new Date().toISOString(),
    };
    await saveStore(store);
    sendJson(res, 200, store.firstUser);
    return;
  }

  if (pathname === "/api/connectors/calendar" && req.method === "GET") {
    if (url.searchParams.get("refresh") === "1") await refreshCalendar(store);
    await saveStore(store);
    sendJson(res, 200, store.calendar);
    return;
  }

  if (pathname === "/api/connectors/lms" && req.method === "GET") {
    if (url.searchParams.get("refresh") === "1") await refreshLms(store);
    await saveStore(store);
    sendJson(res, 200, store.lms);
    return;
  }

  if (pathname === "/api/webhooks/calendar" && req.method === "POST") {
    if (!webhookAuthorized(req)) {
      sendJson(res, 401, { error: "Invalid webhook secret" });
      return;
    }
    const payload = await readJson(req);
    store.calendar = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: "",
      events: (payload.items || payload.events || []).map(normalizeCalendarEvent),
    };
    store.webhooks.push({ type: "calendar", at: new Date().toISOString() });
    await saveStore(store);
    sendJson(res, 200, { ok: true, eventCount: store.calendar.events.length });
    return;
  }

  if (pathname === "/api/webhooks/lms" && req.method === "POST") {
    if (!webhookAuthorized(req)) {
      sendJson(res, 401, { error: "Invalid webhook secret" });
      return;
    }
    const payload = await readJson(req);
    store.lms = {
      configured: true,
      lastSyncAt: new Date().toISOString(),
      lastError: "",
      courses: (payload.courses || []).map(normalizeCanvasCourse),
      assignments: (payload.assignments || []).map((assignment) =>
        normalizeCanvasAssignment(assignment, { code: assignment.course || assignment.courseCode || "ACADEMY" }),
      ),
    };
    store.webhooks.push({ type: "lms", at: new Date().toISOString() });
    await saveStore(store);
    sendJson(res, 200, { ok: true, courseCount: store.lms.courses.length, assignmentCount: store.lms.assignments.length });
    return;
  }

  if (pathname === "/api/webhooks/apex" && req.method === "POST") {
    if (!webhookAuthorized(req)) {
      sendJson(res, 401, { error: "Invalid webhook secret" });
      return;
    }
    const payload = await readJson(req);
    store.manualPayload = {
      ...store.manualPayload,
      ...payload,
      constraints: {
        ...(store.manualPayload.constraints || {}),
        ...(payload.constraints || {}),
        hard: {
          ...(store.manualPayload.constraints?.hard || {}),
          ...(payload.constraints?.hard || {}),
        },
        soft: {
          ...(store.manualPayload.constraints?.soft || {}),
          ...(payload.constraints?.soft || {}),
        },
      },
    };
    store.webhooks.push({ type: "apex", at: new Date().toISOString() });
    await saveStore(store);
    sendJson(res, 200, { ok: true, keys: Object.keys(payload) });
    return;
  }

  if (pathname === "/api/reset" && req.method === "POST") {
    const nextStore = defaultStore();
    await saveStore(nextStore);
    sendJson(res, 200, { ok: true });
    return;
  }

  await serveStatic(res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`APEX server running at http://${HOST}:${PORT}`);
});
