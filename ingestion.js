const MIN_USEFUL_TEXT = 120;
const MONTH_PATTERN = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const cleanText = (value = "") => String(value).replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function bufferFromContent(contentBase64 = "") {
  const payload = String(contentBase64).includes(",") ? String(contentBase64).split(",").pop() : contentBase64;
  return Buffer.from(payload || "", "base64");
}

function fileExtension(name = "") {
  return String(name).toLowerCase().split(".").pop() || "";
}

function isTextLike(type = "", name = "") {
  const ext = fileExtension(name);
  return type.startsWith("text/") || ["txt", "md", "csv", "json", "html", "ics"].includes(ext);
}

function isPdf(type = "", name = "") {
  return type === "application/pdf" || fileExtension(name) === "pdf";
}

function isDocx(type = "", name = "") {
  const ext = fileExtension(name);
  return ext === "docx" || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isImage(type = "", name = "") {
  const ext = fileExtension(name);
  return type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "tif", "tiff", "bmp"].includes(ext);
}

async function extractPdfText(buffer) {
  const mod = await import("pdf-parse");
  const parse = mod.default || mod;
  const result = await parse(buffer);
  return result.text || "";
}

async function extractDocxText(buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

async function extractImageText(buffer) {
  const tesseract = await import("tesseract.js");
  if (typeof tesseract.recognize === "function") {
    const result = await tesseract.recognize(buffer, "eng");
    return result?.data?.text || "";
  }
  if (typeof tesseract.createWorker === "function") {
    const worker = await tesseract.createWorker("eng");
    try {
      const result = await worker.recognize(buffer);
      return result?.data?.text || "";
    } finally {
      await worker.terminate();
    }
  }
  throw new Error("Tesseract API unavailable.");
}

export async function extractTextFromUpload(file) {
  const buffer = bufferFromContent(file.contentBase64);
  const type = file.type || "";
  const name = file.name || "upload";
  const warnings = [];
  let text = "";
  let method = "unsupported";

  if (isTextLike(type, name)) {
    text = buffer.toString("utf8");
    method = "plain-text";
  } else if (isPdf(type, name)) {
    try {
      text = await extractPdfText(buffer);
      method = "pdf-parse";
    } catch (error) {
      warnings.push(`PDF text extraction unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } else if (isDocx(type, name)) {
    try {
      text = await extractDocxText(buffer);
      method = "mammoth";
    } catch (error) {
      warnings.push(`DOCX text extraction unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  if (cleanText(text).length < MIN_USEFUL_TEXT && isImage(type, name)) {
    try {
      text = await extractImageText(buffer);
      method = "tesseract-ocr";
    } catch (error) {
      warnings.push(`Tesseract OCR fallback unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } else if (cleanText(text).length < MIN_USEFUL_TEXT && (isPdf(type, name) || isDocx(type, name))) {
    warnings.push("Text extraction returned limited text. Tesseract fallback is enabled for image uploads; scanned PDFs need a PDF-to-image render step before OCR.");
  }

  const cleaned = cleanText(text);
  return {
    text: cleaned,
    method,
    textStatus: cleaned.length >= MIN_USEFUL_TEXT ? "complete" : cleaned ? "partial" : "failed",
    warnings,
    charCount: cleaned.length,
    preview: cleaned.slice(0, 500),
  };
}

function firstMatch(lines, pattern) {
  const matcher = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  return lines.find((line) => matcher.test(line)) || "";
}

function parseDateItems(lines, labelPattern, type) {
  const dateRegex = new RegExp(`${MONTH_PATTERN}\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?(?:\\s+(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?`, "ig");
  const labelRegex = new RegExp(labelPattern, "i");
  return lines
    .filter((line) => labelRegex.test(line) || dateRegex.test(line))
    .flatMap((line) => {
      dateRegex.lastIndex = 0;
      const matches = [...line.matchAll(dateRegex)];
      return matches.map((match) => ({
        type,
        title: line.replace(/\s+/g, " ").slice(0, 140),
        dateText: match[0],
        status: "needs_review",
      }));
    })
    .slice(0, 12);
}

function parseWeights(lines) {
  const weightRegex = /([A-Za-z][A-Za-z\s/+-]{2,42})\s*[:\-]?\s*(\d{1,3})\s*%/g;
  const weights = [];
  for (const line of lines) {
    for (const match of line.matchAll(weightRegex)) {
      const label = match[1].trim().replace(/\s+/g, " ");
      const weight = Number(match[2]);
      if (label && weight > 0 && weight <= 100) weights.push({ label, weight });
    }
  }
  return weights.slice(0, 12);
}

function parseInstructor(line) {
  const match = line.match(/(?:instructor|professor|teacher|faculty)\s*[:\-]\s*(.+)$/i);
  return match?.[1]?.trim() || "";
}

const SECTION_TYPES = {
  important_dates: /^(important\s+dates?|academic\s+calendar|key\s+dates?|course\s+calendar)\b/i,
  tentative_schedule: /^(tentative\s+schedule|weekly\s+schedule|course\s+schedule|schedule\s+of\s+topics|calendar)\b/i,
  exams: /^(exams?|tests?|midterms?|final\s+exam)\b/i,
  labs: /^(labs?|laboratory|lab\s+schedule|simulation\s+labs?)\b/i,
  homework: /^(homework|assignments?|problem\s+sets?|online\s+homework)\b/i,
  grade_policy: /^(grading|grade\s+policy|course\s+grade|evaluation|weights?)\b/i,
  noise: /^(resources?|textbooks?|office\s+hours?|contact|communication|materials?)\b/i,
};

const EVENT_TYPES = new Set(["homework", "lab", "quiz", "exam", "final_exam", "break", "holiday", "policy", "info"]);

function detectSectionType(line = "") {
  const normalized = String(line).trim().replace(/[:\-–—]+$/, "");
  const compact = normalized.replace(/\s+/g, " ");
  for (const [type, pattern] of Object.entries(SECTION_TYPES)) {
    if (pattern.test(compact)) return type;
  }
  if (/important|key/i.test(compact) && /date/i.test(compact)) return "important_dates";
  if (/tentative|weekly|course/i.test(compact) && /schedule|calendar/i.test(compact)) return "tentative_schedule";
  if (/homework|assignment|problem\s+set/i.test(compact) && compact.length < 70) return "homework";
  if (/lab|laboratory/i.test(compact) && /schedule|experiment|report/i.test(compact) && compact.length < 90) return "labs";
  if (/exam|test|midterm|final/i.test(compact) && compact.length < 80) return "exams";
  if (/grading|weight|points|percent|policy/i.test(compact) && compact.length < 100) return "grade_policy";
  return "";
}

function looksLikeTableRow(line = "") {
  const value = String(line).trim();
  return /\t|\s{2,}|\|/.test(value)
    || (/(?:^|\s)(?:ch(?:apter)?\.?\s*)?\d{1,2}\b/i.test(value) && hasDate(value))
    || (/^(?:week|unit|module)\s+\d+/i.test(value) && hasDate(value));
}

function normalizeBlocks(text) {
  const lines = cleanText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let sectionType = "info";
  return lines.map((line, index) => {
    const detected = detectSectionType(line);
    if (detected) sectionType = detected;
    return {
      page: 1,
      line: index + 1,
      blockType: detected ? "heading" : looksLikeTableRow(line) ? "table_row" : /^[-*•]\s+/.test(line) ? "list_item" : "paragraph",
      text: line.replace(/^[-*•]\s+/, "").trim(),
      sectionType: detected || sectionType,
    };
  });
}

function inferYear(text = "") {
  const explicit = String(text).match(/\b(20\d{2})\b/);
  return explicit ? Number(explicit[1]) : new Date().getFullYear();
}

function hasDate(text = "") {
  return new RegExp(`${MONTH_PATTERN}\\.?\\s+\\d{1,2}|\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b`, "i").test(String(text));
}

function monthIndex(value = "") {
  const key = String(value).slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
}

function isoDate(year, month, day) {
  const safeYear = Number(year) || new Date().getFullYear();
  const safeMonth = String(Number(month) + 1).padStart(2, "0");
  const safeDay = String(Number(day)).padStart(2, "0");
  return `${safeYear}-${safeMonth}-${safeDay}`;
}

function parseDateRange(text = "", defaultYear = new Date().getFullYear()) {
  const value = String(text).replace(/\s+/g, " ");
  const monthRange = new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:\\s*(?:-|–|—|to)\\s*(?:(?:${MONTH_PATTERN})\\.?\\s+)?(\\d{1,2}))?(?:,\\s*(20\\d{2}))?`, "i");
  const monthMatch = value.match(monthRange);
  if (monthMatch) {
    const startMonth = monthIndex(monthMatch[1]);
    const endMonth = monthMatch[3] ? monthIndex(monthMatch[3]) : startMonth;
    const startDay = Number(monthMatch[2]);
    const endDay = Number(monthMatch[4] || startDay);
    const year = Number(monthMatch[5] || defaultYear);
    return {
      dateText: monthMatch[0],
      parsedStartDate: isoDate(year, startMonth, startDay),
      parsedEndDate: isoDate(year, endMonth, endDay),
    };
  }

  const numericRange = value.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*(?:-|–|—|to)\s*(?:(\d{1,2})\/)?(\d{1,2})(?:\/(\d{2,4}))?)?/);
  if (numericRange) {
    const startMonth = Number(numericRange[1]) - 1;
    const startDay = Number(numericRange[2]);
    const endMonth = Number(numericRange[4] || numericRange[1]) - 1;
    const endDay = Number(numericRange[5] || numericRange[2]);
    const rawYear = numericRange[3] || numericRange[6] || defaultYear;
    const year = Number(rawYear) < 100 ? 2000 + Number(rawYear) : Number(rawYear);
    return {
      dateText: numericRange[0],
      parsedStartDate: isoDate(year, startMonth, startDay),
      parsedEndDate: isoDate(year, endMonth, endDay),
    };
  }

  return { dateText: "", parsedStartDate: "", parsedEndDate: "" };
}

function normalizeEventType(text = "", sectionType = "") {
  const value = `${sectionType} ${text}`.toLowerCase();
  if (/spring\s+break|fall\s+break|winter\s+break|thanksgiving\s+break/.test(value)) return "break";
  if (/holiday|offices?\s+closed|no\s+class/.test(value)) return "holiday";
  if (/final\s+exam|comprehensive\s+final/.test(value)) return "final_exam";
  if (sectionType === "exams" || /\bexam\b|midterm|\btest\b/.test(value)) return "exam";
  if (/\bquiz\b/.test(value)) return "quiz";
  if (sectionType === "labs" || /\blab\b|laboratory/.test(value)) return "lab";
  if (sectionType === "homework" || /\bhw\b|homework|problem\s+set|assignment/.test(value)) return "homework";
  if (sectionType === "grade_policy" || /policy|grading|weight|percent|attendance|withdrawal/.test(value)) return "policy";
  return "info";
}

function chapterTitle(text = "", type = "homework") {
  const explicit = String(text).match(/\bch(?:apter)?\.?\s*(\d{1,2})\b/i)?.[1];
  const hwShorthand = type === "homework" ? String(text).match(/\b(\d{1,2})\s*hw\b|\bhw\s*(\d{1,2})\b/i) : null;
  const chapter = explicit || hwShorthand?.[1] || hwShorthand?.[2] || "";
  if (!chapter) return "";
  const label = type === "quiz" ? "Quiz" : type === "homework" ? "Homework" : "";
  return label ? `Chapter ${chapter} ${label}` : "";
}

function cleanEventTitle(text = "", type = "info") {
  const value = String(text)
    .replace(/\bweek\s+\d{1,2}\b/ig, " ")
    .replace(/\b(?:due|opens?|closes?|date|week)\b[:\s]*/ig, " ")
    .replace(/^\d{1,2}\s+(?=module|unit|topic|chapter|quiz|lab|homework)/i, " ")
    .replace(new RegExp(`${MONTH_PATTERN}\\.?\\s+\\d{1,2}(?:\\s*(?:-|–|—|to)\\s*(?:(?:${MONTH_PATTERN})\\.?\\s+)?\\d{1,2})?(?:,\\s*20\\d{2})?`, "ig"), " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*(?:-|–|—|to)\s*(?:\d{1,2}\/)?\d{1,2}(?:\/\d{2,4})?)?/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[|:\-–—,\s]+|[|:\-–—,\s]+$/g, "")
    .trim();
  if (type === "break") return value || "Academic Break";
  if (type === "holiday" && /holiday/i.test(text)) return value || "Holiday";
  if (type === "final_exam") return value || "Final Exam";
  if (type === "homework" || type === "quiz") return chapterTitle(text, type) || value.replace(/\bHW\b/ig, "Homework") || (type === "quiz" ? "Quiz" : "Homework");
  if (type === "lab") return value.replace(/\blab\b/i, "Lab") || "Lab";
  if (type === "exam") return value || "Exam";
  return value || text.slice(0, 120);
}

function makeCandidate(block, type, defaultYear, reason = "") {
  const dates = parseDateRange(block.text, defaultYear);
  const itemType = EVENT_TYPES.has(type) ? type : normalizeEventType(block.text, block.sectionType);
  return {
    itemType,
    type: itemType,
    rawTitle: block.text,
    title: cleanEventTitle(block.text, itemType),
    dateText: dates.dateText,
    parsedStartDate: dates.parsedStartDate,
    parsedEndDate: dates.parsedEndDate,
    dueAt: ["homework", "lab", "quiz"].includes(itemType) && dates.parsedStartDate ? `${dates.parsedStartDate}T23:59:00-06:00` : "",
    status: ["policy", "info"].includes(itemType) ? "skip" : "needs_review",
    confidence: 0,
    page: block.page,
    sectionType: block.sectionType,
    blockType: block.blockType,
    evidence: [reason || block.sectionType || block.blockType],
  };
}

function confidenceForItem(item, duplicateCount = 1) {
  let score = 0.35;
  if (item.blockType === "table_row") score += 0.4;
  if (item.parsedStartDate || item.dueAt) score += 0.3;
  if (duplicateCount > 1) score += 0.2;
  if (item.blockType === "paragraph") score -= 0.3;
  if (!item.parsedStartDate && !["policy", "info"].includes(item.itemType)) score -= 0.4;
  if (["break", "holiday", "exam", "final_exam"].includes(item.itemType)) score += 0.1;
  return Math.max(0.05, Math.min(0.99, Number(score.toFixed(2))));
}

function dedupeItems(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = [item.itemType, item.title.toLowerCase().replace(/[^a-z0-9]+/g, " "), item.parsedStartDate || item.dateText].join("|");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...item, evidenceCount: 1 });
    } else {
      grouped.set(key, {
        ...existing,
        evidenceCount: existing.evidenceCount + 1,
        evidence: [...new Set([...(existing.evidence || []), ...(item.evidence || [])])],
        rawTitle: existing.rawTitle.length <= item.rawTitle.length ? existing.rawTitle : item.rawTitle,
      });
    }
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, confidence: confidenceForItem(item, item.evidenceCount) }))
    .sort((a, b) => (a.parsedStartDate || "9999").localeCompare(b.parsedStartDate || "9999") || a.itemType.localeCompare(b.itemType));
}

function parseImportantDates(blocks, year) {
  return blocks
    .filter((block) => block.sectionType === "important_dates" || /spring\s+break|holiday|final\s+exam|withdrawal|offices?\s+closed/i.test(block.text))
    .map((block) => makeCandidate(block, normalizeEventType(block.text, block.sectionType), year, "important_dates"))
    .filter((item) => item.itemType !== "info" && (item.parsedStartDate || item.itemType === "policy"));
}

function parseExams(blocks, year) {
  return blocks
    .filter((block) => block.sectionType === "exams" || /\bexam\b|midterm|final\s+exam|\btest\b/i.test(block.text))
    .map((block) => makeCandidate(block, normalizeEventType(block.text, "exams"), year, "exams"))
    .filter((item) => ["exam", "final_exam"].includes(item.itemType) && item.parsedStartDate);
}

function parseLabs(blocks, year) {
  return blocks
    .filter((block) => block.sectionType === "labs" || /\blab\b|laboratory/i.test(block.text))
    .map((block) => makeCandidate(block, "lab", year, "labs"))
    .filter((item) => item.itemType === "lab" && item.parsedStartDate);
}

function parseHomework(blocks, year) {
  return blocks
    .filter((block) => block.sectionType === "homework" || /\bhw\b|homework|problem\s+set/i.test(block.text))
    .map((block) => makeCandidate(block, "homework", year, "homework"))
    .filter((item) => item.itemType === "homework" && item.parsedStartDate);
}

function parseWeeklySchedule(blocks, year) {
  const scheduleRows = blocks.filter((block) => block.sectionType === "tentative_schedule" && (block.blockType === "table_row" || hasDate(block.text)));
  const candidates = [];
  for (const block of scheduleRows) {
    const hardType = normalizeEventType(block.text, block.sectionType);
    if (["break", "holiday", "exam", "final_exam"].includes(hardType)) candidates.push(makeCandidate(block, hardType, year, "weekly_schedule"));
    if (/\bquiz\b/i.test(block.text)) candidates.push(makeCandidate(block, "quiz", year, "weekly_schedule"));
    if (/\blab\b|laboratory/i.test(block.text)) candidates.push(makeCandidate(block, "lab", year, "weekly_schedule"));
    if (/\bhw\b|homework|assignment|problem\s+set/i.test(block.text)) candidates.push(makeCandidate(block, "homework", year, "weekly_schedule"));
  }
  return candidates.filter((item) => item.parsedStartDate || ["break", "holiday"].includes(item.itemType));
}

function parseStructuredItems(text) {
  const year = inferYear(text);
  const blocks = normalizeBlocks(text);
  const items = dedupeItems([
    ...parseImportantDates(blocks, year),
    ...parseExams(blocks, year),
    ...parseLabs(blocks, year),
    ...parseHomework(blocks, year),
    ...parseWeeklySchedule(blocks, year),
  ]);
  const sections = [...new Set(blocks.map((block) => block.sectionType).filter(Boolean))];
  return { blocks, items, sections, year };
}

export function heuristicSyllabusParse(text, fileName = "upload") {
  const cleaned = cleanText(text);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 400);
  const joined = lines.join("\n");
  const structured = parseStructuredItems(cleaned);
  const fileStem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const codeMatch = joined.match(/\b[A-Z]{2,5}\s*[-]?\s*\d{2,4}[A-Z]?\b/) || fileStem.match(/\b[A-Z]{2,5}\s*[-]?\s*\d{2,4}[A-Z]?\b/);
  const syllabusLine = firstMatch(lines, /syllabus|course overview|course schedule/i);
  const instructorLine = firstMatch(lines, /instructor|professor|teacher|faculty/i);
  const assignments = structured.items.filter((item) => ["homework", "lab", "quiz"].includes(item.itemType));
  const exams = structured.items.filter((item) => ["exam", "final_exam", "break", "holiday"].includes(item.itemType));
  const gradingWeights = parseWeights(lines);
  const policies = [
    ...structured.items.filter((item) => ["policy", "info"].includes(item.itemType)),
    ...lines
    .filter((line) => /attendance|late|make.?up|academic integrity|honor|office hours|grading|policy/i.test(line))
    .slice(0, 8)
    .map((line) => ({ itemType: "policy", type: "policy", title: line.slice(0, 140), status: "skip", confidence: 0.45 })),
  ].slice(0, 12);
  const extractedItems = [...assignments, ...exams, ...policies].slice(0, 80);
  const averageItemConfidence = extractedItems.length ? extractedItems.reduce((sum, item) => sum + Number(item.confidence || 0.4), 0) / extractedItems.length : 0;
  const confidence = Math.min(0.96, Math.max(0.28, averageItemConfidence + (codeMatch ? 0.04 : 0) + (gradingWeights.length ? 0.04 : 0)));

  return {
    parser: "structured-heuristic",
    documentType: /syllabus/i.test(joined) || gradingWeights.length || exams.length ? "syllabus" : assignments.length ? "assignment_sheet" : "unknown",
    courseName: syllabusLine ? syllabusLine.replace(/syllabus/ig, "").replace(/[:|-]/g, " ").trim() || fileStem : fileStem,
    courseCode: codeMatch ? codeMatch[0].toUpperCase().replace("-", " ") : "Needs review",
    instructor: parseInstructor(instructorLine) || "Needs review",
    assignments,
    exams,
    gradingWeights,
    policies,
    extractedItems,
    confidence,
    sections: structured.sections,
    parserStats: {
      homework: extractedItems.filter((item) => item.itemType === "homework").length,
      labs: extractedItems.filter((item) => item.itemType === "lab").length,
      quizzes: extractedItems.filter((item) => item.itemType === "quiz").length,
      exams: extractedItems.filter((item) => ["exam", "final_exam"].includes(item.itemType)).length,
      breaks: extractedItems.filter((item) => ["break", "holiday"].includes(item.itemType)).length,
    },
    warning: confidence < 0.65 ? "Structured parsing found limited rows. Review before scheduling assignments." : "Review extracted dates and grading details before scheduling.",
    warnings: [],
    sourceTextLength: cleaned.length,
  };
}

function normalizeParsedSummary(summary, fallback) {
  return {
    parser: summary.parser || fallback.parser || "unknown",
    documentType: summary.documentType || fallback.documentType || "unknown",
    courseName: summary.courseName || fallback.courseName || "Needs review",
    courseCode: summary.courseCode || fallback.courseCode || "Needs review",
    instructor: summary.instructor || fallback.instructor || "Needs review",
    assignments: Array.isArray(summary.assignments) ? summary.assignments : fallback.assignments || [],
    exams: Array.isArray(summary.exams) ? summary.exams : fallback.exams || [],
    gradingWeights: Array.isArray(summary.gradingWeights) ? summary.gradingWeights : fallback.gradingWeights || [],
    policies: Array.isArray(summary.policies) ? summary.policies : fallback.policies || [],
    extractedItems: Array.isArray(summary.extractedItems) ? summary.extractedItems : fallback.extractedItems || [],
    confidence: Number(summary.confidence ?? fallback.confidence ?? 0.35),
    warning: summary.warning || fallback.warning || "Review before scheduling assignments.",
    warnings: Array.isArray(summary.warnings) ? summary.warnings : fallback.warnings || [],
    sourceTextLength: Number(summary.sourceTextLength ?? fallback.sourceTextLength ?? 0),
  };
}

async function parseWithOpenAI(text, fileName, fallback) {
  if (!process.env.OPENAI_API_KEY) return null;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["parser", "documentType", "courseName", "courseCode", "instructor", "assignments", "exams", "gradingWeights", "policies", "extractedItems", "confidence", "warning", "warnings", "sourceTextLength"],
    properties: {
      parser: { type: "string" },
      documentType: { type: "string", enum: ["syllabus", "assignment_sheet", "lecture_notes", "study_guide", "unknown"] },
      courseName: { type: "string" },
      courseCode: { type: "string" },
      instructor: { type: "string" },
      assignments: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "title", "dateText", "status"], properties: { type: { type: "string" }, title: { type: "string" }, dateText: { type: "string" }, status: { type: "string" } } } },
      exams: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "title", "dateText", "status"], properties: { type: { type: "string" }, title: { type: "string" }, dateText: { type: "string" }, status: { type: "string" } } } },
      gradingWeights: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "weight"], properties: { label: { type: "string" }, weight: { type: "number" } } } },
      policies: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "title", "status"], properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "string" } } } },
      extractedItems: { type: "array", items: { type: "object", additionalProperties: false, required: ["type", "title", "status"], properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "string" } } } },
      confidence: { type: "number" },
      warning: { type: "string" },
      warnings: { type: "array", items: { type: "string" } },
      sourceTextLength: { type: "number" },
    },
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      input: [
        {
          role: "system",
          content: "Extract syllabus and assignment information from user-provided source text. Do not invent dates, grades, instructor names, or policies. Mark uncertain fields as Needs review.",
        },
        {
          role: "user",
          content: `File: ${fileName}\n\nSource text:\n${text.slice(0, 24000)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "apex_syllabus_parse",
          strict: true,
          schema,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI parsing returned ${response.status}`);
  const data = await response.json();
  const output = data.output_text || data.output?.flatMap((item) => item.content?.map((part) => part.text || "").filter(Boolean) || []).join("\n") || "";
  return normalizeParsedSummary(JSON.parse(output), fallback);
}

async function parseWithExternalAi(text, fileName, fallback) {
  if (!process.env.APEX_AI_PARSE_URL) return null;
  const response = await fetch(process.env.APEX_AI_PARSE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName, text }),
  });
  if (!response.ok) throw new Error(`External AI parser returned ${response.status}`);
  return normalizeParsedSummary(await response.json(), fallback);
}

export async function parseSyllabusWithAi(text, fileName = "upload") {
  const fallback = heuristicSyllabusParse(text, fileName);
  const warnings = [];
  for (const parser of [parseWithExternalAi, parseWithOpenAI]) {
    try {
      const parsed = await parser(text, fileName, fallback);
      if (parsed) {
        const fallbackCount = Array.isArray(fallback.extractedItems) ? fallback.extractedItems.length : 0;
        const parsedCount = Array.isArray(parsed.extractedItems) ? parsed.extractedItems.length : 0;
        if (parsedCount >= fallbackCount) return { ...parsed, parser: parsed.parser || "ai", warnings: [...(parsed.warnings || []), ...warnings] };
        warnings.push(`AI parser returned ${parsedCount} item(s); kept structured parser result with ${fallbackCount} item(s).`);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "AI parser failed.");
    }
  }
  return { ...fallback, warnings: [...(fallback.warnings || []), ...warnings] };
}

export async function extractAndParseUpload(file) {
  const extraction = await extractTextFromUpload(file);
  const parsed = extraction.text ? await parseSyllabusWithAi(extraction.text, file.name) : heuristicSyllabusParse(file.name || "", file.name);
  return {
    extraction,
    parsed: {
      ...parsed,
      warnings: [...(parsed.warnings || []), ...(extraction.warnings || [])],
      sourceTextLength: extraction.charCount,
    },
  };
}
