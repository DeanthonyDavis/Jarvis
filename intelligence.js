import { DEFAULT_BUDGET, DEFAULT_CONSTRAINTS, DEFAULT_PAYCHECKS } from "./apex-data.js";

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const DOMAIN_LABELS = {
  academy: "Academy",
  works: "Works",
  life: "Life",
  future: "Future",
  mind: "Mind",
  notebook: "Notebook",
  command: "Command",
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "plus",
  "deep",
  "study",
  "block",
  "shift",
  "today",
  "draft",
]);

const CLAMP = (value, min, max) => Math.max(min, Math.min(max, value));

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function diffMinutes(later, earlier) {
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60));
}

function diffHours(target, now) {
  return (target.getTime() - now.getTime()) / (1000 * 60 * 60);
}

function diffDays(target, now) {
  return (startOfDay(target).getTime() - startOfDay(now).getTime()) / (1000 * 60 * 60 * 24);
}

function parseClock(text, defaultHour = 18, defaultMinute = 0) {
  const match = String(text).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) {
    if (/eod/i.test(text)) return { hour: 17, minute: 0 };
    return { hour: defaultHour, minute: defaultMinute };
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3].toLowerCase();
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

function parseMonthDay(text, year) {
  const match = String(text).match(/\b([A-Za-z]{3,})\s+(\d{1,2})\b/);
  if (!match) return null;
  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  if (month === undefined) return null;
  return new Date(year, month, Number(match[2]));
}

function parseDueDate(rawText, now) {
  if (!rawText) return null;
  const text = String(rawText)
    .replace(/\u00b7/g, " ")
    .replace(/Â·/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let base = null;
  if (/^today/i.test(text)) {
    base = startOfDay(now);
  } else {
    base = parseMonthDay(text, now.getFullYear());
  }
  if (!base) return null;
  const clock = parseClock(text, /^today/i.test(text) ? 20 : 18, 0);
  base.setHours(clock.hour, clock.minute, 0, 0);
  return base;
}

function parseSimpleDate(rawText, now, hour = 12) {
  if (!rawText) return null;
  const base = parseMonthDay(rawText, now.getFullYear());
  if (!base) return null;
  base.setHours(hour, 0, 0, 0);
  return base;
}

function extractKeywords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapScore(a, b) {
  const aSet = new Set(extractKeywords(a));
  const bSet = new Set(extractKeywords(b));
  let score = 0;
  for (const token of aSet) {
    if (bSet.has(token)) score += 1;
  }
  return score;
}

export function normalizeConstraints(input = {}) {
  return {
    hard: {
      ...DEFAULT_CONSTRAINTS.hard,
      ...(input.hard || {}),
    },
    soft: {
      ...DEFAULT_CONSTRAINTS.soft,
      ...(input.soft || {}),
    },
  };
}

function inferTaskMinutes(task) {
  const title = String(task.title || "").toLowerCase();
  if (/(report|problem set|lab|project)/.test(title)) return 120;
  if (/(interview|resume|portfolio|reading|study)/.test(title)) return 60;
  if (/(pay|submit|follow up|email|time sheet|call)/.test(title)) return 20;
  return 45;
}

function inferTaskEnergy(task) {
  const title = String(task.title || "").toLowerCase();
  if (/(report|problem set|interview|portfolio|orgo|calc|statics)/.test(title)) return 3;
  if (/(reading|resume|follow up|email)/.test(title)) return 2;
  return 1;
}

function inferScheduleKind(item) {
  const label = String(item.label || "").toLowerCase();
  if (item.domain === "works" || /shift/.test(label)) return "work";
  if (item.domain === "mind" || /lunch|dinner|wind down|decompress|reset|journal/.test(label)) return "recovery";
  if (item.domain === "academy" && /calculus|statics|lecture|class/.test(label)) return "class";
  if (/study|problem set|portfolio|reading|prep/.test(label)) return "focus";
  return "support";
}

function getScheduleMinuteMarks(schedule) {
  let previous = null;
  return schedule.map((item) => {
    const text = String(item.time || "");
    const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!match) {
      const fallback = previous === null ? 9 * 60 : previous + 60;
      previous = fallback;
      return fallback;
    }
    const hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = match[3]?.toLowerCase();
    let absolute;
    if (period) {
      absolute = (hour % 12) * 60 + minute + (period === "pm" ? 12 * 60 : 0);
    } else {
      absolute = (hour % 12) * 60 + minute;
      while (previous !== null && absolute <= previous) {
        absolute += 12 * 60;
      }
    }
    previous = absolute;
    return absolute;
  });
}

function buildCourseInsights(courses, now) {
  return courses.map((course) => {
    const gradeGap = Math.max(0, (course.target || 0) - (course.grade || 0));
    const examDate = parseSimpleDate(course.exam, now, 11);
    const daysToExam = examDate ? diffDays(examDate, now) : null;
    const score =
      gradeGap * 8 +
      ((course.trend || 0) < 0 ? Math.abs(course.trend) * 10 : 0) +
      (daysToExam !== null && daysToExam <= 7 ? (8 - Math.max(daysToExam, 0)) * 5 : 0);
    return {
      ...course,
      platform: course.platform || course.plat || "",
      examDate,
      daysToExam,
      riskScore: CLAMP(Math.round(score), 0, 100),
      status: score >= 45 ? "at-risk" : score >= 20 ? "watch" : "stable",
    };
  });
}

function buildBillInsights(bills, now, budget, paychecks) {
  const paycheckRows = paychecks.map((paycheck) => ({
    ...paycheck,
    dateValue: parseSimpleDate(paycheck.date, now, 9),
  }));
  return bills.map((bill) => {
    const dueDate = parseSimpleDate(bill.due, now, 17);
    const amount = Number(String(bill.amount || 0).replace(/[^0-9.]/g, "")) || 0;
    const incomingBeforeDue = paycheckRows
      .filter((paycheck) => paycheck.dateValue && dueDate && paycheck.dateValue <= dueDate)
      .reduce((sum, paycheck) => sum + (Number(paycheck.amount) || 0), 0);
    const coverage = Number(budget.left || 0) + incomingBeforeDue;
    return {
      ...bill,
      amountValue: amount,
      dueDate,
      hoursUntilDue: dueDate ? diffHours(dueDate, now) : null,
      daysUntilDue: dueDate ? diffDays(dueDate, now) : null,
      covered: coverage >= amount,
      coverage,
    };
  });
}

function buildTaskInsights(tasks, now, courseInsights) {
  const courseByCode = new Map(courseInsights.map((course) => [course.code, course]));
  return tasks
    .filter((task) => !task.done)
    .map((task) => {
      const dueDate = parseDueDate(task.due, now);
      const hoursUntilDue = dueDate ? diffHours(dueDate, now) : null;
      const course = task.course ? courseByCode.get(task.course) : null;
      let score = task.urgent ? 35 : 12;
      if (hoursUntilDue !== null) {
        if (hoursUntilDue <= 0) score += 50;
        else if (hoursUntilDue <= 12) score += 38;
        else if (hoursUntilDue <= 24) score += 32;
        else if (hoursUntilDue <= 48) score += 24;
        else if (hoursUntilDue <= 72) score += 18;
        else if (hoursUntilDue <= 120) score += 10;
      }
      if (course) score += Math.round(course.riskScore * 0.35);
      if (task.domain === "life" && /rent|pay/i.test(task.title || "")) score += 18;
      if (task.domain === "works" && /interview|follow up/i.test(task.title || "")) score += 12;
      return {
        ...task,
        dueDate,
        hoursUntilDue,
        minutes: Number(task.minutes) || inferTaskMinutes(task),
        energy: Number(task.energy) || inferTaskEnergy(task),
        score,
        reason:
          course && course.status === "at-risk"
            ? `${course.name} is below target with an exam approaching.`
            : hoursUntilDue !== null && hoursUntilDue <= 24
              ? "Deadline is inside the next 24 hours."
              : task.urgent
                ? "Marked urgent and still open."
                : "Important but not yet critical.",
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildTaskChunks(taskInsights, constraints) {
  const cap = CLAMP(Number(constraints.hard.maxFocusBlockMinutes) || 90, 20, 180);
  const chunks = [];
  for (const task of taskInsights) {
    let remaining = Math.max(15, task.minutes);
    let index = 0;
    while (remaining > 0) {
      const preferred =
        task.energy >= 3
          ? Math.min(cap, 90)
          : task.energy === 2
            ? Math.min(cap, 60)
            : Math.min(cap, 30);
      let size = Math.min(remaining, preferred);
      if (remaining > preferred && remaining - size < 20) {
        size = remaining;
      }
      chunks.push({
        id: `${task.id}:${index}`,
        taskId: task.id,
        title: task.title,
        domain: task.domain,
        course: task.course,
        dueDate: task.dueDate,
        urgent: task.urgent,
        priority: task.score - index * 4,
        minutes: size,
        energy: task.energy,
      });
      remaining -= size;
      index += 1;
    }
  }
  return chunks;
}

function buildScheduleBlocks(schedule, now, constraints) {
  const base = startOfDay(now);
  const marks = getScheduleMinuteMarks(schedule);
  const windDownMinutes = CLAMP(Number(constraints.hard.windDownHour) || 22, 18, 24) * 60;
  return schedule.map((item, index) => {
    const kind = inferScheduleKind(item);
    const start = addMinutes(base, marks[index]);
    const end = addMinutes(start, Number(item.mins) || 0);
    const availableStart = start > now ? start : now;
    const availableEnd = end < addMinutes(base, windDownMinutes) ? end : addMinutes(base, windDownMinutes);
    const liveMinutes = Math.max(0, diffMinutes(availableEnd, availableStart));
    const lockedBy = [];
    if (kind === "class" && constraints.hard.lockClasses) lockedBy.push("class");
    if (kind === "work" && constraints.hard.lockWorkShifts) lockedBy.push("work");
    if (kind === "recovery" && constraints.hard.protectRecoveryBlocks) lockedBy.push("recovery");
    if (marks[index] >= windDownMinutes) lockedBy.push("wind-down");
    if (end <= now) lockedBy.push("elapsed");
    return {
      ...item,
      start,
      end,
      availableStart,
      availableEnd,
      kind,
      liveMinutes,
      remaining: lockedBy.includes("elapsed") ? 0 : liveMinutes,
      hardLocked: lockedBy.some((reason) => reason !== "elapsed") || liveMinutes <= 0,
      lockedBy,
      assignments: [],
      preferredDomain: item.domain,
      labelKeywords: extractKeywords(item.label),
    };
  });
}

function hoursBadge(date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function chunkUnscheduledPenalty(chunk, now) {
  let penalty = chunk.priority * 2.6;
  if (chunk.urgent) penalty += 45;
  if (chunk.dueDate) {
    const hours = diffHours(chunk.dueDate, now);
    if (hours <= 24) penalty += 24;
  }
  return penalty;
}

function scoreChunkForBlock(chunk, block, constraints, checkin, context) {
  if (block.remaining < chunk.minutes) return Number.NEGATIVE_INFINITY;
  if (block.hardLocked) return Number.NEGATIVE_INFINITY;
  if (chunk.dueDate && block.availableEnd > chunk.dueDate) return Number.NEGATIVE_INFINITY;

  let score = chunk.priority * 4;
  const startHour = block.availableStart.getHours();
  const overlap = overlapScore(`${block.label} ${block.domain}`, `${chunk.title} ${chunk.course || ""}`);
  score += overlap * 22;

  if (block.preferredDomain === chunk.domain) score += 20;
  if (block.kind === "focus" && chunk.energy >= 2) score += 14;
  if (block.kind === "focus" && chunk.energy === 1) score += 6;
  if (block.kind === "support" && chunk.energy <= 2) score += 10;
  if (block.kind === "support" && chunk.energy >= 3) score -= 10;
  if (block.kind === "recovery") score -= 22;

  if (startHour < 12 && chunk.energy >= 2) score += constraints.soft.morningFocusBias * 3.5;
  if (startHour >= 18 && chunk.energy >= 2) score -= constraints.soft.keepEveningLight * 4;
  if (block.preferredDomain === "future" && chunk.domain === "future") {
    score += constraints.soft.protectFutureWork * 4;
  }
  if (block.preferredDomain === "future" && chunk.domain !== "future") {
    score -= constraints.soft.protectFutureWork * 5;
  }

  if (checkin.submitted && checkin.energy <= 2) {
    score -= constraints.soft.lowEnergyProtection * chunk.energy * (startHour >= 17 ? 3 : 2);
  }
  if (checkin.submitted && checkin.focus <= 2 && chunk.energy >= 3 && block.kind !== "focus") {
    score -= constraints.soft.lowEnergyProtection * 3;
  }

  if (chunk.dueDate) {
    const leadHours = diffHours(chunk.dueDate, block.availableEnd);
    if (leadHours <= 12) score += 26;
    else if (leadHours <= 24) score += 18;
    else if (leadHours <= 48) score += 10;
  }

  const previous = block.assignments[block.assignments.length - 1];
  if (previous) {
    if (previous.domain === chunk.domain) score += constraints.soft.batchShallowWork * 2;
    if (previous.energy <= 1 && chunk.energy <= 1) score += constraints.soft.batchShallowWork * 4;
  }

  if (context.heavyLoad && chunk.domain === "future" && block.preferredDomain !== "future") {
    score -= constraints.soft.protectFutureWork * 2;
  }

  return score;
}

function explainChunkPlacement(chunk, block, constraints, checkin) {
  const reasons = [];
  const startHour = block.availableStart.getHours();
  const overlap = overlapScore(`${block.label} ${block.domain}`, `${chunk.title} ${chunk.course || ""}`);
  if (chunk.dueDate) {
    const leadHours = diffHours(chunk.dueDate, block.availableEnd);
    if (leadHours <= 12) reasons.push("deadline window");
    else if (leadHours <= 24) reasons.push("due in 24h");
  }
  if (block.preferredDomain === chunk.domain) reasons.push(`${DOMAIN_LABELS[chunk.domain] || chunk.domain} block`);
  if (block.kind === "focus" && chunk.energy >= 2) reasons.push("focus block fit");
  if (startHour < 12 && chunk.energy >= 2 && constraints.soft.morningFocusBias >= 6) reasons.push("morning focus mode");
  if (startHour >= 18 && chunk.energy >= 2 && constraints.soft.keepEveningLight >= 6) reasons.push("evening penalty avoided elsewhere");
  if (checkin.submitted && checkin.energy <= 2 && chunk.energy <= 2) reasons.push("low-energy safe");
  if (overlap > 0) reasons.push("matched block context");
  if (!reasons.length) reasons.push("best available fit");
  return `Why: ${reasons.slice(0, 3).join(", ")}.`;
}

function solveSchedule({ now, schedule, taskInsights, constraints, checkin }) {
  const blocks = buildScheduleBlocks(schedule, now, constraints);
  const rawChunks = buildTaskChunks(taskInsights, constraints)
    .filter((chunk) => !chunk.dueDate || diffDays(chunk.dueDate, now) <= 5 || chunk.urgent)
    .filter((chunk) => !chunk.dueDate || chunk.dueDate > now);

  const context = {
    heavyLoad: taskInsights.filter((task) => task.urgent).length >= 3,
  };

  const candidateCount = new Map();
  for (const chunk of rawChunks) {
    const count = blocks.filter((block) => scoreChunkForBlock(chunk, block, constraints, checkin, context) > Number.NEGATIVE_INFINITY).length;
    candidateCount.set(chunk.id, count);
  }

  const chunks = rawChunks.sort((a, b) => {
    const availabilityDelta = (candidateCount.get(a.id) || 0) - (candidateCount.get(b.id) || 0);
    if (availabilityDelta !== 0) return availabilityDelta;
    return b.priority - a.priority;
  });

  const best = {
    score: Number.NEGATIVE_INFINITY,
    scheduledMinutes: -1,
    blocks: blocks.map((block) => ({ ...block, assignments: [] })),
    unscheduled: [],
  };

  function snapshotBlocks(source) {
    return source.map((block) => ({
      ...block,
      assignments: block.assignments.map((assignment) => ({ ...assignment })),
    }));
  }

  function recordSolution(score, blockState, unscheduled, scheduledMinutes) {
    if (score > best.score || (score === best.score && scheduledMinutes > best.scheduledMinutes)) {
      best.score = score;
      best.scheduledMinutes = scheduledMinutes;
      best.blocks = snapshotBlocks(blockState);
      best.unscheduled = unscheduled.map((item) => ({ ...item }));
    }
  }

  function search(index, blockState, unscheduled, score, scheduledMinutes) {
    if (index >= chunks.length) {
      recordSolution(score, blockState, unscheduled, scheduledMinutes);
      return;
    }

    const chunk = chunks[index];
    const options = [];
    for (let blockIndex = 0; blockIndex < blockState.length; blockIndex += 1) {
      const block = blockState[blockIndex];
      const localScore = scoreChunkForBlock(chunk, block, constraints, checkin, context);
      if (localScore > Number.NEGATIVE_INFINITY) {
        options.push({ blockIndex, localScore });
      }
    }

    options.sort((a, b) => b.localScore - a.localScore);
    for (const option of options.slice(0, 6)) {
      const block = blockState[option.blockIndex];
      const assignment = {
        ...chunk,
        placement: `${hoursBadge(block.availableStart)} fit`,
        score: option.localScore,
        why: explainChunkPlacement(chunk, block, constraints, checkin),
        confidence: CLAMP(Math.round(option.localScore / 8), 35, 98),
      };
      block.assignments.push(assignment);
      block.remaining -= chunk.minutes;
      search(index + 1, blockState, unscheduled, score + option.localScore, scheduledMinutes + chunk.minutes);
      block.remaining += chunk.minutes;
      block.assignments.pop();
    }

    unscheduled.push(chunk);
    search(index + 1, blockState, unscheduled, score - chunkUnscheduledPenalty(chunk, now), scheduledMinutes);
    unscheduled.pop();
  }

  search(0, blocks.map((block) => ({ ...block, assignments: [] })), [], 0, 0);

  const flexibleCapacityMinutes = best.blocks
    .filter((block) => !block.hardLocked && !block.lockedBy.includes("elapsed"))
    .reduce((sum, block) => sum + block.liveMinutes, 0);

  const schedulePlan = best.blocks.map((block) => {
    const assignedMinutes = block.assignments.reduce((sum, assignment) => sum + assignment.minutes, 0);
    const remainingMinutes = Math.max(0, block.liveMinutes - assignedMinutes);
    let note = "Hard constraint preserved.";
    if (block.lockedBy.includes("elapsed")) note = "Elapsed earlier today.";
    else if (!block.hardLocked && block.assignments.length) note = "Solver allocated the highest-scoring work here.";
    else if (!block.hardLocked && !block.assignments.length) note = "Flexible capacity remained unused.";
    else if (block.lockedBy.includes("recovery")) note = "Protected recovery block.";
    else if (block.lockedBy.includes("class")) note = "Class time stayed locked.";
    else if (block.lockedBy.includes("work")) note = "Work shift stayed locked.";
    return {
      ...block,
      assignedMinutes,
      remainingMinutes,
      status: block.hardLocked ? "locked" : block.assignments.length ? "assigned" : "open",
      note,
    };
  });

  const unscheduledMinutes = best.unscheduled.reduce((sum, chunk) => sum + chunk.minutes, 0);
  const unscheduledUrgentCount = best.unscheduled.filter((chunk) => chunk.urgent).length;

  return {
    schedulePlan,
    summary: {
      totalChunks: chunks.length,
      scheduledChunks: best.blocks.reduce((sum, block) => sum + block.assignments.length, 0),
      scheduledMinutes: best.scheduledMinutes < 0 ? 0 : best.scheduledMinutes,
      unscheduledMinutes,
      unscheduledUrgentCount,
      flexibleCapacityMinutes,
      hardGuardrails: best.blocks.filter((block) => block.hardLocked && !block.lockedBy.includes("elapsed")).length,
      score: Math.round(best.score),
      unscheduled: best.unscheduled,
    },
  };
}

function buildWeeklyOutlook(now, taskInsights, courseInsights, billInsights) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(startOfDay(now), offset);
    const taskWeight = taskInsights
      .filter((task) => task.dueDate && diffDays(task.dueDate, date) === 0)
      .reduce((sum, task) => sum + task.score, 0);
    const examWeight = courseInsights
      .filter((course) => course.examDate && diffDays(course.examDate, date) === 0)
      .reduce((sum, course) => sum + course.riskScore + 20, 0);
    const billWeight = billInsights
      .filter((bill) => bill.dueDate && diffDays(bill.dueDate, date) === 0)
      .reduce((sum, bill) => sum + (bill.covered ? 14 : 28), 0);
    const total = taskWeight + examWeight + billWeight;
    return {
      date,
      score: total,
      level: total >= 80 ? "high" : total >= 35 ? "medium" : "low",
    };
  });
}

function buildDomainLoads(taskInsights, schedulePlan, courseInsights, billInsights) {
  const loadMap = new Map([
    ["academy", 10],
    ["works", 8],
    ["life", 8],
    ["future", 6],
    ["mind", 4],
  ]);

  for (const task of taskInsights) {
    loadMap.set(task.domain, (loadMap.get(task.domain) || 0) + task.score * 0.75);
  }

  for (const block of schedulePlan) {
    const lockedWeight = block.hardLocked ? 0.24 : 0.12;
    loadMap.set(block.domain, (loadMap.get(block.domain) || 0) + block.liveMinutes * lockedWeight);
    for (const assignment of block.assignments) {
      loadMap.set(assignment.domain, (loadMap.get(assignment.domain) || 0) + assignment.minutes * 0.48);
    }
  }

  const academyRisk = courseInsights.reduce((sum, course) => sum + course.riskScore, 0) * 0.25;
  const lifeRisk = billInsights.reduce((sum, bill) => sum + (bill.daysUntilDue !== null && bill.daysUntilDue <= 3 ? 16 : 6), 0);
  loadMap.set("academy", (loadMap.get("academy") || 0) + academyRisk);
  loadMap.set("life", (loadMap.get("life") || 0) + lifeRisk);

  const total = [...loadMap.values()].reduce((sum, value) => sum + value, 0);
  return [...loadMap.entries()]
    .map(([domain, raw]) => ({
      domain,
      label: DOMAIN_LABELS[domain],
      pct: total ? Math.round((raw / total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
}

function buildConflicts({ courseInsights, billInsights, schedulePlan, checkin, loadScore, solverSummary }) {
  const conflicts = [];

  if (solverSummary.unscheduledUrgentCount > 0) {
    conflicts.push({
      severity: "crit",
      title: "Urgent work no longer fits the remaining day",
      text: `${solverSummary.unscheduledUrgentCount} urgent chunk(s) could not be placed before the current guardrails and deadlines.`,
      action: "Change constraints",
    });
  }

  const atRiskCourse = courseInsights.find((course) => course.status === "at-risk" && course.daysToExam !== null && course.daysToExam <= 7);
  if (atRiskCourse) {
    conflicts.push({
      severity: "warn",
      title: `${atRiskCourse.name} is approaching an exam below target`,
      text: `Exam is in ${Math.max(0, atRiskCourse.daysToExam)} day(s), grade is ${atRiskCourse.grade}%, and the solver is prioritizing recovery work around it.`,
      action: "Bias study blocks",
    });
  }

  const nextBill = billInsights
    .filter((bill) => bill.daysUntilDue !== null && bill.daysUntilDue <= 3)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0];
  if (nextBill) {
    conflicts.push({
      severity: nextBill.covered ? "info" : "warn",
      title: `${nextBill.name} is due soon`,
      text: nextBill.covered
        ? `Cash on hand plus known income covers ${nextBill.amount}.`
        : `Current coverage is tight for ${nextBill.amount}; the engine is flagging this before it becomes a scramble.`,
      action: nextBill.covered ? "Monitor" : "Resolve",
    });
  }

  const openBlocks = schedulePlan.filter((block) => block.status === "open").length;
  if (openBlocks === 0 && solverSummary.unscheduledMinutes > 0) {
    conflicts.push({
      severity: "warn",
      title: "No flexible capacity remains today",
      text: "Every remaining block is either locked or already spoken for by higher-scoring work.",
      action: "Rebalance",
    });
  }

  if (checkin.submitted && checkin.energy <= 2 && loadScore >= 70) {
    conflicts.push({
      severity: "warn",
      title: "Low energy is colliding with a heavy day",
      text: "The load is still high enough to justify protecting recovery and reducing context switching tonight.",
      action: "Stabilize day",
    });
  }

  if (!conflicts.length) {
    conflicts.push({
      severity: "info",
      title: "No critical collisions detected",
      text: "The current constraint set still yields a feasible day with visible tradeoffs.",
      action: "Stay steady",
    });
  }

  return conflicts.slice(0, 4);
}

function buildRecommendations({ taskInsights, courseInsights, billInsights, checkin, loadScore, solverSummary }) {
  const items = [];
  const topTask = taskInsights[0];
  const atRiskCourse = courseInsights.find((course) => course.status === "at-risk");
  const nextBill = billInsights
    .filter((bill) => bill.daysUntilDue !== null)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0];

  if (topTask) {
    items.push({
      title: "Start where the score is highest",
      text: `${topTask.title} is currently the highest-leverage move because ${topTask.reason.toLowerCase()}`,
      accent: topTask.domain,
    });
  }

  if (solverSummary.unscheduledUrgentCount > 0) {
    items.push({
      title: "A guardrail needs to move or capacity must expand",
      text: "The solver could not fit every urgent chunk. Loosen one hard rule, add a new block, or accept a carryover explicitly.",
      accent: "command",
    });
  }

  if (atRiskCourse) {
    items.push({
      title: "Keep grade recovery visible",
      text: `${atRiskCourse.name} remains the clearest academic drag on the system and deserves the strongest remaining focus slot.`,
      accent: "academy",
    });
  }

  if (checkin.submitted && checkin.energy <= 2) {
    items.push({
      title: "Reduce fragmentation, not just volume",
      text: "Low energy makes switching expensive. Batch shallow work and keep recovery intact even if a future block slips.",
      accent: "mind",
    });
  } else if (loadScore >= 70) {
    items.push({
      title: "Treat long-range work as the flex point",
      text: "Classes, work, and bills stay fixed first. Future work can move, but only explicitly and with a visible tradeoff.",
      accent: "future",
    });
  }

  if (nextBill) {
    items.push({
      title: "Keep the next cash obligation in view",
      text: `${nextBill.name} is the next household obligation and should remain visible until it clears.`,
      accent: "life",
    });
  }

  return items.slice(0, 4);
}

export function buildCommandCenterIntelligence({
  now,
  tasks,
  schedule,
  courses,
  bills,
  checkin,
  constraints,
  budget = DEFAULT_BUDGET,
  paychecks = DEFAULT_PAYCHECKS,
}) {
  const normalizedConstraints = normalizeConstraints(constraints);
  const courseInsights = buildCourseInsights(courses, now);
  const billInsights = buildBillInsights(bills, now, budget, paychecks);
  const taskInsights = buildTaskInsights(tasks, now, courseInsights);
  const solver = solveSchedule({
    now,
    schedule,
    taskInsights,
    constraints: normalizedConstraints,
    checkin,
  });
  const completedCount = tasks.filter((task) => task.done).length;
  const openUrgentCount = taskInsights.filter((task) => task.urgent).length;
  const domainLoads = buildDomainLoads(taskInsights, solver.schedulePlan, courseInsights, billInsights);
  const hasUserData =
    taskInsights.length > 0 ||
    courseInsights.length > 0 ||
    billInsights.length > 0 ||
    schedule.length > 0 ||
    Boolean(checkin.submitted);
  const baseLoad = hasUserData ? 18 + openUrgentCount * 7 + taskInsights.length * 2 : 0;
  const academicPressure = courseInsights.reduce((sum, course) => sum + course.riskScore, 0) * 0.12;
  const financePressure = billInsights.reduce((sum, bill) => sum + (bill.daysUntilDue !== null && bill.daysUntilDue <= 3 ? 5 : 1), 0);
  const energyPenalty = checkin.submitted ? (6 - checkin.energy) * 4 + (6 - checkin.focus) * 3 : 0;
  const solverPenalty = solver.summary.unscheduledUrgentCount * 8 + solver.summary.unscheduledMinutes * 0.03;
  const loadScore = hasUserData ? CLAMP(Math.round(baseLoad + academicPressure + financePressure + energyPenalty + solverPenalty), 8, 98) : 0;
  const loadLabel = !hasUserData ? "setup" : loadScore >= 78 ? "stabilize" : loadScore >= 62 ? "pressured" : "balanced";
  const loadDisplay = !hasUserData ? "Setup" : `${loadScore}%`;
  const loadExplanation = !hasUserData
    ? "Add tasks, classes, bills, calendar events, or a check-in before APEX estimates your load."
    : "Computed from urgent tasks, course risk, bill timing, check-ins, and solver fit.";
  const conflicts = buildConflicts({
    courseInsights,
    billInsights,
    schedulePlan: solver.schedulePlan,
    checkin,
    loadScore,
    solverSummary: solver.summary,
  });
  const recommendations = buildRecommendations({
    taskInsights,
    courseInsights,
    billInsights,
    checkin,
    loadScore,
    solverSummary: solver.summary,
  });
  const weeklyOutlook = buildWeeklyOutlook(now, taskInsights, courseInsights, billInsights);
  const hottestDay = weeklyOutlook.reduce((best, day) => (day.score > best.score ? day : best), weeklyOutlook[0]);

  return {
    generatedAt: now,
    loadScore,
    loadLabel,
    loadDisplay,
    loadExplanation,
    hasUserData,
    topPriorities: taskInsights.slice(0, 3),
    completedCount,
    openUrgentCount,
    courseInsights,
    billInsights,
    conflicts,
    recommendations,
    domainLoads,
    weeklyOutlook,
    hottestDay,
    schedulePlan: solver.schedulePlan,
    solverSummary: solver.summary,
    constraintsUsed: normalizedConstraints,
  };
}
