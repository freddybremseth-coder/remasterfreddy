import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const songId = request.body?.songId;
  if (typeof songId !== "string" || !/^[0-9a-f-]{36}$/i.test(songId)) {
    response.status(400).json({ error: "Invalid song ID." });
    return;
  }
  if (!process.env.REALTYFLOW_MIGRATION_SECRET) {
    response.status(503).json({ error: "Re-Master API-forbindelsen er ikke konfigurert. Mangler RealtyFlow-migreringsnøkkel." });
    return;
  }
  try {
    const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
    const upstream = await fetch(`${base}/api/neural-beat/art-short`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-ReMaster-Admin": admin.email,
        "X-ReMaster-Migration-Secret": process.env.REALTYFLOW_MIGRATION_SECRET,
      },
      body: JSON.stringify({ songId }),
      signal: AbortSignal.timeout(280_000),
    });
    const raw = await upstream.text();
    response.setHeader("Cache-Control", "no-store");
    const type = upstream.headers.get("content-type") || "";
    if (!type.includes("application/json")) {
      const unexpected = upstream.status >= 500
        ? "RealtyFlow svarte med serverfeil under Shorts-generering"
        : "RealtyFlow returnerte uventet svar under Shorts-generering";
      response.status(upstream.ok ? 502 : upstream.status).json({
        error: `${unexpected} (HTTP ${upstream.status}). Hovedvideoen er ikke berørt.`,
      });
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.status(upstream.status).send(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ArtShortProxy] Failed:", message);
    response.status(502).json({
      error: "Forbindelsen til Shorts-generatoren feilet: " + message.slice(0, 300),
    });
  }
}
