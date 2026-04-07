const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const hoursUntil = (value, now = new Date()) => {
  const due = toDate(value);
  return Math.round((due.getTime() - now.getTime()) / 36e5);
};

const dayName = (value) => toDate(value).toLocaleDateString("en-US", { weekday: "long" });

const normalizeDueText = (task) => String(task?.due || task?.date || "").trim();

function taskDueScore(task, now = new Date()) {
  const text = normalizeDueText(task).toLowerCase();
  if (!text) return 0;
  if (/today|tonight|11:59|midnight/.test(text)) return 100;
  if (/tomorrow/.test(text)) return 82;
  if (/this week|fri|thu|wed|tue|mon|sat|sun/.test(text)) return 62;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const hours = hoursUntil(parsed, now);
    if (hours <= 6) return 100;
    if (hours <= 24) return 86;
    if (hours <= 72) return 68;
  }
  return task?.urgent ? 78 : 34;
}

function topOpenTasks(tasks = [], now = new Date()) {
  return tasks
    .filter((task) => !task.done)
    .map((task) => ({ ...task, emberScore: taskDueScore(task, now) + (task.urgent ? 18 : 0) }))
    .sort((a, b) => b.emberScore - a.emberScore)
    .slice(0, 3);
}

function buildEmberStates({ state, intel, now = new Date() }) {
  const states = [];
  const urgentTask = topOpenTasks(state.tasks, now)[0];
  const conflicts = (intel?.conflicts || []).filter((item) => item.severity !== "info");
  const lowEnergy = state.checkin?.submitted && Number(state.checkin.energy || 0) <= 2;
  const heavyLoad = Number(intel?.loadScore || 0) >= 70;
  const overdue = state.tasks.filter((task) => !task.done && /overdue|late/i.test(String(task.due || "")));
  const completed = state.tasks.filter((task) => task.done).length;

  if (conflicts.length) {
    states.push({ stateKey: "conflict_day", severity: "high", context: { count: conflicts.length, title: conflicts[0].title, text: conflicts[0].text, dayName: dayName(now), date: now.toISOString() } });
  }
  if (urgentTask && (urgentTask.urgent || urgentTask.emberScore >= 86)) {
    states.push({ stateKey: "urgent_deadline", severity: "high", context: { taskId: urgentTask.id, taskTitle: urgentTask.title, courseName: urgentTask.course || urgentTask.domain || "school", due: urgentTask.due || "today" } });
  }
  if (lowEnergy && heavyLoad) {
    states.push({ stateKey: "burnout_risk", severity: "high", context: { energy: state.checkin.energy, loadScore: intel.loadScore, workloadHours: Math.round((intel.solverSummary?.scheduledMinutes || 0) / 60) } });
  }
  if (heavyLoad && !states.some((item) => item.stateKey === "burnout_risk")) {
    states.push({ stateKey: "overload_week", severity: "medium", context: { loadScore: intel.loadScore, plannedMinutes: intel.solverSummary?.scheduledMinutes || 0 } });
  }
  if (overdue.length) {
    states.push({ stateKey: "missed_task", severity: "medium", context: { count: overdue.length, taskTitle: overdue[0].title } });
  }
  if (completed >= 3) {
    states.push({ stateKey: "momentum_streak", severity: "low", context: { completed } });
  }
  if (!states.length) {
    states.push({ stateKey: "steady", severity: "low", context: {} });
  }
  return states;
}

function renderDashboardMessage(primaryState, { state, intel }) {
  const ctx = primaryState.context || {};
  const topTask = topOpenTasks(state.tasks)[0];
  switch (primaryState.stateKey) {
    case "conflict_day":
      return {
        title: `${ctx.dayName || "Today"} needs attention.`,
        body: `${ctx.title || "A conflict"} is making the plan less realistic. I can help review what should move, but I will not hide the tradeoff.`,
        ctaLabel: "Review conflicts",
        ctaAction: { type: "open_conflicts" },
        note: "Conflicts come from class, work, deadline, and load signals.",
      };
    case "urgent_deadline":
      return {
        title: "Start with the thing that can hurt first.",
        body: `${ctx.taskTitle} is the first thing that matters. Due ${ctx.due}. Keep everything else behind it until you make progress.`,
        ctaLabel: "See today's plan",
        ctaAction: { type: "open_plan" },
        note: "Priority is based on urgency, source confidence, and available blocks.",
      };
    case "burnout_risk":
      return {
        title: "This week is heavier than it looks.",
        body: "Your check-in is low and the schedule is stacked. I would protect one recovery slot before adding anything else.",
        ctaLabel: "See recovery plan",
        ctaAction: { type: "open_recovery" },
        note: "This is scheduler context, not a health diagnosis.",
      };
    case "overload_week":
      return {
        title: "The week is getting tight.",
        body: `${Math.round((ctx.plannedMinutes || 0) / 60)} hours are already planned. Do not add more unless something else moves.`,
        ctaLabel: "Open planner",
        ctaAction: { type: "open_plan" },
        note: "Load is computed from tasks, fixed events, money pressure, and check-ins.",
      };
    case "momentum_streak":
      return {
        title: "You have momentum. Use it carefully.",
        body: `You finished ${ctx.completed} things. Pick one high-value task next, then stop before the plan turns into a punishment loop.`,
        ctaLabel: "Preview tomorrow",
        ctaAction: { type: "preview_tomorrow" },
        note: "Win messages stay light so Ember does not become noisy.",
      };
    case "missed_task":
      return {
        title: "Something is starting to drag.",
        body: `${ctx.taskTitle || "A task"} looks overdue. Bring it back into the plan or intentionally drop it.`,
        ctaLabel: "Review manually",
        ctaAction: { type: "open_plan" },
        note: "Avoidance patterns need repeated signals before Ember escalates.",
      };
    default:
      return {
        title: topTask ? "Today is manageable. Start clean." : "Add one real thing and Ember can help.",
        body: topTask ? `${topTask.title} is the best first move. Start while the plan is still quiet.` : "Add a class, shift, task, or syllabus. Ember works best when the source data is real.",
        ctaLabel: topTask ? "See today's plan" : "Add a source",
        ctaAction: { type: topTask ? "open_plan" : "open_sources" },
        note: "Connected when possible. Manual when needed.",
      };
  }
}

function buildPlannerTake(primaryState, intel) {
  if (primaryState.stateKey === "conflict_day") {
    return {
      title: "Thursday does not work if everything stays fixed.",
      body: "Class, work, and serious tasks need more breathing room. I can move flexible work and keep locked blocks visible.",
      actions: ["Fix Thursday", "Keep it manual"],
    };
  }
  if (primaryState.stateKey === "burnout_risk") {
    return {
      title: "Do not solve overload by squeezing harder.",
      body: "Move one low-priority block, protect recovery, then keep the urgent task pinned.",
      actions: ["Protect recovery", "Keep it manual"],
    };
  }
  return {
    title: "The plan is usable if you start with the first block.",
    body: `${intel?.solverSummary?.scheduledMinutes || 0} minutes are scheduled under the current rules. Review the unscheduled list before adding more.`,
    actions: ["See today's plan", "Keep it manual"],
  };
}

function buildUploadGuidance(reviews = []) {
  const pending = reviews.filter((review) => review.parseStatus !== "confirmed");
  const lowConfidence = pending.filter((review) => Number(review.confidence || 0) < 0.7).length;
  if (!reviews.length) {
    return {
      title: "Upload a source when you want Ember to prove it.",
      body: "Syllabi and assignment sheets stay in review first. Nothing gets dumped into your calendar without confirmation.",
      ctaLabel: "Upload file",
    };
  }
  return {
    title: `Found ${pending.length} review card${pending.length === 1 ? "" : "s"}.`,
    body: lowConfidence ? `A few look messy, so I kept them as suggestions. Double-check the ${lowConfidence} lower-confidence item${lowConfidence === 1 ? "" : "s"}.` : "These look usable, but you still approve them before they become assignments.",
    ctaLabel: "Review deadlines",
  };
}

export function buildEmberIntelligence({ state, intel, now = new Date() }) {
  const states = buildEmberStates({ state, intel, now });
  const primaryState = states[0];
  return {
    states,
    primaryState,
    dashboard: renderDashboardMessage(primaryState, { state, intel }),
    planner: buildPlannerTake(primaryState, intel),
    upload: buildUploadGuidance(state.syllabusReviews || []),
    topThree: topOpenTasks(state.tasks || [], now),
  };
}
