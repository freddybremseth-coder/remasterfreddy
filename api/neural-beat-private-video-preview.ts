import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const data = request.body;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      typeof data.recordId !== "string" || !Array.isArray(data.storyboardScenes) ||
      JSON.stringify(data).length > 12500) {
    response.status(400).json({ error: "Velg en sang og et godkjent storyboard først." });
    return;
  }

  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  if (process.env.REALTYFLOW_MIGRATION_SECRET) {
    headers["X-ReMaster-Migration-Secret"] = process.env.REALTYFLOW_MIGRATION_SECRET;
  }
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/private-video-preview`, {
      method: "POST", headers, body: JSON.stringify(data),
      signal: AbortSignal.timeout(190000), redirect: "manual",
    });
    response.setHeader("Cache-Control", "private, no-store");
    if (!(upstream.headers.get("content-type") || "").includes("application/json") ||
        (upstream.status >= 300 && upstream.status < 400)) {
      response.status(502).json({ error: "RealtyFlow returnerte ingen privat MP4." });
      return;
    }
    const result = await upstream.json().catch(() => null);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      response.status(502).json({ error: "Ugyldig svar fra MP4-forhåndsvisningen." });
      return;
    }
    response.status(upstream.status).json(result);
  } catch {
    response.status(503).json({ error: "Forhåndsvisningen fikk ikke svar fra RealtyFlow. Ingen video er publisert." });
  }
}
