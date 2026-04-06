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

export function heuristicSyllabusParse(text, fileName = "upload") {
  const cleaned = cleanText(text);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 400);
  const joined = lines.join("\n");
  const fileStem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const codeMatch = joined.match(/\b[A-Z]{2,5}\s*[-]?\s*\d{2,4}[A-Z]?\b/) || fileStem.match(/\b[A-Z]{2,5}\s*[-]?\s*\d{2,4}[A-Z]?\b/);
  const syllabusLine = firstMatch(lines, /syllabus|course overview|course schedule/i);
  const instructorLine = firstMatch(lines, /instructor|professor|teacher|faculty/i);
  const assignments = parseDateItems(lines, "assignment|homework|problem set|project|paper|essay|lab|quiz|due", "assignment");
  const exams = parseDateItems(lines, "exam|midterm|final|test", "exam");
  const gradingWeights = parseWeights(lines);
  const policies = lines
    .filter((line) => /attendance|late|make.?up|academic integrity|honor|office hours|grading|policy/i.test(line))
    .slice(0, 8)
    .map((line) => ({ type: "policy", title: line.slice(0, 140), status: "needs_review" }));
  const extractedItems = [...assignments, ...exams, ...policies].slice(0, 24);
  const confidence = Math.min(0.92, Math.max(0.28, (cleaned.length > 500 ? 0.25 : 0) + (codeMatch ? 0.18 : 0) + (assignments.length ? 0.18 : 0) + (exams.length ? 0.14 : 0) + (gradingWeights.length ? 0.12 : 0) + (policies.length ? 0.05 : 0)));

  return {
    parser: "heuristic",
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
    warning: confidence < 0.65 ? "AI-style parsing found limited structure. Review before scheduling assignments." : "Review extracted dates and grading details before scheduling.",
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
      if (parsed) return { ...parsed, parser: parsed.parser || "ai", warnings: [...(parsed.warnings || []), ...warnings] };
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
