import { extractAndParseUpload } from "../ingestion.js";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const payload = await readJsonBody(req);
    if (!payload.contentBase64) {
      res.status(400).json({ error: "contentBase64 is required." });
      return;
    }
    const result = await extractAndParseUpload({
      name: payload.name || "upload",
      type: payload.type || "",
      contentBase64: payload.contentBase64,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Ingestion failed." });
  }
}
