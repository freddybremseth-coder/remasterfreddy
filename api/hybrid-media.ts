import { requireAdmin } from "./_admin.js";

/** Authenticated proxy for hybrid media ticket/registration; no file bytes pass this API. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const action = String(request.query?.action || "");
  if (!["upload-ticket", "register"].includes(action)) {
    response.status(400).json({ error: "Invalid hybrid media action" });
    return;
  }
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    response.status(503).json({ error: "RealtyFlow is not configured" });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/hybrid-media/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ReMaster-Admin": admin.email,
        "X-ReMaster-Migration-Secret": secret,
      },
      body: JSON.stringify(request.body || {}),
    });
    const data = await upstream.json().catch(() => ({ error: "RealtyFlow returned an invalid response" }));
    response.setHeader("Cache-Control", "no-store");
    response.status(upstream.status).json(data);
  } catch {
    response.status(502).json({ error: "Could not reach RealtyFlow media service" });
  }
}
