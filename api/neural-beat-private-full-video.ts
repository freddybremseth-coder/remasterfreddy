import { requireAdmin } from "./_admin.js";

/** Owner-only, long-running proxy for PRIVATE full-song MP4s; no YouTube dispatch. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.recordId !== "string" || !Array.isArray(body.storyboardScenes) ||
      (body.gentleMotion !== undefined && typeof body.gentleMotion !== "boolean") ||
      JSON.stringify(body).length > 14000) {
    response.status(400).json({ error: "Velg sang og godkjenn storyboard før du lager privat fullengdevideo." });
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
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/private-full-video`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(290000),
    });
    response.setHeader("Cache-Control", "private, no-store");
    if ((upstream.status >= 300 && upstream.status < 400) ||
        !(upstream.headers.get("content-type") || "").includes("application/json")) {
      response.status(502).json({ error: "Kunne ikke hente privat fullengdevideo fra RealtyFlow." });
      return;
    }
    const result = await upstream.json().catch(() => null);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      response.status(502).json({ error: "RealtyFlow returnerte ikke gyldig svar fra den private videomotoren." });
      return;
    }
    response.status(upstream.status).json(result);
  } catch {
    response.status(503).json({
      error: "Privat videoproduksjon fikk ikke svar fra RealtyFlow. Ingen video er publisert.",
    });
  }
}
