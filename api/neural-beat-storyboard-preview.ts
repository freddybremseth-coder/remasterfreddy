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
      redirect: "manual",
    });
    response.setHeader("Cache-Control", "no-store");
    const contentType = upstream.headers.get("content-type") || "";
    // A login redirect or 200 HTML page is never a successful storyboard.
    if (upstream.status >= 300 && upstream.status < 400 || !contentType.includes("application/json")) {
      response.status(502).json({
        error: "Storyboard-tjenesten svarte med innlogging eller feil innhold i stedet for scener. Kontroller RealtyFlow-tilkoblingen.",
      });
      return;
    }
    const payload: unknown = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      response.status(502).json({ error: "Storyboard-tjenesten sendte ikke gyldig JSON. Prøv igjen." });
      return;
    }
    if (!upstream.ok) {
      const error = (payload as Record<string, unknown>).error;
      response.status(upstream.status).json({
        error: typeof error === "string" ? error : "Storyboardsvar ble avvist av RealtyFlow.",
      });
      return;
    }
    const storyboard = payload as Record<string, unknown>;
    const validScenes = Array.isArray(storyboard.scenes) && storyboard.scenes.length === 8 &&
      storyboard.scenes.every(scene => typeof scene === "string" &&
        scene.trim().length >= 25 && scene.trim().length <= 1000) &&
      new Set(storyboard.scenes.map((scene: string) => scene.trim().toLocaleLowerCase())).size === 8;
    if (storyboard.mode !== "free-text-outline" || !validScenes) {
      response.status(502).json({ error: "Storyboard-tjenesten returnerte ikke åtte gyldige scener. Prøv igjen eller kontroller RealtyFlow." });
      return;
    }
    response.status(200).json(storyboard);
  } catch {
    response.status(503).json({ error: "Forhåndsvisningen er midlertidig utilgjengelig." });
  }
}
