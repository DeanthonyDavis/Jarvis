export const TOKENS = {
  command: "var(--cmd)",
  academy: "var(--acad)",
  works: "var(--work)",
  life: "var(--life)",
  future: "var(--fut)",
  mind: "var(--mind)",
  notebook: "var(--note)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

export const DOMAINS = [
  { id: "command", label: "Plan", icon: "&#9889;", blurb: "Next block + conflicts" },
  { id: "academy", label: "School", icon: "&#127891;", blurb: "Classes, due dates, exams" },
  { id: "works", label: "Work", icon: "&#128188;", blurb: "Shifts, hours, pay" },
  { id: "life", label: "Money", icon: "&#127968;", blurb: "Bills, income, spend" },
  { id: "future", label: "Path", icon: "&#128640;", blurb: "Goals, skills, next steps" },
  { id: "mind", label: "Recovery", icon: "&#129504;", blurb: "Energy, focus, rest" },
  { id: "notebook", label: "Sources", icon: "&#128211;", blurb: "Files, notes, review" },
];

export const COURSES = [
  { id: 1, name: "Calculus II", code: "MATH 242", grade: 87, target: 90, trend: 2.1, exam: "Apr 12", platform: "Canvas", color: TOKENS.academy, hist: [72, 78, 84, 87] },
  { id: 2, name: "Organic Chemistry", code: "CHEM 301", grade: 74, target: 85, trend: -1.3, exam: "Apr 9", platform: "Blackboard", color: TOKENS.life, hist: [68, 72, 70, 74] },
  { id: 3, name: "Engineering Statics", code: "ENGR 201", grade: 91, target: 90, trend: 3.7, exam: "Apr 18", platform: "Canvas", color: TOKENS.works, hist: [88, 90, 89, 91] },
  { id: 4, name: "Technical Writing", code: "ENGL 210", grade: 95, target: 90, trend: 1.2, exam: null, platform: "Canvas", color: TOKENS.future, hist: [92, 93, 94, 95] },
];

export const INITIAL_TASKS = [
  { id: 1, title: "Calculus Problem Set #8", domain: "academy", due: "Today · 11:59 PM", urgent: true, done: false, course: "MATH 242" },
  { id: 2, title: "Orgo Lab Report Draft", domain: "academy", due: "Apr 7 · 11:59 PM", urgent: true, done: false, course: "CHEM 301" },
  { id: 3, title: "Follow up: Google interview", domain: "works", due: "Today · 5:00 PM", urgent: true, done: false },
  { id: 4, title: "Pay rent", domain: "life", due: "Apr 8", urgent: true, done: false },
  { id: 5, title: "Statics Ch. 9 reading", domain: "academy", due: "Apr 8", urgent: false, done: false, course: "ENGR 201" },
  { id: 6, title: "Update resume", domain: "future", due: "Apr 10", urgent: false, done: false },
  { id: 7, title: "Grocery run", domain: "life", due: "Apr 7", urgent: false, done: true },
  { id: 8, title: "Submit time sheet", domain: "works", due: "Apr 7 · EOD", urgent: false, done: true },
];

export const SCHEDULE = [
  { time: "8:00", label: "Calculus II", domain: "academy", mins: 75 },
  { time: "9:30", label: "Deep Study - Orgo", domain: "academy", mins: 90 },
  { time: "11:00", label: "Lunch + Reset", domain: "life", mins: 60 },
  { time: "12:00", label: "Work Shift @ Lab", domain: "works", mins: 180 },
  { time: "3:00", label: "Engineering Statics", domain: "academy", mins: 75 },
  { time: "4:30", label: "Calc Problem Set", domain: "academy", mins: 60 },
  { time: "6:00", label: "Dinner + Decompress", domain: "mind", mins: 60 },
  { time: "7:00", label: "Portfolio: GitHub", domain: "future", mins: 90 },
  { time: "9:00", label: "Wind Down + Journal", domain: "mind", mins: 60 },
];

export const GOALS = [
  { id: 1, title: "SWE Internship", type: "90-day", pct: 35, domain: "future", tasks: 8, done: 3 },
  { id: 2, title: "Semester GPA 3.5", type: "90-day", pct: 62, domain: "academy", tasks: 4, done: 2 },
  { id: 3, title: "Ship 2 portfolio projects", type: "1-year", pct: 20, domain: "future", tasks: 12, done: 2 },
  { id: 4, title: "Pay off credit card", type: "1-year", pct: 45, domain: "life", tasks: 5, done: 2 },
];

export const CHECKINS = [
  { day: "M", e: 4, f: 5, m: 4 },
  { day: "T", e: 3, f: 3, m: 3 },
  { day: "W", e: 2, f: 2, m: 2 },
  { day: "T", e: 3, f: 4, m: 3 },
  { day: "F", e: 4, f: 4, m: 4 },
  { day: "S", e: 5, f: 3, m: 5 },
  { day: "S", e: 4, f: 4, m: 4 },
];

export const NOTES = [
  { id: 1, title: "Orgo: Reaction Mechanisms Ch. 7", domain: "academy", updated: "2h ago", tags: ["exam-prep", "mechanisms"], summary: "Reaction maps, acid/base checkpoints, and a retrieval-practice set waiting to be generated." },
  { id: 2, title: "Google Interview Prep", domain: "works", updated: "Yesterday", tags: ["interview", "leetcode"], summary: "System design prompts, STAR stories, and the next four coding drills for the STEP round." },
  { id: 3, title: "5-Year Vision Statement", domain: "future", updated: "3 days ago", tags: ["vision", "goals"], summary: "A career and life narrative that anchors internship choices, savings goals, and what to say no to." },
  { id: 4, title: "Monthly Budget - April", domain: "life", updated: "Apr 1", tags: ["finance", "budget"], summary: "Income cadence, fixed bills, and a cash buffer scenario tied to rent and transport." },
  { id: 5, title: "Brain Dump - Tuesday", domain: "mind", updated: "Apr 4", tags: ["reflection", "journal"], summary: "Pattern notes from a high-friction week, including sleep tradeoffs and notification overload." },
  { id: 6, title: "Statics: Truss Analysis", domain: "academy", updated: "Apr 3", tags: ["exam-prep", "trusses"], summary: "Worked examples, error patterns, and a spaced-review schedule for this unit." },
];

export const TOASTS = [
  "Orgo exam in 4 days - tonight's study block shifted earlier to protect energy.",
  "Calculus quiz posted: 88/100. Semester average now 87%.",
  "Work shift confirmed for Wednesday. Deep-work blocks stayed protected.",
  "Rent due in 3 days. Cash buffer remains positive after paycheck lands.",
  "Low-energy signal detected. Friday load softened by one hour.",
];

export const PIPELINE = [
  { company: "Meta", role: "SWE Intern", stage: "Applied", note: "No response yet - follow up Apr 11", color: TOKENS.warn },
  { company: "Google", role: "STEP Intern", stage: "Interviewing", note: "Technical round scheduled for Apr 12", color: TOKENS.works },
];

export const SHIFTS = [
  { day: "Mon", hours: "9 AM-1 PM", pay: 56 },
  { day: "Wed", hours: "9 AM-3 PM", pay: 84 },
  { day: "Fri", hours: "10 AM-2 PM", pay: 56 },
];

export const BILLS = [
  { name: "Rent", amount: "$850", due: "Apr 8", soon: true },
  { name: "Electric", amount: "$62", due: "Apr 15", soon: false },
  { name: "Spotify", amount: "$9.99", due: "Apr 20", soon: false },
  { name: "Phone", amount: "$45", due: "Apr 22", soon: false },
];

export const DEFAULT_BUDGET = {
  income: 1400,
  spent: 920,
  saved: 230,
  left: 250,
};

export const DEFAULT_PAYCHECKS = [
  { label: "Campus Lab paycheck", date: "Apr 7", amount: 420 },
];

export const HABITS = [
  { label: "Sleep 7+ hours", data: [1, 1, 0, 1, 1, 0, 1] },
  { label: "Exercise", data: [1, 0, 1, 0, 1, 0, 1] },
  { label: "Hydration", data: [1, 1, 1, 0, 1, 1, 1] },
  { label: "Meals logged", data: [1, 1, 0, 0, 1, 1, 1] },
];

export const CAREER_SKILLS = [
  { name: "Data Structures", pct: 60 },
  { name: "System Design", pct: 0 },
  { name: "Portfolio Projects", pct: 20 },
  { name: "Behavioral Interviews", pct: 40 },
  { name: "LeetCode Practice", pct: 35 },
];

export const MILESTONES = [
  { label: "Google STEP - technical interview", date: "Apr 12", hot: true },
  { label: "Resume updated for fall apps", date: "May 1", hot: false },
  { label: "Two GitHub projects live", date: "Jun 1", hot: false },
  { label: "Fall internship apps open", date: "Aug 15", hot: false },
];

export const MIND_INSIGHTS = [
  { icon: "&#127769;", title: "Sleep pattern", body: "Average is 6.2 hours. The kernel adds a calmer wind-down at 9 PM." },
  { icon: "&#9889;", title: "Peak focus", body: "Wednesday mornings still test best for hard cognitive work." },
  { icon: "&#128277;", title: "Notification shield", body: "Non-urgent alerts are batched into three windows to reduce switching costs." },
  { icon: "&#128293;", title: "Burnout forecast", body: "Risk stays low when sleep improves. No pseudo-therapy, just load-aware scheduling." },
];

export const DEFAULT_CONSTRAINTS = {
  hard: {
    lockClasses: true,
    lockWorkShifts: true,
    protectRecoveryBlocks: true,
    earliestScheduleHour: 0,
    latestScheduleHour: 22,
    maxDeepWorkBlocks: 3,
    reservedDaypart: "none",
    minSleepHours: 7,
    windDownHour: 22,
    maxFocusBlockMinutes: 90,
  },
  soft: {
    morningFocusBias: 4,
    lowEnergyProtection: 5,
    keepEveningLight: 4,
    protectFutureWork: 3,
    batchShallowWork: 3,
  },
};

export const DEFAULT_SOURCE_CONFIG = {
  remoteUrl: "",
  autoSync: false,
  lastSyncAt: null,
  lastSyncStatus: "idle",
  lastError: "",
  draftPayload: "",
};
