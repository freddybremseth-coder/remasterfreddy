import { requireAdmin } from "./_admin.js";

/** Authenticated, no-AI storyboard preview forwarded to RealtyFlow. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const body = request.body || {};
  if (typeof body !== "object" || Array.isArray(body) ||
      JSON.stringify(body).length > 6500) {
    response.status(400).json({ error: "Ugyldig eller for langt storyboard-grunnlag." });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  if (process.env.REALTYFLOW_MIGRATION_SECRET) {
    headers["X-ReMaster-Migration-Secret"] = process.env.REALTYFLOW_MIGRATION_SECRET;
  }

  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat-storyboard-preview`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await upstream.json().catch(() => ({ error: "Ugyldig svar fra preview-tjenesten." }));
    response.setHeader("Cache-Control", "no-store");
    response.status(upstream.status).json(payload);
  } catch {
    response.status(503).json({ error: "Forhåndsvisningen er midlertidig utilgjengelig." });
  }
}
