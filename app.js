import {
  buildCommandCenterIntelligence,
  buildScheduleRunSnapshot,
  compareScheduleRunSnapshots,
  normalizeConstraints,
} from "./intelligence.js";
import {
  buildEmberIntelligence,
} from "./ember-engine.js";
import {
  createActivityLogRecord,
  createEmberActionRecord,
  createEmberCheckInRecord,
  createEmberMessageRecord,
  createEmberNotificationEventRecord,
  createEmberStateRecord,
  createIntegrationEventRecord,
  createNotificationRecord,
  createNoteRecord,
  createSyllabusRecord,
  createUploadRecord,
  deleteSyllabusRecordsForUpload,
  deleteUploadRecord,
  dismissNotificationRecord,
  ensureUserWorkspace,
  initAuthClient,
  loadNotificationRecords,
  loadNoteRecords,
  loadIntegrationRecords,
  loadActivityLogRecords,
  loadEmberMessageRecords,
  loadEmberNotificationEventRecords,
  loadEmberStateRecords,
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
  updateUploadExtractionRecord,
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
        removeItem: () => {},
      };

const STORAGE_KEY = "apex-universal-state";
const CUSTOM_THEMES_KEY = "ember_themes";
const AUTO_SYNC_MS = 60 * 1000;
const CLOUD_SAVE_MS = 900;
let emberSyncTimer = null;
const clone = (value) => JSON.parse(JSON.stringify(value));

if (win?.history && "scrollRestoration" in win.history) {
  win.history.scrollRestoration = "manual";
}

function handleResetQuery() {
  if (!win) return;
  const params = new URLSearchParams(win.location.search);
  if (!params.has("reset")) return;
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(CUSTOM_THEMES_KEY);
  params.delete("reset");
  const query = params.toString();
  win.location.replace(`${win.location.pathname}${query ? `?${query}` : ""}${win.location.hash || ""}`);
}

handleResetQuery();

const MAX_SAVED_TEXT = 900;
const MAX_NOTE_TEXT = 6000;
const HTMLISH_PATTERN = /(<\/?[a-z][\s\S]*?>|function\s+\w+|import\s+.+from|export\s+default|className=|jsx|tailwind|lorem ipsum)/i;

function safeSavedText(value, max = MAX_SAVED_TEXT) {
  const text = String(value || "");
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max).trim()}...` : compact;
}

function safeFreeformText(value, max = MAX_NOTE_TEXT) {
  const text = String(value || "");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function safePreviewText(value) {
  const text = safeSavedText(value, 420);
  return HTMLISH_PATTERN.test(text) ? "Large source preview hidden. Open the review queue for extracted dates." : text;
}

const EMBER_THEMES = {
  dawn: {
    name: "Dawn",
    vibe: "Dawn to Dusk, warm horizon",
    personality: "A protective sunrise over a deep-brown base for calmer student planning.",
    tokens: {
      bg: "#0d0705",
      surface: "#1a0e08",
      surfaceStrong: "#2d1408",
      border: "#b85520",
      accent1: "#E07030",
      accent2: "#f09050",
      accent3: "#fde8c0",
      text: "#fff8f0",
      textSecondary: "#fde8c0",
      textSoft: "#b88963",
      gradientA: "radial-gradient(circle at 50% 16%, rgba(253, 232, 192, 0.28), transparent 18%), radial-gradient(circle at 52% 28%, rgba(224, 112, 48, 0.34), transparent 30%), linear-gradient(180deg, #0d0705 0%, #2d1408 38%, #7a3412 62%, #E07030 82%, #fff8f0 128%)",
      gradientB: "linear-gradient(135deg, rgba(224, 112, 48, 0.22), rgba(240, 144, 80, 0.14), rgba(253, 232, 192, 0.08))",
      glow: "rgba(224, 112, 48, 0.38)",
    },
  },
  void: {
    name: "Void",
    vibe: "Deep space, electric",
    personality: "High-contrast nebula glow for late-night planning.",
    tokens: {
      bg: "#050508",
      surface: "#12121f",
      surfaceStrong: "#1c1b2e",
      border: "#7c6dfa",
      accent1: "#7c6dfa",
      accent2: "#f472b6",
      accent3: "#38bdf8",
      text: "#f3f2ff",
      textSecondary: "#aaa8c4",
      textSoft: "#6d6b8e",
      gradientA: "radial-gradient(circle at 18% 12%, rgba(124, 109, 250, 0.3), transparent 30%), radial-gradient(circle at 86% 18%, rgba(244, 114, 182, 0.24), transparent 30%), linear-gradient(145deg, #03040b 0%, #08091a 45%, #050508 100%)",
      gradientB: "linear-gradient(135deg, rgba(124, 109, 250, 0.2), rgba(244, 114, 182, 0.12), rgba(255, 255, 255, 0.025))",
      glow: "rgba(124, 109, 250, 0.4)",
    },
  },
  retro: {
    name: "Retro",
    vibe: "80s synthwave, neon",
    personality: "Hot pink, cyan, and arcade yellow for high-energy focus.",
    tokens: {
      bg: "#0d0221",
      surface: "#1a0533",
      surfaceStrong: "#2a074f",
      border: "#ff2d78",
      accent1: "#ff2d78",
      accent2: "#00f5ff",
      accent3: "#ffe600",
      text: "#ffffff",
      textSecondary: "#cc99ff",
      textSoft: "#8f68c8",
      gradientA: "linear-gradient(135deg, #ff2d78 0%, #7b2fff 52%, #00f5ff 100%)",
      gradientB: "linear-gradient(90deg, rgba(0, 245, 255, 0.24), rgba(255, 45, 120, 0.22), rgba(255, 230, 0, 0.12))",
      glow: "rgba(255, 45, 120, 0.4)",
    },
  },
  floral: {
    name: "Floral",
    vibe: "Soft botanical, organic",
    personality: "Blush, sage, and cream for a softer planning environment.",
    tokens: {
      bg: "#1a1016",
      surface: "#231520",
      surfaceStrong: "#33212e",
      border: "#d4789a",
      accent1: "#f2a7c3",
      accent2: "#8fbc8f",
      accent3: "#e8d5c4",
      text: "#f5ede8",
      textSecondary: "#c4a0b0",
      textSoft: "#8f7482",
      gradientA: "radial-gradient(circle at 20% 12%, rgba(242, 167, 195, 0.3), transparent 32%), radial-gradient(circle at 88% 18%, rgba(143, 188, 143, 0.22), transparent 32%), linear-gradient(160deg, #1a1016 0%, #2a1824 58%, #15110f 100%)",
      gradientB: "linear-gradient(160deg, rgba(232, 213, 196, 0.18), rgba(212, 120, 154, 0.18), rgba(143, 188, 143, 0.1))",
      glow: "rgba(242, 167, 195, 0.35)",
    },
  },
  solar: {
    name: "Solar",
    vibe: "Warm golden hour",
    personality: "Amber, terracotta, and sand for a calm daylight push.",
    tokens: {
      bg: "#160d07",
      surface: "#26170d",
      surfaceStrong: "#3a2414",
      border: "#d97706",
      accent1: "#f59e0b",
      accent2: "#c65f33",
      accent3: "#f5d6a1",
      text: "#fff7ed",
      textSecondary: "#e7b98b",
      textSoft: "#a9825f",
      gradientA: "linear-gradient(90deg, #3a1808 0%, #b45309 52%, #f5d6a1 100%)",
      gradientB: "linear-gradient(180deg, rgba(245, 158, 11, 0.2), rgba(198, 95, 51, 0.16), rgba(255, 255, 255, 0.03))",
      glow: "rgba(245, 158, 11, 0.38)",
    },
  },
  arctic: {
    name: "Arctic",
    vibe: "Cold, clean, minimal",
    personality: "Ice blue, white, and steel for a quiet reset.",
    tokens: {
      bg: "#071016",
      surface: "#0e1b24",
      surfaceStrong: "#172b38",
      border: "#9bd8ff",
      accent1: "#9bd8ff",
      accent2: "#f8fbff",
      accent3: "#7891a5",
      text: "#f8fbff",
      textSecondary: "#b5cadb",
      textSoft: "#7a91a6",
      gradientA: "radial-gradient(circle at 28% 4%, rgba(248, 251, 255, 0.26), transparent 30%), radial-gradient(circle at 84% 18%, rgba(155, 216, 255, 0.24), transparent 34%), linear-gradient(145deg, #071016 0%, #102334 62%, #071016 100%)",
      gradientB: "linear-gradient(135deg, rgba(155, 216, 255, 0.18), rgba(248, 251, 255, 0.1), rgba(120, 145, 165, 0.12))",
      glow: "rgba(155, 216, 255, 0.34)",
    },
  },
  forest: {
    name: "Forest",
    vibe: "Earthy, grounded, calm",
    personality: "Moss, bark, and copper for low-noise planning.",
    tokens: {
      bg: "#07100a",
      surface: "#101b12",
      surfaceStrong: "#1c2b1d",
      border: "#8b6f47",
      accent1: "#84a98c",
      accent2: "#8b5e34",
      accent3: "#c47f45",
      text: "#edf7e8",
      textSecondary: "#abc5a7",
      textSoft: "#71866d",
      gradientA: "radial-gradient(circle at 12% 18%, rgba(132, 169, 140, 0.24), transparent 34%), radial-gradient(circle at 88% 12%, rgba(196, 127, 69, 0.18), transparent 32%), linear-gradient(145deg, #07100a 0%, #142516 55%, #090d08 100%)",
      gradientB: "linear-gradient(145deg, rgba(132, 169, 140, 0.16), rgba(139, 94, 52, 0.14), rgba(196, 127, 69, 0.1))",
      glow: "rgba(132, 169, 140, 0.34)",
    },
  },
  candy: {
    name: "Candy",
    vibe: "Playful, soft pastels",
    personality: "Lavender, peach, and mint for a friendlier first-run feel.",
    tokens: {
      bg: "#15101f",
      surface: "#221a30",
      surfaceStrong: "#302640",
      border: "#c4b5fd",
      accent1: "#c4b5fd",
      accent2: "#fecdd3",
      accent3: "#a7f3d0",
      text: "#fff7fb",
      textSecondary: "#decff2",
      textSoft: "#a895bd",
      gradientA: "radial-gradient(circle at 18% 10%, rgba(196, 181, 253, 0.32), transparent 32%), radial-gradient(circle at 84% 18%, rgba(254, 205, 211, 0.26), transparent 30%), radial-gradient(circle at 50% 88%, rgba(167, 243, 208, 0.18), transparent 32%), linear-gradient(145deg, #15101f 0%, #241733 100%)",
      gradientB: "linear-gradient(135deg, rgba(196, 181, 253, 0.18), rgba(254, 205, 211, 0.16), rgba(167, 243, 208, 0.12))",
      glow: "rgba(196, 181, 253, 0.34)",
    },
  },
  midnight: {
    name: "Midnight",
    vibe: "Dark luxury, deep navy",
    personality: "Navy, gold, and ivory for a premium command-room feel.",
    tokens: {
      bg: "#030816",
      surface: "#081225",
      surfaceStrong: "#101c33",
      border: "#c8a74a",
      accent1: "#d4af37",
      accent2: "#243b73",
      accent3: "#f8f1d8",
      text: "#f8f1d8",
      textSecondary: "#b8c0d9",
      textSoft: "#77829e",
      gradientA: "radial-gradient(circle at 18% 12%, rgba(212, 175, 55, 0.22), transparent 32%), radial-gradient(circle at 86% 18%, rgba(36, 59, 115, 0.34), transparent 34%), linear-gradient(145deg, #030816 0%, #071126 62%, #02040c 100%)",
      gradientB: "linear-gradient(145deg, rgba(212, 175, 55, 0.16), rgba(36, 59, 115, 0.22), rgba(248, 241, 216, 0.08))",
      glow: "rgba(212, 175, 55, 0.34)",
    },
  },
};

const HELP_COPY = {
  command: ["Plan", "Decide the next realistic block from school, work, money, sources, and recovery signals."],
  academy: ["School", "Add classes, assignments, exams, and syllabi manually or through school sources."],
  works: ["Work", "Track shifts, hours, conflicts, and paycheck impact without waiting for a connector."],
  life: ["Money", "Keep income, bills, and safe spending separate from the planner until they matter."],
  future: ["Path", "Turn goals, skills, and portfolio work into visible next steps."],
  mind: ["Recovery", "Use energy and focus as planning inputs, not another productivity score."],
  notebook: ["Sources", "Bring in files, notes, and manual context so Ember has real evidence to work from."],
};

const COURSE_STATUSES = ["planned", "active", "completed", "dropped", "archived"];
const DEFAULT_CURRENT_PERIOD_ID = "term-spring-2026";
const DEFAULT_ACADEMIC_PROFILE = {
  schoolType: "college",
  programType: "degree",
  programName: "Academic path",
  totalCreditsRequired: 120,
  targetGradDate: "",
};
const DEFAULT_ACADEMIC_PERIODS = [
  { id: "term-fall-2025", name: "Fall 2025", type: "semester", startDate: "2025-08-25", endDate: "2025-12-12", status: "past", schoolName: "Current school" },
  { id: DEFAULT_CURRENT_PERIOD_ID, name: "Spring 2026", type: "semester", startDate: "2026-01-12", endDate: "2026-05-08", status: "current", schoolName: "Current school" },
  { id: "term-summer-2026", name: "Summer 2026", type: "summer_session", startDate: "2026-06-01", endDate: "2026-08-07", status: "upcoming", schoolName: "Current school" },
  { id: "term-fall-2026", name: "Fall 2026", type: "semester", startDate: "2026-08-24", endDate: "2026-12-11", status: "upcoming", schoolName: "Current school" },
];
const REQUIREMENT_TEMPLATES = {
  college: {
    id: "requirements-college-starter",
    name: "College starter audit",
    profileType: "college",
    groups: [
      { id: "req-gen-ed", name: "General education", minCredits: 42, items: [{ title: "English composition", courseCode: "ENGL" }, { title: "History / government", courseCode: "HIST" }, { title: "Humanities elective", courseCode: "" }] },
      { id: "req-math-science", name: "Math and science", minCredits: 18, items: [{ title: "College math sequence", courseCode: "MATH" }, { title: "Lab science", courseCode: "PHYS" }, { title: "Chemistry or biology", courseCode: "CHEM" }] },
      { id: "req-major", name: "Major core", minCredits: 36, items: [{ title: "Major gateway course", courseCode: "" }, { title: "Upper-level major elective", courseCode: "" }] },
    ],
  },
  high_school: {
    id: "requirements-high-school-starter",
    name: "High school graduation starter",
    profileType: "high_school",
    groups: [
      { id: "req-hs-english", name: "English", minCredits: 4, items: [{ title: "English 9-12 sequence", courseCode: "ENGL" }] },
      { id: "req-hs-math", name: "Math", minCredits: 4, items: [{ title: "Algebra / geometry / advanced math", courseCode: "MATH" }] },
      { id: "req-hs-science", name: "Science", minCredits: 3, items: [{ title: "Biology / chemistry / physics", courseCode: "SCI" }] },
      { id: "req-hs-electives", name: "Electives and pathway", minCredits: 6, items: [{ title: "Fine arts / CTE / world language", courseCode: "" }] },
    ],
  },
};

const SECTION_IDENTITY = {
  command: {
    eyebrow: "Plan",
    title: "Keep school, work, and deadlines from colliding.",
    body: "Turn classes, shifts, deadlines, and energy into the next realistic block.",
    actions: [["Plan next block", "focus"], ["Switch mode", "modes"], ["Add time block", "manual:time_block"]],
    stats: ["Load", "Conflicts", "Planned", "Rules kept"],
  },
  academy: {
    eyebrow: "School",
    title: "Know what is due and what matters this week.",
    body: "Track assignments, exams, and reading by class without digging through five LMS tabs.",
    actions: [["Add class", "manual:course"], ["Upload syllabus", "upload"], ["Enter assignment", "manual:assignment"]],
    stats: ["Classes", "Due soon", "Study plan", "Exams"],
  },
  works: {
    eyebrow: "Shift Board",
    title: "See work hours, conflicts, and paycheck impact fast.",
    body: "Add shifts manually or import them later so work never surprises the school plan.",
    actions: [["Add shift", "manual:shift"], ["Import schedule", "connectors"], ["Add work task", "manual:work_task"]],
    stats: ["Shifts", "Work tasks", "Planned", "Pay"],
  },
  life: {
    eyebrow: "Money",
    title: "Know what is coming in, going out, and safe to spend.",
    body: "Add bills and income manually first. Connect finance later only if you want to.",
    actions: [["Add transaction", "manual:transaction"], ["Add bill", "manual:bill"], ["Add account", "manual:account"]],
    stats: ["Safe", "Recurring", "Income", "Goals"],
  },
  future: {
    eyebrow: "Path",
    title: "Turn long-range goals into the next concrete move.",
    body: "Track goals, portfolio work, applications, and skills as actions you can schedule.",
    actions: [["Add goal", "manual:goal"], ["Create note", "manual:future_note"], ["Upload proof", "upload"]],
    stats: ["Goals", "Milestones", "Skills", "Next step"],
  },
  mind: {
    eyebrow: "Recovery",
    title: "Let energy shape the plan before burnout stacks up.",
    body: "A quick check-in can soften the schedule without treating wellness like a grade.",
    actions: [["Start check-in", "mind_checkin"], ["Add rest block", "manual:rest_block"], ["Open plan", "command"]],
    stats: ["Energy", "Risk", "Rest", "Load"],
  },
  notebook: {
    eyebrow: "Sources",
    title: "Bring in the information Ember should trust.",
    body: "Upload files, write notes, or enter source details yourself when nothing connects cleanly.",
    actions: [["Upload file", "upload"], ["Write note", "manual:note"], ["Manual source", "manual:source"]],
    stats: ["Files", "Reviews", "Notes", "Evidence"],
  },
};

const CONNECTOR_TEMPLATES = [
  { provider: "canvas", providerType: "lms", displayName: "Canvas LMS", domain: "academy", description: "Courses, assignments, deadlines, and grade signals.", scopes: ["courses", "assignments", "grades"] },
  { provider: "blackboard", providerType: "lms", displayName: "Blackboard Learn", domain: "academy", description: "Institution-controlled course and deadline sync when available.", scopes: ["courses", "assignments", "grades"] },
  { provider: "d2l", providerType: "lms", displayName: "D2L Brightspace", domain: "academy", description: "Brightspace course, assignment, and grade context when enabled by the school.", scopes: ["courses", "assignments", "grades"] },
  { provider: "google_calendar", providerType: "calendar", displayName: "Google Calendar", domain: "command", description: "Fixed events, study windows, and calendar conflicts.", scopes: ["events.read", "events.write"] },
  { provider: "deputy", providerType: "workforce", displayName: "Deputy / shifts", domain: "works", description: "Shift changes and work-hour protection.", scopes: ["rosters", "timesheets"] },
  { provider: "plaid", providerType: "finance", displayName: "Plaid finance", domain: "life", description: "Balances, recurring bills, and budget pressure.", scopes: ["accounts", "transactions"] },
  { provider: "health_connect", providerType: "health", displayName: "Health signals", domain: "mind", description: "Sleep and recovery context for load softening.", scopes: ["sleep", "activity"] },
  { provider: "apex_webhook", providerType: "webhook", displayName: "Ember webhook", domain: "notebook", description: "Zapier/n8n/manual JSON events while OAuth connectors are built.", scopes: ["events", "tasks"] },
];

const FREE_UPLOAD_LIMIT = 5;
const DEFAULT_SUBSCRIPTION = {
  planType: "free",
  status: "active",
  trialEndsAt: null,
  currentPeriodEnd: null,
  upgradedAt: null,
};

const PAYWALL_TRIGGERS = {
  syllabus_upload: {
    eyebrow: "syllabus scan",
    title: "Your syllabus is ready to scan",
    body: "Unlock automatic deadline extraction with Pro.",
    primary: "Unlock Pro",
    secondary: "Enter Dates Manually",
    secondaryAction: "manual:assignment",
  },
  lms_connect: {
    eyebrow: "school sync",
    title: "Connect your classes in one step",
    body: "Sync assignments and due dates from Canvas, Blackboard, or D2L.",
    primary: "Upgrade to Connect",
    secondary: "Skip for Now",
  },
  conflict_fix: {
    eyebrow: "conflict fix",
    title: "You have schedule conflicts this week",
    body: "Let Pro rebalance your school and work hours.",
    primary: "Fix My Week",
    secondary: "Review Manually",
  },
  auto_plan: {
    eyebrow: "weekly plan",
    title: "Build this week automatically",
    body: "Turn all tasks, shifts, and deadlines into a usable plan.",
    primary: "Generate My Plan",
    secondary: "I'll Do It Myself",
  },
  unlimited_uploads: {
    eyebrow: "upload limit",
    title: "Keep every source in one place",
    body: "Free includes up to 5 uploads. Pro unlocks unlimited uploads and syllabus parsing.",
    primary: "Start Pro",
    secondary: "Enter Manually",
    secondaryAction: "manual:source",
  },
  notebook_advanced: {
    eyebrow: "notebook",
    title: "Organize every class source",
    body: "Pro unlocks unlimited files and richer source organization.",
    primary: "Start Pro",
    secondary: "Stay Free",
  },
};

const PLAN_CARDS = [
  {
    id: "free",
    title: "Free",
    price: "$0",
    meta: "For getting organized",
    bullets: ["Manual task entry", "Basic calendar", "Basic notebook", "Pomodoro timer", "Up to 5 uploads"],
    button: "Stay Free",
  },
  {
    id: "pro_monthly",
    title: "Pro",
    price: "$4.99/mo",
    meta: "$39/year available",
    badge: "Most Popular",
    bullets: ["Everything in Free", "Syllabus parsing", "LMS sync", "Smart scheduling", "Conflict detection", "Unlimited tasks and uploads", "Priority scoring"],
    button: "Start Pro",
  },
  {
    id: "pro_plus",
    title: "Pro+",
    price: "$9.99/mo",
    meta: "For heavy workloads",
    bullets: ["Everything in Pro", "AI weekly planning", "Grade tracking", "Work + school load insights", "Burnout risk flags", "Multi-calendar sync", "Advanced analytics"],
    button: "Start Pro+",
  },
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

const DOMAIN_ATMOSPHERES = {
  command: {
    label: "Dawn board",
    title: "Start with the next honest move.",
    body: "A warm read on school, work, money, and energy before the day gets loud.",
    temperature: "dawn",
  },
  academy: {
    label: "Forest study",
    title: "School has its own terrain.",
    body: "Classes, syllabi, exams, and assignment risk stay grouped so they do not blur into everything else.",
    temperature: "forest",
  },
  works: {
    label: "Shift light",
    title: "Work hours stay visible.",
    body: "Shifts, pay impact, and collisions get their own board before they damage the week.",
    temperature: "copper",
  },
  life: {
    label: "Money weather",
    title: "Know what is safe before you spend.",
    body: "Bills, income, subscriptions, and weekly targets stay separate from the school planner.",
    temperature: "gold",
  },
  future: {
    label: "Long road",
    title: "Turn goals into steps.",
    body: "Career and semester direction stay quieter until there is a real next action.",
    temperature: "sky",
  },
  mind: {
    label: "Dusk recovery",
    title: "Recovery changes the plan.",
    body: "Check-ins and rest blocks shape the schedule without making the app feel clinical.",
    temperature: "violet",
  },
  notebook: {
    label: "Source desk",
    title: "Keep evidence separate until you approve it.",
    body: "Uploads, notes, and syllabus extractions stay inspectable before they touch your calendar.",
    temperature: "paper",
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
  themeFamily: "dawn",
  gradientProfile: "dawn-to-dusk",
  layoutProfile: "guided",
  surfaceOpacity: 72,
  cardBlur: 24,
  borderStyle: "soft",
  animations: "on",
  compactMode: "off",
  accentOverride: "off",
  brandRevision: "dawn-v1",
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
    ["command", "Plan"],
    ["academy", "School"],
    ["works", "Work"],
    ["life", "Money"],
    ["future", "Path"],
    ["mind", "Recovery"],
  ],
  themeFamily: Object.entries(EMBER_THEMES).map(([value, theme]) => [value, theme.name]),
  gradientProfile: [
    ["dawn-to-dusk", "Dawn to Dusk"],
    ["study-neon", "Study Neon"],
    ["campus-sunrise", "Campus Sunrise"],
    ["library-blue", "Library Blue"],
    ["focus-lime", "Focus Lime"],
    ["exam-ember", "Exam Ember"],
  ],
  layoutProfile: [
    ["guided", "Guided"],
    ["operator", "Operator"],
    ["focus", "Focus"],
  ],
  borderStyle: [
    ["sharp", "Sharp"],
    ["soft", "Soft"],
    ["glow", "Glow"],
  ],
  animations: [
    ["on", "On"],
    ["off", "Off"],
  ],
  compactMode: [
    ["off", "Off"],
    ["on", "On"],
  ],
  accentOverride: [
    ["off", "Off"],
    ["on", "On"],
  ],
};

const GRADIENT_PRESETS = {
  "dawn-to-dusk": {
    css: "radial-gradient(circle at 50% 16%, rgba(253, 232, 192, 0.28), transparent 18%), radial-gradient(circle at 52% 28%, rgba(224, 112, 48, 0.34), transparent 30%), linear-gradient(180deg, #0d0705 0%, #2d1408 38%, #7a3412 62%, #E07030 82%, #fff8f0 128%)",
    soft: "linear-gradient(135deg, rgba(224, 112, 48, 0.22), rgba(240, 144, 80, 0.14), rgba(253, 232, 192, 0.08))",
  },
  "study-neon": {
    css: "radial-gradient(circle at 18% 12%, rgba(56, 189, 248, 0.28), transparent 30%), radial-gradient(circle at 86% 18%, rgba(124, 109, 250, 0.28), transparent 30%), linear-gradient(145deg, #03040b 0%, #08091a 45%, #050508 100%)",
    soft: "linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(124, 109, 250, 0.12), rgba(255, 255, 255, 0.025))",
  },
  "campus-sunrise": {
    css: "radial-gradient(circle at 14% 12%, rgba(251, 146, 60, 0.28), transparent 30%), radial-gradient(circle at 92% 18%, rgba(244, 114, 182, 0.22), transparent 30%), linear-gradient(145deg, #090507 0%, #140a12 42%, #06050a 100%)",
    soft: "linear-gradient(135deg, rgba(251, 146, 60, 0.18), rgba(244, 114, 182, 0.12), rgba(255, 255, 255, 0.025))",
  },
  "library-blue": {
    css: "radial-gradient(circle at 16% 12%, rgba(96, 165, 250, 0.26), transparent 30%), radial-gradient(circle at 90% 20%, rgba(52, 211, 153, 0.18), transparent 30%), linear-gradient(145deg, #030712 0%, #07111f 46%, #04060a 100%)",
    soft: "linear-gradient(135deg, rgba(96, 165, 250, 0.18), rgba(52, 211, 153, 0.11), rgba(255, 255, 255, 0.025))",
  },
  "focus-lime": {
    css: "radial-gradient(circle at 18% 12%, rgba(74, 222, 128, 0.22), transparent 30%), radial-gradient(circle at 86% 18%, rgba(251, 191, 36, 0.16), transparent 30%), linear-gradient(145deg, #040807 0%, #07150d 48%, #040505 100%)",
    soft: "linear-gradient(135deg, rgba(74, 222, 128, 0.16), rgba(251, 191, 36, 0.1), rgba(255, 255, 255, 0.025))",
  },
  "exam-ember": {
    css: "radial-gradient(circle at 18% 12%, rgba(248, 113, 113, 0.24), transparent 30%), radial-gradient(circle at 86% 18%, rgba(251, 191, 36, 0.2), transparent 30%), linear-gradient(145deg, #0a0506 0%, #160b08 48%, #050404 100%)",
    soft: "linear-gradient(135deg, rgba(248, 113, 113, 0.18), rgba(251, 191, 36, 0.1), rgba(255, 255, 255, 0.025))",
  },
};

const DEFAULT_COMMAND_WIDGETS = [
  { id: "ember", type: "assistant", title: "Ember Home Base", visible: true, pinned: true, order: 5, size: "wide", profile: "all" },
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
  { id: "activity", type: "system", title: "Activity Log", visible: true, pinned: false, order: 145, size: "half", profile: "operator" },
  { id: "schedule", type: "scheduler", title: "Optimized Schedule", visible: true, pinned: true, order: 150, size: "full", profile: "all" },
];

const COMMAND_WIDGET_PROFILE_PRESETS = {
  guided: {
    label: "Guided",
    description: "Setup, personalization, priorities, conflicts, source connections, and the schedule stay visible for first-time users.",
    visible: ["ember", "setup", "personalization", "briefing", "capacity", "conflicts", "recommendations", "sources", "connectors", "activity", "schedule"],
    pinned: ["ember", "setup", "briefing", "capacity", "conflicts", "schedule"],
  },
  operator: {
    label: "Operator",
    description: "Daily operating panels stay visible: solver health, conflicts, week view, constraints, sources, connectors, and schedule.",
    visible: ["ember", "briefing", "solver", "capacity", "conflicts", "week", "why", "constraints", "sources", "connectors", "activity", "schedule"],
    pinned: ["ember", "briefing", "solver", "capacity", "conflicts", "schedule"],
  },
  focus: {
    label: "Focus",
    description: "Only the panels needed to understand load, risk, decisions, modes, and the next schedule stay prominent.",
    visible: ["ember", "briefing", "capacity", "conflicts", "why", "modes", "schedule"],
    pinned: ["ember", "capacity", "briefing", "conflicts", "schedule"],
  },
};

function defaultSnapshot() {
  return {
    activeDomain: "command",
    sidebarCollapsed: false,
    tasks: clone(INITIAL_TASKS),
    courses: clone(COURSES),
    academicProfile: clone(DEFAULT_ACADEMIC_PROFILE),
    academicPeriods: clone(DEFAULT_ACADEMIC_PERIODS),
    academicRequirements: [],
    activeAcademicPeriodId: DEFAULT_CURRENT_PERIOD_ID,
    schedule: clone(SCHEDULE),
    bills: clone(BILLS),
    budget: clone(DEFAULT_BUDGET),
    paychecks: clone(DEFAULT_PAYCHECKS),
    finance: { accounts: [], transactions: [], subscriptions: [], savingsGoals: [] },
    subscription: clone(DEFAULT_SUBSCRIPTION),
    featureUsage: {},
    constraints: clone(DEFAULT_CONSTRAINTS),
    scheduleMode: "balanced",
    sourceConfig: {
      ...clone(DEFAULT_SOURCE_CONFIG),
      remoteUrl: win && win.location.protocol.startsWith("http") ? "/api/source/live" : DEFAULT_SOURCE_CONFIG.remoteUrl,
    },
    subTabs: { academy: "grades", works: "shifts" },
    activeCourseId: null,
    toast: null,
    workspace: { id: null, name: "Local workspace", phase2Enabled: false, error: "" },
    notifications: [],
    notificationPanelOpen: false,
    notificationStatus: "local",
    ember: { states: [], messages: [], notificationEvents: [], lastSnapshotKey: "" },
    emberInteraction: { prompt: "", response: "" },
    activityLog: [],
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
    checkin: { energy: 0, focus: 0, mood: 0, note: "", submitted: false },
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
    academicProfile: clone(DEFAULT_ACADEMIC_PROFILE),
    academicPeriods: clone(DEFAULT_ACADEMIC_PERIODS),
    academicRequirements: [],
    activeAcademicPeriodId: DEFAULT_CURRENT_PERIOD_ID,
    schedule: [],
    bills: [],
    budget: { income: 0, spent: 0, saved: 0, left: 0 },
    paychecks: [],
    finance: { accounts: [], transactions: [], subscriptions: [], savingsGoals: [] },
    subscription: clone(DEFAULT_SUBSCRIPTION),
    featureUsage: {},
    noteSearch: "",
    activeNoteId: null,
    notes: [],
    brainDump: "",
    processedDump: null,
    checkin: { energy: 0, focus: 0, mood: 0, note: "", submitted: false },
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
    return sanitizeLoadedStateSnapshot({
      ...defaults,
      activeDomain: saved.activeDomain || defaults.activeDomain,
      sidebarCollapsed: Boolean(saved.sidebarCollapsed),
      tasks: Array.isArray(saved.tasks) ? saved.tasks : defaults.tasks,
      courses: Array.isArray(saved.courses) ? saved.courses : defaults.courses,
      academicProfile: { ...DEFAULT_ACADEMIC_PROFILE, ...(saved.academicProfile || {}) },
      academicPeriods: Array.isArray(saved.academicPeriods) ? saved.academicPeriods : defaults.academicPeriods,
      academicRequirements: Array.isArray(saved.academicRequirements) ? saved.academicRequirements : defaults.academicRequirements,
      activeAcademicPeriodId: saved.activeAcademicPeriodId || defaults.activeAcademicPeriodId,
      schedule: Array.isArray(saved.schedule) ? saved.schedule : defaults.schedule,
      bills: Array.isArray(saved.bills) ? saved.bills : defaults.bills,
      budget: { ...defaults.budget, ...(saved.budget || {}) },
      paychecks: Array.isArray(saved.paychecks) ? saved.paychecks : defaults.paychecks,
      finance: {
        accounts: Array.isArray(saved.finance?.accounts) ? saved.finance.accounts : [],
        transactions: Array.isArray(saved.finance?.transactions) ? saved.finance.transactions : [],
        subscriptions: Array.isArray(saved.finance?.subscriptions) ? saved.finance.subscriptions : [],
        savingsGoals: Array.isArray(saved.finance?.savingsGoals) ? saved.finance.savingsGoals : [],
      },
      subscription: normalizeSubscription(saved.subscription),
      featureUsage: typeof saved.featureUsage === "object" && saved.featureUsage ? saved.featureUsage : {},
      constraints: normalizeConstraints(saved.constraints),
      scheduleMode: SCHEDULE_MODES[saved.scheduleMode] ? saved.scheduleMode : defaults.scheduleMode,
      sourceConfig: { ...defaults.sourceConfig, ...(saved.sourceConfig || {}) },
      subTabs: { ...defaults.subTabs, ...(saved.subTabs || {}) },
      activeCourseId: saved.activeCourseId ?? null,
      workspace: { ...defaults.workspace, ...(saved.workspace || {}) },
      notifications: Array.isArray(saved.notifications) ? saved.notifications : defaults.notifications,
      notificationPanelOpen: Boolean(saved.notificationPanelOpen),
      notificationStatus: saved.notificationStatus || defaults.notificationStatus,
      ember: {
        states: Array.isArray(saved.ember?.states) ? saved.ember.states : [],
        messages: Array.isArray(saved.ember?.messages) ? saved.ember.messages : [],
        notificationEvents: Array.isArray(saved.ember?.notificationEvents) ? saved.ember.notificationEvents : [],
        lastSnapshotKey: saved.ember?.lastSnapshotKey || "",
      },
      emberInteraction: {
        prompt: safeSavedText(saved.emberInteraction?.prompt || "", 180),
        response: safeSavedText(saved.emberInteraction?.response || "", 520),
      },
      activityLog: Array.isArray(saved.activityLog) ? saved.activityLog : defaults.activityLog,
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
    });
  } catch {
    return defaults;
  }
}

function sanitizeSavedUpload(file = {}) {
  return {
    ...file,
    name: safeSavedText(file.name, 120),
    type: safeSavedText(file.type, 64),
    uploadStatus: safeSavedText(file.uploadStatus, 40),
    textStatus: safeSavedText(file.textStatus, 40),
    extractionMethod: safeSavedText(file.extractionMethod, 40),
    textPreview: safePreviewText(file.textPreview),
  };
}

function sanitizeExtractedItem(item = {}) {
  return {
    ...item,
    itemType: safeSavedText(item.itemType || item.type, 24),
    type: safeSavedText(item.type || item.itemType, 24),
    title: safeSavedText(item.title || item.rawTitle || item.name, 140),
    rawTitle: safeSavedText(item.rawTitle || item.title || item.name, 140),
    name: safeSavedText(item.name || item.title || item.rawTitle, 140),
    dateText: safeSavedText(item.dateText || item.due || item.dueAt || item.date, 48),
  };
}

function sanitizeSyllabusReview(review = {}) {
  const summary = review.parsedSummary && typeof review.parsedSummary === "object" ? review.parsedSummary : {};
  const items = Array.isArray(summary.extractedItems) ? summary.extractedItems.slice(0, 80).map(sanitizeExtractedItem) : [];
  return {
    ...review,
    title: safeSavedText(review.title, 140),
    parsedSummary: {
      ...summary,
      courseName: safeSavedText(summary.courseName, 100),
      courseCode: safeSavedText(summary.courseCode, 40),
      parser: safeSavedText(summary.parser, 50),
      extractionMethod: safeSavedText(summary.extractionMethod, 50),
      textStatus: safeSavedText(summary.textStatus, 50),
      warning: safeSavedText(summary.warning, 260),
      extractedItems: items,
    },
  };
}

function sanitizeNote(note = {}) {
  return {
    ...note,
    title: safeSavedText(note.title, 140),
    summary: safeSavedText(note.summary, 420),
    body: safeFreeformText(note.body, HTMLISH_PATTERN.test(String(note.body || "")) ? 1200 : MAX_NOTE_TEXT),
    tags: Array.isArray(note.tags) ? note.tags.map((tag) => safeSavedText(tag, 36)).slice(0, 16) : [],
  };
}

function sanitizeLoadedStateSnapshot(snapshot) {
  const academicPeriods = normalizeAcademicPeriods(snapshot.academicPeriods);
  return {
    ...snapshot,
    academicProfile: { ...DEFAULT_ACADEMIC_PROFILE, ...(snapshot.academicProfile || {}) },
    academicPeriods,
    academicRequirements: Array.isArray(snapshot.academicRequirements) ? snapshot.academicRequirements.map(normalizeRequirementSet) : [],
    activeAcademicPeriodId: academicPeriods.some((period) => String(period.id) === String(snapshot.activeAcademicPeriodId))
      ? snapshot.activeAcademicPeriodId
      : academicPeriods.find((period) => period.status === "current")?.id || academicPeriods[0]?.id || DEFAULT_CURRENT_PERIOD_ID,
    courses: normalizeCourses(snapshot.courses, academicPeriods),
    notes: Array.isArray(snapshot.notes) ? snapshot.notes.map(sanitizeNote) : [],
    uploadedFiles: Array.isArray(snapshot.uploadedFiles) ? snapshot.uploadedFiles.map(sanitizeSavedUpload) : [],
    syllabusReviews: Array.isArray(snapshot.syllabusReviews) ? snapshot.syllabusReviews.map(sanitizeSyllabusReview) : [],
    brainDump: safeFreeformText(snapshot.brainDump, 2000),
  };
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
  appearancePanelOpen: false,
  themeBuilderOpen: false,
  customThemes: [],
  themeDraft: null,
  uploadSheetOpen: false,
  manualEntry: { open: false, type: "", error: "" },
  paywall: { open: false, trigger: "", sourceAction: null },
};
state.customThemes = loadCustomThemes();
state.themeDraft = defaultThemeDraft();

const app = doc?.querySelector("#app") || null;
const colorFor = (domain) => TOKENS[domain] || TOKENS.command;
const activeDomain = () => DOMAINS.find((domain) => domain.id === state.activeDomain);
const localId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizedKey = (...parts) => parts.map((part) => String(part || "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");
const nextNumericTaskId = () => Math.max(0, ...state.tasks.map((task) => Number(task.id) || 0)) + 1;
const unreadNotifications = () => state.notifications.filter((item) => !item.read_at && !item.dismissed_at && !item.resolved_at);

function normalizeAcademicPeriod(period = {}, index = 0) {
  const allowedTypes = ["semester", "quarter", "summer_session", "school_year", "custom"];
  const allowedStatuses = ["past", "current", "upcoming"];
  return {
    id: period.id || period.academic_period_id || `term-${index + 1}`,
    name: safeSavedText(period.name || `Term ${index + 1}`, 80),
    type: allowedTypes.includes(period.type) ? period.type : "semester",
    startDate: period.startDate || period.start_date || "",
    endDate: period.endDate || period.end_date || "",
    status: allowedStatuses.includes(period.status) ? period.status : index === 0 ? "current" : "upcoming",
    schoolName: safeSavedText(period.schoolName || period.school_name || "Current school", 120),
  };
}

function normalizeAcademicPeriods(periods) {
  const input = Array.isArray(periods) && periods.length ? periods : DEFAULT_ACADEMIC_PERIODS;
  const normalized = input.map(normalizeAcademicPeriod);
  return normalized.some((period) => period.status === "current")
    ? normalized
    : normalized.map((period, index) => index === 0 ? { ...period, status: "current" } : period);
}

function currentAcademicPeriodId(periods = state?.academicPeriods || DEFAULT_ACADEMIC_PERIODS) {
  const normalized = normalizeAcademicPeriods(periods);
  return normalized.find((period) => period.status === "current")?.id || normalized[0]?.id || DEFAULT_CURRENT_PERIOD_ID;
}

function normalizeCourseRecord(course = {}, periods = state?.academicPeriods || DEFAULT_ACADEMIC_PERIODS) {
  const periodId = course.academicPeriodId || course.academic_period_id || currentAcademicPeriodId(periods);
  const status = COURSE_STATUSES.includes(course.status) ? course.status : "active";
  const fallbackId = String(course.code || course.course_code || course.name || course.title || "manual-course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "manual-course";
  return {
    ...course,
    id: course.id ?? `course-${fallbackId}-${periodId}`,
    name: safeSavedText(course.name || course.title || "Untitled class", 120),
    code: safeSavedText(course.code || course.course_code || "Manual", 40),
    academicPeriodId: periodId,
    credits: Number(course.credits || course.creditHours || course.credit_hours || 3) || 0,
    status,
    archivedAt: course.archivedAt || course.archived_at || (status === "archived" ? new Date().toISOString() : null),
    difficultyEstimate: course.difficultyEstimate || course.difficulty_estimate || "medium",
  };
}

function normalizeCourses(courses = state?.courses || [], periods = state?.academicPeriods || DEFAULT_ACADEMIC_PERIODS) {
  return Array.isArray(courses) ? courses.map((course) => normalizeCourseRecord(course, periods)) : [];
}

function normalizeRequirementSet(set = {}) {
  const fallbackId = String(set.name || set.profileType || set.profile_type || "requirement-plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "requirement-plan";
  return {
    id: set.id || `requirements-${fallbackId}`,
    name: safeSavedText(set.name || "Requirement plan", 120),
    profileType: set.profileType || set.profile_type || "college",
    groups: Array.isArray(set.groups) ? set.groups.map((group, groupIndex) => ({
      id: group.id || `group-${groupIndex + 1}`,
      name: safeSavedText(group.name || `Group ${groupIndex + 1}`, 120),
      minCredits: Number(group.minCredits || group.min_credits || 0) || 0,
      items: Array.isArray(group.items) ? group.items.map((item, itemIndex) => ({
        id: item.id || `item-${groupIndex + 1}-${itemIndex + 1}`,
        title: safeSavedText(item.title || "Requirement", 120),
        courseCode: safeSavedText(item.courseCode || item.course_code || "", 40),
        overrideStatus: ["satisfied", "waived", "transfer"].includes(item.overrideStatus || item.override_status) ? (item.overrideStatus || item.override_status) : "",
      })) : [],
    })) : [],
  };
}

function visibleCourses({ includeArchived = false, periodId = state?.activeAcademicPeriodId } = {}) {
  const archivedStatuses = new Set(["archived", "dropped", "completed"]);
  return normalizeCourses(state.courses).filter((course) => {
    const inPeriod = !periodId || String(course.academicPeriodId) === String(periodId);
    if (!includeArchived) return inPeriod && !archivedStatuses.has(course.status);
    return archivedStatuses.has(course.status);
  });
}

function scrollAppToTop() {
  requestAnimationFrame(() => {
    doc?.querySelector(".app-shell")?.scrollTo?.({ top: 0, behavior: "auto" });
    doc?.querySelector(".main")?.scrollTo?.({ top: 0, behavior: "auto" });
    win?.scrollTo?.({ top: 0, behavior: "auto" });
  });
}

function setActiveDomain(domainId, { preserveScroll = false } = {}) {
  if (!DOMAINS.some((domain) => domain.id === domainId)) return;
  const changed = state.activeDomain !== domainId;
  state.activeDomain = domainId;
  if (changed && !preserveScroll) scrollAppToTop();
}

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
const tabButton = (group, value, active, accent, label = value) => `<button class="domain-tab ${active === value ? "is-active" : ""}" data-tab-group="${escapeHtml(group)}" data-tab-value="${escapeHtml(value)}" style="--accent:${accent};">${escapeHtml(label)}</button>`;
const iconSvg = (id, label = "") =>
  `<svg class="ui-icon" viewBox="0 0 20 20" aria-hidden="${label ? "false" : "true"}" ${label ? `aria-label="${escapeHtml(label)}"` : ""}><path d="${DOMAIN_ICONS[id] || DOMAIN_ICONS.command}"></path></svg>`;
const emberLogoMark = (label = "Ember") =>
  `<svg class="ember-logo-mark" viewBox="0 0 36 36" role="img" aria-label="${escapeHtml(label)}"><path class="ember-logo-mark__outline" d="M18 3c4.9 4.1 9.1 9.1 9.8 15.2.8 7.1-3.7 13-9.8 14.8-6.1-1.8-10.6-7.7-9.8-14.8C8.9 12.1 13.1 7.1 18 3Z"></path><path class="ember-logo-mark__middle" d="M18 11.2c3.4 3 6 6.4 6 10.8 0 4.6-2.7 7.8-6 9-3.3-1.2-6-4.4-6-9 0-4.4 2.6-7.8 6-10.8Z"></path><path class="ember-logo-mark__core" d="M18 18.7c1.8 1.8 2.9 3.6 2.9 5.4 0 2.2-1.2 3.7-2.9 4.4-1.7-.7-2.9-2.2-2.9-4.4 0-1.8 1.1-3.6 2.9-5.4Z"></path></svg>`;
const sparkBars = (values, accent) => {
  const max = Math.max(...values, 1);
  return `<div class="spark-bars">${values.map((value, index) => `<span style="height:${Math.max(14, (value / max) * 100)}%; --accent:${accent}; --index:${index + 1};"></span>`).join("")}</div>`;
};

function gauge(value, accent, label, subtitle = "", displayValue = `${value}%`) {
  return `<div class="gauge"><div class="gauge-ring" style="--value:${value}; --accent:${accent};"><strong>${displayValue}</strong></div><div class="gauge-copy"><span>${label}</span>${subtitle ? `<small class="muted">${subtitle}</small>` : ""}</div></div>`;
}

function emptyState({ domain = "command", title, body, primaryLabel = "Open setup", primaryDomain = "command", secondaryLabel = "", secondaryDomain = "notebook", tertiaryLabel = "", tertiaryDomain = "command", compact = false } = {}) {
  const actionButton = (label, destination, className) => {
    if (!label) return "";
    if (String(destination).startsWith("manual:")) return `<button class="${className}" data-manual-entry="${escapeHtml(String(destination).replace("manual:", ""))}">${escapeHtml(label)}</button>`;
    return destination === "upload"
      ? `<button class="${className}" data-upload-sheet-open>${escapeHtml(label)}</button>`
      : `<button class="${className}" data-domain="${escapeHtml(destination)}">${escapeHtml(label)}</button>`;
  };
  return `<div class="empty-state ${compact ? "empty-state--compact" : ""}" style="--accent:${colorFor(domain)};"><div class="empty-state__icon">${iconSvg(domain, title || "Empty state")}</div><h3 class="empty-title">${escapeHtml(title || "Nothing here yet.")}</h3><p>${escapeHtml(body || "Add a source or complete setup to unlock this area.")}</p>${primaryLabel || secondaryLabel || tertiaryLabel ? `<div class="empty-state__actions">${actionButton(primaryLabel, primaryDomain, "primary-action")}${actionButton(secondaryLabel, secondaryDomain, "surface-action")}${actionButton(tertiaryLabel, tertiaryDomain, "surface-action")}</div>` : ""}</div>`;
}

function stateNotice(kind, title, body, domain = "command") {
  return `<div class="state-notice state-notice--${kind}" style="--accent:${colorFor(domain)};"><div class="row-badge">${iconSvg(domain, title)}</div><div><strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div></div></div>`;
}

function normalizeSubscription(subscription = {}) {
  const allowed = ["free", "pro_monthly", "pro_yearly", "pro_plus", "semester_pass"];
  const statuses = ["active", "canceled", "trialing", "expired"];
  return {
    ...DEFAULT_SUBSCRIPTION,
    ...subscription,
    planType: allowed.includes(subscription.planType || subscription.plan_type) ? subscription.planType || subscription.plan_type : "free",
    status: statuses.includes(subscription.status) ? subscription.status : "active",
    trialEndsAt: subscription.trialEndsAt || subscription.trial_ends_at || null,
    currentPeriodEnd: subscription.currentPeriodEnd || subscription.current_period_end || null,
  };
}

function subscriptionTier() {
  const subscription = normalizeSubscription(state.subscription);
  if (subscription.status === "expired" || subscription.status === "canceled") return "free";
  if (subscription.planType === "pro_plus") return "pro_plus";
  if (["pro_monthly", "pro_yearly", "semester_pass"].includes(subscription.planType)) return "pro";
  return "free";
}

function hasAccess(required = "pro") {
  const tier = subscriptionTier();
  if (required === "free") return true;
  if (required === "pro") return tier === "pro" || tier === "pro_plus";
  if (required === "pro_plus") return tier === "pro_plus";
  return false;
}

function featureUsageCount(featureKey) {
  return Number(state.featureUsage?.[featureKey]?.usageCount || 0);
}

function recordFeatureUsage(featureKey) {
  state.featureUsage = {
    ...(state.featureUsage || {}),
    [featureKey]: {
      featureKey,
      usageCount: featureUsageCount(featureKey) + 1,
      lastUsedAt: new Date().toISOString(),
    },
  };
  saveState();
  scheduleCloudSave();
}

function likelySyllabusFile(file) {
  return /syllabus|course[-_\s]?outline|class[-_\s]?schedule/i.test(`${file?.name || ""} ${file?.type || ""}`);
}

function openPaywall(trigger = "auto_plan", sourceAction = null) {
  state.paywall = { open: true, trigger, sourceAction };
  recordFeatureUsage(trigger);
  renderPaywallSheet();
}

function closePaywall() {
  state.paywall = { open: false, trigger: "", sourceAction: null };
  renderPaywallSheet();
}

function selectPlan(planType) {
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const semesterEnds = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
  const yearlyEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const monthlyEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  state.subscription = normalizeSubscription({
    planType,
    status: planType === "free" ? "active" : planType === "semester_pass" ? "active" : "trialing",
    trialEndsAt: planType === "free" || planType === "semester_pass" ? null : trialEnds.toISOString(),
    currentPeriodEnd: planType === "free" ? null : planType === "semester_pass" ? semesterEnds.toISOString() : planType === "pro_yearly" ? yearlyEnd.toISOString() : monthlyEnd.toISOString(),
    upgradedAt: now.toISOString(),
  });
  closePaywall();
  saveState();
  scheduleCloudSave();
  renderApp();
  void notifyUser({
    type: "subscription_update",
    title: planType === "free" ? "Staying Free" : planType === "semester_pass" ? "Semester Pass enabled" : `${planType === "pro_plus" ? "Pro+" : "Pro"} trial enabled`,
    body: planType === "free" ? "Manual entry, basic notebook, calendar, Pomodoro, and limited uploads stay available." : "Automation is unlocked for this local beta flow. Connect Stripe before charging real users.",
    severity: planType === "free" ? "info" : "success",
  });
}

function listOrEmpty(rows, emptyConfig) {
  return rows || emptyState({ compact: true, ...emptyConfig });
}

function normalizePreferences(preferences = {}) {
  const isValid = (key, value) => PREFERENCE_OPTIONS[key]?.some(([option]) => option === value);
  const clampNumber = (value, fallback, min, max) => Math.max(min, Math.min(max, Number(value ?? fallback) || fallback));
  const themeFamily = isValid("themeFamily", preferences.themeFamily) || preferences.themeFamily?.startsWith("custom:") ? preferences.themeFamily : DEFAULT_PREFERENCES.themeFamily;
  const gradientProfile = isValid("gradientProfile", preferences.gradientProfile) ? preferences.gradientProfile : DEFAULT_PREFERENCES.gradientProfile;
  const shouldMigrateDawn = !preferences.brandRevision && themeFamily === "void" && gradientProfile === "study-neon";
  return {
    theme: isValid("theme", preferences.theme) ? preferences.theme : DEFAULT_PREFERENCES.theme,
    density: isValid("density", preferences.density) ? preferences.density : DEFAULT_PREFERENCES.density,
    fontScale: isValid("fontScale", preferences.fontScale) ? preferences.fontScale : DEFAULT_PREFERENCES.fontScale,
    accentProfile: isValid("accentProfile", preferences.accentProfile) ? preferences.accentProfile : DEFAULT_PREFERENCES.accentProfile,
    themeFamily: shouldMigrateDawn ? "dawn" : themeFamily,
    gradientProfile: shouldMigrateDawn ? "dawn-to-dusk" : gradientProfile,
    layoutProfile: isValid("layoutProfile", preferences.layoutProfile) ? preferences.layoutProfile : DEFAULT_PREFERENCES.layoutProfile,
    surfaceOpacity: clampNumber(preferences.surfaceOpacity, DEFAULT_PREFERENCES.surfaceOpacity, 18, 96),
    cardBlur: clampNumber(preferences.cardBlur, DEFAULT_PREFERENCES.cardBlur, 0, 42),
    borderStyle: isValid("borderStyle", preferences.borderStyle) ? preferences.borderStyle : DEFAULT_PREFERENCES.borderStyle,
    animations: isValid("animations", preferences.animations) ? preferences.animations : DEFAULT_PREFERENCES.animations,
    compactMode: isValid("compactMode", preferences.compactMode) ? preferences.compactMode : DEFAULT_PREFERENCES.compactMode,
    accentOverride: isValid("accentOverride", preferences.accentOverride) ? preferences.accentOverride : DEFAULT_PREFERENCES.accentOverride,
    brandRevision: preferences.brandRevision || DEFAULT_PREFERENCES.brandRevision,
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

function selectedGradient(profile = state.preferences?.gradientProfile || DEFAULT_PREFERENCES.gradientProfile) {
  return GRADIENT_PRESETS[profile] || GRADIENT_PRESETS[DEFAULT_PREFERENCES.gradientProfile];
}

function activeBackdrop(theme = currentThemeDefinition(), preferences = state.preferences) {
  const prefs = normalizePreferences(preferences);
  const tokens = theme.tokens || EMBER_THEMES.dawn.tokens;
  const preset = selectedGradient(prefs.gradientProfile);
  const usesDefaultGradient = prefs.gradientProfile === DEFAULT_PREFERENCES.gradientProfile;
  return {
    css: usesDefaultGradient ? tokens.gradientA : preset.css,
    soft: usesDefaultGradient ? tokens.gradientB : preset.soft,
  };
}

function loadCustomThemes() {
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOM_THEMES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((theme) => theme?.id && theme?.tokens).slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveCustomThemes() {
  storage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(state.customThemes || []));
}

function defaultThemeDraft(base = EMBER_THEMES.dawn) {
  const tokens = base.tokens || EMBER_THEMES.dawn.tokens;
  return {
    name: "My Ember Theme",
    background: tokens.bg,
    surface: tokens.surface,
    border: tokens.border,
    primary: tokens.accent1,
    secondary: tokens.accent2,
    highlight: tokens.accent3,
    text: tokens.text,
    textSecondary: tokens.textSecondary,
    gradientStyle: "linear",
    gradientAngle: 135,
    gradientColorA: tokens.accent1,
    gradientColorB: tokens.accent2,
  };
}

function themeFromDraft(draft = state.themeDraft) {
  const style = draft.gradientStyle || "linear";
  const angle = Number(draft.gradientAngle || 135);
  const gradientA = style === "radial"
    ? `radial-gradient(circle at 20% 14%, ${draft.gradientColorA}, transparent 34%), radial-gradient(circle at 86% 18%, ${draft.gradientColorB}, transparent 34%), linear-gradient(145deg, ${draft.background}, ${draft.surface})`
    : style === "conic"
      ? `conic-gradient(from ${angle}deg at 50% 28%, ${draft.gradientColorA}, ${draft.gradientColorB}, ${draft.background}, ${draft.gradientColorA})`
      : `linear-gradient(${angle}deg, ${draft.background} 0%, ${draft.gradientColorA} 48%, ${draft.gradientColorB} 100%)`;
  return {
    id: draft.id || `custom-${Date.now()}`,
    name: draft.name || "My Ember Theme",
    vibe: "Custom",
    personality: "Saved from the My Theme builder.",
    custom: true,
    tokens: {
      bg: draft.background,
      surface: draft.surface,
      surfaceStrong: draft.surface,
      border: draft.border,
      accent1: draft.primary,
      accent2: draft.secondary,
      accent3: draft.highlight,
      text: draft.text,
      textSecondary: draft.textSecondary,
      textSoft: draft.textSecondary,
      gradientA,
      gradientB: `linear-gradient(135deg, ${draft.primary}33, ${draft.secondary}22, ${draft.highlight}18)`,
      glow: `${draft.primary}66`,
    },
  };
}

function currentThemeDefinition() {
  const prefs = normalizePreferences(state.preferences);
  if (String(prefs.themeFamily).startsWith("custom:")) {
    const id = prefs.themeFamily.replace("custom:", "");
    return state.customThemes.find((theme) => theme.id === id) || EMBER_THEMES.dawn;
  }
  return EMBER_THEMES[prefs.themeFamily] || EMBER_THEMES.dawn;
}

function hexToRgba(hex, opacity = 1) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return hex;
  const numeric = Number.parseInt(value, 16);
  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

function applyTheme(theme = currentThemeDefinition()) {
  const root = doc?.documentElement;
  if (!root) return;
  const prefs = normalizePreferences(state.preferences);
  const tokens = theme.tokens || EMBER_THEMES.dawn.tokens;
  const backdrop = activeBackdrop(theme, prefs);
  const opacity = prefs.surfaceOpacity / 100;
  const domain = prefs.accentOverride === "on"
    ? {
        cmd: tokens.accent1,
        acad: tokens.accent1,
        work: tokens.accent1,
        life: tokens.accent1,
        fut: tokens.accent1,
        mind: tokens.accent1,
        note: tokens.accent1,
      }
    : {
        cmd: tokens.accent1,
        acad: tokens.accent2,
        work: tokens.accent3,
        life: tokens.border,
        fut: tokens.accent2,
        mind: tokens.accent1,
        note: tokens.textSecondary,
      };
  const vars = {
    bg: tokens.bg,
    panel: hexToRgba(tokens.surface, opacity),
    "panel-strong": hexToRgba(tokens.surfaceStrong || tokens.surface, Math.min(1, opacity + 0.18)),
    border: hexToRgba(tokens.border, prefs.borderStyle === "sharp" ? 0.42 : 0.24),
    text: tokens.text,
    "text-muted": tokens.textSecondary,
    "text-soft": tokens.textSoft || tokens.textSecondary,
    "cmd": domain.cmd,
    "acad": domain.acad,
    "work": domain.work,
    "life": domain.life,
    "fut": domain.fut,
    "mind": domain.mind,
    "note": domain.note,
    "theme-glow": tokens.glow,
    "student-gradient": backdrop.css,
    "student-gradient-soft": backdrop.soft,
    "card-blur": `${prefs.cardBlur}px`,
    "theme-border-radius": prefs.borderStyle === "sharp" ? "18px" : prefs.borderStyle === "glow" ? "34px" : "28px",
    "theme-transition": prefs.animations === "on" ? "background 300ms ease, color 300ms ease, border-color 300ms ease, box-shadow 300ms ease" : "none",
  };
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(`--${key}`, value));
  root.toggleAttribute("data-reduce-ember-motion", prefs.animations === "off");
}

function syncShellPreferenceClasses() {
  const shell = doc?.querySelector(".app-shell");
  if (!shell) return;
  const prefs = normalizePreferences(state.preferences);
  const domain = activeDomain();
  shell.className = `app-shell theme-${prefs.theme} density-${prefs.compactMode === "on" ? "compact" : prefs.density} text-${prefs.fontScale} layout-${prefs.layoutProfile} domain-${domain.id}`;
}

function saveState() {
  const sanitized = sanitizeLoadedStateSnapshot(state);
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeDomain: state.activeDomain,
      sidebarCollapsed: state.sidebarCollapsed,
      tasks: state.tasks,
      courses: normalizeCourses(state.courses, state.academicPeriods),
      academicProfile: state.academicProfile,
      academicPeriods: normalizeAcademicPeriods(state.academicPeriods),
      academicRequirements: Array.isArray(state.academicRequirements) ? state.academicRequirements.map(normalizeRequirementSet) : [],
      activeAcademicPeriodId: state.activeAcademicPeriodId,
      schedule: state.schedule,
      bills: state.bills,
      budget: state.budget,
      paychecks: state.paychecks,
      finance: state.finance,
      subscription: state.subscription,
      featureUsage: state.featureUsage,
      constraints: state.constraints,
      scheduleMode: state.scheduleMode,
      sourceConfig: state.sourceConfig,
      subTabs: state.subTabs,
      activeCourseId: state.activeCourseId,
      workspace: state.workspace,
      notifications: state.notifications,
      notificationPanelOpen: state.notificationPanelOpen,
      notificationStatus: state.notificationStatus,
      ember: state.ember,
      emberInteraction: state.emberInteraction,
      activityLog: state.activityLog,
      integrations: state.integrations,
      noteSearch: state.noteSearch,
      activeNoteId: state.activeNoteId,
      notes: sanitized.notes,
      uploadedFiles: sanitized.uploadedFiles,
      syllabusReviews: sanitized.syllabusReviews,
      brainDump: sanitized.brainDump,
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
    courses: normalizeCourses(state.courses, state.academicPeriods),
    academicProfile: state.academicProfile,
    academicPeriods: normalizeAcademicPeriods(state.academicPeriods),
    academicRequirements: Array.isArray(state.academicRequirements) ? state.academicRequirements.map(normalizeRequirementSet) : [],
    activeAcademicPeriodId: state.activeAcademicPeriodId,
    schedule: state.schedule,
    bills: state.bills,
    budget: state.budget,
    paychecks: state.paychecks,
    finance: state.finance,
    subscription: state.subscription,
    featureUsage: state.featureUsage,
    constraints: state.constraints,
    scheduleMode: state.scheduleMode,
    sourceConfig: state.sourceConfig,
    subTabs: state.subTabs,
    activeCourseId: state.activeCourseId,
    workspace: state.workspace,
    notifications: state.notifications,
    notificationStatus: state.notificationStatus,
    ember: state.ember,
    emberInteraction: state.emberInteraction,
    activityLog: state.activityLog,
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
  state.academicProfile = { ...DEFAULT_ACADEMIC_PROFILE, ...(workspace?.academicProfile || base.academicProfile || {}) };
  state.academicPeriods = normalizeAcademicPeriods(workspace?.academicPeriods || base.academicPeriods);
  state.academicRequirements = Array.isArray(workspace?.academicRequirements) ? workspace.academicRequirements.map(normalizeRequirementSet) : [];
  state.activeAcademicPeriodId = state.academicPeriods.some((period) => String(period.id) === String(workspace?.activeAcademicPeriodId))
    ? workspace.activeAcademicPeriodId
    : currentAcademicPeriodId(state.academicPeriods);
  state.courses = normalizeCourses(Array.isArray(workspace?.courses) ? workspace.courses : base.courses, state.academicPeriods);
  state.schedule = Array.isArray(workspace?.schedule) ? workspace.schedule : base.schedule;
  state.bills = Array.isArray(workspace?.bills) ? workspace.bills : base.bills;
  state.budget = { ...base.budget, ...(workspace?.budget || {}) };
  state.paychecks = Array.isArray(workspace?.paychecks) ? workspace.paychecks : base.paychecks;
  state.finance = {
    accounts: Array.isArray(workspace?.finance?.accounts) ? workspace.finance.accounts : base.finance.accounts,
    transactions: Array.isArray(workspace?.finance?.transactions) ? workspace.finance.transactions : base.finance.transactions,
    subscriptions: Array.isArray(workspace?.finance?.subscriptions) ? workspace.finance.subscriptions : base.finance.subscriptions,
    savingsGoals: Array.isArray(workspace?.finance?.savingsGoals) ? workspace.finance.savingsGoals : base.finance.savingsGoals,
  };
  state.subscription = normalizeSubscription(workspace?.subscription || base.subscription);
  state.featureUsage = typeof workspace?.featureUsage === "object" && workspace.featureUsage ? workspace.featureUsage : base.featureUsage;
  state.constraints = normalizeConstraints(workspace?.constraints || base.constraints);
  state.scheduleMode = SCHEDULE_MODES[workspace?.scheduleMode] ? workspace.scheduleMode : base.scheduleMode;
  state.sourceConfig = { ...base.sourceConfig, ...(workspace?.sourceConfig || {}) };
  state.subTabs = { ...base.subTabs, ...(workspace?.subTabs || {}) };
  state.activeCourseId = workspace?.activeCourseId ?? null;
  state.workspace = { ...base.workspace, ...(workspace?.workspace || {}) };
  state.notifications = Array.isArray(workspace?.notifications) ? workspace.notifications : base.notifications;
  state.notificationStatus = workspace?.notificationStatus || base.notificationStatus;
  state.ember = {
    ...base.ember,
    ...(workspace?.ember || {}),
    states: Array.isArray(workspace?.ember?.states) ? workspace.ember.states : base.ember.states,
    messages: Array.isArray(workspace?.ember?.messages) ? workspace.ember.messages : base.ember.messages,
    notificationEvents: Array.isArray(workspace?.ember?.notificationEvents) ? workspace.ember.notificationEvents : base.ember.notificationEvents,
  };
  state.emberInteraction = {
    prompt: safeSavedText(workspace?.emberInteraction?.prompt || "", 180),
    response: safeSavedText(workspace?.emberInteraction?.response || "", 520),
  };
  state.activityLog = Array.isArray(workspace?.activityLog) ? workspace.activityLog : base.activityLog;
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
  toast.innerHTML = `<strong>Ember</strong><span>${escapeHtml(state.toast)}</span><button aria-label="Dismiss notification" data-dismiss-toast>&times;</button>`;
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
    title: record.title || "Ember notification",
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

function normalizeActivity(record) {
  const after = record.afterState || record.after_state || {};
  return {
    id: record.id || localId("activity"),
    entityType: record.entityType || record.entity_type || "workspace",
    entityId: record.entityId || record.entity_id || null,
    actionType: record.actionType || record.action_type || "updated",
    beforeState: record.beforeState ?? record.before_state ?? null,
    afterState: after,
    source: record.source || "app",
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    local: Boolean(record.local),
  };
}

function normalizeEmberState(record) {
  return {
    id: record.id || localId("ember_state"),
    stateKey: record.stateKey || record.state_key || "steady",
    severity: record.severity || "low",
    context: record.context || {},
    isActive: record.isActive ?? record.is_active ?? true,
    detectedAt: record.detectedAt || record.detected_at || new Date().toISOString(),
    resolvedAt: record.resolvedAt || record.resolved_at || null,
    local: Boolean(record.local),
  };
}

function normalizeEmberMessage(record) {
  return {
    id: record.id || localId("ember_message"),
    stateId: record.stateId || record.state_id || null,
    surface: record.surface || "dashboard",
    messageType: record.messageType || record.message_type || "guidance",
    title: record.title || "",
    body: record.body || "",
    ctaLabel: record.ctaLabel || record.cta_label || "",
    ctaAction: record.ctaAction || record.cta_action || null,
    metadata: record.metadata || {},
    deliveredAt: record.deliveredAt || record.delivered_at || null,
    createdAt: record.createdAt || record.created_at || new Date().toISOString(),
    local: Boolean(record.local),
  };
}

function normalizeEmberNotificationEvent(record) {
  return {
    id: record.id || localId("ember_notification_event"),
    messageId: record.messageId || record.message_id || null,
    channel: record.channel || "in_app",
    eventKey: record.eventKey || record.event_key || "ember_message",
    sentAt: record.sentAt || record.sent_at || new Date().toISOString(),
    status: record.status || "sent",
    metadata: record.metadata || {},
    local: Boolean(record.local),
  };
}

function activityLabel(activity) {
  const labels = {
    upload: "Upload",
    syllabus: "Syllabus",
    note: "Note",
    integration: "Connector",
    notification: "Notification",
    scheduler: "Scheduler",
    source: "Source",
    mind: "Recovery",
    ember: "Ember",
    task: "Task",
    onboarding: "Onboarding",
  };
  return labels[activity.entityType] || activity.entityType.replace(/_/g, " ");
}

function activitySummary(activity) {
  const detail = activity.afterState?.summary || activity.afterState?.title || activity.afterState?.message || activity.afterState?.provider || "";
  return detail || `${activity.actionType.replace(/_/g, " ")} from ${activity.source}`;
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
    extractionMethod: record.extractionMethod || record.extraction_method || "",
    textPreview: record.textPreview || record.extracted_text_preview || "",
    extractionWarnings: Array.isArray(record.extractionWarnings) ? record.extractionWarnings : Array.isArray(record.extraction_warnings) ? record.extraction_warnings : [],
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
    summary: body || "Start writing here. Ember will use notes as source-grounded context in a later AI phase.",
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function summaryFromParsedUpload(upload, parsed, extraction) {
  const extractedItems = Array.isArray(parsed.extractedItems) && parsed.extractedItems.length
    ? parsed.extractedItems
    : [
        ...(Array.isArray(parsed.assignments) ? parsed.assignments : []),
        ...(Array.isArray(parsed.exams) ? parsed.exams : []),
        ...(Array.isArray(parsed.policies) ? parsed.policies : []),
      ].slice(0, 80);
  return {
    ...parsed,
    courseName: parsed.courseName || upload.name.replace(/\.[^.]+$/, ""),
    courseCode: parsed.courseCode || "Needs review",
    extractedItems,
    extractionMethod: extraction.method,
    textStatus: extraction.textStatus,
    textPreview: extraction.preview,
    warning: parsed.warning || (extraction.textStatus === "complete" ? "Review extracted dates before scheduling." : "Extraction was incomplete. Review before trusting this source."),
  };
}

function courseFromSyllabusReview(review) {
  const summary = review.parsedSummary || {};
  const rawCode = String(summary.courseCode || "").trim();
  const code = rawCode && rawCode.toLowerCase() !== "needs review" ? rawCode.toUpperCase().replace("-", " ") : "";
  const name = String(summary.courseName || review.title || "Imported course").replace(/\s+review$/i, "").trim() || "Imported course";
  if (!code && !name) return null;
  return {
    id: localId("course"),
    name,
    code: code || "Review code",
    grade: null,
    target: null,
    trend: 0,
    color: TOKENS.academy,
    exam: "",
    plat: "Syllabus",
    platform: "Syllabus",
    hist: [],
    source: "syllabus",
    sourceType: "syllabus_parse",
    sourceUploadId: review.uploadId || null,
    sourceReviewId: review.id,
  };
}

function taskItemsFromSyllabusReview(review) {
  const summary = review.parsedSummary || {};
  const items = [
    ...(Array.isArray(summary.assignments) ? summary.assignments : []),
    ...(Array.isArray(summary.exams) ? summary.exams : []),
    ...(Array.isArray(summary.extractedItems) ? summary.extractedItems : []),
  ];
  const seen = new Set();
  return items
    .map((item) => ({
      type: String(item.itemType || item.type || "").toLowerCase(),
      title: String(item.title || item.rawTitle || item.name || "").trim(),
      due: String(item.dateText || item.dueAt || item.due || item.date || item.parsedStartDate || "").trim(),
      status: String(item.status || "").toLowerCase(),
    }))
    .filter((item) => !(item.status === "needs_review" && !item.due && /^review\s+/i.test(item.title)))
    .filter((item) => item.title && /homework|assignment|exam|final_exam|quiz|project|paper|lab|deadline|midterm|final|test/.test(`${item.type} ${item.title}`))
    .filter((item) => !/break|holiday|policy|info/.test(item.type))
    .filter((item) => {
      const key = normalizedKey(item.type, item.title, item.due);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function applyConfirmedSyllabusReview(review) {
  const summary = review.parsedSummary || {};
  const course = courseFromSyllabusReview(review);
  let courseAdded = false;
  let linkedCourse = null;
  if (course) {
    const courseKey = normalizedKey(course.code !== "Review code" ? course.code : course.name);
    const exists = state.courses.find((item) => normalizedKey(item.code || item.name) === courseKey || item.sourceReviewId === review.id);
    if (!exists) {
      state.courses = [course, ...state.courses];
      linkedCourse = course;
      courseAdded = true;
    } else {
      linkedCourse = exists;
    }
  }

  const existingTaskKeys = new Set(state.tasks.map((task) => normalizedKey(task.course, task.title, task.due)));
  let nextId = nextNumericTaskId();
  const newTasks = taskItemsFromSyllabusReview(review)
    .map((item) => {
      const task = {
        id: nextId,
        title: item.title,
        domain: "academy",
        due: item.due || "Needs date review",
        urgent: /exam|midterm|final|test/.test(`${item.type} ${item.title}`),
        done: false,
        course: summary.courseCode && summary.courseCode !== "Needs review" ? summary.courseCode : course?.code || "",
        source: "syllabus",
        sourceType: "syllabus_parse",
        sourceUploadId: review.uploadId || null,
        sourceReviewId: review.id,
        courseId: linkedCourse?.id || course?.id || null,
      };
      nextId += 1;
      return task;
    })
    .filter((task) => {
      const key = normalizedKey(task.course, task.title, task.due);
      if (existingTaskKeys.has(key)) return false;
      existingTaskKeys.add(key);
      return true;
    });
  if (newTasks.length) state.tasks = [...newTasks, ...state.tasks];

  return { courseAdded, tasksAdded: newTasks.length, courseId: linkedCourse?.id || null };
}

async function upsertParsedSyllabusReview(upload, parsed, extraction) {
  const summary = summaryFromParsedUpload(upload, parsed, extraction);
  const existing = state.syllabusReviews.map(normalizeSyllabusReview).find((review) => review.uploadId === upload.id);
  const localReview = normalizeSyllabusReview({
    ...(existing || {}),
    id: existing?.id || localId("syllabus"),
    uploadId: upload.id,
    title: `${summary.courseCode && summary.courseCode !== "Needs review" ? summary.courseCode : upload.name.replace(/\.[^.]+$/, "")} review`,
    parseStatus: "needs_review",
    parsedSummary: summary,
    confidence: Number(summary.confidence || 0.35),
    local: existing?.local ?? true,
  });
  state.syllabusReviews = existing
    ? state.syllabusReviews.map((review) => review.uploadId === upload.id ? localReview : review)
    : [localReview, ...state.syllabusReviews].slice(0, 100);
  saveState();
  renderApp();

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return localReview;
  try {
    const cloudPayload = { ...localReview, uploadId: isUuid(upload.id) ? upload.id : null };
    const cloudReview = existing && isUuid(existing.id)
      ? normalizeSyllabusReview(await updateSyllabusRecord(state.auth.client, existing.id, {
          title: localReview.title,
          parseStatus: localReview.parseStatus,
          parsedSummary: localReview.parsedSummary,
          confidence: localReview.confidence,
        }))
      : normalizeSyllabusReview(await createSyllabusRecord(state.auth.client, state.workspace.id, cloudPayload));
    state.syllabusReviews = state.syllabusReviews.map((review) => review.id === localReview.id || review.uploadId === upload.id ? cloudReview : review);
    saveState();
    renderApp();
    return cloudReview;
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Parsed syllabus sync unavailable.",
    };
    saveState();
    return localReview;
  }
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

function renderActivityLogPanelOnly() {
  const panel = doc?.querySelector("[data-activity-panel]");
  if (panel) panel.outerHTML = renderActivityPanel();
}

async function logActivity(activity) {
  const normalized = normalizeActivity({ ...activity, local: true });
  state.activityLog = [normalized, ...state.activityLog].slice(0, 50);
  saveState();
  renderActivityLogPanelOnly();

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client || !state.auth.user) return;
  try {
    const created = await createActivityLogRecord(state.auth.client, state.workspace.id, state.auth.user.id, {
      ...activity,
      entityId: isUuid(activity.entityId) ? activity.entityId : null,
    });
    state.activityLog = state.activityLog.map((item) => item.id === normalized.id ? normalizeActivity(created) : item);
    saveState();
    renderActivityLogPanelOnly();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Activity log unavailable.",
    };
    saveState();
  }
}

function emberSnapshotKey(surface, ember) {
  const sourceMessage = surface === "planner" ? ember.planner : surface === "upload_review" ? ember.upload : ember.dashboard;
  return [
    surface,
    ember.primaryState?.stateKey || "steady",
    ember.primaryState?.severity || "low",
    sourceMessage?.title || "",
    sourceMessage?.body || "",
  ].join("::");
}

function appendLocalEmberSnapshot(surface, ember) {
  const key = emberSnapshotKey(surface, ember);
  if (state.ember.lastSnapshotKey === key) return null;
  const primary = normalizeEmberState({ ...ember.primaryState, local: true });
  const sourceMessage = surface === "planner"
    ? ember.planner
    : surface === "upload_review"
      ? ember.upload
      : ember.dashboard;
  const message = normalizeEmberMessage({
    local: true,
    stateId: primary.id,
    surface,
    messageType: primary.severity === "high" ? "warning" : "guidance",
    title: sourceMessage.title,
    body: sourceMessage.body,
    ctaLabel: sourceMessage.ctaLabel,
    ctaAction: sourceMessage.ctaAction,
    metadata: {
      stateKey: primary.stateKey,
      severity: primary.severity,
      note: sourceMessage.note || "",
    },
  });
  state.ember = {
    ...state.ember,
    lastSnapshotKey: key,
    states: [primary, ...(state.ember.states || [])].slice(0, 40),
    messages: [message, ...(state.ember.messages || [])].slice(0, 60),
  };
  saveState();
  return { key, primary, message };
}

async function persistEmberSnapshot(surface = "dashboard") {
  const intel = getIntel();
  const ember = buildEmberIntelligence({ state, intel });
  const snapshot = appendLocalEmberSnapshot(surface, ember);
  if (!snapshot || !state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client || !state.auth.user) return snapshot;
  try {
    const cloudState = normalizeEmberState(await createEmberStateRecord(state.auth.client, state.workspace.id, state.auth.user.id, snapshot.primary));
    const cloudMessage = normalizeEmberMessage(await createEmberMessageRecord(state.auth.client, state.workspace.id, state.auth.user.id, {
      ...snapshot.message,
      stateId: cloudState.id,
    }));
    state.ember = {
      ...state.ember,
      states: state.ember.states.map((item) => item.id === snapshot.primary.id ? cloudState : item),
      messages: state.ember.messages.map((item) => item.id === snapshot.message.id ? cloudMessage : item),
    };

    if (cloudState.severity === "high") {
      const eventKey = `${surface}:${cloudState.stateKey}:${new Date().toISOString().slice(0, 10)}`;
      const recent = (state.ember.notificationEvents || []).some((item) => item.eventKey === eventKey);
      if (!recent) {
        const event = normalizeEmberNotificationEvent(await createEmberNotificationEventRecord(state.auth.client, state.workspace.id, state.auth.user.id, {
          messageId: cloudMessage.id,
          channel: "in_app",
          eventKey,
          metadata: { surface, severity: cloudState.severity, stateKey: cloudState.stateKey },
        }));
        state.ember.notificationEvents = [event, ...(state.ember.notificationEvents || [])].slice(0, 80);
      }
    }
    saveState();
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Ember persistence unavailable.",
    };
    saveState();
  }
  return snapshot;
}

function queueEmberSnapshotSync(surface = "dashboard") {
  if (!win || !state.auth.user) return;
  clearTimeout(emberSyncTimer);
  emberSyncTimer = win.setTimeout(() => {
    persistEmberSnapshot(surface);
  }, 500);
}

async function persistEmberCheckIn() {
  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client || !state.auth.user) return;
  try {
    await createEmberCheckInRecord(state.auth.client, state.workspace.id, state.auth.user.id, {
      mood: state.checkin.mood,
      energy: state.checkin.energy,
      stress: state.checkin.stress || null,
      note: state.checkin.note || "",
    });
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Check-in persistence unavailable.",
    };
    saveState();
  }
}

async function persistEmberAction(actionType, actionPayload = {}) {
  logActivity({
    entityType: "ember",
    actionType,
    afterState: {
      summary: `Ember action requested: ${actionType.replace(/_/g, " ")}`,
      ...actionPayload,
    },
  });
  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client || !state.auth.user) return;
  try {
    await createEmberActionRecord(state.auth.client, state.workspace.id, state.auth.user.id, {
      actionType,
      actionPayload,
    });
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Ember action persistence unavailable.",
    };
    saveState();
  }
}

async function ingestUploadedFile(file, uploadRecord) {
  const upload = normalizeUpload(uploadRecord);
  state.uploadedFiles = state.uploadedFiles.map((item) => item.id === upload.id ? { ...item, textStatus: "processing" } : item);
  saveState();
  renderApp();
  try {
    const contentBase64 = await readFileAsDataUrl(file);
    const response = await fetch("/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        name: file.name,
        type: file.type,
        size: file.size,
        contentBase64,
      }),
    });
    if (!response.ok) throw new Error(`Ingestion returned ${response.status}`);
    const result = await response.json();
    const extraction = result.extraction || {};
    const parsed = result.parsed || {};
    const updatedUpload = normalizeUpload({
      ...upload,
      textStatus: extraction.textStatus || "complete",
      extractionMethod: extraction.method || "unknown",
      textPreview: extraction.preview || "",
      extractionWarnings: extraction.warnings || [],
    });
    state.uploadedFiles = state.uploadedFiles.map((item) => item.id === upload.id ? updatedUpload : item);
    saveState();
    renderApp();
    if (state.workspace.phase2Enabled && state.auth.client && isUuid(upload.id)) {
      try {
        const cloudUpload = normalizeUpload(await updateUploadExtractionRecord(state.auth.client, upload.id, extraction));
        state.uploadedFiles = state.uploadedFiles.map((item) => item.id === upload.id ? cloudUpload : item);
      } catch (error) {
        state.workspace = { ...state.workspace, error: error instanceof Error ? error.message : "Upload extraction sync unavailable." };
      }
    }
    const review = await upsertParsedSyllabusReview(updatedUpload, parsed, extraction);
    notifyUser({
      type: "source_parsed",
      title: "Source text extracted",
      body: `${file.name} parsed with ${extraction.method || "the ingestion pipeline"}. Review the syllabus card before scheduling.`,
      severity: extraction.textStatus === "complete" ? "success" : "warning",
      sourceEntityType: "upload",
      sourceEntityId: isUuid(upload.id) ? upload.id : null,
    });
    logActivity({
      entityType: "syllabus",
      entityId: isUuid(review.id) ? review.id : null,
      actionType: "parsed",
      afterState: {
        title: review.title,
        summary: `${file.name} parsed via ${extraction.method || "ingestion"}`,
        confidence: review.confidence,
        textStatus: extraction.textStatus,
      },
    });
    await persistEmberSnapshot("upload_review");
  } catch (error) {
    state.uploadedFiles = state.uploadedFiles.map((item) => item.id === upload.id ? { ...item, textStatus: "failed", extractionWarnings: [error instanceof Error ? error.message : "Ingestion failed."] } : item);
    saveState();
    renderApp();
    notifyUser({
      type: "source_parse_error",
      title: "Source parsing failed",
      body: `${file.name} could not be extracted. You can still review it manually.`,
      severity: "warning",
      sourceEntityType: "upload",
      sourceEntityId: isUuid(upload.id) ? upload.id : null,
    });
  }
}

async function ingestUploadedFiles(files, uploadRecords) {
  for (let index = 0; index < files.length; index += 1) {
    await ingestUploadedFile(files[index], uploadRecords[index] || uploadRecords[0]);
  }
}

async function attachSourceFiles(files) {
  const fileList = [...files];
  if (!fileList.length) return;
  if (!hasAccess("pro") && state.uploadedFiles.length + fileList.length > FREE_UPLOAD_LIMIT) {
    openPaywall("unlimited_uploads", { feature: "file_upload", count: fileList.length });
    return;
  }
  if (!hasAccess("pro") && fileList.some(likelySyllabusFile)) {
    openPaywall("syllabus_upload", { feature: "syllabus_upload", filenames: fileList.map((file) => file.name) });
    return;
  }
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
  logActivity({
    entityType: "upload",
    actionType: "attached",
    afterState: {
      summary: `${fileList.length} source file${fileList.length === 1 ? "" : "s"} attached`,
      filenames: fileList.map((file) => file.name).slice(0, 12),
    },
  });

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) {
    await ingestUploadedFiles(fileList, localUploads);
    return;
  }
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
    logActivity({
      entityType: "upload",
      actionType: "synced_metadata",
      afterState: {
        summary: `${created.length} upload record${created.length === 1 ? "" : "s"} synced to Supabase`,
        uploadIds: created.map((item) => item.id).filter(isUuid),
      },
    });
    await ingestUploadedFiles(fileList, created);
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Upload metadata sync unavailable.",
    };
    notifyUser({
      type: "upload_sync_error",
      title: "Upload saved locally",
      body: "Ember could not write upload metadata to Supabase, so this file remains in local fallback state.",
      severity: "warning",
    });
    await ingestUploadedFiles(fileList, localUploads);
  }
}

async function removeUploadedFile(uploadId) {
  const upload = state.uploadedFiles.map(normalizeUpload).find((item) => item.id === uploadId);
  if (!upload) return;
  const linkedReviews = state.syllabusReviews
    .map(normalizeSyllabusReview)
    .filter((review) => review.uploadId === uploadId);
  const linkedReviewIds = new Set(linkedReviews.map((review) => String(review.id)));
  const linkedCourseIds = new Set(state.courses
    .filter((course) => course.sourceUploadId === uploadId || linkedReviewIds.has(String(course.sourceReviewId || "")))
    .map((course) => String(course.id)));
  const generatedTaskCount = state.tasks.filter((task) =>
    task.sourceUploadId === uploadId ||
    linkedReviewIds.has(String(task.sourceReviewId || "")) ||
    (task.sourceType === "syllabus_parse" && linkedCourseIds.has(String(task.courseId || "")))
  ).length;
  const beforeUploads = state.uploadedFiles;
  const beforeReviews = state.syllabusReviews;
  const beforeTasks = state.tasks;
  const beforeCourses = state.courses;
  state.uploadedFiles = state.uploadedFiles.filter((item) => item.id !== uploadId);
  state.syllabusReviews = state.syllabusReviews.filter((review) => review.uploadId !== uploadId);
  state.tasks = state.tasks.filter((task) =>
    task.sourceUploadId !== uploadId &&
    !linkedReviewIds.has(String(task.sourceReviewId || "")) &&
    !(task.sourceType === "syllabus_parse" && linkedCourseIds.has(String(task.courseId || "")))
  );
  state.courses = state.courses.map((course) =>
    course.sourceUploadId === uploadId || linkedReviewIds.has(String(course.sourceReviewId || ""))
      ? { ...course, sourceStatus: "source_removed", sourceUploadId: null }
      : course
  );
  saveState();
  renderApp();
  void notifyUser({
    type: "upload_removed",
    title: "Source removed",
    body: `${upload.name} was removed. ${generatedTaskCount ? `${generatedTaskCount} syllabus-generated assignment${generatedTaskCount === 1 ? "" : "s"} were removed too.` : "Manual assignments were left alone."}`,
    severity: "info",
    sourceEntityType: "upload",
    sourceEntityId: isUuid(uploadId) ? uploadId : null,
  });
  void logActivity({
    entityType: "upload",
    entityId: isUuid(uploadId) ? uploadId : null,
    actionType: "removed",
    beforeState: { title: upload.name, textStatus: upload.textStatus },
    afterState: { summary: `${upload.name} removed from source uploads.`, generatedTasksRemoved: generatedTaskCount },
  });

  if (!state.workspace.phase2Enabled || !state.auth.client || !isUuid(uploadId)) return;
  try {
    await deleteSyllabusRecordsForUpload(state.auth.client, uploadId);
    await deleteUploadRecord(state.auth.client, uploadId);
  } catch (error) {
    state.uploadedFiles = beforeUploads;
    state.syllabusReviews = beforeReviews;
    state.tasks = beforeTasks;
    state.courses = beforeCourses;
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Upload removal unavailable.",
    };
    saveState();
    renderApp();
    void notifyUser({
      type: "upload_remove_error",
      title: "Could not remove source",
      body: "Ember restored the upload because Supabase could not delete the source record.",
      severity: "warning",
      sourceEntityType: "upload",
      sourceEntityId: uploadId,
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
    body: "Ember created a review card. Confirm the extracted placeholders before they become schedule data.",
    severity: "info",
    sourceEntityType: "upload",
    sourceEntityId: upload.id,
  });
  logActivity({
    entityType: "syllabus",
    entityId: isUuid(draft.id) ? draft.id : null,
    actionType: "review_started",
    afterState: {
      title: draft.title,
      summary: "Syllabus review card created from upload metadata.",
      uploadName: upload.name,
      parseStatus: draft.parseStatus,
    },
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
    logActivity({
      entityType: "syllabus",
      entityId: isUuid(created.id) ? created.id : null,
      actionType: "synced_review",
      afterState: { title: created.title, parseStatus: created.parseStatus },
    });
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Syllabus review sync unavailable.",
    };
    notifyUser({
      type: "syllabus_sync_error",
      title: "Syllabus review saved locally",
      body: "Ember could not write the review to Supabase, so it remains local fallback state.",
      severity: "warning",
    });
  }
}

async function confirmSyllabusReview(reviewId) {
  const current = state.syllabusReviews.map(normalizeSyllabusReview).find((item) => item.id === reviewId);
  if (!current) return;
  const wasConfirmed = current.parseStatus === "confirmed";
  const updated = normalizeSyllabusReview({
    ...current,
    parseStatus: "confirmed",
    confidence: Math.max(current.confidence, 0.75),
    updatedAt: new Date().toISOString(),
    local: current.local,
  });
  state.syllabusReviews = state.syllabusReviews.map((item) => item.id === reviewId ? updated : item);
  const created = wasConfirmed ? { courseAdded: false, tasksAdded: 0 } : applyConfirmedSyllabusReview(updated);
  if (created.courseId) {
    state.activeCourseId = created.courseId;
    state.activeDomain = "academy";
  }
  rerender();
  notifyUser({
    type: "syllabus_confirmed",
    title: created.courseAdded || created.tasksAdded ? "Syllabus added to Academy" : "Syllabus review confirmed",
    body: created.courseAdded || created.tasksAdded
      ? `Added ${created.courseAdded ? "1 course" : "0 courses"} and ${created.tasksAdded} academic task${created.tasksAdded === 1 ? "" : "s"} from the reviewed syllabus.`
      : "The syllabus is confirmed. No new course or assignment rows were added because they already exist or the parser found no actionable dates.",
    severity: "success",
    sourceEntityType: "syllabus",
    sourceEntityId: reviewId,
  });
  logActivity({
    entityType: "syllabus",
    entityId: isUuid(reviewId) ? reviewId : null,
    actionType: "confirmed",
    beforeState: { parseStatus: current.parseStatus, confidence: current.confidence },
    afterState: {
      title: updated.title,
      parseStatus: updated.parseStatus,
      confidence: updated.confidence,
      summary: `Confirmed syllabus review. Added ${created.courseAdded ? "1 course" : "0 courses"} and ${created.tasksAdded} academic task${created.tasksAdded === 1 ? "" : "s"}.`,
    },
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

async function createNotebookNote({ domain = "notebook", title = "Untitled note", tags = ["draft"] } = {}) {
  const note = normalizeNote({
    id: localId("note"),
    title,
    domain,
    tags,
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
  logActivity({
    entityType: "note",
    entityId: isUuid(note.id) ? note.id : null,
    actionType: "created",
    afterState: { title: note.title, domain: note.domain, tags: note.tags },
  });

  if (!state.workspace.phase2Enabled || !state.workspace.id || !state.auth.client) return;
  try {
    const cloud = normalizeNote(await createNoteRecord(state.auth.client, state.workspace.id, note));
    state.notes = state.notes.map((item) => item.id === note.id ? cloud : item);
    state.activeNoteId = cloud.id;
    saveState();
    renderApp();
    logActivity({
      entityType: "note",
      entityId: isUuid(cloud.id) ? cloud.id : null,
      actionType: "synced",
      afterState: { title: cloud.title, domain: cloud.domain },
    });
  } catch (error) {
    state.workspace = {
      ...state.workspace,
      error: error instanceof Error ? error.message : "Note sync unavailable.",
    };
    saveState();
  }
}

function addManualTask({ domain, title, due = "Today", urgent = false, course = "", courseId = null, source = "manual", sourceType = "manual" }) {
  const task = {
    id: nextNumericTaskId(),
    title,
    domain,
    due,
    urgent,
    done: false,
    source,
    sourceType,
  };
  if (course) task.course = course;
  if (courseId) task.courseId = courseId;
  state.tasks = [task, ...state.tasks].slice(0, 200);
  return task;
}

function addManualScheduleBlock({ domain, label, time = "9:00", mins = 60, course = "", courseId = null, note = "" }) {
  const block = {
    time,
    label,
    domain,
    mins: Math.max(15, Number(mins) || 60),
    manual: true,
  };
  if (course) block.course = course;
  if (courseId) block.courseId = courseId;
  if (note) block.note = note;
  state.schedule = [...state.schedule, block];
  return block;
}

const MANUAL_ENTRY_CONFIG = {
  course: {
    eyebrow: "School",
    title: "Add class",
    body: "Create the class now. You can attach a syllabus or LMS connection later.",
    submit: "Add class",
    fields: [
      { key: "code", label: "Class code", placeholder: "MATH 101", optional: true },
      { key: "name", label: "Class name", placeholder: "Calculus I", required: true },
    ],
  },
  academic_period: {
    eyebrow: "School",
    title: "Create term",
    body: "Add a semester, quarter, school year, or custom term for class planning.",
    submit: "Create term",
    fields: [
      { key: "name", label: "Term name", placeholder: "Fall 2026", required: true },
      { key: "type", label: "Term type", placeholder: "semester" },
      { key: "startDate", label: "Start date", placeholder: "2026-08-24" },
      { key: "endDate", label: "End date", placeholder: "2026-12-11" },
    ],
  },
  assignment: {
    eyebrow: "School",
    title: "Enter assignment",
    body: "Add one due date manually so School and Plan can use it right away.",
    submit: "Add assignment",
    fields: [
      { key: "title", label: "Assignment title", placeholder: "Problem Set 4", required: true },
      { key: "due", label: "Due date", placeholder: "Friday 11:59pm" },
    ],
  },
  exam: {
    eyebrow: "School",
    title: "Add exam",
    body: "Create an exam deadline without waiting for syllabus parsing.",
    submit: "Add exam",
    fields: [
      { key: "title", label: "Exam title", placeholder: "Midterm 1", required: true },
      { key: "due", label: "Exam date", placeholder: "Apr 21" },
    ],
  },
  shift: {
    eyebrow: "Shift Board",
    title: "Add shift",
    body: "Block work time manually before it collides with class, study, or sleep.",
    submit: "Add shift",
    fields: [
      { key: "label", label: "Shift label", placeholder: "Campus lab shift", required: true },
      { key: "time", label: "Start time", placeholder: "9:00" },
      { key: "mins", label: "Length in minutes", placeholder: "240", inputType: "number" },
    ],
  },
  time_block: {
    eyebrow: "Plan",
    title: "Add time block",
    body: "Reserve time in the planner for something the solver should respect.",
    submit: "Add block",
    fields: [
      { key: "label", label: "Block label", placeholder: "Study block", required: true },
      { key: "time", label: "Start time", placeholder: "9:00" },
      { key: "mins", label: "Length in minutes", placeholder: "60", inputType: "number" },
    ],
  },
  rest_block: {
    eyebrow: "Recovery",
    title: "Add rest block",
    body: "Protect recovery time without turning it into another productivity task.",
    submit: "Add rest block",
    fields: [
      { key: "label", label: "Rest block label", placeholder: "Walk + reset", required: true },
      { key: "time", label: "Start time", placeholder: "6:00" },
      { key: "mins", label: "Length in minutes", placeholder: "45", inputType: "number" },
    ],
  },
  work_task: {
    eyebrow: "Work",
    title: "Add work task",
    body: "Track a work commitment without connecting a project tool.",
    submit: "Add work task",
    fields: [
      { key: "title", label: "Task title", placeholder: "Submit timesheet", required: true },
      { key: "due", label: "Due or target date", placeholder: "This week" },
    ],
  },
  personal_task: {
    eyebrow: "Money",
    title: "Add life task",
    body: "Add an errand, chore, or admin task when it should affect the plan.",
    submit: "Add task",
    fields: [
      { key: "title", label: "Task title", placeholder: "Pay rent", required: true },
      { key: "due", label: "Due or target date", placeholder: "This week" },
    ],
  },
  goal: {
    eyebrow: "Path",
    title: "Add goal",
    body: "Capture a goal as a schedulable next step, not just a vague idea.",
    submit: "Add goal",
    fields: [
      { key: "title", label: "Goal or milestone", placeholder: "Finish portfolio project", required: true },
      { key: "due", label: "Target date", placeholder: "This month" },
    ],
  },
  bill: {
    eyebrow: "Money",
    title: "Add bill",
    body: "Add a bill manually so Money can warn you before deadlines stack up.",
    submit: "Add bill",
    fields: [
      { key: "name", label: "Bill name", placeholder: "Rent", required: true },
      { key: "amount", label: "Amount", placeholder: "850", inputType: "number" },
      { key: "due", label: "Due date", placeholder: "Apr 8" },
    ],
  },
  income: {
    eyebrow: "Money",
    title: "Add income",
    body: "Add income timing manually. Bank connections can stay optional.",
    submit: "Add income",
    fields: [
      { key: "label", label: "Income label", placeholder: "Paycheck", required: true },
      { key: "amount", label: "Amount", placeholder: "420", inputType: "number" },
      { key: "date", label: "Expected date", placeholder: "This week" },
    ],
  },
  budget: {
    eyebrow: "Money",
    title: "Set weekly target",
    body: "Give Money a simple spending target without connecting accounts.",
    submit: "Set target",
    fields: [
      { key: "amount", label: "Weekly spending target", placeholder: "75", inputType: "number", required: true },
    ],
  },
  account: {
    eyebrow: "Money",
    title: "Add account",
    body: "Create a manual balance source. Plaid can replace or update this later.",
    submit: "Add account",
    fields: [
      { key: "name", label: "Account name", placeholder: "Checking", required: true },
      { key: "type", label: "Account type", placeholder: "checking" },
      { key: "balance", label: "Current balance", placeholder: "250", inputType: "number" },
    ],
  },
  transaction: {
    eyebrow: "Money",
    title: "Add transaction",
    body: "Add income, expense, transfer, or refund by hand.",
    submit: "Add transaction",
    fields: [
      { key: "merchant", label: "Merchant or source", placeholder: "Grocery store", required: true },
      { key: "amount", label: "Amount", placeholder: "24.50", inputType: "number", required: true },
      { key: "eventType", label: "Type", placeholder: "expense" },
      { key: "category", label: "Category", placeholder: "Food" },
    ],
  },
  subscription: {
    eyebrow: "Money",
    title: "Add subscription",
    body: "Track a recurring charge before account sync detects it.",
    submit: "Add subscription",
    fields: [
      { key: "name", label: "Subscription", placeholder: "Spotify", required: true },
      { key: "amount", label: "Amount", placeholder: "9.99", inputType: "number" },
      { key: "cadence", label: "Cadence", placeholder: "monthly" },
      { key: "nextDue", label: "Next charge", placeholder: "Apr 20" },
    ],
  },
  savings_goal: {
    eyebrow: "Money",
    title: "Add savings goal",
    body: "Create a target and track progress manually before smart savings exists.",
    submit: "Add goal",
    fields: [
      { key: "name", label: "Goal name", placeholder: "Emergency fund", required: true },
      { key: "target", label: "Target amount", placeholder: "1000", inputType: "number" },
      { key: "current", label: "Current amount", placeholder: "0", inputType: "number" },
    ],
  },
  note: {
    eyebrow: "Sources",
    title: "Write note",
    body: "Create a source note directly inside Ember.",
    submit: "Create note",
    fields: [
      { key: "title", label: "Note title", placeholder: "Untitled note", required: true },
    ],
  },
  future_note: {
    eyebrow: "Path",
    title: "Create path note",
    body: "Capture career or goal context and link it to Path.",
    submit: "Create note",
    fields: [
      { key: "title", label: "Note title", placeholder: "Career path note", required: true },
    ],
  },
  source: {
    eyebrow: "Sources",
    title: "Manual source",
    body: "Add a source placeholder when nothing connects cleanly yet.",
    submit: "Create source",
    fields: [
      { key: "title", label: "Source title", placeholder: "Manual source", required: true },
    ],
  },
};

function manualValue(values, key, fallback = "") {
  return String(values?.[key] || fallback || "").trim();
}

async function handleManualEntry(type, values = {}) {
  let created = null;
  let notifyTitle = "Manual item added";
  let notifyBody = "Ember updated from your manual entry.";

  if (type === "note" || type === "future_note" || type === "source") {
    const title = manualValue(values, "title", type === "future_note" ? "Career path note" : type === "source" ? "Manual source" : "Untitled note");
    if (!title) return;
    await createNotebookNote({
      domain: type === "future_note" ? "future" : "notebook",
      title,
      tags: [type === "source" ? "manual-source" : "manual"],
    });
    return;
  }

  if (type === "course") {
    const code = manualValue(values, "code", "Manual");
    const name = manualValue(values, "name", code || "New class");
    if (!name) return;
    created = normalizeCourseRecord({
      id: localId("course"),
      name,
      code: code || "Manual",
      academicPeriodId: state.activeAcademicPeriodId || currentAcademicPeriodId(state.academicPeriods),
      status: "active",
      credits: 3,
      grade: null,
      target: null,
      trend: 0,
      color: TOKENS.academy,
      exam: null,
      platform: "Manual entry",
      hist: [],
    }, state.academicPeriods);
    state.courses = [created, ...state.courses];
    state.subTabs.academy = "grades";
    notifyTitle = "Class added";
    notifyBody = `${name} is now available in School.`;
  } else if (type === "academic_period") {
    const name = manualValue(values, "name", "New term");
    if (!name) return;
    created = normalizeAcademicPeriod({
      id: localId("term"),
      name,
      type: manualValue(values, "type", "semester"),
      startDate: manualValue(values, "startDate", ""),
      endDate: manualValue(values, "endDate", ""),
      status: "upcoming",
      schoolName: "Current school",
    }, state.academicPeriods.length);
    state.academicPeriods = [...normalizeAcademicPeriods(state.academicPeriods), created];
    state.activeAcademicPeriodId = created.id;
    state.subTabs.academy = "roadmap";
    notifyTitle = "Term created";
    notifyBody = `${name} is ready for planned classes and roadmap work.`;
  } else if (type === "assignment" || type === "exam") {
    const activeCourse = state.courses.find((course) => String(course.id) === String(state.activeCourseId));
    const fallbackCourse = activeCourse?.code || activeCourse?.name || state.courses[0]?.code || state.courses[0]?.name || "Manual";
    const title = manualValue(values, "title", type === "exam" ? "Exam" : "Assignment");
    if (!title) return;
    const due = manualValue(values, "due", "Today");
    created = addManualTask({
      domain: "academy",
      title,
      due: due || "Today",
      urgent: /today|tomorrow|exam/i.test(`${due} ${type}`),
      course: fallbackCourse,
      courseId: activeCourse?.id || null,
      source: "manual",
      sourceType: "manual",
    });
    state.subTabs.academy = "courses";
    notifyTitle = type === "exam" ? "Exam added" : "Assignment added";
    notifyBody = `${title} now appears in School deadlines.`;
  } else if (type === "shift" || type === "time_block" || type === "rest_block") {
    const domain = type === "shift" ? "works" : type === "rest_block" ? "mind" : "command";
    const label = manualValue(values, "label", type === "shift" ? "Work shift" : type === "rest_block" ? "Recovery block" : "Manual block");
    if (!label) return;
    const time = manualValue(values, "time", "9:00");
    const mins = manualValue(values, "mins", type === "shift" ? "240" : "60");
    created = addManualScheduleBlock({ domain, label, time: time || "9:00", mins });
    if (type === "shift") state.subTabs.works = "shifts";
    notifyTitle = type === "shift" ? "Shift added" : "Time block added";
    notifyBody = `${label} is now part of the planner context.`;
  } else if (type === "work_task" || type === "personal_task" || type === "goal") {
    const domain = type === "work_task" ? "works" : type === "goal" ? "future" : "life";
    const title = manualValue(values, "title", type === "goal" ? "New goal" : "New task");
    if (!title) return;
    const due = manualValue(values, "due", "This week");
    created = addManualTask({ domain, title, due: due || "This week", urgent: false });
    if (type === "work_task") state.subTabs.works = "tasks";
    notifyTitle = type === "goal" ? "Goal added" : "Task added";
    notifyBody = `${title} now appears in ${DOMAINS.find((domainItem) => domainItem.id === domain)?.label || "Ember"}.`;
  } else if (type === "bill") {
    const name = manualValue(values, "name", "Bill");
    if (!name) return;
    const amount = manualValue(values, "amount", "0");
    const due = manualValue(values, "due", "This week");
    created = { name, amount: String(amount || "").startsWith("$") ? amount : `$${amount || 0}`, due: due || "This week", soon: false, manual: true };
    state.bills = [created, ...state.bills];
    notifyTitle = "Bill added";
    notifyBody = `${name} is now part of Money and load context.`;
  } else if (type === "income") {
    const label = manualValue(values, "label", "Paycheck");
    if (!label) return;
    const amount = Number(manualValue(values, "amount", "0")) || 0;
    const date = manualValue(values, "date", "This week");
    created = { label, amount, date: date || "This week", manual: true };
    state.paychecks = [created, ...state.paychecks];
    state.budget = { ...state.budget, income: Number(state.budget.income || 0) + amount, left: Number(state.budget.left || 0) + amount };
    notifyTitle = "Income added";
    notifyBody = `${label} now helps Ember estimate bill coverage.`;
  } else if (type === "budget") {
    const amount = Number(manualValue(values, "amount", "0")) || 0;
    if (!amount) return;
    created = { weeklyTarget: amount };
    state.budget = { ...state.budget, weeklyTarget: amount, left: Number(state.budget.left || 0) || amount };
    notifyTitle = "Weekly target set";
    notifyBody = `Money now uses a $${amount} weekly target.`;
  } else if (type === "account") {
    const name = manualValue(values, "name", "Manual account");
    const balance = Number(manualValue(values, "balance", "0")) || 0;
    created = {
      id: localId("account"),
      name,
      type: manualValue(values, "type", "checking"),
      balance,
      provider: "Manual",
      updatedAt: new Date().toISOString(),
    };
    state.finance = {
      ...state.finance,
      accounts: [created, ...(state.finance?.accounts || [])].slice(0, 50),
    };
    state.budget = { ...state.budget, left: Number(state.budget.left || 0) + balance };
    notifyTitle = "Account added";
    notifyBody = `${name} now contributes to Money cash context.`;
  } else if (type === "transaction") {
    const merchant = manualValue(values, "merchant", "Manual transaction");
    const rawAmount = Number(manualValue(values, "amount", "0")) || 0;
    const eventTypeInput = manualValue(values, "eventType", rawAmount >= 0 ? "income" : "expense").toLowerCase();
    const eventType = ["expense", "income", "transfer", "refund", "adjustment"].includes(eventTypeInput) ? eventTypeInput : rawAmount >= 0 ? "income" : "expense";
    const signedAmount = eventType === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const budgetDelta = eventType === "transfer" ? 0 : signedAmount;
    created = {
      id: localId("txn"),
      merchant,
      amount: signedAmount,
      eventType,
      category: manualValue(values, "category", eventType === "income" ? "Income" : "Uncategorized"),
      date: new Date().toISOString().slice(0, 10),
      source: "manual",
      confidence: 1,
    };
    state.finance = {
      ...state.finance,
      transactions: [created, ...(state.finance?.transactions || [])].slice(0, 250),
    };
    state.budget = {
      ...state.budget,
      income: eventType === "income" ? Number(state.budget.income || 0) + Math.abs(signedAmount) : Number(state.budget.income || 0),
      spent: eventType === "expense" ? Number(state.budget.spent || 0) + Math.abs(signedAmount) : Number(state.budget.spent || 0),
      left: Number(state.budget.left || 0) + budgetDelta,
    };
    notifyTitle = "Transaction added";
    notifyBody = `${merchant} was added as a ${eventType}.`;
  } else if (type === "subscription") {
    const name = manualValue(values, "name", "Subscription");
    created = {
      id: localId("sub"),
      name,
      amount: Number(manualValue(values, "amount", "0")) || 0,
      cadence: manualValue(values, "cadence", "monthly"),
      nextDue: manualValue(values, "nextDue", "This month"),
      status: "active",
      confidence: 1,
      source: "manual",
    };
    state.finance = {
      ...state.finance,
      subscriptions: [created, ...(state.finance?.subscriptions || [])].slice(0, 100),
    };
    notifyTitle = "Subscription added";
    notifyBody = `${name} now appears in recurring charges.`;
  } else if (type === "savings_goal") {
    const name = manualValue(values, "name", "Savings goal");
    created = {
      id: localId("goal"),
      name,
      target: Number(manualValue(values, "target", "0")) || 0,
      current: Number(manualValue(values, "current", "0")) || 0,
      autoContribute: false,
      source: "manual",
    };
    state.finance = {
      ...state.finance,
      savingsGoals: [created, ...(state.finance?.savingsGoals || [])].slice(0, 50),
    };
    notifyTitle = "Savings goal added";
    notifyBody = `${name} is now tracked manually.`;
  }

  if (!created) return;
  saveState();
  rerender();
  await notifyUser({
    type: "manual_entry",
    title: notifyTitle,
    body: notifyBody,
    severity: "success",
    sourceEntityType: type,
  });
  logActivity({
    entityType: type,
    actionType: "manual_created",
    afterState: created,
  });
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
  if (event) {
    logActivity({
      entityType: "integration",
      entityId: isUuid(updated.id) ? updated.id : null,
      actionType: event.eventType || event.type || "updated",
      beforeState: { status: current.status, authState: current.authState, syncStatus: current.syncStatus },
      afterState: {
        provider: updated.provider,
        title: updated.displayName,
        status: updated.status,
        authState: updated.authState,
        syncStatus: updated.syncStatus,
        message: event.message,
      },
    });
  }
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
  if (!hasAccess("pro") && integration.providerType === "lms") {
    openPaywall("lms_connect", { provider });
    return;
  }
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

function courseTaskMatches(course, task) {
  if (!course || !task || task.domain !== "academy") return false;
  const courseId = String(course.id || "");
  if (courseId && String(task.courseId || "") === courseId) return true;
  if (course.sourceReviewId && String(task.sourceReviewId || "") === String(course.sourceReviewId)) return true;
  const courseCode = normalizedKey(course.code);
  const courseName = normalizedKey(course.name);
  const taskCourse = normalizedKey(task.course);
  return Boolean(taskCourse && (taskCourse === courseCode || taskCourse === courseName));
}

function courseTasks(course) {
  return state.tasks.filter((task) => courseTaskMatches(course, task));
}

function courseSourceSummary(course) {
  if (course.sourceStatus === "source_removed") return "Syllabus source removed";
  if (course.sourceType === "syllabus_parse" || course.source === "syllabus") return "From syllabus";
  return course.platform || course.plat || "Manual";
}

function updateCourseLifecycle(courseId, status) {
  if (!COURSE_STATUSES.includes(status)) return;
  let changed = null;
  state.courses = normalizeCourses(state.courses, state.academicPeriods).map((course) => {
    if (String(course.id) !== String(courseId)) return course;
    changed = {
      ...course,
      status,
      archivedAt: status === "archived" ? new Date().toISOString() : null,
    };
    return changed;
  });
  if (!changed) return;
  if (["archived", "completed", "dropped"].includes(status)) state.activeCourseId = null;
  saveState();
  rerender();
  notifyUser({
    type: "course_status",
    title: "Class updated",
    body: `${changed.name} is now ${status.replace(/_/g, " ")}.`,
    severity: status === "archived" ? "info" : "success",
  });
  logActivity({
    entityType: "course",
    entityId: isUuid(changed.id) ? changed.id : null,
    actionType: `marked_${status}`,
    afterState: { title: changed.name, status, academicPeriodId: changed.academicPeriodId },
  });
}

function moveCourseToPeriod(courseId, periodId) {
  const period = normalizeAcademicPeriods(state.academicPeriods).find((item) => String(item.id) === String(periodId));
  if (!period) return;
  let changed = null;
  state.courses = normalizeCourses(state.courses, state.academicPeriods).map((course) => {
    if (String(course.id) !== String(courseId)) return course;
    changed = { ...course, academicPeriodId: period.id };
    return changed;
  });
  if (!changed) return;
  saveState();
  rerender();
  notifyUser({
    type: "course_moved",
    title: "Class moved",
    body: `${changed.name} moved to ${period.name}.`,
    severity: "info",
  });
}

function deleteCoursePermanently(courseId) {
  const course = normalizeCourses(state.courses, state.academicPeriods).find((item) => String(item.id) === String(courseId));
  if (!course) return;
  const taskCount = state.tasks.filter((task) => courseTaskMatches(course, task)).length;
  state.courses = state.courses.filter((item) => String(item.id) !== String(courseId));
  state.tasks = state.tasks.filter((task) => !courseTaskMatches(course, task));
  state.activeCourseId = null;
  saveState();
  rerender();
  notifyUser({
    type: "course_deleted",
    title: "Class deleted",
    body: `${course.name} and ${taskCount} linked assignment${taskCount === 1 ? "" : "s"} were removed.`,
    severity: "warning",
  });
  logActivity({
    entityType: "course",
    entityId: isUuid(course.id) ? course.id : null,
    actionType: "deleted",
    beforeState: { title: course.name, taskCount, status: course.status },
  });
}

function academicProgressSummary() {
  const courses = normalizeCourses(state.courses, state.academicPeriods);
  const totalRequired = Number(state.academicProfile?.totalCreditsRequired || 120) || 120;
  const completedCredits = courses
    .filter((course) => course.status === "completed")
    .reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const activeCredits = courses
    .filter((course) => course.status === "active")
    .reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const plannedCredits = courses
    .filter((course) => course.status === "planned")
    .reduce((sum, course) => sum + Number(course.credits || 0), 0);
  const remainingCredits = Math.max(0, totalRequired - completedCredits - activeCredits - plannedCredits);
  const pct = Math.min(100, Math.round((completedCredits / totalRequired) * 100));
  const currentPeriod = normalizeAcademicPeriods(state.academicPeriods).find((period) => period.status === "current");
  const upcomingPeriod = normalizeAcademicPeriods(state.academicPeriods).find((period) => period.status === "upcoming");
  return { totalRequired, completedCredits, activeCredits, plannedCredits, remainingCredits, pct, currentPeriod, upcomingPeriod };
}

function closeActiveAcademicPeriod() {
  const periods = normalizeAcademicPeriods(state.academicPeriods);
  const current = periods.find((period) => period.status === "current") || periods.find((period) => String(period.id) === String(state.activeAcademicPeriodId));
  if (!current) return;
  const nextUpcoming = periods.find((period) => period.status === "upcoming");
  state.academicPeriods = periods.map((period) => {
    if (String(period.id) === String(current.id)) return { ...period, status: "past" };
    if (nextUpcoming && String(period.id) === String(nextUpcoming.id)) return { ...period, status: "current" };
    return period;
  });
  state.courses = normalizeCourses(state.courses, periods).map((course) => {
    if (String(course.academicPeriodId) !== String(current.id) || course.status !== "active") return course;
    const openWork = courseTasks(course).some((task) => !task.done);
    return { ...course, status: openWork ? "archived" : "completed", archivedAt: openWork ? new Date().toISOString() : course.archivedAt || null };
  });
  state.activeAcademicPeriodId = nextUpcoming?.id || current.id;
  state.activeCourseId = null;
  state.subTabs.academy = "roadmap";
  saveState();
  rerender();
  notifyUser({
    type: "term_closed",
    title: "Term closed",
    body: `${current.name} moved to past terms. Completed classes went to progress; unfinished active classes were archived for review.`,
    severity: "success",
  });
}

function requirementItemStatus(item, courses = normalizeCourses(state.courses, state.academicPeriods)) {
  if (item.overrideStatus === "satisfied") return { status: "satisfied", label: "Manually satisfied", tone: TOKENS.ok };
  if (item.overrideStatus === "waived") return { status: "waived", label: "Waived", tone: TOKENS.future };
  if (item.overrideStatus === "transfer") return { status: "transfer", label: "Transfer credit", tone: TOKENS.command };
  const code = normalizedKey(item.courseCode).replace(/\|/g, "");
  if (!code) return { status: "manual_review", label: "Needs mapping", tone: TOKENS.notebook };
  const matches = courses.filter((course) => normalizedKey(course.code).includes(code));
  if (matches.some((course) => course.status === "completed")) return { status: "satisfied", label: "Satisfied", tone: TOKENS.ok };
  if (matches.some((course) => course.status === "active")) return { status: "in_progress", label: "In progress", tone: TOKENS.academy };
  if (matches.some((course) => course.status === "planned")) return { status: "planned", label: "Planned", tone: TOKENS.future };
  return { status: "missing", label: "Missing", tone: TOKENS.warn };
}

function renderRequirementsPanel() {
  const requirements = Array.isArray(state.academicRequirements) ? state.academicRequirements.map(normalizeRequirementSet) : [];
  if (!requirements.length) {
    return `<article class="panel span-12" style="--accent:${TOKENS.academy};">${emptyState({ domain: "academy", title: "No requirement plan yet.", body: "Start with a college or high-school template, then replace it with an uploaded degree sheet or counselor checklist later.", compact: true })}<div class="requirement-template-actions"><button class="primary-action" data-requirement-template="college">Use college starter</button><button class="surface-action" data-requirement-template="high_school">Use high-school starter</button><button class="surface-action" data-upload-sheet-open>Upload checklist</button></div></article>`;
  }
  const rows = requirements.map((set) => {
    const groups = set.groups.map((group) => {
      const items = group.items.map((item) => {
        const status = requirementItemStatus(item);
        const actionPayload = `${set.id}|${group.id}|${item.id}`;
        const overrideActions = item.overrideStatus
          ? `<button class="surface-action surface-action--tiny" data-requirement-override="${escapeHtml(actionPayload)}" data-override-status="">Clear</button>`
          : `<button class="surface-action surface-action--tiny" data-requirement-override="${escapeHtml(actionPayload)}" data-override-status="satisfied">Satisfy</button><button class="surface-action surface-action--tiny" data-requirement-override="${escapeHtml(actionPayload)}" data-override-status="transfer">Transfer</button><button class="surface-action surface-action--tiny" data-requirement-override="${escapeHtml(actionPayload)}" data-override-status="waived">Waive</button>`;
        return `<div class="requirement-item" style="--accent:${status.tone};"><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.courseCode || "Manual match needed")}</span></div><div class="requirement-item__status">${pill(status.label, status.tone)}<div class="requirement-actions">${overrideActions}</div></div></div>`;
      }).join("");
      return `<section class="requirement-group"><div class="requirement-group__head"><strong>${escapeHtml(group.name)}</strong><span>${group.minCredits ? `${group.minCredits} credits` : "rule group"}</span></div>${items}</section>`;
    }).join("");
    return `<article class="panel span-12 requirement-set" style="--accent:${set.profileType === "high_school" ? TOKENS.future : TOKENS.academy};"><div class="panel-label">${escapeHtml(set.profileType.replace(/_/g, " "))} audit</div><h3>${escapeHtml(set.name)}</h3><div class="requirement-grid">${groups}</div></article>`;
  }).join("");
  return rows;
}

function updateRequirementOverride(payload, overrideStatus) {
  const [setId, groupId, itemId] = String(payload || "").split("|");
  if (!setId || !groupId || !itemId) return;
  state.academicRequirements = (state.academicRequirements || []).map((set) => normalizeRequirementSet({
    ...set,
    groups: (set.groups || []).map((group) => ({
      ...group,
      items: (group.items || []).map((item) => {
        if (String(set.id) !== setId || String(group.id) !== groupId || String(item.id) !== itemId) return item;
        return { ...item, overrideStatus: overrideStatus || "" };
      }),
    })),
  }));
  saveState();
  rerender();
}

function addCourseStudyBlock(courseId) {
  const course = normalizeCourses(state.courses, state.academicPeriods).find((item) => String(item.id) === String(courseId));
  if (!course) return;
  addManualScheduleBlock({
    domain: "academy",
    label: `${course.code || course.name} study block`,
    time: "Next open",
    mins: 60,
    course: course.code || course.name,
    courseId: course.id,
    note: `Dedicated ${course.name} focus block`,
  });
  saveState();
  rerender();
  notifyUser({
    type: "course_study_block",
    title: "Study block added",
    body: `${course.name} now has a dedicated 60-minute block in its class workspace.`,
    severity: "success",
  });
}

function applyRequirementTemplate(templateKey) {
  const template = REQUIREMENT_TEMPLATES[templateKey];
  if (!template) return;
  state.academicRequirements = [normalizeRequirementSet(clone(template))];
  state.academicProfile = {
    ...state.academicProfile,
    schoolType: template.profileType,
    programType: template.profileType === "high_school" ? "graduation_path" : "degree",
    programName: template.name,
    totalCreditsRequired: template.profileType === "high_school" ? 24 : 120,
  };
  state.subTabs.academy = "requirements";
  saveState();
  rerender();
  notifyUser({
    type: "requirement_template",
    title: "Requirement plan started",
    body: `${template.name} is now available in School Progress. Replace it with your real catalog or counselor sheet when ready.`,
    severity: "success",
  });
}

function renderEmberSplashScene() {
  return `<div class="ember-splash-scene" role="img" aria-label="Ember dawn horizon"><div class="ember-splash-sky"></div><div class="ember-sun" aria-hidden="true"></div><div class="ember-horizon-glow" aria-hidden="true"></div><svg class="ember-treeline" viewBox="0 0 320 88" aria-hidden="true"><path d="M0 76h320v12H0V76Zm5 0 18-32 14 32h12l18-46 20 46h16l17-34 13 34h16l28-56 30 56h14l18-38 17 38h17l16-30 16 30h14v12H0V76Z"></path></svg><div class="ember-reflection" aria-hidden="true"></div><div class="ember-ground" aria-hidden="true"></div><div class="ember-wordmark">${emberLogoMark("Ember")}<span>Ember</span><small>School, work, money, and energy in one morning plan.</small></div><div class="dawn-palette-strip" role="img" aria-label="Dawn to Dusk palette"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="ember-tap-hint"><span></span><small>sign in to enter</small></div></div>`;
}

function renderAuthShell() {
  const modeLabel = state.auth.mode === "sign-up" ? "Create account" : "Sign in";
  const altLabel = state.auth.mode === "sign-up" ? "Already have an account? Sign in" : "Create your first account";
  const body = !state.auth.ready
    ? `<div class="auth-card"><div class="panel-label">starting ember</div><h1>Loading your workspace...</h1><p>Checking Supabase Auth and preparing your private Ember state.</p></div>`
    : !state.auth.enabled
      ? `<div class="auth-card"><div class="panel-label">supabase setup required</div><h1>Connect Supabase to unlock first-user testing.</h1><p>${escapeHtml(state.auth.error || "Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and your local .env file, then run the Supabase schema.")}</p><div class="auth-hint"><strong>Next:</strong> run <code>supabase/schema.sql</code> in Supabase SQL Editor, then redeploy or restart the local server.</div></div>`
      : `<form class="auth-card" data-auth-form><div class="panel-label">private beta login</div><h1>${modeLabel} to Ember</h1><p>New accounts start with a clean workspace: no demo classes, no preset tasks, and no inherited connector state.</p><label class="field-shell"><div class="field-row"><span>Email</span></div><input class="search-input" type="email" autocomplete="email" value="${escapeHtml(state.auth.email)}" data-auth-email /></label><label class="field-shell"><div class="field-row"><span>Password</span></div><input class="search-input" type="password" autocomplete="${state.auth.mode === "sign-up" ? "new-password" : "current-password"}" value="${escapeHtml(state.auth.password)}" data-auth-password /></label>${state.auth.error ? `<div class="auth-error">${escapeHtml(state.auth.error)}</div>` : ""}${state.auth.message ? `<div class="auth-hint">${escapeHtml(state.auth.message)}</div>` : ""}<div class="hero-actions"><button class="primary-action" type="submit">${modeLabel}</button><button class="surface-action" type="button" data-auth-toggle>${altLabel}</button></div></form>`;
  app.innerHTML = `<div class="auth-shell auth-shell--dawn"><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><div class="auth-poster">${renderEmberSplashScene()}<div class="auth-poster-copy"><div class="eyebrow">${emberLogoMark("Ember")}<span>Dawn to Dusk</span></div><h2>Keep school, work, and money from colliding.</h2><p>Ember starts with manual entry, then gets smarter as you add syllabi, calendars, shifts, and real sources.</p></div></div>${body}</div>`;
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
  const hasBudget = Number(state.budget?.income || 0) > 0 || Number(state.budget?.spent || 0) > 0 || Number(state.budget?.left || 0) > 0 || Boolean(state.budget?.weeklyTarget);
  const hasMoneyContext = hasBudget || state.bills.length > 0 || state.paychecks.length > 0 || (state.finance?.accounts || []).length > 0 || (state.finance?.transactions || []).length > 0 || (state.finance?.subscriptions || []).length > 0;
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
      action: "Upload in Sources",
      unlocked: "Ember can start a review queue for course dates, policies, and assignment hints.",
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
      action: "Open School",
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
      action: "Open Work",
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
      action: "Open Money",
      unlocked: "Bill timing can influence warnings, weekly pressure, and next-best-move recommendations.",
      checks: [
        { label: "Add bills or subscriptions", done: state.bills.length > 0 || (state.finance?.subscriptions || []).length > 0 },
        { label: "Connect Plaid finance", done: connectorIsConnected(["plaid"], connectors) },
        { label: "Add manual money context", done: hasMoneyContext },
        { label: "Add paycheck timing", done: state.paychecks.length > 0 },
      ],
    }),
    item({
      title: "Scheduler tuning",
      headline: "Tune scheduler guardrails",
      text: "Tune the scheduler so Ember respects your real-life boundaries and preferred work style.",
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
  panel.innerHTML = `<div class="notification-head"><div><div class="panel-label">notification center</div><h4>Action state</h4><p>${state.workspace.phase2Enabled ? "Backed by Supabase records." : "Local fallback until phase2_schema.sql is active."}</p></div><button aria-label="Close notifications" data-notification-toggle>&times;</button></div><div class="notification-actions"><button class="surface-action" data-notification-read-all>Mark all read</button>${pill(`${unreadNotifications().length} unread`, unreadNotifications().length ? TOKENS.warn : TOKENS.ok)}${pill(state.notificationStatus, state.notificationStatus === "cloud" ? TOKENS.ok : TOKENS.notebook)}</div><div class="notification-list">${activeItems.length ? activeItems.map((item) => `<article class="notification-item ${item.read_at ? "is-read" : "is-unread"}" style="--accent:${item.severity === "critical" ? TOKENS.danger : item.severity === "warning" ? TOKENS.warn : item.severity === "success" ? TOKENS.ok : TOKENS.command};"><div class="notification-dot"></div><div class="notification-copy"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || "No additional detail.")}</p><small>${new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></div><div class="notification-controls"><button class="small-action" data-notification-read="${item.id}">${item.read_at ? "Read" : "Mark Read"}</button><button class="small-action" data-notification-dismiss="${item.id}">Dismiss</button></div></article>`).join("") : `<div class="empty-notifications">No active notifications. When Ember creates a real alert, it will show here first and the toast will only mirror it briefly.</div>`}</div></aside>`;
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
    { id: "widgets", title: "Open Widget Layout", subtitle: "Pin, hide, restore, and reorder Plan widgets.", domain: "command", scrollSelector: "[data-widget-manager-panel]", keywords: "widgets layout pin hide order dashboard customize" },
    { id: "connectors", title: "Open Connector Framework", subtitle: "Inspect auth, sync, webhooks, and provider lifecycle state.", domain: "command", scrollSelector: "[data-connector-panel]", widgetId: "connectors", keywords: "connect accounts canvas google calendar plaid deputy health webhook integrations" },
    { id: "activity", title: "Open Activity Log", subtitle: "Review setup, upload, connector, and review audit events.", domain: "command", scrollSelector: "[data-activity-panel]", widgetId: "activity", keywords: "activity log audit history events trace debugging" },
    { id: "sources", title: "Open Live Data Sources", subtitle: "Sync local JSON, manual payloads, and webhook-fed source data.", domain: "command", scrollSelector: "[data-source-panel]", widgetId: "sources", keywords: "live data sources json sync payload webhook" },
    { id: "constraints", title: "Open Constraint Studio", subtitle: "Tune hard guardrails, soft preferences, and human override rules.", domain: "command", scrollSelector: "[data-constraint-panel]", widgetId: "constraints", keywords: "constraints schedule guardrails overrides solver" },
    { id: "modes", title: "Open Schedule Modes", subtitle: "Preview Balanced, Focus Week, Recovery, Finals, Work-Heavy, and Catch-Up modes.", domain: "command", scrollSelector: "[data-schedule-mode-panel]", widgetId: "modes", keywords: "schedule modes focus recovery finals work heavy catch up" },
    { id: "why-plan", title: "Open Why This Plan", subtitle: "Review solver reasoning, tradeoffs, confidence, and schedule deltas.", domain: "command", scrollSelector: "[data-why-plan-panel]", widgetId: "why", keywords: "why this plan reasoning confidence tradeoffs deltas explanations" },
    { id: "uploads", title: "Upload Files", subtitle: "Open upload without leaving your current section.", action: "uploadSheet", domain: state.activeDomain || "command", keywords: "upload syllabus files notes pdf assignment sheet source" },
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
  if (item.action === "uploadSheet") {
    state.uploadSheetOpen = true;
    renderUploadSheet();
    return;
  }
  if (item.widgetId && item.domain === "command") {
    state.widgets = normalizeWidgets(state.widgets);
    const profile = activeWidgetProfile();
    state.widgets.commandProfiles[profile] = commandWidgets().map((widget) => (widget.id === item.widgetId ? { ...widget, visible: true } : widget));
    state.widgets.command = state.widgets.commandProfiles.guided;
  }
  if (item.domain) setActiveDomain(item.domain);
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
  panel.innerHTML = `<div class="mobile-nav-sheet__scrim" data-mobile-nav-close></div><div class="mobile-nav-sheet__panel" role="dialog" aria-modal="true" aria-label="Mobile navigation"><div class="mobile-nav-grabber"></div><div class="mobile-nav-head"><div><div class="panel-label">navigation</div><h4>Move through Ember</h4><p>${escapeHtml(profile.label)} layout profile is active.</p></div><button class="surface-action surface-action--small" data-mobile-nav-close aria-label="Close mobile menu">Close</button></div><div class="mobile-nav-actions"><button class="primary-action" data-command-open data-mobile-nav-close>Search everything</button><button class="surface-action" data-domain="command" data-scroll-personalization data-mobile-nav-close>Personalize</button><button class="surface-action" data-command-action="uploads" data-mobile-nav-close>Upload files</button></div><nav class="mobile-nav-grid" aria-label="Mobile sections">${DOMAINS.map((domain) => `<button class="mobile-nav-item ${state.activeDomain === domain.id ? "is-active" : ""}" data-domain="${domain.id}" data-mobile-nav-close style="--accent:${colorFor(domain.id)};" aria-current="${state.activeDomain === domain.id ? "page" : "false"}"><span>${iconSvg(domain.id, domain.label)}</span><strong>${domain.label}</strong><small>${domain.blurb}</small></button>`).join("")}</nav></div>`;
}

function closeMobileNavSheet() {
  state.mobileNavOpen = false;
  renderMobileNavSheet();
}

function renderUploadSheet() {
  let panel = doc?.querySelector("[data-upload-sheet]");
  if (!state.uploadSheetOpen) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-upload-sheet", "");
    doc.body.appendChild(panel);
  }
  const prefs = normalizePreferences(state.preferences);
  const domain = activeDomain();
  const uploads = state.uploadedFiles.map(normalizeUpload).slice(0, 5);
  const reviews = state.syllabusReviews.map(normalizeSyllabusReview).slice(0, 4);
  const uploadRows = uploads.map((file) => {
    const review = state.syllabusReviews.map(normalizeSyllabusReview).find((item) => String(item.uploadId) === String(file.id));
    return `<div class="upload-sheet-row"><div><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.textStatus)}${file.extractionMethod ? ` via ${escapeHtml(file.extractionMethod)}` : ""}${review ? ` | ${escapeHtml(review.parseStatus.replace(/_/g, " "))}` : ""}</span></div><div class="row-actions">${review ? `<button class="surface-action surface-action--small" data-domain="notebook">Review</button>` : `<button class="surface-action surface-action--small" data-syllabus-start="${escapeHtml(file.id)}">Review as syllabus</button>`}<button class="surface-action surface-action--small danger-action" data-upload-remove="${escapeHtml(file.id)}" aria-label="Remove ${escapeHtml(file.name)}">Remove</button></div></div>`;
  }).join("");
  const reviewRows = reviews.map((review) => `<div class="upload-sheet-row"><strong>${escapeHtml(review.title)}</strong><span>${escapeHtml(review.parseStatus.replace(/_/g, " "))} | ${Math.round((review.confidence || 0) * 100)}% confidence</span>${review.parseStatus === "confirmed" ? "" : `<button class="surface-action surface-action--small" data-syllabus-confirm="${escapeHtml(review.id)}">Confirm</button>`}</div>`).join("");
  panel.className = `upload-sheet theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<div class="upload-sheet__scrim" data-upload-sheet-close></div><div class="upload-sheet__panel" role="dialog" aria-modal="true" aria-label="Upload source files"><div class="mobile-nav-grabber"></div><div class="upload-sheet__head"><div><div class="panel-label">source upload</div><h4>Upload without leaving ${escapeHtml(domain?.label || "this section")}</h4><p>Ember will extract text, run syllabus parsing, and create a review card in the background. You stay right where you are.</p></div><button class="surface-action surface-action--small" data-upload-sheet-close aria-label="Close upload">Close</button></div><label class="upload-zone upload-zone--sheet"><input type="file" multiple data-file-upload /><span>Choose syllabus, notes, PDFs, DOCX, TXT, or images</span><small>Parsed results stay in review until you confirm them.</small></label><div class="upload-sheet__stats"><article><div class="panel-label">recent files</div>${uploadRows || `<p class="row-subtitle">No files uploaded yet.</p>`}</article><article><div class="panel-label">review queue</div>${reviewRows || `<p class="row-subtitle">No review cards yet.</p>`}</article></div><div class="footer-note">Tip: confirming a syllabus now creates an Academy course and extracted assignment or exam tasks when the parser finds them.</div></div>`;
}

function closeUploadSheet() {
  state.uploadSheetOpen = false;
  renderUploadSheet();
}

function renderPaywallSheet() {
  let panel = doc?.querySelector("[data-paywall-sheet]");
  if (!state.paywall?.open) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-paywall-sheet", "");
    doc.body.appendChild(panel);
  }
  const prefs = normalizePreferences(state.preferences);
  const trigger = PAYWALL_TRIGGERS[state.paywall.trigger] || PAYWALL_TRIGGERS.auto_plan;
  const planMarkup = PLAN_CARDS.map((plan) => `<article class="paywall-card ${plan.id === "pro_monthly" ? "is-featured" : ""}"><div class="paywall-card__head"><div><span>${escapeHtml(plan.title)}</span><strong>${escapeHtml(plan.price)}</strong><small>${escapeHtml(plan.meta)}</small></div>${plan.badge ? `<em>${escapeHtml(plan.badge)}</em>` : ""}</div><ul>${plan.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><button class="${plan.id === "pro_monthly" ? "primary-action" : "surface-action"}" data-plan-select="${escapeHtml(plan.id)}">${escapeHtml(plan.button)}</button>${plan.id === "pro_monthly" ? `<p class="paywall-trial">7-day free trial</p>` : ""}</article>`).join("");
  const secondary = trigger.secondaryAction
    ? `<button class="surface-action" data-paywall-secondary="${escapeHtml(trigger.secondaryAction)}">${escapeHtml(trigger.secondary)}</button>`
    : `<button class="surface-action" data-paywall-close>${escapeHtml(trigger.secondary || "Stay Free")}</button>`;
  panel.className = `paywall-sheet theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<div class="paywall-sheet__scrim" data-paywall-close></div><div class="paywall-sheet__panel" role="dialog" aria-modal="true" aria-label="Upgrade Ember"><div class="mobile-nav-grabber"></div><section class="paywall-hero"><div><div class="panel-label">${escapeHtml(trigger.eyebrow || "upgrade")}</div><h3>Stop guessing what's due.</h3><p>${escapeHtml(trigger.body || "Turn syllabi, assignments, work shifts, and calendar conflicts into one clean weekly plan.")}</p><div class="paywall-trigger-note"><strong>${escapeHtml(trigger.title)}</strong><span>Manual entry stays available. Upgrade only when automation is worth it.</span></div><div class="paywall-actions"><button class="primary-action" data-plan-select="pro_monthly">${escapeHtml(trigger.primary || "Start Pro")}</button>${secondary}</div></div><div class="paywall-preview" aria-label="Pro value preview"><span>weekly plan</span><strong>Classes + shifts + due dates</strong><small>Conflicts show before they hurt your grade.</small><div class="paywall-preview__line"></div><div class="paywall-preview__row"><b>Mon</b><i>Lab due</i></div><div class="paywall-preview__row"><b>Wed</b><i>Shift conflict</i></div><div class="paywall-preview__row"><b>Fri</b><i>Study block</i></div></div></section><ul class="paywall-benefits"><li>Auto-import deadlines from syllabi</li><li>Sync Canvas, Blackboard, or D2L</li><li>Catch school vs work conflicts early</li><li>Build your week in minutes</li><li>Keep everything in one place</li></ul><section class="paywall-pricing">${planMarkup}</section><section class="semester-pass"><div><span>Semester Pass</span><strong>$14.99 one time</strong><p>Get Pro for one semester without a subscription.</p></div><button class="surface-action" data-plan-select="semester_pass">Choose Semester Pass</button></section><footer class="paywall-trust"><span>Cancel anytime</span><span>Student-friendly pricing</span><span>No ads</span><span>Your data stays yours</span></footer><button class="paywall-close-link" data-paywall-close>Continue free</button></div>`;
}

function openManualEntrySheet(type) {
  state.manualEntry = { open: true, type, error: "" };
  renderManualEntrySheet();
}

function closeManualEntrySheet() {
  state.manualEntry = { open: false, type: "", error: "" };
  renderManualEntrySheet();
}

function renderManualEntrySheet() {
  let panel = doc?.querySelector("[data-manual-entry-sheet]");
  if (!state.manualEntry?.open) {
    panel?.remove();
    return;
  }
  const config = MANUAL_ENTRY_CONFIG[state.manualEntry.type];
  if (!config) {
    state.manualEntry = { open: false, type: "", error: "" };
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-manual-entry-sheet", "");
    doc.body.appendChild(panel);
  }
  const prefs = normalizePreferences(state.preferences);
  const fields = config.fields.map((field) => `<label class="manual-entry-field"><span>${escapeHtml(field.label)}${field.optional ? " <small>optional</small>" : ""}</span><input name="${escapeHtml(field.key)}" type="${escapeHtml(field.inputType || "text")}" placeholder="${escapeHtml(field.placeholder || "")}" ${field.required ? "required" : ""} /></label>`).join("");
  panel.className = `manual-entry-sheet theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<div class="manual-entry-sheet__scrim" data-manual-entry-close></div><form class="manual-entry-sheet__panel" data-manual-entry-form="${escapeHtml(state.manualEntry.type)}" role="dialog" aria-modal="true" aria-label="${escapeHtml(config.title)}"><div class="mobile-nav-grabber"></div><div class="manual-entry-sheet__head"><div><div class="panel-label">${escapeHtml(config.eyebrow)}</div><h4>${escapeHtml(config.title)}</h4><p>${escapeHtml(config.body)}</p></div><button class="surface-action surface-action--small" type="button" data-manual-entry-close aria-label="Close manual entry">Close</button></div>${state.manualEntry.error ? `<div class="auth-error">${escapeHtml(state.manualEntry.error)}</div>` : ""}<div class="manual-entry-fields">${fields}</div><div class="manual-entry-actions"><button class="primary-action" type="submit">${escapeHtml(config.submit)}</button><button class="surface-action" type="button" data-manual-entry-close>Cancel</button></div><p class="footer-note">Connected when possible. Manual when needed.</p></form>`;
}

function themeButtonMarkup([id, theme]) {
  const prefs = normalizePreferences(state.preferences);
  const active = prefs.themeFamily === id;
  return `<button class="theme-card ${active ? "is-active" : ""}" data-appearance-theme="${escapeHtml(id)}" style="--theme-card-gradient:${theme.tokens.gradientA}; --accent:${theme.tokens.accent1};" aria-pressed="${active}"><span class="theme-card__swatch"></span><strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(theme.vibe)}</small></button>`;
}

function customThemeButtonMarkup(theme) {
  const prefs = normalizePreferences(state.preferences);
  const id = `custom:${theme.id}`;
  const active = prefs.themeFamily === id;
  return `<button class="theme-card ${active ? "is-active" : ""}" data-appearance-theme="${escapeHtml(id)}" style="--theme-card-gradient:${theme.tokens.gradientA}; --accent:${theme.tokens.accent1};" aria-pressed="${active}"><span class="theme-card__swatch"></span><strong>${escapeHtml(theme.name)}</strong><small>Custom theme</small></button>`;
}

function builderField(label, key, type = "color", extra = "") {
  return `<label class="builder-field"><span>${escapeHtml(label)}</span><input type="${type}" value="${escapeHtml(state.themeDraft?.[key] ?? "")}" data-theme-draft="${escapeHtml(key)}" ${extra} /></label>`;
}

function renderThemeBuilderLegacy() {
  if (!state.themeBuilderOpen) return "";
  const preview = themeFromDraft(state.themeDraft);
  return `<div class="theme-builder"><div class="settings-subhead"><div><div class="panel-label">my theme</div><h4>Build your own Ember.</h4></div><button class="surface-action surface-action--small" data-theme-builder-close>Close</button></div><div class="theme-builder-grid"><section><div class="subtle-label">Base</div>${builderField("Theme name", "name", "text")}${builderField("Background", "background")}${builderField("Surface", "surface")}${builderField("Text", "text")}${builderField("Text secondary", "textSecondary")}</section><section><div class="subtle-label">Accent colors</div>${builderField("Primary", "primary")}${builderField("Secondary", "secondary")}${builderField("Highlight", "highlight")}${builderField("Border", "border")}<label class="builder-field"><span>Gradient style</span><select data-theme-draft="gradientStyle">${["linear", "radial", "conic"].map((value) => `<option value="${value}" ${state.themeDraft.gradientStyle === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="builder-field"><span>Gradient angle</span><input type="range" min="0" max="360" value="${Number(state.themeDraft.gradientAngle || 135)}" data-theme-draft="gradientAngle" /></label></section><section class="builder-preview" style="--theme-card-gradient:${preview.tokens.gradientA}; --accent:${preview.tokens.accent1};"><div class="panel-label">live preview</div><h4>${escapeHtml(preview.name)}</h4><p>${escapeHtml(preview.personality)}</p><div class="preview-mini-card"><strong>Study block</strong><span>45m focus · source-grounded</span></div><button class="primary-action" data-theme-save>Save to My Themes</button></section></div></div>`;
}

function renderThemeBuilderMarkup() {
  if (!state.themeBuilderOpen) return "";
  const preview = themeFromDraft(state.themeDraft);
  return `<div class="theme-builder"><div class="settings-subhead"><div><div class="panel-label">my theme</div><h4>Build your own Ember.</h4></div><button class="surface-action surface-action--small" data-theme-builder-close>Close</button></div><div class="theme-builder-grid"><section><div class="subtle-label">Base</div>${builderField("Theme name", "name", "text")}${builderField("Background", "background")}${builderField("Surface", "surface")}${builderField("Text", "text")}${builderField("Text secondary", "textSecondary")}</section><section><div class="subtle-label">Accent colors</div>${builderField("Primary", "primary")}${builderField("Secondary", "secondary")}${builderField("Highlight", "highlight")}${builderField("Border", "border")}${builderField("Gradient color A", "gradientColorA")}${builderField("Gradient color B", "gradientColorB")}<label class="builder-field"><span>Gradient style</span><select data-theme-draft="gradientStyle">${["linear", "radial", "conic"].map((value) => `<option value="${value}" ${state.themeDraft.gradientStyle === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="builder-field"><span>Gradient angle</span><input type="range" min="0" max="360" value="${Number(state.themeDraft.gradientAngle || 135)}" data-theme-draft="gradientAngle" /></label></section><section class="builder-preview" style="--theme-card-gradient:${preview.tokens.gradientA}; --accent:${preview.tokens.accent1};"><div class="panel-label">live preview</div><h4>${escapeHtml(preview.name)}</h4><p>${escapeHtml(preview.personality)}</p><div class="preview-mini-card"><strong>Study block</strong><span>45m focus - source-grounded</span></div><button class="primary-action" data-theme-save>Save to My Themes</button></section></div></div>`;
}

function renderThemeBuilder() {
  return renderThemeBuilderMarkup();
}

function renderAppearanceSettings() {
  let panel = doc?.querySelector("[data-appearance-settings]");
  const prefs = normalizePreferences(state.preferences);
  if (!state.auth.user) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = doc.createElement("aside");
    panel.setAttribute("data-appearance-settings", "");
    doc.body.appendChild(panel);
  }
  const current = currentThemeDefinition();
  const themeRows = Object.entries(EMBER_THEMES).map(themeButtonMarkup).join("");
  const customRows = (state.customThemes || []).map(customThemeButtonMarkup).join("");
  panel.className = `appearance-settings ${state.appearancePanelOpen ? "is-open" : ""} theme-${prefs.theme} text-${prefs.fontScale}`;
  panel.innerHTML = `<button class="appearance-fab" data-appearance-toggle aria-label="${state.appearancePanelOpen ? "Close appearance settings" : "Open appearance settings"}" aria-expanded="${state.appearancePanelOpen}">${iconSvg("command", "Appearance settings")}</button>${state.appearancePanelOpen ? `<div class="appearance-panel" role="dialog" aria-modal="false" aria-label="Appearance settings"><div class="appearance-head"><div><div class="panel-label">appearance settings</div><h3>Make Ember yours.</h3><p>${escapeHtml(current.personality)}</p></div><button class="surface-action surface-action--small" data-appearance-toggle>Close</button></div><section><div class="settings-subhead"><div><div class="panel-label">themes</div><h4>Curated collections</h4></div>${pill(current.name, current.tokens.accent1)}</div><div class="theme-card-grid">${themeRows}</div></section><section><div class="settings-subhead"><div><div class="panel-label">my themes</div><h4>Saved identities</h4></div><button class="surface-action surface-action--small" data-theme-builder-open>+ Create New Theme</button></div><div class="theme-card-grid theme-card-grid--custom">${customRows || `<div class="empty-theme-row">No saved themes yet. Create one and it will live here.</div>`}</div>${renderThemeBuilder()}</section><section><div class="settings-subhead"><div><div class="panel-label">feel</div><h4>Reading and motion</h4></div></div><div class="settings-control-grid"><label><span>Font size</span><input type="range" min="0" max="2" value="${["standard", "large", "xl"].indexOf(prefs.fontScale)}" data-appearance-range="fontScale" /></label><label><span>Card blur</span><input type="range" min="0" max="42" value="${prefs.cardBlur}" data-appearance-number="cardBlur" /></label><label><span>Surface opacity</span><input type="range" min="18" max="96" value="${prefs.surfaceOpacity}" data-appearance-number="surfaceOpacity" /></label></div><div class="settings-toggle-row">${PREFERENCE_OPTIONS.borderStyle.map(([value, label]) => `<button class="preference-chip ${prefs.borderStyle === value ? "is-active" : ""}" data-appearance-pref="borderStyle" data-appearance-value="${value}">${label}</button>`).join("")}${PREFERENCE_OPTIONS.animations.map(([value, label]) => `<button class="preference-chip ${prefs.animations === value ? "is-active" : ""}" data-appearance-pref="animations" data-appearance-value="${value}">Animations ${label}</button>`).join("")}${PREFERENCE_OPTIONS.compactMode.map(([value, label]) => `<button class="preference-chip ${prefs.compactMode === value ? "is-active" : ""}" data-appearance-pref="compactMode" data-appearance-value="${value}">Compact ${label}</button>`).join("")}</div></section><section class="accent-override-row"><div><div class="panel-label">accent override</div><p>Override domain colors with your theme accent.</p></div><button class="toggle-chip ${prefs.accentOverride === "on" ? "is-active" : ""}" data-appearance-pref="accentOverride" data-appearance-value="${prefs.accentOverride === "on" ? "off" : "on"}"><strong>${prefs.accentOverride === "on" ? "On" : "Off"}</strong></button></section></div>` : ""}`;
}

function updateAppearancePreference(key, value) {
  const fontScaleValues = ["standard", "large", "xl"];
  const nextValue = key === "fontScale" && /^\d+$/.test(String(value)) ? fontScaleValues[Number(value)] || "standard" : value;
  state.preferences = normalizePreferences({
    ...(state.preferences || DEFAULT_PREFERENCES),
    [key]: nextValue,
    ...(key === "themeFamily" ? { gradientProfile: DEFAULT_PREFERENCES.gradientProfile } : {}),
  });
  applyTheme();
  syncShellPreferenceClasses();
  saveState();
  scheduleCloudSave();
  renderAppearanceSettings();
}

function updateThemeDraft(key, value) {
  state.themeDraft = { ...(state.themeDraft || defaultThemeDraft()), [key]: value };
  renderAppearanceSettings();
}

function saveThemeDraft() {
  const theme = themeFromDraft(state.themeDraft);
  state.customThemes = [theme, ...(state.customThemes || []).filter((item) => item.id !== theme.id)].slice(0, 12);
  saveCustomThemes();
  updateAppearancePreference("themeFamily", `custom:${theme.id}`);
  state.themeBuilderOpen = false;
  state.themeDraft = defaultThemeDraft(theme);
  renderAppearanceSettings();
  void notifyUser({ type: "theme_saved", title: "Theme saved", body: `${theme.name} is now available in My Themes.`, severity: "success" });
}

const money = (value) => {
  const amount = Number(value || 0);
  return amount < 0 ? `-$${Math.abs(amount).toFixed(0)}` : `$${amount.toFixed(0)}`;
};

function compactSourceText(value, max = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

function amountNumber(value) {
  return Number(String(value || 0).replace(/[^0-9.-]/g, "")) || 0;
}

function buildMoneyInsights() {
  const finance = state.finance || {};
  const accounts = Array.isArray(finance.accounts) ? finance.accounts : [];
  const transactions = Array.isArray(finance.transactions) ? finance.transactions : [];
  const subscriptions = Array.isArray(finance.subscriptions) ? finance.subscriptions : [];
  const savingsGoals = Array.isArray(finance.savingsGoals) ? finance.savingsGoals : [];
  const accountCash = accounts.reduce((sum, account) => sum + amountNumber(account.balance), 0);
  const fallbackCash = Number(state.budget.left || 0);
  const cashOnHand = accountCash || fallbackCash;
  const billTotal = state.bills.reduce((sum, bill) => sum + amountNumber(bill.amount), 0);
  const subscriptionTotal = subscriptions.reduce((sum, item) => sum + amountNumber(item.amount), 0);
  const paycheckIncome = state.paychecks.reduce((sum, item) => sum + amountNumber(item.amount), 0);
  const transactionIncome = transactions.filter((item) => item.eventType === "income").reduce((sum, item) => sum + Math.abs(amountNumber(item.amount)), 0);
  const transactionSpend = transactions.filter((item) => item.eventType !== "income").reduce((sum, item) => sum + Math.abs(Math.min(amountNumber(item.amount), 0)), 0);
  const weeklyTarget = Number(state.budget.weeklyTarget || 0);
  const safeToSpend = Math.max(0, cashOnHand + paycheckIncome + transactionIncome - billTotal - subscriptionTotal - weeklyTarget - transactionSpend);
  return {
    accounts,
    transactions,
    subscriptions,
    savingsGoals,
    cashOnHand,
    billTotal,
    subscriptionTotal,
    incomeTotal: paycheckIncome + transactionIncome,
    transactionSpend,
    weeklyTarget,
    safeToSpend,
    recurringCount: state.bills.length + subscriptions.length,
  };
}

function heroActionButton([label, action], index) {
  const className = index === 0 ? "primary-action" : "surface-action";
  if (String(action).startsWith("manual:")) return `<button class="${className}" data-manual-entry="${escapeHtml(action.replace("manual:", ""))}">${escapeHtml(label)}</button>`;
  if (action === "upload") return `<button class="${className}" data-upload-sheet-open>${escapeHtml(label)}</button>`;
  if (action === "connectors") return `<button class="${className}" data-domain="command" data-scroll-connectors>${escapeHtml(label)}</button>`;
  if (action === "modes") return `<button class="${className}" data-domain="command" data-scroll-modes>${escapeHtml(label)}</button>`;
  if (action === "focus") return `<button class="${className}" data-focus-top>${escapeHtml(label)}</button>`;
  if (action === "mind_checkin") return `<button class="${className}" data-domain="mind">${escapeHtml(label)}</button>`;
  return `<button class="${className}" data-domain="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function emberAtmosphereBand(intel) {
  const domain = activeDomain();
  const atmosphere = DOMAIN_ATMOSPHERES[domain.id] || DOMAIN_ATMOSPHERES.command;
  const loadValue = intel.loadDisplay || `${intel.loadScore}%`;
  return `<section class="ember-atmosphere ember-atmosphere--${escapeHtml(domain.id)}" style="--accent:${colorFor(domain.id)};"><div class="ember-atmosphere__orb" aria-hidden="true">${emberLogoMark("Ember")}</div><div class="ember-atmosphere__copy"><div class="panel-label">${escapeHtml(atmosphere.label)}</div><h2>${escapeHtml(atmosphere.title)}</h2><p>${escapeHtml(atmosphere.body)}</p></div><div class="ember-atmosphere__meta"><span>${escapeHtml(atmosphere.temperature)}</span><strong>${escapeHtml(loadValue)}</strong><small>${escapeHtml(state.scheduleMode || "balanced")} plan</small></div></section>`;
}

function renderEmberDock() {
  const dockDomains = ["command", "academy", "works", "life", "notebook", "mind"];
  return `<nav class="ember-dock" aria-label="Primary app dock">${dockDomains.map((id) => {
    const item = DOMAINS.find((domain) => domain.id === id);
    if (!item) return "";
    return `<button class="ember-dock__item ${state.activeDomain === id ? "is-active" : ""}" data-domain="${escapeHtml(id)}" style="--accent:${colorFor(id)};" aria-current="${state.activeDomain === id ? "page" : "false"}"><span>${iconSvg(id, item.label)}</span><strong>${escapeHtml(item.label)}</strong></button>`;
  }).join("")}<button class="ember-dock__item ember-dock__item--search" data-command-open aria-label="Open command palette"><span>${iconSvg("command", "Search")}</span><strong>Search</strong></button></nav>`;
}

function heroBand(intel) {
  const domain = activeDomain();
  const identity = SECTION_IDENTITY[domain.id] || SECTION_IDENTITY.command;
  const loadValue = intel.loadDisplay || `${intel.loadScore}%`;
  const loadMode = intel.loadLabel === "setup" ? "setup mode" : intel.loadScore >= 70 ? "stabilize mode" : "balanced mode";
  const importedShiftCount = connectorIsConnected(["deputy"]) ? SHIFTS.length : 0;
  const importedShiftPay = connectorIsConnected(["deputy"]) ? SHIFTS.reduce((sum, shift) => sum + Number(shift.pay || 0), 0) : 0;
  const hasFutureContext = state.tasks.some((task) => task.domain === "future") || state.notes.some((note) => normalizeNote(note).domain === "future");
  const moneyInsights = buildMoneyInsights();
  const statValues = {
    command: [loadValue, intel.conflicts.length, `${intel.solverSummary.scheduledMinutes}m`, intel.solverSummary.hardGuardrails],
    academy: [state.courses.length, state.tasks.filter((task) => task.domain === "academy" && !task.done).length, `${intel.solverSummary.scheduledMinutes}m`, intel.courseInsights.filter((course) => course.exam).length],
    works: [state.schedule.filter((item) => item.domain === "works").length + importedShiftCount, state.tasks.filter((task) => task.domain === "works" && !task.done).length, `${intel.solverSummary.scheduledMinutes}m`, importedShiftPay ? `$${importedShiftPay}` : "--"],
    life: [money(moneyInsights.safeToSpend), moneyInsights.recurringCount, money(moneyInsights.incomeTotal), money(moneyInsights.cashOnHand)],
    future: [hasFutureContext ? GOALS.length : 0, hasFutureContext ? MILESTONES.length : 0, hasFutureContext ? CAREER_SKILLS.length : 0, state.tasks.filter((task) => task.domain === "future" && !task.done).length],
    mind: [state.checkin.energy || "--", burnoutRisk(intel), state.schedule.filter((item) => item.domain === "mind").length, loadValue],
    notebook: [state.uploadedFiles.length, state.syllabusReviews.length, state.notes.length, state.syllabusReviews.filter((review) => review.parseStatus === "needs_review").length],
  }[domain.id] || [loadValue, intel.openUrgentCount, `${intel.solverSummary.scheduledMinutes}m`, intel.solverSummary.hardGuardrails];
  return `${emberAtmosphereBand(intel)}<section class="hero-band hero-band--${domain.id}" style="--accent:${colorFor(domain.id)};"><div class="hero-copy"><div class="eyebrow">${iconSvg(domain.id)}<span>${escapeHtml(identity.eyebrow)}</span></div><h3>${escapeHtml(identity.title)}</h3><p>${escapeHtml(identity.body)}</p><div class="hero-actions">${identity.actions.map(heroActionButton).join("")}${pill(loadMode, intel.loadScore >= 70 ? TOKENS.warn : colorFor(domain.id))}</div></div><div class="hero-stats">${identity.stats.map((label, index) => `<div class="hero-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(statValues[index] ?? "--")}</strong></div>`).join("")}</div></section>`;
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
  return `<article class="panel span-12" data-why-plan-panel style="--accent:${TOKENS.command};"><div class="panel-label">why this plan?</div><div class="why-plan-layout"><div class="why-plan-main"><h3 class="empty-title">${escapeHtml(explanation.primaryReason)}</h3><p class="row-subtitle">Confidence ${explanation.confidence}% &middot; ${SCHEDULE_MODES[state.scheduleMode]?.label || "Balanced"} mode</p><div class="why-list">${explanation.supportingReasons.map((reason) => `<div><span>Reason</span><strong>${escapeHtml(reason)}</strong></div>`).join("")}</div></div><div class="why-plan-side"><div class="subtle-label">Constraints applied</div><div class="inline-chips">${explanation.constraintsApplied.map((item) => pill(item, TOKENS.command)).join("")}</div><div class="subtle-label" style="margin-top:1rem;">Tradeoffs</div><div class="why-list why-list--compact">${explanation.tradeoffs.map((item) => `<div><span>Tradeoff</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div></div></div><div class="plan-change-card" style="--accent:${changeTone};"><div><div class="subtle-label">what changed since last plan</div><h4>${escapeHtml(changes.summary || "Plan comparison is warming up.")}</h4><p class="row-subtitle">${escapeHtml(changedAt)}</p></div><div class="why-list why-list--compact">${(changes.items || ["Ember will compare the next schedule recalculation against this baseline."]).map((item) => `<div><span>Delta</span><strong>${escapeHtml(item)}</strong></div>`).join("")}</div></div>${unscheduled.length ? `<div class="unscheduled-strip"><div class="subtle-label">unscheduled carryover</div>${unscheduled.slice(0, 4).map((chunk) => `<div class="row" style="--accent:${colorFor(chunk.domain)};"><div class="row-badge">${chunk.urgent ? "!" : "~"}</div><div class="row-copy"><div class="row-title">${escapeHtml(chunk.title)}</div><div class="row-subtitle">${escapeHtml(chunk.why)}</div></div>${pill(`${chunk.minutes}m`, colorFor(chunk.domain))}</div>`).join("")}</div>` : `<div class="footer-note">No unscheduled carryover under the current guardrails.</div>`}</article>`;
}

function renderSourcePanel() {
  const source = state.sourceConfig;
  return `<article class="panel span-6" data-source-panel style="--accent:${TOKENS.notebook};"><div class="panel-label">live data sources</div><div class="source-shell"><label class="field-shell"><div class="field-row"><span>Remote JSON URL</span><strong>${source.lastSyncStatus}</strong></div><input class="search-input" type="url" value="${escapeHtml(source.remoteUrl)}" placeholder="https://example.com/ember.json" data-source-url /></label><div class="source-actions"><button class="surface-action" data-use-local-source>Use local live source</button>${pill("/api/source/live", TOKENS.command)}</div><div class="field-row"><span>Auto-sync every minute</span><button class="toggle-chip ${source.autoSync ? "is-active" : ""}" data-source-toggle="autoSync" style="--accent:${TOKENS.command};"><strong>${source.autoSync ? "On" : "Off"}</strong></button></div><div class="source-actions"><button class="primary-action" data-sync-source>Sync now</button><button class="surface-action" data-reset-source>Status reset</button>${pill(source.lastSyncStatus, statusTone(source.lastSyncStatus))}</div><div class="meta-grid"><div class="metric-stack"><span>Last sync</span><strong>${formatTimestamp(source.lastSyncAt)}</strong></div><div class="metric-stack"><span>Error</span><strong>${escapeHtml(source.lastError || "None")}</strong></div></div><label class="field-shell"><div class="field-row"><span>Manual payload</span><strong>JSON merge</strong></div><textarea class="brain-dump source-draft" placeholder='{"tasks":[...],"constraints":{"soft":{"keepEveningLight":7}}}' data-source-draft>${escapeHtml(source.draftPayload)}</textarea></label><div class="source-actions"><button class="primary-action" data-apply-source>Apply payload</button></div></div><div class="footer-note">Supported keys: <code>tasks</code>, <code>courses</code>, <code>schedule</code>, <code>bills</code>, <code>budget</code>, <code>paychecks</code>, <code>checkin</code>, and <code>constraints</code>. The bundled local server also exposes calendar, LMS, and webhook routes behind this source path.</div></article>`;
}

function renderConnectorPanel() {
  const connectors = mergeIntegrationTemplates();
  return `<article class="panel span-6" data-connector-panel style="--accent:${TOKENS.command};"><div class="panel-label">connector framework</div><h3 class="empty-title">Every integration has an inspectable lifecycle.</h3><p class="row-subtitle">Connectors now track auth, webhooks, sync health, token refresh, last result, and event history instead of relying on one-off button state.</p><div class="connector-grid">${connectors.map((item) => {
    const events = Array.isArray(item.metadata?.events) ? item.metadata.events : [];
    return `<div class="connector-card" style="--accent:${colorFor(item.domain)};"><div class="connector-card__head"><div class="row-badge">${iconSvg(item.domain, item.displayName)}</div><div><strong>${escapeHtml(item.displayName)}</strong><small>${escapeHtml(item.providerType)} &middot; ${escapeHtml(item.status)}</small></div></div><p>${escapeHtml(item.description)}</p><div class="connector-status-grid">${pill(`Auth: ${item.authState}`, connectorTone(item.authState))}${pill(`Sync: ${item.syncStatus}`, connectorTone(item.syncStatus))}${pill(`Webhook: ${item.webhookStatus}`, connectorTone(item.webhookStatus))}${pill(`Refresh: ${item.refreshStatus}`, connectorTone(item.refreshStatus))}</div><div class="inline-chips">${item.scopes.slice(0, 3).map((scope) => pill(scope, colorFor(item.domain))).join("")}${pill(item.local ? "local" : "cloud", item.local ? TOKENS.warn : TOKENS.ok)}</div><div class="meta-grid connector-meta-grid"><div class="metric-stack"><span>Last sync</span><strong>${formatTimestamp(item.lastSyncedAt)}</strong></div><div class="metric-stack"><span>Next sync</span><strong>${formatTimestamp(item.nextSyncAt)}</strong></div><div class="metric-stack"><span>Last test</span><strong>${formatTimestamp(item.lastTestedAt)}</strong></div><div class="metric-stack"><span>Token expires</span><strong>${formatTimestamp(item.tokenExpiresAt)}</strong></div><div class="metric-stack"><span>Errors</span><strong>${item.errorCount}</strong></div><div class="metric-stack"><span>Token ref</span><strong>${item.tokenRef ? "stored" : "none"}</strong></div></div><div class="connector-result"><span>Last result</span><strong>${escapeHtml(summarizeConnectorResult(item.lastSyncResult))}</strong></div>${item.lastError ? `<div class="connector-error">${escapeHtml(item.lastError)}</div>` : ""}<div class="connector-log">${events.length ? events.slice(0, 3).map((event) => `<div><span>${escapeHtml(event.type || "event")} &middot; ${formatTimestamp(event.createdAt)}</span><strong>${escapeHtml(event.message || "Connector event recorded.")}</strong></div>`).join("") : `<div><span>No events yet</span><strong>Use Connect, Test, or Sync to create the first connector event.</strong></div>`}</div><div class="source-actions connector-actions"><button class="surface-action surface-action--small" data-integration-connect="${escapeHtml(item.provider)}">${item.status === "connected" ? "Reconnect" : "Connect"}</button><button class="surface-action surface-action--small" data-integration-test="${escapeHtml(item.provider)}">Test</button><button class="surface-action surface-action--small" data-integration-sync="${escapeHtml(item.provider)}">Sync now</button><button class="surface-action surface-action--small" data-integration-reauth="${escapeHtml(item.provider)}">Re-auth</button><button class="surface-action surface-action--small" data-integration-disconnect="${escapeHtml(item.provider)}">Disconnect</button></div></div>`;
  }).join("")}</div><div class="footer-note">Canvas, Google Calendar, and Ember webhook can call local endpoints now. Plaid, Deputy, and Health now have lifecycle records and logs so the real provider flows can plug in cleanly.</div></article>`;
}

function preferenceButtons(key) {
  const current = state.preferences?.[key] || DEFAULT_PREFERENCES[key];
  return `<div class="preference-button-row ${key === "gradientProfile" ? "preference-button-row--swatches" : ""}">${PREFERENCE_OPTIONS[key].map(([value, label]) => {
    const gradient = key === "gradientProfile" ? selectedGradient(value) : null;
    return `<button class="preference-chip ${key === "gradientProfile" ? "preference-chip--gradient" : ""} ${current === value ? "is-active" : ""}" data-preference-key="${key}" data-preference-value="${value}" aria-pressed="${current === value}" style="--accent:${selectedAccent()}; ${gradient ? `--chip-gradient:${gradient.css};` : ""}">${key === "gradientProfile" ? `<span class="gradient-swatch"></span>` : ""}${escapeHtml(label)}</button>`;
  }).join("")}</div>`;
}

function renderPersonalizationPanel() {
  const prefs = state.preferences || DEFAULT_PREFERENCES;
  const layoutCopy = {
    guided: "Setup and help stay prominent while you are still wiring sources.",
    operator: "More widgets stay visible at once for daily command-center use.",
    focus: "Lower-priority chrome is visually quieter so the current plan stands out.",
  }[prefs.layoutProfile] || "Guided defaults are active.";
  return `<article class="panel span-12 personalization-panel" data-personalization-panel style="--accent:${selectedAccent()};"><div class="setup-head"><div><div class="panel-label">personalization</div><h3 class="empty-title">Tune the workspace before the full layout builder lands.</h3><p class="row-subtitle">These preferences persist now and become the compatibility layer for saved layouts, profiles, and drag-reordered widgets later.</p></div>${pill(`${prefs.theme} / ${prefs.density}`, selectedAccent())}</div><div class="gradient-preview" style="--preview-gradient:${selectedGradient().css};"><div><div class="panel-label">student gradient</div><strong>${escapeHtml(PREFERENCE_OPTIONS.gradientProfile.find(([value]) => value === prefs.gradientProfile)?.[1] || "Study Neon")}</strong><span>Change the atmosphere without changing your data.</span></div></div><div class="preference-grid"><div><div class="subtle-label">Theme</div>${preferenceButtons("theme")}</div><div><div class="subtle-label">Density</div>${preferenceButtons("density")}</div><div><div class="subtle-label">Type Scale</div>${preferenceButtons("fontScale")}</div><div><div class="subtle-label">Accent</div>${preferenceButtons("accentProfile")}</div><div><div class="subtle-label">Gradient</div>${preferenceButtons("gradientProfile")}</div><div><div class="subtle-label">Layout Profile</div>${preferenceButtons("layoutProfile")}</div><div class="state-notice" style="--accent:${selectedAccent()};"><div class="row-badge">${iconSvg("command", "Layout profile")}</div><div><strong>${escapeHtml(PREFERENCE_OPTIONS.layoutProfile.find(([value]) => value === prefs.layoutProfile)?.[1] || "Guided")}</strong><div>${escapeHtml(layoutCopy)}</div></div></div></div><div class="source-actions" style="margin-top:1rem;"><button class="surface-action" data-preference-reset>Reset Preferences</button>${pill("Saved to workspace", TOKENS.ok)}</div></article>`;
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
  return `<article class="panel span-12 setup-panel" style="--accent:${TOKENS.command};"><div class="setup-head"><div><div class="panel-label">setup states</div><h3 class="empty-title">Make Ember useful in the fewest steps.</h3><p class="row-subtitle">Each setup state explains what value unlocks and what is still missing, so the fresh app does not feel empty or mysterious.</p></div>${pill(`${completed}/${items.length} ready`, completed === items.length ? TOKENS.ok : TOKENS.warn)}</div><div class="setup-list">${items.map((item) => `<button class="setup-item ${item.done ? "is-complete" : ""}" data-domain="${item.domain}" style="--accent:${colorFor(item.domain)};"><span class="setup-icon">${iconSvg(item.domain, item.title)}</span><span class="setup-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></span><span class="setup-meter"><span style="width:${Math.round((item.completed / item.total) * 100)}%;"></span></span><span class="setup-feedback-line">${item.done ? "Unlocked: " : "Missing: "}${escapeHtml(item.done ? item.unlocked : item.missing)}</span><span class="setup-status">${escapeHtml(item.status)}</span><span class="setup-action">${escapeHtml(item.action)}</span></button>`).join("")}</div></article>`;
}

function renderActivityPanel() {
  const rows = state.activityLog
    .map(normalizeActivity)
    .slice(0, 8)
    .map((activity) => `<div class="row" style="--accent:${TOKENS.command};"><div class="row-badge">${escapeHtml(activityLabel(activity).slice(0, 1).toUpperCase())}</div><div class="row-copy"><div class="row-title">${escapeHtml(activityLabel(activity))} ${escapeHtml(activity.actionType.replace(/_/g, " "))}</div><div class="row-subtitle">${escapeHtml(activitySummary(activity))}</div></div><small class="muted">${escapeHtml(new Date(activity.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</small></div>`)
    .join("");
  return `<article class="panel span-6" data-activity-panel style="--accent:${TOKENS.command};"><div class="panel-label">activity log</div>${listOrEmpty(rows, { domain: "command", title: "No activity recorded yet.", body: "Ember will start logging setup actions, uploads, connector events, and review decisions here.", primaryLabel: "Review setup", primaryDomain: "command" })}<div class="footer-note">This is the audit trail foundation for debugging, rollback visibility, and normalized Supabase migration.</div></article>`;
}

function emberActionButton(label, action, className = "primary-action") {
  return `<button class="${className}" data-ember-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function renderEmberHomePanel(ember) {
  const priorities = ember.topThree.map((task) => `<div class="ember-priority"><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.due || "Today")} &middot; ${escapeHtml(task.course || task.domain || "task")}</span></div>${pill(task.urgent ? "high" : "today", task.urgent ? TOKENS.warn : TOKENS.command)}</div>`).join("");
  const states = ember.states.slice(0, 3).map((item) => `<span>${escapeHtml(item.stateKey.replace(/_/g, " "))}</span>`).join("");
  const interaction = state.emberInteraction || {};
  const response = interaction.response || "Ask Ember what changed, what to do next, or why the plan feels heavy.";
  return `<article class="panel span-8 ember-home-card" data-ember-home style="--accent:${TOKENS.command};"><div class="ember-card-head"><div class="ember-avatar">${emberLogoMark("Ember")}</div><div><div class="panel-label">EMBER</div><h3>${escapeHtml(ember.dashboard.title)}</h3></div></div><p class="ember-message">${escapeHtml(ember.dashboard.body)}</p><div class="ember-card-actions">${emberActionButton(ember.dashboard.ctaLabel, ember.dashboard.ctaAction?.type || "open_plan")}${emberActionButton("Why Ember said this", "why_ember", "surface-action")}</div><div class="ember-talk-box"><label><span>Talk to Ember</span><input value="${escapeHtml(interaction.prompt || "")}" data-ember-prompt placeholder="Example: what should I do first?" /></label><div class="ember-card-actions"><button class="primary-action" data-ember-ask>Ask Ember</button><button class="surface-action" data-ember-quick="explain">Explain plan</button><button class="surface-action" data-ember-quick="next">Next move</button></div><p>${escapeHtml(response)}</p></div><p class="footer-note">${escapeHtml(ember.dashboard.note)}</p><div class="ember-state-strip">${states}</div>${priorities ? `<div class="ember-priority-list"><div class="panel-label">what actually matters today</div>${priorities}</div>` : ""}</article>`;
}

function buildEmberInteractionResponse(kind = "ask") {
  const intel = getIntel();
  const prompt = String(state.emberInteraction?.prompt || "").trim().toLowerCase();
  const topTask = intel.topPriorities[0];
  const conflict = intel.conflicts[0];
  if (kind === "explain" || /why|explain|plan/.test(prompt)) {
    return conflict
      ? `${conflict.title}: ${conflict.text} I am using that conflict plus deadline pressure to keep the next plan conservative.`
      : topTask
        ? `I am prioritizing ${topTask.title} because ${topTask.reason || "it has the strongest deadline/load signal right now"}.`
        : "I do not have enough assignments, shifts, or calendar blocks yet to explain a real plan.";
  }
  if (kind === "next" || /first|next|start|do/.test(prompt)) {
    return topTask
      ? `Start with ${topTask.title}. Do one focused block, then come back here before adding more.`
      : "Add one assignment or class first. Ember needs a real school item before it can choose a meaningful next move.";
  }
  if (/upload|syllabus|file/.test(prompt)) {
    return "Upload the syllabus, review the extracted dates, then confirm only the rows that look right. If you remove that syllabus later, Ember now removes the assignments it created from it.";
  }
  return topTask
    ? `I see ${topTask.title} as the cleanest next move. If that feels wrong, tell me what changed and I will explain the tradeoff.`
    : "I am ready, but I need one real class, task, shift, or file before I can be specific.";
}

function renderEmberPlannerPanel(ember) {
  return `<article class="panel span-4 ember-planner-panel" data-ember-planner style="--accent:${TOKENS.warn};"><div class="panel-label">EMBER'S TAKE</div><h3>${escapeHtml(ember.planner.title)}</h3><p>${escapeHtml(ember.planner.body)}</p><div class="ember-card-actions">${emberActionButton(ember.planner.actions[0], "fix_plan")}${emberActionButton(ember.planner.actions[1], "manual_review", "surface-action")}</div><div class="footer-note">Phase 1 explains the action. Phase 2 will persist exact moved blocks in ember_actions.</div></article>`;
}

function renderCommand(intel) {
  const ember = buildEmberIntelligence({ state, intel });
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];
  const dayIndex = intel.generatedAt.getDay();
  const topCourse = intel.courseInsights.slice().sort((a, b) => b.riskScore - a.riskScore)[0];
  const priorities = intel.topPriorities.map((task, index) => `<div class="row is-hot" style="--accent:${colorFor(task.domain)};"><div class="row-badge">${index + 1}</div><div class="row-copy"><div class="row-title">${escapeHtml(task.title)}</div><div class="row-subtitle">Due ${escapeHtml(task.due)} &middot; ${escapeHtml(task.reason)}</div></div>${pill(task.domain, colorFor(task.domain))}</div>`).join("");
  const domainLoads = intel.domainLoads.map((item) => `<div><div class="label-row"><span>${escapeHtml(item.label)}</span><span>${item.pct}%</span></div>${meter(item.pct, colorFor(item.domain))}</div>`).join("");
  const courses = intel.courseInsights.map((course) => `<div class="meta-row"><span>${escapeHtml(course.name)}</span><strong style="color:${course.status === "at-risk" ? TOKENS.danger : course.status === "watch" ? TOKENS.warn : TOKENS.ok};">${escapeHtml(course.gradeLabel || `${course.grade}%`)}</strong></div>`).join("");
  const conflicts = intel.conflicts.map((conflict) => `<div class="row" style="--accent:${conflict.severity === "crit" ? TOKENS.danger : conflict.severity === "warn" ? TOKENS.warn : TOKENS.command}; align-items:flex-start;"><div class="row-badge">${conflict.severity === "crit" ? "!" : conflict.severity === "warn" ? "~" : "i"}</div><div class="row-copy"><div class="row-title">${escapeHtml(conflict.title)}</div><div class="row-subtitle">${escapeHtml(conflict.text)}</div></div><button class="small-action">${escapeHtml(conflict.action)}</button></div>`).join("");
  const recommendations = intel.recommendations.map((item) => `<article class="note-card"><h4>${escapeHtml(item.title)}</h4><p class="row-subtitle" style="margin-top:0.7rem;">${escapeHtml(item.text)}</p><div style="margin-top:0.8rem;">${pill(DOMAINS.find((domain) => domain.id === item.accent)?.label || item.accent, colorFor(item.accent))}</div></article>`).join("");
  const scheduleBlocks = intel.schedulePlan.map((item) => `<div class="schedule-block" style="--accent:${colorFor(item.domain)};"><div class="schedule-time">${escapeHtml(item.time)}</div><strong>${escapeHtml(item.label)}</strong><div class="row-subtitle" style="margin-top:0.45rem;">${escapeHtml(item.note)}</div><div style="margin-top:0.65rem;">${pill(item.status || item.kind, item.status === "locked" ? TOKENS.notebook : item.status === "assigned" ? colorFor(item.domain) : TOKENS.warn)}</div><div class="assignment-list">${item.assignments?.length ? item.assignments.map((assignment) => `<div class="assignment-pill assignment-pill--explain"><span>${escapeHtml(assignment.title)}</span><strong>${assignment.minutes}m</strong><small>${escapeHtml(assignment.why || assignment.placement || "Placed by solver score.")}</small></div>`).join("") : `<div class="empty-assignment">${item.status === "locked" ? "Reserved" : "No task assigned"}</div>`}</div><div class="row-subtitle">Remaining: ${item.remainingMinutes ?? 0}m</div></div>`).join("");
  const hasAnyGrade = state.courses.some((course) => course.grade !== null && course.grade !== undefined && course.grade !== "" && Number.isFinite(Number(course.grade)));
  const widgetPanels = {
    ember: renderEmberHomePanel(ember),
    setup: renderSetupChecklist(),
    personalization: renderPersonalizationPanel(),
    briefing: `<article class="panel span-8" style="--accent:${TOKENS.command};"><div class="panel-label">intelligence briefing</div><div class="list-rows">${listOrEmpty(priorities, { domain: "command", title: "Not enough data for a briefing yet.", body: "Add tasks, classes, bills, or a calendar source so Ember can rank what matters first.", primaryLabel: "Review setup", primaryDomain: "command", secondaryLabel: "Upload files", secondaryDomain: "upload" })}</div><div class="system-note" style="margin-top:1rem;">This stack is driven by live task scoring plus the current constraint profile. Change the rules, and these priorities recompute.</div></article>`,
    solver: `<article class="panel span-4" style="--accent:${intel.solverSummary.unscheduledUrgentCount ? TOKENS.danger : TOKENS.ok};"><div class="panel-label">solver summary</div><div class="solver-grid"><div class="metric-stack"><span>Scheduled</span><strong>${intel.solverSummary.scheduledMinutes}m</strong></div><div class="metric-stack"><span>Capacity</span><strong>${intel.solverSummary.flexibleCapacityMinutes}m</strong></div><div class="metric-stack"><span>Urgent unscheduled</span><strong>${intel.solverSummary.unscheduledUrgentCount}</strong></div><div class="metric-stack"><span>Search score</span><strong>${intel.solverSummary.score}</strong></div></div><div class="footer-note">${intel.solverSummary.unscheduledMinutes ? `${intel.solverSummary.unscheduledMinutes} minutes remain unscheduled under the current rules.` : "Every active chunk currently fits inside the remaining day."}</div></article>`,
    capacity: `<article class="panel span-4" style="--accent:${TOKENS.command};"><div class="panel-label">capacity gauge</div>${gauge(intel.loadScore, TOKENS.command, "load index", intel.loadLabel === "stabilize" ? "stabilize plan active" : intel.loadLabel, intel.loadDisplay || `${intel.loadScore}%`)}<div class="footer-note" style="margin-top:0.9rem;">${intel.loadExplanation}</div><div class="mini-breakdown">${listOrEmpty(domainLoads, { domain: "command", title: "Setup mode is active.", body: "Ember will show real domain load once you add source data.", primaryLabel: "Review setup", primaryDomain: "command" })}</div></article>`,
    gpa: `<article class="panel span-4" style="--accent:${TOKENS.academy};"><div class="panel-label">school signal</div>${state.courses.length ? `<div class="kpi"><div class="kpi-value accent-text">${hasAnyGrade ? "3.47" : "--"}</div><div class="kpi-copy"><div>${hasAnyGrade ? "Current GPA" : "Grade sync pending"}</div><div class="${topCourse?.status === "at-risk" ? "trend-down" : "trend-up"}">${topCourse?.status === "at-risk" ? "Watch " : "Stable "}${escapeHtml(topCourse?.name || "semester profile")}</div></div></div>${sparkBars(state.courses.map((course) => Number(course.grade) ? Number(course.grade) / 10 : 1), TOKENS.academy)}<div class="section-list" style="margin-top:0.95rem;">${listOrEmpty(courses, { domain: "academy", title: "No classes yet.", body: "Add a class, upload a syllabus, or enter assignments manually.", primaryLabel: "Add class", primaryDomain: "manual:course", secondaryLabel: "Upload syllabus", secondaryDomain: "upload", tertiaryLabel: "Enter assignment", tertiaryDomain: "manual:assignment" })}</div>` : emptyState({ domain: "academy", title: "No classes yet.", body: "Add a class, upload a syllabus, or enter assignments manually. Ember will not invent grade data.", primaryLabel: "Add class", primaryDomain: "manual:course", secondaryLabel: "Upload syllabus", secondaryDomain: "upload", tertiaryLabel: "Enter assignment", tertiaryDomain: "manual:assignment", compact: true })}</article>`,
    conflicts: `<article class="panel span-4" data-conflict-panel style="--accent:${TOKENS.danger};"><div class="panel-label">conflict engine</div><div class="stack-list">${listOrEmpty(conflicts, { domain: "command", title: "No conflicts detected yet.", body: "That can mean you are clear, or that Ember needs more real sources before it can compare commitments.", primaryLabel: "Add sources", primaryDomain: "command" })}</div></article>`,
    week: `<article class="panel span-4" style="--accent:${TOKENS.notebook};"><div class="panel-label">this week</div><div class="calendar-grid">${dayLabels.map((label, index) => { const day = intel.weeklyOutlook[index]; const level = day.level === "high" ? TOKENS.danger : day.level === "medium" ? TOKENS.warn : TOKENS.ok; return `<div class="day-card ${index === dayIndex ? "is-today" : ""}" style="--accent:${level};"><small class="muted">${label}</small><strong>${day.date.getDate()}</strong><div class="dot-stack"><span style="background:${level};"></span><span style="background:${level}; opacity:.65;"></span><span style="background:${level}; opacity:.35;"></span></div></div>`; }).join("")}</div><div class="footer-note" style="margin-top:0.95rem;">Peak pressure day: ${intel.hottestDay.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}. The weekly view is driven by deadlines, exams, and bills.</div></article>`,
    recommendations: `<article class="panel span-12" style="--accent:${TOKENS.future};"><div class="panel-label">next best moves</div><div class="courses-grid">${listOrEmpty(recommendations, { domain: "future", title: "No recommendations yet.", body: "Ember needs source data before it can safely recommend next moves.", primaryLabel: "Review setup", primaryDomain: "command" })}</div></article>`,
    why: renderWhyPlanPanel(intel),
    modes: renderScheduleModePanel(intel),
    constraints: renderConstraintPanel(intel),
    sources: renderSourcePanel(),
    connectors: renderConnectorPanel(),
    activity: renderActivityPanel(),
    schedule: `<article class="panel span-12" style="--accent:${TOKENS.command};"><div class="panel-label">today's plan</div><div class="schedule-strip schedule-strip--solver">${scheduleBlocks || emptyState({ domain: "command", title: "No plan blocks yet.", body: "Add a manual time block, connect a calendar, or upload a source so the planner has real commitments.", primaryLabel: "Add time block", primaryDomain: "manual:time_block", secondaryLabel: "Open connectors", secondaryDomain: "command", tertiaryLabel: "Upload files", tertiaryDomain: "upload" })}</div></article>${renderEmberPlannerPanel(ember)}`,
  };
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${renderWidgetManager()}${renderVisibleCommandWidgets(widgetPanels)}</div></section>`;
}

function simpleListPanel(title, accent, rows, emptyConfig = null) {
  const body = rows || (emptyConfig ? emptyState({ compact: true, ...emptyConfig }) : stateNotice("loading", "No data yet", "Connect a source or add an item to activate this panel."));
  return `<article class="panel span-12" style="--accent:${accent};"><div class="panel-label">${title}</div><div class="section-list">${body}</div></article>`;
}

function estimatedTaskMinutes(task = {}) {
  const explicit = Number(task.estimatedMinutes || task.estimated_minutes || task.minutes || task.mins);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${task.title || ""} ${task.type || ""}`.toLowerCase();
  if (/exam|test|midterm|final/.test(text)) return 120;
  if (/lab|report|project|paper/.test(text)) return 90;
  if (/quiz/.test(text)) return 45;
  if (/read|discussion|note/.test(text)) return 40;
  return task.urgent ? 75 : 50;
}

function coursePlanBlocks(course, assignments = [], intel = getIntel()) {
  const courseNeedles = [course.code, course.name].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const assignmentTitles = new Set(assignments.map((task) => normalizedKey(task.title)));
  const generatedBlocks = (intel.schedulePlan || []).filter((block) => {
    if (block.domain !== "academy") return false;
    if (course.id && String(block.courseId || "") === String(course.id)) return true;
    const blockText = `${block.label || ""} ${block.note || ""}`.toLowerCase();
    if (courseNeedles.some((needle) => needle && blockText.includes(needle))) return true;
    return (block.assignments || []).some((assignment) => assignmentTitles.has(normalizedKey(assignment.title)));
  });
  const manualBlocks = state.schedule.filter((block) => {
    if (block.domain !== "academy") return false;
    if (course.id && String(block.courseId || "") === String(course.id)) return true;
    const blockText = `${block.label || ""} ${block.note || ""} ${block.course || ""}`.toLowerCase();
    return courseNeedles.some((needle) => needle && blockText.includes(needle));
  });
  return [...manualBlocks, ...generatedBlocks].filter((block, index, blocks) => {
    const key = normalizedKey(block.time, block.label, block.courseId, block.note);
    return blocks.findIndex((item) => normalizedKey(item.time, item.label, item.courseId, item.note) === key) === index;
  });
}

function renderCourseWorkspace(intel, activeCourse, periods) {
  const course = normalizeCourseRecord(activeCourse, periods);
  const assignments = courseTasks(activeCourse);
  const openTasks = assignments.filter((task) => !task.done);
  const doneTasks = assignments.filter((task) => task.done);
  const urgentTasks = openTasks.filter((task) => task.urgent);
  const sourceReview = activeCourse.sourceReviewId
    ? state.syllabusReviews.map(normalizeSyllabusReview).find((review) => String(review.id) === String(activeCourse.sourceReviewId))
    : null;
  const sourceUpload = activeCourse.sourceUploadId
    ? state.uploadedFiles.map(normalizeUpload).find((upload) => String(upload.id) === String(activeCourse.sourceUploadId))
    : null;
  const studyMinutes = openTasks.reduce((sum, task) => sum + estimatedTaskMinutes(task), 0);
  const weeklyTarget = openTasks.length ? Math.max(1, Math.ceil(studyMinutes / 60)) : 0;
  const planBlocks = coursePlanBlocks(course, assignments, intel);
  const plannedMinutes = planBlocks.reduce((sum, block) => sum + (Number(block.mins || block.minutes || 0) || 0), 0);
  const sourceCopy = sourceUpload
    ? `${sourceUpload.name} - ${sourceReview?.parseStatus || "review"}`
    : activeCourse.sourceStatus === "source_removed"
      ? "The syllabus file was removed. Manual assignments can still be added here."
      : "Manual class or connector-backed class.";
  const emberNote = !openTasks.length
    ? `${course.name} is clean right now. Add new work here when the class gives you something real.`
    : urgentTasks.length
      ? `${urgentTasks[0].title} is the class item I would protect first. Keep this course page focused until that is handled.`
      : plannedMinutes < studyMinutes
        ? `${course.name} needs about ${weeklyTarget} focused hour${weeklyTarget === 1 ? "" : "s"} this week. I only see ${Math.round(plannedMinutes / 60)} hour${Math.round(plannedMinutes / 60) === 1 ? "" : "s"} planned so far.`
        : `${course.name} has a workable study shape right now. Keep the next block tied to the earliest open assignment.`;
  const periodMoves = periods.map((period) => `<button class="surface-action surface-action--small ${String(course.academicPeriodId) === String(period.id) ? "is-active" : ""}" data-course-move="${escapeHtml(course.id)}" data-period-id="${escapeHtml(period.id)}">${escapeHtml(period.name)}</button>`).join("");
  const lifecycleActions = course.status === "archived"
    ? `<button class="primary-action" data-course-status="${escapeHtml(course.id)}" data-status-value="active">Restore</button><button class="surface-action danger-action" data-course-delete="${escapeHtml(course.id)}">Delete permanently</button>`
    : `<button class="surface-action" data-course-status="${escapeHtml(course.id)}" data-status-value="completed">Complete</button><button class="surface-action" data-course-status="${escapeHtml(course.id)}" data-status-value="dropped">Drop</button><button class="surface-action" data-course-status="${escapeHtml(course.id)}" data-status-value="archived">Archive</button>`;
  const statCards = [
    ["Open work", openTasks.length],
    ["Urgent", urgentTasks.length],
    ["Study target", `${weeklyTarget}h`],
    ["Planned", plannedMinutes ? `${Math.round(plannedMinutes / 60)}h` : "0h"],
  ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join("");
  const openRows = openTasks.map((task) => taskMarkup(task)).join("");
  const doneRows = doneTasks.map((task) => taskMarkup(task)).join("");
  const planRows = planBlocks.map((block) => `<div class="class-plan-block" style="--accent:${TOKENS.academy};"><span>${escapeHtml(block.time || "Study")}</span><strong>${escapeHtml(block.label || "Study block")}</strong><small>${escapeHtml(block.note || "Class-linked planner block")}</small></div>`).join("");
  const sourceRows = [
    sourceUpload ? `<div class="row" style="--accent:${TOKENS.notebook};"><div class="row-copy"><div class="row-title">${escapeHtml(sourceUpload.name)}</div><div class="row-subtitle">${escapeHtml(sourceReview?.parseStatus || sourceUpload.extractionStatus || "attached")}</div></div><button class="surface-action surface-action--small" data-upload-remove="${escapeHtml(sourceUpload.id)}">Remove</button></div>` : "",
    activeCourse.sourceStatus === "source_removed" ? stateNotice("warning", "Syllabus source removed", "Generated assignments from that syllabus were removed; manual work stays here.", "academy") : "",
  ].filter(Boolean).join("");
  return `<section class="section-shell class-page-shell">${heroBand(intel)}<article class="class-page-hero" style="--accent:${course.color || TOKENS.academy};"><button class="surface-action surface-action--small" data-course-close>&larr; All classes</button><div class="class-page-hero__main"><div><div class="panel-label">class workspace</div><h3>${escapeHtml(course.name)}</h3><p>${escapeHtml(course.code || "Manual class")} &middot; ${escapeHtml(sourceCopy)}</p></div><div class="class-page-actions"><button class="primary-action" data-manual-entry="assignment">Add assignment</button><button class="surface-action" data-manual-entry="exam">Add exam</button></div></div><div class="course-detail-stats">${statCards}</div></article><div class="class-workspace-grid"><article class="panel class-focus-panel" style="--accent:${TOKENS.command};"><div class="panel-label">Ember for this class</div><h3>${escapeHtml(openTasks[0]?.title || "No class fire right now")}</h3><p>${escapeHtml(emberNote)}</p><div class="class-study-meter"><span style="width:${Math.min(100, Math.round((plannedMinutes / Math.max(60, studyMinutes)) * 100))}%;"></span></div><div class="footer-note">${plannedMinutes} of ${studyMinutes} estimated study minutes planned.</div></article><article class="panel class-assignments-panel" style="--accent:${TOKENS.academy};"><div class="panel-label">open assignments</div><div class="section-list">${openRows || emptyState({ domain: "academy", title: "No open assignments in this class.", body: "Add one manually, upload a syllabus, or confirm extracted dates from Sources.", primaryLabel: "Add assignment", primaryDomain: "manual:assignment", secondaryLabel: "Upload syllabus", secondaryDomain: "upload", compact: true })}</div></article><article class="panel class-plan-panel" style="--accent:${TOKENS.future};"><div class="panel-label">dedicated study plan</div>${planRows || stateNotice("loading", "No dedicated blocks yet", "Add assignments or create a class block so this course gets protected hours.", "academy")}<div class="hero-actions"><button class="primary-action" data-course-study-block="${escapeHtml(course.id)}">Add 60m class block</button><button class="surface-action" data-domain="command">Open planner</button></div></article><article class="panel class-source-panel" style="--accent:${TOKENS.notebook};"><div class="panel-label">sources and notes</div><div class="section-list">${sourceRows || stateNotice("loading", "No class source attached", "Upload a syllabus or add a note so this class has evidence.", "notebook")}</div><div class="hero-actions"><button class="surface-action" data-upload-sheet-open>Upload syllabus</button><button class="surface-action" data-manual-entry="note">Write note</button></div></article><article class="panel class-completed-panel" style="--accent:${TOKENS.ok};"><div class="panel-label">completed work</div><div class="section-list">${doneRows || stateNotice("loading", "Nothing completed yet", "Finished work will collect here for this class.", "academy")}</div></article><article class="panel class-manage-panel" style="--accent:${TOKENS.warn};"><div class="panel-label">class management</div><div class="course-action-row"><div><div class="subtle-label">Lifecycle</div><div class="row-actions">${lifecycleActions}</div></div><div><div class="subtle-label">Move to term</div><div class="row-actions">${periodMoves}</div></div></div></article></div></section>`;
}

function renderAcademy(intel) {
  const tab = state.subTabs.academy;
  const periods = normalizeAcademicPeriods(state.academicPeriods);
  const activePeriod = periods.find((period) => String(period.id) === String(state.activeAcademicPeriodId)) || periods.find((period) => period.status === "current") || periods[0];
  const activeCourse = state.courses.find((course) => String(course.id) === String(state.activeCourseId));
  if (activeCourse) {
    return renderCourseWorkspace(intel, activeCourse, periods);
  }
  const periodTabs = periods.map((period) => `<button class="period-chip ${String(activePeriod?.id) === String(period.id) ? "is-active" : ""}" data-academic-period="${escapeHtml(period.id)}"><strong>${escapeHtml(period.name)}</strong><span>${escapeHtml(period.status)}</span></button>`).join("");
  const progress = academicProgressSummary();
  const grades = visibleCourses({ periodId: activePeriod?.id }).map((course) => {
    const hasGrade = course.grade !== null && course.grade !== undefined && course.grade !== "" && course.target !== null && course.target !== undefined && course.target !== "" && Number.isFinite(Number(course.grade)) && Number.isFinite(Number(course.target));
    const count = courseTasks(course).length;
    return `<button class="row course-open-row" data-course-open="${escapeHtml(course.id)}" style="--accent:${course.color || TOKENS.academy};"><div class="row-copy"><div class="row-title">${escapeHtml(course.name)}</div><div class="row-subtitle">${escapeHtml(course.code)} &middot; ${escapeHtml(courseSourceSummary(course))} &middot; ${count} assignment${count === 1 ? "" : "s"}</div></div><strong style="color:${hasGrade && course.grade < course.target ? TOKENS.warn : TOKENS.ok};">${hasGrade ? `${course.grade}%` : "Open"}</strong></button>`;
  }).join("");
  const planner = intel.schedulePlan.filter((item) => item.domain === "academy").map((item) => `<div class="row" style="--accent:${TOKENS.academy};"><div class="row-badge mono">${item.time}</div><div class="row-copy"><div class="row-title">${item.label}</div><div class="row-subtitle">${item.note}</div></div></div>`).join("");
  const courses = state.tasks.filter((task) => task.domain === "academy").map((task) => taskMarkup(task)).join("");
  const roadmap = periods.map((period) => {
    const termCourses = normalizeCourses(state.courses, periods).filter((course) => String(course.academicPeriodId) === String(period.id));
    const credits = termCourses.reduce((sum, course) => sum + Number(course.credits || 0), 0);
    return `<article class="roadmap-term ${period.status}" style="--accent:${period.status === "current" ? TOKENS.academy : period.status === "past" ? TOKENS.ok : TOKENS.future};"><div class="roadmap-term__head"><div><span>${escapeHtml(period.type.replace(/_/g, " "))}</span><strong>${escapeHtml(period.name)}</strong></div>${pill(period.status, period.status === "current" ? TOKENS.academy : period.status === "past" ? TOKENS.ok : TOKENS.future)}</div><div class="footer-note">${credits} planned credits &middot; ${termCourses.length} class${termCourses.length === 1 ? "" : "es"}</div><div class="section-list">${termCourses.map((course) => `<button class="roadmap-course" data-course-open="${escapeHtml(course.id)}"><strong>${escapeHtml(course.code)}</strong><span>${escapeHtml(course.name)} &middot; ${escapeHtml(course.status)}</span></button>`).join("") || `<p class="row-subtitle">No classes planned yet.</p>`}</div></article>`;
  }).join("");
  const archived = visibleCourses({ includeArchived: true, periodId: null }).map((course) => `<div class="row" style="--accent:${course.status === "completed" ? TOKENS.ok : course.status === "dropped" ? TOKENS.warn : TOKENS.notebook};"><div class="row-copy"><div class="row-title">${escapeHtml(course.name)}</div><div class="row-subtitle">${escapeHtml(course.code)} &middot; ${escapeHtml(course.status)} &middot; ${escapeHtml(periods.find((period) => String(period.id) === String(course.academicPeriodId))?.name || "No term")}</div></div><div class="row-actions"><button class="surface-action surface-action--small" data-course-open="${escapeHtml(course.id)}">Open</button><button class="surface-action surface-action--small" data-course-status="${escapeHtml(course.id)}" data-status-value="active">Restore</button></div></div>`).join("");
  const progressPanel = `<div class="dashboard-grid"><article class="panel span-5 degree-progress-panel" style="--accent:${TOKENS.academy};"><div class="panel-label">degree progress</div><h3>${escapeHtml(state.academicProfile?.programName || "Academic path")}</h3>${gauge(progress.pct, TOKENS.academy, "completed credits", `${progress.completedCredits} of ${progress.totalRequired}`, `${progress.pct}%`)}</article><article class="panel span-7" style="--accent:${TOKENS.future};"><div class="panel-label">credit picture</div><div class="course-detail-stats"><div><span>Completed</span><strong>${progress.completedCredits}</strong></div><div><span>In progress</span><strong>${progress.activeCredits}</strong></div><div><span>Planned</span><strong>${progress.plannedCredits}</strong></div><div><span>Remaining</span><strong>${progress.remainingCredits}</strong></div></div><div class="footer-note" style="margin-top:1rem;">Current term: ${escapeHtml(progress.currentPeriod?.name || "None")} &middot; Next term: ${escapeHtml(progress.upcomingPeriod?.name || "Create one")}</div></article><article class="panel span-12" style="--accent:${TOKENS.warn};"><div class="panel-label">semester rollover</div><h3 class="empty-title">Close the current term when grades settle.</h3><p class="row-subtitle">Ember will move the current term to past, mark active classes with no open work as completed, and archive unfinished active classes for review instead of deleting anything.</p><button class="primary-action" data-close-academic-period>Close current term</button></article></div>`;
  return `<section class="section-shell">${heroBand(intel)}<div class="academic-period-strip">${periodTabs}<button class="surface-action" data-manual-entry="academic_period">New term</button></div><div class="tab-strip" style="--accent:${TOKENS.academy};">${tabButton("academy", "grades", tab, TOKENS.academy, "classes")}${tabButton("academy", "planner", tab, TOKENS.academy, "study plan")}${tabButton("academy", "courses", tab, TOKENS.academy, "deadlines")}${tabButton("academy", "roadmap", tab, TOKENS.academy, "roadmap")}${tabButton("academy", "progress", tab, TOKENS.academy, "progress")}${tabButton("academy", "requirements", tab, TOKENS.academy, "requirements")}${tabButton("academy", "archive", tab, TOKENS.academy, "archive")}</div>${tab === "grades" ? simpleListPanel(`${activePeriod?.name || "Current term"} classes`, TOKENS.academy, grades, { domain: "academy", title: "No active classes in this term.", body: "Add a class, upload a syllabus, or select a different semester.", primaryLabel: "Add class", primaryDomain: "manual:course", secondaryLabel: "Upload syllabus", secondaryDomain: "upload", tertiaryLabel: "Connect school", tertiaryDomain: "command" }) : ""}${tab === "planner" ? simpleListPanel("study plan", TOKENS.academy, planner, { domain: "academy", title: "No study plan yet.", body: "Add an assignment or exam manually so Ember can place a real study block.", primaryLabel: "Enter assignment", primaryDomain: "manual:assignment", secondaryLabel: "Add exam", secondaryDomain: "manual:exam", tertiaryLabel: "Upload syllabus", tertiaryDomain: "upload" }) : ""}${tab === "courses" ? simpleListPanel("deadlines", TOKENS.warn, courses, { domain: "academy", title: "No academic deadlines yet.", body: "Deadlines can come from a syllabus, LMS sync, or manual entry.", primaryLabel: "Enter assignment", primaryDomain: "manual:assignment", secondaryLabel: "Add exam", secondaryDomain: "manual:exam", tertiaryLabel: "Upload syllabus", tertiaryDomain: "upload" }) : ""}${tab === "roadmap" ? `<div class="roadmap-grid">${roadmap}</div>` : ""}${tab === "progress" ? progressPanel : ""}${tab === "requirements" ? `<div class="dashboard-grid">${renderRequirementsPanel()}</div>` : ""}${tab === "archive" ? simpleListPanel("archived and completed classes", TOKENS.notebook, archived, { domain: "academy", title: "No archived classes yet.", body: "Completed, dropped, and archived classes will live here instead of cluttering the current semester.", primaryLabel: "Add class", primaryDomain: "manual:course", compact: true }) : ""}</section>`;
}

function renderWorks(intel) {
  const tab = state.subTabs.works;
  const hasWorkSource = connectorIsConnected(["deputy"]) || state.tasks.some((task) => task.domain === "works") || state.schedule.some((item) => item.domain === "works");
  const manualShifts = state.schedule.filter((item) => item.domain === "works").map((item) => `<div class="row" style="--accent:${TOKENS.works};"><div class="row-badge">${escapeHtml(item.time)}</div><div class="row-copy"><div class="row-title">${escapeHtml(item.label)}</div><div class="row-subtitle">${Number(item.mins) || 0} minutes &middot; manual shift</div></div>${pill("manual", TOKENS.works)}</div>`).join("");
  const importedShifts = connectorIsConnected(["deputy"]) ? SHIFTS.map((shift) => `<div class="row" style="--accent:${TOKENS.works};"><div class="row-badge">${shift.day}</div><div class="row-copy"><div class="row-title">${shift.hours}</div><div class="row-subtitle">Campus Research Lab</div></div>${pill(`$${shift.pay}`, TOKENS.works)}</div>`).join("") : "";
  const shifts = [manualShifts, importedShifts].filter(Boolean).join("");
  const tasks = state.tasks.filter((task) => task.domain === "works").map((task) => taskMarkup(task)).join("");
  const pipeline = hasWorkSource ? PIPELINE.map((item) => `<div class="row" style="--accent:${item.color};"><div class="row-copy"><div class="row-title">${item.company} - ${item.role}</div><div class="row-subtitle">${item.note}</div></div>${pill(item.stage, item.color)}</div>`).join("") : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="tab-strip" style="--accent:${TOKENS.works};">${tabButton("works", "shifts", tab, TOKENS.works)}${tabButton("works", "tasks", tab, TOKENS.works)}${tabButton("works", "pipeline", tab, TOKENS.works)}</div>${tab === "shifts" ? simpleListPanel("shift board", TOKENS.works, shifts, { domain: "works", title: "No shifts added.", body: "Import a work schedule later, or add a shift manually now so the planner protects those hours.", primaryLabel: "Add shift", primaryDomain: "manual:shift", secondaryLabel: "Import schedule", secondaryDomain: "command", tertiaryLabel: "Add work task", tertiaryDomain: "manual:work_task" }) : ""}${tab === "tasks" ? simpleListPanel("work tasks", TOKENS.works, tasks, { domain: "works", title: "No work tasks yet.", body: "Add a work task manually or sync a source when the connector is ready.", primaryLabel: "Add work task", primaryDomain: "manual:work_task", secondaryLabel: "Import schedule", secondaryDomain: "command" }) : ""}${tab === "pipeline" ? simpleListPanel("career pipeline", TOKENS.future, pipeline, { domain: "future", title: "No career pipeline yet.", body: "Add a career task or future note before Ember turns follow-ups into schedule pressure.", primaryLabel: "Add career task", primaryDomain: "manual:goal", secondaryLabel: "Create note", secondaryDomain: "manual:future_note" }) : ""}</section>`;
}

function renderLife(intel) {
  const insights = buildMoneyInsights();
  const bills = intel.billInsights.map((bill) => `<div class="row ${bill.daysUntilDue !== null && bill.daysUntilDue <= 3 ? "is-hot" : ""}" style="--accent:${bill.covered ? TOKENS.warn : TOKENS.danger};"><div class="row-copy"><div class="row-title">${bill.name}</div><div class="row-subtitle">Due ${bill.due} &middot; ${bill.covered ? "covered" : "needs attention"}</div></div><strong>${bill.amount}</strong></div>`).join("");
  const accounts = insights.accounts.map((account) => `<div class="row" style="--accent:${TOKENS.life};"><div class="row-copy"><div class="row-title">${escapeHtml(account.name)}</div><div class="row-subtitle">${escapeHtml(account.type || "account")} &middot; ${escapeHtml(account.provider || "Manual")}</div></div><strong>${money(account.balance)}</strong></div>`).join("");
  const transactions = insights.transactions.slice(0, 8).map((item) => `<div class="row" style="--accent:${amountNumber(item.amount) < 0 ? TOKENS.warn : TOKENS.ok};"><div class="row-copy"><div class="row-title">${escapeHtml(item.merchant)}</div><div class="row-subtitle">${escapeHtml(item.category || "Uncategorized")} &middot; ${escapeHtml(item.eventType || "expense")} &middot; ${escapeHtml(item.date || "manual")}</div></div><strong>${money(item.amount)}</strong></div>`).join("");
  const subscriptions = insights.subscriptions.map((item) => `<div class="row" style="--accent:${TOKENS.life};"><div class="row-copy"><div class="row-title">${escapeHtml(item.name)}</div><div class="row-subtitle">${escapeHtml(item.cadence || "monthly")} &middot; next ${escapeHtml(item.nextDue || "review")}</div></div><strong>${money(item.amount)}</strong></div>`).join("");
  const paychecks = state.paychecks.map((item) => `<div class="row" style="--accent:${TOKENS.ok};"><div class="row-copy"><div class="row-title">${escapeHtml(item.label || "Income")}</div><div class="row-subtitle">${escapeHtml(item.date || "manual")} &middot; forecast income</div></div><strong>${money(item.amount)}</strong></div>`).join("");
  const savings = insights.savingsGoals.map((goal) => {
    const pct = goal.target ? Math.min(100, Math.round((amountNumber(goal.current) / amountNumber(goal.target)) * 100)) : 0;
    return `<div class="row" style="--accent:${TOKENS.ok};"><div class="row-copy"><div class="row-title">${escapeHtml(goal.name)}</div><div class="row-subtitle">${money(goal.current)} of ${money(goal.target)} saved</div>${meter(pct, TOKENS.ok)}</div><strong>${pct}%</strong></div>`;
  }).join("");
  const safeSummary = insights.cashOnHand || insights.incomeTotal || insights.billTotal || insights.subscriptionTotal || insights.weeklyTarget
    ? `<div class="money-summary"><div class="money-safe"><span>safe to spend</span><strong>${money(insights.safeToSpend)}</strong><small>Cash + known income minus bills, subscriptions, weekly target, and manual spend.</small></div><div class="money-summary-grid"><div><span>Cash</span><strong>${money(insights.cashOnHand)}</strong></div><div><span>Income</span><strong>${money(insights.incomeTotal)}</strong></div><div><span>Bills</span><strong>${money(insights.billTotal)}</strong></div><div><span>Subs</span><strong>${money(insights.subscriptionTotal)}</strong></div></div></div>`
    : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("safe-to-spend", TOKENS.life, safeSummary, { domain: "life", title: "No money context yet.", body: "Add an account, transaction, income, bill, or weekly target manually. Plaid can come later.", primaryLabel: "Add transaction", primaryDomain: "manual:transaction", secondaryLabel: "Add account", secondaryDomain: "manual:account", tertiaryLabel: "Set weekly target", tertiaryDomain: "manual:budget" })}${simpleListPanel("accounts and cash", TOKENS.life, accounts, { domain: "life", title: "No accounts added.", body: "Create a manual account now, then connect finance later if you want bank sync.", primaryLabel: "Add account", primaryDomain: "manual:account", secondaryLabel: "Connect finance", secondaryDomain: "command" })}${simpleListPanel("transactions", TOKENS.life, transactions, { domain: "life", title: "No transactions yet.", body: "Add a transaction manually so budgeting and safe-to-spend have real movement.", primaryLabel: "Add transaction", primaryDomain: "manual:transaction", secondaryLabel: "Add income", secondaryDomain: "manual:income" })}${simpleListPanel("recurring bills", TOKENS.warn, `${bills}${subscriptions}`, { domain: "life", title: "No recurring charges yet.", body: "Add bills and subscriptions manually before bank sync detects them.", primaryLabel: "Add bill", primaryDomain: "manual:bill", secondaryLabel: "Add subscription", secondaryDomain: "manual:subscription" })}${simpleListPanel("income and paydays", TOKENS.ok, paychecks, { domain: "life", title: "No income forecast yet.", body: "Add a paycheck or shift income so Payday View can estimate what's safe before the next bill.", primaryLabel: "Add income", primaryDomain: "manual:income", secondaryLabel: "Add shift", secondaryDomain: "manual:shift" })}${simpleListPanel("savings goals", TOKENS.ok, savings, { domain: "life", title: "No savings goals yet.", body: "Create a manual goal now. Smart savings automation can plug in later.", primaryLabel: "Add savings goal", primaryDomain: "manual:savings_goal", secondaryLabel: "Add income", secondaryDomain: "manual:income" })}</div></section>`;
}

function renderFuture(intel) {
  const hasFutureContext = state.tasks.some((task) => task.domain === "future") || state.notes.some((note) => normalizeNote(note).domain === "future");
  const goals = hasFutureContext ? GOALS.map((goal) => `<div class="row" style="--accent:${colorFor(goal.domain)};"><div class="row-copy"><div class="row-title">${goal.title}</div><div class="row-subtitle">${goal.done}/${goal.tasks} complete</div></div><strong>${goal.pct}%</strong></div>`).join("") : "";
  const milestones = hasFutureContext ? MILESTONES.map((milestone) => `<div class="row ${milestone.hot ? "is-hot" : ""}" style="--accent:${milestone.hot ? TOKENS.future : TOKENS.notebook};"><div class="row-copy"><div class="row-title">${milestone.label}</div><div class="row-subtitle">${milestone.hot ? "High urgency" : "Forward-looking checkpoint"}</div></div><strong>${milestone.date}</strong></div>`).join("") : "";
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid">${simpleListPanel("next steps", TOKENS.future, goals, { domain: "future", title: "No goals linked yet.", body: "Add one concrete goal or write a future note so Path becomes schedulable.", primaryLabel: "Add goal", primaryDomain: "manual:goal", secondaryLabel: "Create note", secondaryDomain: "manual:future_note", tertiaryLabel: "Upload proof", tertiaryDomain: "upload" })}${simpleListPanel("milestones", TOKENS.future, milestones, { domain: "future", title: "No milestones yet.", body: "Milestones should come from real goals, school path, or career sources before they drive the plan.", primaryLabel: "Add goal", primaryDomain: "manual:goal", secondaryLabel: "Upload source", secondaryDomain: "upload" })}</div></section>`;
}

function renderMind(intel) {
  const checkinPresets = [
    ["Good", 4, 4, 4],
    ["Fine", 3, 3, 3],
    ["Tired", 2, 3, 3],
    ["Drained", 1, 2, 2],
  ];
  const form = !state.checkin.submitted
    ? `<div class="ember-checkin"><h3>How are you actually holding up?</h3><div class="checkin-choice-grid">${checkinPresets.map(([label, energy, focus, mood]) => `<button class="checkin-choice ${state.checkin.energy === energy && state.checkin.focus === focus && state.checkin.mood === mood ? "is-active" : ""}" data-checkin-preset="${energy},${focus},${mood}">${label}</button>`).join("")}</div><label class="manual-entry-field"><span>Anything throwing you off?</span><input value="${escapeHtml(state.checkin.note || "")}" placeholder="Optional. Example: quiz anxiety, work ran late..." data-checkin-note /></label><div class="slider-group slider-group--compact">${[{ key: "energy", label: "Energy" }, { key: "focus", label: "Focus" }, { key: "mood", label: "Mood" }].map((field) => `<div class="slider-row"><strong>${field.label}</strong><div class="slider-values">${[1, 2, 3, 4, 5].map((value) => `<button class="score-button ${state.checkin[field.key] === value ? "is-active" : ""}" data-score-field="${field.key}" data-score-value="${value}" style="--accent:${TOKENS.mind};">${value}</button>`).join("")}</div></div>`).join("")}</div><button class="primary-action" data-submit-checkin style="margin-top:1rem;">Log check-in</button></div>`
    : `<div class="processing-result"><div class="footer-note">Check-in logged. Ember softened the next 24 hours because energy and focus are real scheduling inputs.</div><button class="surface-action" data-reset-checkin>Check in again</button></div>`;
  const insights = MIND_INSIGHTS.map((item) => `<div class="row" style="--accent:${TOKENS.mind};"><div class="row-badge">${iconSvg("mind", item.title)}</div><div class="row-copy"><div class="row-title">${item.title}</div><div class="row-subtitle">${item.body}</div></div></div>`).join("");
  const risk = burnoutRisk(intel);
  const hasMindSignals = state.checkin.submitted || state.checkin.energy || state.checkin.focus || state.checkin.mood;
  const riskBody = hasMindSignals
    ? gauge(risk, risk > 55 ? TOKENS.warn : TOKENS.ok, "burnout risk", risk > 55 ? "load softening recommended" : "stable")
    : emptyState({ domain: "mind", title: "No recovery signal yet.", body: "Submit a quick check-in or add a rest block. This is scheduler context, not clinical diagnosis.", primaryLabel: "Start check-in", primaryDomain: "mind", secondaryLabel: "Add rest block", secondaryDomain: "manual:rest_block", compact: true });
  return `<section class="section-shell">${heroBand(intel)}<div class="dashboard-grid"><article class="panel span-5" style="--accent:${TOKENS.mind};"><div class="panel-label">daily check-in</div>${form}</article><article class="panel span-3" style="--accent:${TOKENS.notebook};"><div class="panel-label">burnout risk</div>${riskBody}</article>${simpleListPanel("recovery rules", TOKENS.mind, hasMindSignals ? insights : "", { domain: "mind", title: "Not enough recovery data yet.", body: "Once you submit check-ins or add rest blocks, Ember can show how recovery changes the schedule.", primaryLabel: "Start check-in", primaryDomain: "mind", secondaryLabel: "Add rest block", secondaryDomain: "manual:rest_block" })}</div></section>`;
}

function renderNotebook(intel) {
  const ember = buildEmberIntelligence({ state, intel });
  const notes = state.notes.map(normalizeNote);
  const filtered = notes.filter((note) => { const search = state.noteSearch.trim().toLowerCase(); return !search || note.title.toLowerCase().includes(search) || note.domain.toLowerCase().includes(search) || note.tags.some((tag) => tag.toLowerCase().includes(search)) || note.body.toLowerCase().includes(search); });
  const activeNote = notes.find((note) => String(note.id) === String(state.activeNoteId)) || filtered[0] || null;
  const uploads = state.uploadedFiles.map(normalizeUpload);
  const reviews = state.syllabusReviews.map(normalizeSyllabusReview);
  const uploadRows = uploads.map((file) => {
    const hasReview = reviews.some((review) => review.uploadId === file.id);
    const extractionCopy = file.extractionMethod ? ` via ${file.extractionMethod}` : "";
    return `<div class="row source-file-row" style="--accent:${TOKENS.notebook};"><div class="row-badge">${iconSvg("notebook", "Source file")}</div><div class="row-copy"><div class="row-title">${escapeHtml(compactSourceText(file.name, 96))}</div><div class="row-subtitle">${escapeHtml(compactSourceText(file.type, 32))} &middot; ${Math.max(1, Math.round(file.size / 1024))} KB &middot; ${escapeHtml(file.uploadStatus)} / ${escapeHtml(file.textStatus)}${escapeHtml(extractionCopy)}</div>${file.textPreview ? `<div class="footer-note footer-note--clamped">${escapeHtml(compactSourceText(file.textPreview, 180))}</div>` : ""}</div><div class="row-actions">${pill(file.local ? "local" : "cloud", file.local ? TOKENS.warn : TOKENS.ok)}<button class="surface-action surface-action--small" data-syllabus-start="${escapeHtml(file.id)}" ${hasReview ? "disabled" : ""}>${hasReview ? "In review" : "Review as syllabus"}</button><button class="surface-action surface-action--small danger-action" data-upload-remove="${escapeHtml(file.id)}" aria-label="Remove ${escapeHtml(file.name)}">Remove</button></div></div>`;
  }).join("");
  const reviewRows = reviews.map((review) => {
    const summary = review.parsedSummary || {};
    const items = Array.isArray(summary.extractedItems) ? summary.extractedItems.slice(0, 18) : [];
    const parserStats = summary.parserStats ? `<p class="footer-note">Found ${summary.parserStats.homework || 0} homework, ${summary.parserStats.labs || 0} labs, ${summary.parserStats.quizzes || 0} quizzes, ${summary.parserStats.exams || 0} exams, and ${summary.parserStats.breaks || 0} break/holiday blocks.</p>` : "";
    const hiddenCount = Array.isArray(summary.extractedItems) && summary.extractedItems.length > items.length ? summary.extractedItems.length - items.length : 0;
    return `<div class="review-card" style="--accent:${review.parseStatus === "confirmed" ? TOKENS.ok : TOKENS.academy};"><div class="review-card__head"><div><div class="panel-label">${review.parseStatus === "confirmed" ? "confirmed syllabus" : "needs review"}</div><h4>${escapeHtml(compactSourceText(review.title, 110))}</h4></div>${pill(`${Math.round((review.confidence || 0) * 100)}% confidence`, review.parseStatus === "confirmed" ? TOKENS.ok : TOKENS.warn)}</div><div class="review-grid"><span>Course</span><strong>${escapeHtml(compactSourceText(summary.courseName || "Needs review", 80))}</strong><span>Code</span><strong>${escapeHtml(compactSourceText(summary.courseCode || "Needs review", 32))}</strong><span>Parser</span><strong>${escapeHtml(compactSourceText(summary.parser || summary.extractionMethod || "heuristic", 40))}</strong><span>Text</span><strong>${escapeHtml(compactSourceText(summary.textStatus || "review", 40))}</strong></div>${parserStats}<div class="extraction-list">${items.map((item) => `<div><span>${escapeHtml(compactSourceText(item.itemType || item.type || "item", 22))}</span><strong>${escapeHtml(compactSourceText(item.title || item.rawTitle || "Untitled extracted item", 120))}${item.dateText ? ` (${escapeHtml(compactSourceText(item.dateText, 36))})` : ""}</strong></div>`).join("") || `<div><span>review</span><strong>No structured dates found yet</strong></div>`}${hiddenCount ? `<div><span>more</span><strong>${hiddenCount} more extracted items hidden for review stability.</strong></div>` : ""}</div><p class="footer-note footer-note--clamped">${review.parseStatus === "confirmed" ? "Added to Academy where parsed course/task data was available." : escapeHtml(compactSourceText(summary.warning || "Review before scheduling assignments.", 180))}</p><button class="primary-action" data-syllabus-confirm="${escapeHtml(review.id)}" ${review.parseStatus === "confirmed" ? "disabled" : ""}>${review.parseStatus === "confirmed" ? "Added to Academy" : "Confirm and add to Academy"}</button></div>`;
  }).join("");
  const noteButtons = filtered.map((note) => `<button class="note-button ${String(note.id) === String(state.activeNoteId) ? "is-active" : ""}" data-note-id="${escapeHtml(note.id)}" style="--accent:${colorFor(note.domain)};"><strong>${escapeHtml(note.title)}</strong><small>${escapeHtml(note.updated)} &middot; ${escapeHtml(note.domain)}</small></button>`).join("");
  const editor = activeNote
    ? `<div class="note-editor"><div class="panel-label">${iconSvg(activeNote.domain)} editable note</div><input class="note-title-input" value="${escapeHtml(activeNote.title)}" placeholder="Note title" data-note-title /><div class="note-meta-grid"><label><span>Domain</span><select data-note-domain>${DOMAINS.filter((domain) => domain.id !== "command").map((domain) => `<option value="${domain.id}" ${activeNote.domain === domain.id ? "selected" : ""}>${domain.label}</option>`).join("")}</select></label><label><span>Tags</span><input value="${escapeHtml(activeNote.tags.join(", "))}" placeholder="exam-prep, ideas" data-note-tags /></label></div><textarea class="note-body-input" placeholder="Write notes, links, questions, or source-grounded context here..." data-note-body>${escapeHtml(activeNote.body || activeNote.summary || "")}</textarea><p class="footer-note">Autosaves locally. Cloud sync updates on field change when apex_notes is available.</p></div>`
    : `<div class="empty-note-state">${emptyState({ domain: "notebook", title: "No notes yet.", body: "Write a note, enter a manual source, or upload a file. Sources should work even before connectors do.", primaryLabel: "Write note", primaryDomain: "manual:note", secondaryLabel: "Manual source", secondaryDomain: "manual:source", compact: true })}</div>`;
  const uploadEmpty = emptyState({ domain: "notebook", title: "No files attached.", body: "Upload a syllabus, lecture note, or assignment sheet. Nothing gets scheduled until you confirm the review.", primaryLabel: "Upload file", primaryDomain: "upload", secondaryLabel: "Manual source", secondaryDomain: "manual:source", compact: true });
  const reviewEmpty = emptyState({ domain: "academy", title: "No syllabus reviews yet.", body: "Upload a syllabus or enter academic dates manually. Review stays separate from scheduling until you confirm.", primaryLabel: "Upload syllabus", primaryDomain: "upload", secondaryLabel: "Enter assignment", secondaryDomain: "manual:assignment", tertiaryLabel: "Add exam", tertiaryDomain: "manual:exam", compact: true });
  return `<section class="section-shell">${heroBand(intel)}<div class="notebook-layout"><aside class="panel panel--quiet" style="--accent:${TOKENS.notebook};"><div class="panel-label">search notes</div><input class="search-input" type="search" placeholder="Search all notes..." value="${escapeHtml(state.noteSearch)}" data-note-search /><button class="primary-action note-create-action" data-note-create type="button">New note</button><div class="note-list" style="margin-top:1rem;">${noteButtons || stateNotice("loading", "No notes yet", "Create your first note to make Notebook useful.", "notebook")}</div></aside><div class="section-shell"><article class="panel" style="--accent:${activeNote ? colorFor(activeNote.domain) : TOKENS.notebook};">${editor}</article><article class="panel ember-upload-guide" style="--accent:${TOKENS.command};"><div class="panel-label">EMBER UPLOAD REVIEW</div><h3>${escapeHtml(ember.upload.title)}</h3><p>${escapeHtml(ember.upload.body)}</p><button class="surface-action" data-upload-sheet-open>${escapeHtml(ember.upload.ctaLabel)}</button></article><article class="panel" data-upload-panel style="--accent:${TOKENS.notebook};"><div class="panel-label">source uploads</div><h3 class="empty-title">Upload syllabi, notes, and assignment sheets.</h3><p class="row-subtitle">Ember now extracts text, runs AI-style syllabus parsing, and falls back to Tesseract OCR for image uploads when available.</p><label class="upload-zone"><input type="file" multiple data-file-upload /><span>Choose files to attach</span><small>${uploads.length ? `${uploads.length} source file(s) tracked` : "No source files attached yet"}</small></label><div class="section-list" style="margin-top:1rem;">${uploadRows || uploadEmpty}</div></article><article class="panel" data-syllabus-review-panel style="--accent:${TOKENS.academy};"><div class="panel-label">syllabus review queue</div><h3 class="empty-title">Confirm before Ember schedules anything.</h3><p class="row-subtitle">Parsed dates, assignments, grading weights, and policies stay in review until you confirm the card.</p><div class="review-list">${reviewRows || reviewEmpty}</div></article><article class="panel" style="--accent:${TOKENS.command};"><div class="panel-label">brain dump</div>${!state.processedDump ? `<textarea class="brain-dump" placeholder="Type anything: study thermo, email professor, pay rent, prep Friday quiz..." data-brain-dump>${escapeHtml(state.brainDump)}</textarea><div class="hero-actions"><button class="primary-action" data-process-dump>Process + sort</button></div>` : `<div class="processing-result"><div class="row is-hot" style="--accent:${TOKENS.ok};"><div class="row-badge">${iconSvg("command", "Processed")}</div><div class="row-copy"><div class="row-title">Dump routed into ${state.processedDump.domains.length} dashboards</div><div class="row-subtitle">${escapeHtml(state.processedDump.summary)}</div></div></div><div class="inline-chips">${state.processedDump.domains.map((domain) => pill(domain, colorFor(domain.toLowerCase()))).join("")}</div><button class="surface-action" data-clear-dump>New dump</button></div>`}</article></div></div></section>`;
}

function renderFreshDomainState(intel) {
  const domain = activeDomain();
  const guidance = {
    academy: ["No classes yet.", "Add a class, upload a syllabus, or enter your first assignment manually.", "Add class", "manual:course", "Upload syllabus", "upload", "Enter assignment", "manual:assignment"],
    works: ["No shifts added.", "Add recurring work hours manually or import a schedule later.", "Add shift", "manual:shift", "Import schedule", "command", "Add work task", "manual:work_task"],
    life: ["No money context yet.", "Add a bill or income manually so Ember can reason about financial pressure without a bank connection.", "Add bill", "manual:bill", "Add income", "manual:income", "Set weekly target", "manual:budget"],
    future: ["No path items yet.", "Add one concrete goal or write a note so future work turns into a schedulable step.", "Add goal", "manual:goal", "Create note", "manual:future_note", "Upload proof", "upload"],
    mind: ["No recovery signal yet.", "Start with a check-in or add a rest block so recovery can shape the plan.", "Start check-in", "mind", "Add rest block", "manual:rest_block", "Open plan", "command"],
  }[domain.id] || ["Start with real context.", "Add a source manually, upload a file, or connect tools later.", "Review Setup", "command", "Upload Files", "upload", "Manual source", "manual:source"];
  return `<section class="section-shell">${heroBand(intel)}<article class="panel panel--empty span-12" style="--accent:${colorFor(domain.id)};"><div class="panel-label">fresh workspace</div>${emptyState({ domain: domain.id, title: guidance[0], body: guidance[1], primaryLabel: guidance[2], primaryDomain: guidance[3], secondaryLabel: guidance[4], secondaryDomain: guidance[5], tertiaryLabel: guidance[6], tertiaryDomain: guidance[7] })}</article></section>`;
}

function renderContent(intel) {
  const hasFinanceData = (state.finance?.accounts || []).length || (state.finance?.transactions || []).length || (state.finance?.subscriptions || []).length || (state.finance?.savingsGoals || []).length || state.paychecks.length || Boolean(state.budget?.weeklyTarget);
  if (!state.tasks.length && !state.courses.length && !state.schedule.length && !state.bills.length && !hasFinanceData) {
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

function renderContentSafely(intel) {
  try {
    return renderContent(intel);
  } catch (error) {
    console.error("Ember content render failed", error);
    return `<section class="section-shell"><article class="panel panel--empty span-12" style="--accent:${TOKENS.warn};"><div class="panel-label">recovery mode</div><h3 class="empty-title">Ember hit a bad saved view.</h3><p class="row-subtitle">The shell is still okay. Clear local UI state or switch sections to keep going while we protect the app from this data shape.</p><div class="source-actions"><button class="primary-action" data-reset-local-state>Reset local UI</button><button class="surface-action" data-domain="command">Open Plan</button><button class="surface-action" data-upload-sheet-open>Manage uploads</button></div></article></section>`;
  }
}

function renderApp() {
  if (!app) return;
  const safeSnapshot = sanitizeLoadedStateSnapshot(state);
  state.academicProfile = safeSnapshot.academicProfile;
  state.academicPeriods = safeSnapshot.academicPeriods;
  state.activeAcademicPeriodId = safeSnapshot.activeAcademicPeriodId;
  state.courses = safeSnapshot.courses;
  state.notes = safeSnapshot.notes;
  state.uploadedFiles = safeSnapshot.uploadedFiles;
  state.syllabusReviews = safeSnapshot.syllabusReviews;
  state.brainDump = safeSnapshot.brainDump;
  state.preferences = normalizePreferences(state.preferences);
  applyTheme();
  if (!state.auth.ready || !state.auth.user) {
    renderAuthShell();
    renderToast();
    renderNotificationCenter();
    renderCommandPalette();
    renderMobileNavSheet();
    renderUploadSheet();
    renderManualEntrySheet();
    renderPaywallSheet();
    renderAppearanceSettings();
    return;
  }
  const domain = activeDomain();
  const intel = getIntel();
  const nextPlanSnapshot = buildScheduleRunSnapshot({ intel, scheduleMode: state.scheduleMode });
  const latestPlanChanges = compareScheduleRunSnapshots(state.lastPlanSnapshot, nextPlanSnapshot);
  if (latestPlanChanges.status !== "stable") state.lastPlanChanges = latestPlanChanges;
  intel.planChanges = state.lastPlanChanges || latestPlanChanges;
  const prefs = normalizePreferences(state.preferences);
  const shellClass = `theme-${prefs.theme} density-${prefs.compactMode === "on" ? "compact" : prefs.density} text-${prefs.fontScale} layout-${prefs.layoutProfile} domain-${domain.id}`;
  const contentHtml = renderContentSafely(intel);
  app.innerHTML = `<div class="app-shell ${shellClass}" style="--accent:${selectedAccent(domain.id)};"><a class="skip-link" href="#main-content">Skip to content</a><div class="ambient"><div class="orb orb--one"></div><div class="orb orb--two"></div><div class="orb orb--three"></div></div><aside class="sidebar ${state.sidebarCollapsed ? "is-collapsed" : ""}"><div class="brand"><div class="brand-mark">${emberLogoMark("Ember")}</div><div class="brand-copy"><h1>Ember</h1><p>Dawn OS</p></div></div><nav class="sidebar-nav" aria-label="Primary sections">${DOMAINS.map((item) => `<button class="nav-button ${state.activeDomain === item.id ? "is-active" : ""}" data-domain="${item.id}" style="--accent:${colorFor(item.id)};" aria-current="${state.activeDomain === item.id ? "page" : "false"}"><span class="nav-icon">${iconSvg(item.id, item.label)}</span><span class="nav-copy"><strong>${item.label}</strong><span>${item.blurb}</span></span></button>`).join("")}</nav><div class="sidebar-footer"><button class="collapse-button" data-collapse-sidebar aria-label="${state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}"><span>${state.sidebarCollapsed ? "&#9654;" : "&#9664;"}</span><span>${state.sidebarCollapsed ? "Expand" : "Collapse"}</span></button></div></aside><main class="main" id="main-content"><header class="topbar topbar--toolbelt"><div class="topbar-title"><div class="topbar-icon">${emberLogoMark("Ember")}</div><div class="topbar-copy"><div class="topbar-heading-row"><h2>Ember</h2><span class="topbar-mode">${escapeHtml(domain.label)}</span><span class="dawn-os-chip">Class study blocks v15</span></div><p>${escapeHtml(domain.blurb)} &middot; ${formatToday()}</p></div></div><div class="topbar-metrics"><button class="mobile-menu-trigger" data-mobile-nav-open aria-label="Open mobile menu"><span>${iconSvg(domain.id, "Mobile menu")}</span><strong>Menu</strong></button><button class="command-trigger" data-command-open aria-label="Open command palette"><span>${iconSvg("command", "Command palette")}</span><strong>Search</strong><kbd>Ctrl K</kbd></button><div class="metric-pill"><span class="metric-dot"></span><span>Load</span><strong data-shell-load>${intel.loadDisplay || `${intel.loadScore}%`}</strong></div><div class="metric-pill"><span class="metric-dot" style="background:${TOKENS.command};"></span><span>Cloud</span><strong data-shell-cloud>${state.cloudSaveStatus}</strong></div><div class="metric-pill"><span class="metric-dot" data-shell-source-dot style="background:${statusTone(state.sourceConfig.lastSyncStatus)};"></span><span>Source</span><strong data-shell-source>${state.sourceConfig.lastSyncStatus}</strong></div><button class="metric-pill metric-button ${unreadNotifications().length ? "has-unread" : ""}" data-notification-toggle type="button" aria-label="Open notification center"><span class="metric-dot" data-shell-notification-dot style="background:${unreadNotifications().length ? TOKENS.warn : TOKENS.ok};"></span><span>Alerts</span><strong data-shell-notifications>${unreadNotifications().length}</strong></button><button class="upgrade-trigger ${subscriptionTier() === "free" ? "" : "is-active"}" data-paywall-open>${subscriptionTier() === "free" ? "Upgrade" : subscriptionTier() === "pro_plus" ? "Pro+" : "Pro"}</button><button class="surface-action" data-domain="command" data-scroll-personalization>Personalize</button><button class="surface-action" data-auth-signout>Sign Out</button><div class="mini-domain-rail" aria-label="Quick sections">${DOMAINS.filter((item) => item.id !== "command").map((item) => `<button class="stat-dot-button ${item.id === state.activeDomain ? "is-active" : ""}" data-domain="${item.id}" style="--dot:${colorFor(item.id)};" title="${item.label}" aria-label="Open ${item.label}"></button>`).join("")}</div></div></header><div class="content">${contentHtml}</div></main>${renderEmberDock()}${renderOnboarding()}${renderSectionHelp()}</div>`;
  state.lastPlanSnapshot = nextPlanSnapshot;
  persistPlanSnapshotOnly();
  renderToast();
  renderNotificationCenter();
  renderCommandPalette();
  renderMobileNavSheet();
  renderUploadSheet();
  renderManualEntrySheet();
  renderPaywallSheet();
  renderAppearanceSettings();
  queueEmberSnapshotSync(state.activeDomain === "notebook" ? "upload_review" : state.activeDomain === "command" ? "dashboard" : "dashboard");
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
  applyTheme();
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
  if (payload.finance && typeof payload.finance === "object") {
    state.finance = {
      ...state.finance,
      accounts: Array.isArray(payload.finance.accounts) ? payload.finance.accounts : state.finance.accounts,
      transactions: Array.isArray(payload.finance.transactions) ? payload.finance.transactions : state.finance.transactions,
      subscriptions: Array.isArray(payload.finance.subscriptions) ? payload.finance.subscriptions : state.finance.subscriptions,
      savingsGoals: Array.isArray(payload.finance.savingsGoals) ? payload.finance.savingsGoals : state.finance.savingsGoals,
    };
    applied.push("finance");
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
    throw new Error("Payload did not contain any supported Ember keys.");
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
    body: `Updated ${applied.join(", ")} from an Ember source payload.`,
    severity: "success",
  });
  logActivity({
    entityType: "source",
    actionType: "applied",
    afterState: {
      summary: `${origin} updated ${applied.join(", ")}`,
      origin,
      applied,
    },
  });
}

async function syncRemoteSource() {
  if (!state.sourceConfig.remoteUrl.trim()) {
    notifyUser({
      type: "setup",
      title: "Add a remote JSON URL",
      body: "The source panel needs a URL before Ember can run a remote sync.",
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
  if (target.closest("[data-appearance-toggle]")) { state.appearancePanelOpen = !state.appearancePanelOpen; renderAppearanceSettings(); return; }
  const appearanceTheme = target.closest("[data-appearance-theme]");
  if (appearanceTheme) { updateAppearancePreference("themeFamily", appearanceTheme.dataset.appearanceTheme); return; }
  const appearancePref = target.closest("[data-appearance-pref]");
  if (appearancePref) { updateAppearancePreference(appearancePref.dataset.appearancePref, appearancePref.dataset.appearanceValue); return; }
  if (target.closest("[data-theme-builder-open]")) { state.themeBuilderOpen = true; state.themeDraft = defaultThemeDraft(currentThemeDefinition()); renderAppearanceSettings(); return; }
  if (target.closest("[data-theme-builder-close]")) { state.themeBuilderOpen = false; renderAppearanceSettings(); return; }
  if (target.closest("[data-theme-save]")) { saveThemeDraft(); return; }
  if (target.closest("[data-mobile-nav-open]")) { state.mobileNavOpen = true; renderMobileNavSheet(); return; }
  if (target.matches("[data-mobile-nav-close]") || target.closest(".mobile-nav-sheet__scrim")) { closeMobileNavSheet(); return; }
  if (target.closest("[data-upload-sheet-open]")) { state.uploadSheetOpen = true; renderUploadSheet(); return; }
  if (target.matches("[data-upload-sheet-close]") || target.closest(".upload-sheet__scrim")) { closeUploadSheet(); return; }
  if (target.closest("[data-paywall-open]")) { openPaywall("auto_plan", { feature: "upgrade_button" }); return; }
  if (target.matches("[data-paywall-close]") || target.closest(".paywall-sheet__scrim")) { closePaywall(); return; }
  if (target.closest("[data-reset-local-state]")) {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem(CUSTOM_THEMES_KEY);
    win?.location.reload();
    return;
  }
  const planSelect = target.closest("[data-plan-select]");
  if (planSelect) { selectPlan(planSelect.dataset.planSelect); return; }
  const paywallSecondary = target.closest("[data-paywall-secondary]");
  if (paywallSecondary) {
    const action = paywallSecondary.dataset.paywallSecondary || "";
    closePaywall();
    if (action.startsWith("manual:")) openManualEntrySheet(action.replace("manual:", ""));
    return;
  }
  const manualEntry = target.closest("[data-manual-entry]");
  if (manualEntry) { openManualEntrySheet(manualEntry.dataset.manualEntry); return; }
  const emberAction = target.closest("[data-ember-action]");
  if (emberAction) {
    const action = emberAction.dataset.emberAction;
    if (["open_plan", "open_conflicts", "fix_plan", "manual_review"].includes(action)) {
      setActiveDomain("command");
      rerender();
      requestAnimationFrame(() => doc?.querySelector(action === "open_conflicts" ? "[data-conflict-panel]" : ".schedule-strip--solver")?.scrollIntoView({ block: "start", behavior: "smooth" }));
      if (action === "fix_plan") {
        await persistEmberAction("suggest_plan", { surface: "planner", requestedAction: "fix_plan" });
        await persistEmberSnapshot("planner");
      }
    } else if (action === "open_recovery") {
      setActiveDomain("mind");
      rerender();
    } else if (action === "open_sources") {
      setActiveDomain("notebook");
      rerender();
    } else if (action === "why_ember") {
      pushToast("Ember is using urgency, conflicts, load, check-ins, and source confidence.");
    } else if (action === "preview_tomorrow") {
      pushToast("Tomorrow preview will become an Ember evening-wrap message in Phase 2.");
    }
    return;
  }
  const emberAsk = target.closest("[data-ember-ask]");
  if (emberAsk) {
    state.emberInteraction = {
      ...(state.emberInteraction || {}),
      response: buildEmberInteractionResponse("ask"),
    };
    saveState();
    await persistEmberAction("manual_prompt", { prompt: state.emberInteraction.prompt || "" });
    rerender();
    return;
  }
  const emberQuick = target.closest("[data-ember-quick]");
  if (emberQuick) {
    const kind = emberQuick.dataset.emberQuick || "ask";
    state.emberInteraction = {
      ...(state.emberInteraction || {}),
      prompt: kind === "explain" ? "Explain this plan" : "What should I do next?",
      response: buildEmberInteractionResponse(kind),
    };
    saveState();
    await persistEmberAction(`quick_${kind}`, { surface: "dashboard" });
    rerender();
    return;
  }
  if (target.matches("[data-manual-entry-close]") || target.closest(".manual-entry-sheet__scrim")) { closeManualEntrySheet(); return; }
  if (target.closest("[data-focus-top]")) {
    const intel = getIntel();
    if (!hasAccess("pro") && (intel.conflicts.length || state.tasks.length)) {
      openPaywall(intel.conflicts.length ? "conflict_fix" : "auto_plan", { feature: "focus_top" });
      return;
    }
    requestAnimationFrame(() => doc?.querySelector(".schedule-strip--solver")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return;
  }
  const uploadRemove = target.closest("[data-upload-remove]");
  if (uploadRemove) { await removeUploadedFile(uploadRemove.dataset.uploadRemove); return; }
  if (target.closest("[data-command-open]")) { if (shouldCloseMobileNav) state.mobileNavOpen = false; openCommandPalette(); renderMobileNavSheet(); return; }
  if (target.closest("[data-command-close]")) { closeCommandPalette(); return; }
  const commandAction = target.closest("[data-command-action]");
  if (commandAction) { if (shouldCloseMobileNav) state.mobileNavOpen = false; executeCommandPaletteAction(commandAction.dataset.commandAction); renderMobileNavSheet(); return; }
  const domainButton = target.closest("[data-domain]");
  if (domainButton) {
    setActiveDomain(domainButton.dataset.domain);
    if (shouldCloseMobileNav) state.mobileNavOpen = false;
    rerender();
    if (domainButton.matches("[data-scroll-personalization]")) {
      requestAnimationFrame(() => doc?.querySelector("[data-personalization-panel]")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    if (domainButton.matches("[data-scroll-connectors]")) {
      requestAnimationFrame(() => doc?.querySelector("[data-connector-panel]")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    if (domainButton.matches("[data-scroll-modes]")) {
      requestAnimationFrame(() => doc?.querySelector("[data-schedule-mode-panel]")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    return;
  }
  if (target.closest("[data-collapse-sidebar]")) { state.sidebarCollapsed = !state.sidebarCollapsed; rerender(); return; }
  const preferenceButton = target.closest("[data-preference-key]");
  if (preferenceButton) { updatePreference(preferenceButton.dataset.preferenceKey, preferenceButton.dataset.preferenceValue); return; }
  if (target.closest("[data-preference-reset]")) { state.preferences = normalizePreferences(clone(DEFAULT_PREFERENCES)); applyTheme(); rerender(); return; }
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
  const academicPeriod = target.closest("[data-academic-period]");
  if (academicPeriod) {
    state.activeAcademicPeriodId = academicPeriod.dataset.academicPeriod;
    state.activeCourseId = null;
    saveState();
    rerender();
    return;
  }
  if (target.closest("[data-close-academic-period]")) {
    closeActiveAcademicPeriod();
    return;
  }
  const requirementTemplate = target.closest("[data-requirement-template]");
  if (requirementTemplate) {
    applyRequirementTemplate(requirementTemplate.dataset.requirementTemplate);
    return;
  }
  const requirementOverride = target.closest("[data-requirement-override]");
  if (requirementOverride) {
    updateRequirementOverride(requirementOverride.dataset.requirementOverride, requirementOverride.dataset.overrideStatus || "");
    return;
  }
  const courseStudyBlock = target.closest("[data-course-study-block]");
  if (courseStudyBlock) {
    addCourseStudyBlock(courseStudyBlock.dataset.courseStudyBlock);
    return;
  }
  const courseOpen = target.closest("[data-course-open]");
  if (courseOpen) {
    state.activeCourseId = courseOpen.dataset.courseOpen;
    state.subTabs.academy = "grades";
    saveState();
    rerender();
    return;
  }
  if (target.closest("[data-course-close]")) {
    state.activeCourseId = null;
    saveState();
    rerender();
    return;
  }
  const courseStatus = target.closest("[data-course-status]");
  if (courseStatus) {
    updateCourseLifecycle(courseStatus.dataset.courseStatus, courseStatus.dataset.statusValue);
    return;
  }
  const courseMove = target.closest("[data-course-move]");
  if (courseMove) {
    moveCourseToPeriod(courseMove.dataset.courseMove, courseMove.dataset.periodId);
    return;
  }
  const courseDelete = target.closest("[data-course-delete]");
  if (courseDelete) {
    deleteCoursePermanently(courseDelete.dataset.courseDelete);
    return;
  }
  const task = target.closest("[data-task-id]");
  if (task) {
    const id = Number(task.dataset.taskId);
    const current = state.tasks.find((item) => item.id === id);
    state.tasks = state.tasks.map((item) => item.id === id ? { ...item, done: !item.done } : item);
    rerender();
    if (current) logActivity({
      entityType: "task",
      actionType: current.done ? "reopened" : "completed",
      afterState: { title: current.title, domain: current.domain, done: !current.done },
    });
    return;
  }
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
      if (!hasAccess("pro")) {
        openPaywall("auto_plan", { feature: "schedule_mode", mode: state.pendingScheduleMode });
        return;
      }
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
  const checkinPreset = target.closest("[data-checkin-preset]");
  if (checkinPreset) {
    const [energy, focus, mood] = String(checkinPreset.dataset.checkinPreset || "").split(",").map(Number);
    state.checkin = { ...state.checkin, energy, focus, mood };
    rerender();
    return;
  }
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
  if (target.closest("[data-submit-checkin]")) { if (state.checkin.energy && state.checkin.focus && state.checkin.mood) { state.checkin.submitted = true; rerender(); notifyUser({ type: "mind_checkin", title: "Check-in logged", body: "Ember will treat this as schedule context, not a therapy score.", severity: "success" }); logActivity({ entityType: "mind", actionType: "checkin_logged", afterState: { summary: "Daily check-in logged", energy: state.checkin.energy, focus: state.checkin.focus, mood: state.checkin.mood, note: state.checkin.note || "" } }); await persistEmberCheckIn(); await persistEmberSnapshot("dashboard"); } return; }
  if (target.closest("[data-reset-checkin]")) { state.checkin = { energy: 0, focus: 0, mood: 0, note: "", submitted: false }; rerender(); return; }
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
  if (target.closest("[data-onboarding-skip]")) { state.onboarding = { ...state.onboarding, tutorialOpen: false, tutorialSkipped: true }; rerender(); logActivity({ entityType: "onboarding", actionType: "skipped", afterState: { summary: "Guided onboarding skipped" } }); return; }
  if (target.closest("[data-onboarding-next]")) { advanceOnboarding(); return; }
  if (target.closest("[data-onboarding-back]")) { retreatOnboarding(); return; }
  if (target.closest("[data-help-dismiss]")) { state.onboarding = { ...state.onboarding, sectionHelpSeen: { ...(state.onboarding?.sectionHelpSeen || {}), [state.activeDomain]: true } }; rerender(); return; }
  if (target.closest("[data-dismiss-toast]")) { state.toast = null; clearTimeout(state.toastTimer); renderToast(); }
});

doc?.addEventListener("submit", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.matches("[data-manual-entry-form]")) {
    event.preventDefault();
    const type = target.dataset.manualEntryForm;
    const config = MANUAL_ENTRY_CONFIG[type];
    const formData = new FormData(target);
    const values = Object.fromEntries(formData.entries());
    const missing = config?.fields.find((field) => field.required && !String(values[field.key] || "").trim());
    if (missing) {
      state.manualEntry = { ...state.manualEntry, error: `${missing.label} is required.` };
      renderManualEntrySheet();
      return;
    }
    closeManualEntrySheet();
    await handleManualEntry(type, values);
    return;
  }
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
  const appearanceNumber = target.closest("[data-appearance-number]");
  if (appearanceNumber) { updateAppearancePreference(appearanceNumber.dataset.appearanceNumber, appearanceNumber.value); return; }
  const appearanceRange = target.closest("[data-appearance-range]");
  if (appearanceRange) { updateAppearancePreference(appearanceRange.dataset.appearanceRange, appearanceRange.value); return; }
  const themeDraftInput = target.closest("[data-theme-draft]");
  if (themeDraftInput) { updateThemeDraft(themeDraftInput.dataset.themeDraft, themeDraftInput.value); return; }
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
  const checkinNote = target.closest("[data-checkin-note]");
  if (checkinNote) { state.checkin = { ...state.checkin, note: checkinNote.value }; saveState(); return; }
  const emberPrompt = target.closest("[data-ember-prompt]");
  if (emberPrompt) {
    state.emberInteraction = { ...(state.emberInteraction || {}), prompt: emberPrompt.value };
    saveState();
    return;
  }
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
  if (state.uploadSheetOpen && event.key === "Escape") {
    event.preventDefault();
    closeUploadSheet();
    return;
  }
  if (state.manualEntry?.open && event.key === "Escape") {
    event.preventDefault();
    closeManualEntrySheet();
    return;
  }
  if (state.paywall?.open && event.key === "Escape") {
    event.preventDefault();
    closePaywall();
    return;
  }
  if (state.appearancePanelOpen && event.key === "Escape") {
    event.preventDefault();
    state.appearancePanelOpen = false;
    renderAppearanceSettings();
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
    logActivity({
      entityType: "onboarding",
      actionType: "completed",
      afterState: { summary: "Guided onboarding completed" },
    });
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
      name: workspace.name || "My Ember Workspace",
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
    const activity = await loadActivityLogRecords(state.auth.client, workspace.id);
    if (activity.length) state.activityLog = activity.map(normalizeActivity);
    try {
      const emberStates = await loadEmberStateRecords(state.auth.client, workspace.id, user.id);
      const emberMessages = await loadEmberMessageRecords(state.auth.client, workspace.id, user.id);
      const emberEvents = await loadEmberNotificationEventRecords(state.auth.client, workspace.id, user.id);
      state.ember = {
        ...state.ember,
        states: emberStates.map(normalizeEmberState),
        messages: emberMessages.map(normalizeEmberMessage),
        notificationEvents: emberEvents.map(normalizeEmberNotificationEvent),
      };
    } catch (error) {
      state.ember = { ...state.ember, error: error instanceof Error ? error.message : "Ember tables unavailable." };
    }
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
        title: "Welcome to your Ember workspace",
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
    state.finance = { accounts: [], transactions: [], subscriptions: [], savingsGoals: [] };
    state.subscription = clone(DEFAULT_SUBSCRIPTION);
    state.featureUsage = {};
    state.paywall = { open: false, trigger: "", sourceAction: null };
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
  setActiveDomain(next.activeDomain || state.activeDomain);
  state.sidebarCollapsed = next.sidebarCollapsed;
  state.tasks = next.tasks;
  state.courses = next.courses;
  state.schedule = next.schedule;
  state.bills = next.bills;
  state.budget = next.budget;
  state.paychecks = next.paychecks;
  state.finance = next.finance;
  state.subscription = next.subscription;
  state.featureUsage = next.featureUsage;
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
  scrollAppToTop();
  bootstrapAuth();
}
