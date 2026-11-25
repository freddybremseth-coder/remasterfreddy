import { requireAdmin } from "./_admin.js";

/** Owner-authenticated, read-only audio analysis proxy; no publishing. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const recordId = request.body?.recordId;
  if (typeof recordId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
    response.status(400).json({ error: "Velg en gyldig sang." });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    Accept: "application/json", "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  if (process.env.REALTYFLOW_MIGRATION_SECRET) {
    headers["X-ReMaster-Migration-Secret"] = process.env.REALTYFLOW_MIGRATION_SECRET;
  }
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/audio-analysis`, {
      method: "POST", headers, body: JSON.stringify({ recordId }),
      redirect: "manual", signal: AbortSignal.timeout(85000),
    });
    response.setHeader("Cache-Control", "private, no-store");
    if (!(upstream.headers.get("content-type") || "").includes("application/json") ||
        (upstream.status >= 300 && upstream.status < 400)) {
      response.status(502).json({ error: "RealtyFlow svarte ikke med en gyldig lydanalyse." });
      return;
    }
    const payload: unknown = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      response.status(502).json({ error: "Ugyldig analysesvar fra RealtyFlow." });
      return;
    }
    response.status(upstream.status).json(payload);
  } catch {
    response.status(503).json({ error: "Kunne ikke fullføre MP3-analysen. Ingen data er endret." });
  }
}
