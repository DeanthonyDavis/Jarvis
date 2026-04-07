import { runEmberHourlyScan, scanIsAuthorized } from "../../ember-scan.js";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const persistRequested = req.method === "GET" || req.query?.persist === "1";
  if (persistRequested && !scanIsAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized Ember morning brief. Set EMBER_SCAN_SECRET or CRON_SECRET and send it as a bearer token." });
    return;
  }

  try {
    const payload = req.method === "POST" ? await readJsonBody(req) : {};
    const result = await runEmberHourlyScan({
      state: payload.state || null,
      userId: payload.userId || null,
      workspaceId: payload.workspaceId || null,
      surface: "dashboard",
      persist: Boolean(payload.persist ?? persistRequested),
      limit: Number(payload.limit || req.query?.limit || 25),
      now: payload.now ? new Date(payload.now) : new Date(),
      briefingType: "morning",
      cooldownHours: Number(payload.cooldownHours || req.query?.cooldownHours || 26),
    });
    res.status(200).json(result);
  } catch (error) {
    console.error("ember-morning-brief failed", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Ember morning brief failed." });
  }
}
