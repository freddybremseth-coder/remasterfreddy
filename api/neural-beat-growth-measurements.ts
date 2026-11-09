import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
  const headers: Record<string, string> = { Accept: "application/json", "X-ReMaster-Admin": admin.email };
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    response.status(503).json({ error: "Tilkobling for beskyttet resultatmåling er ikke konfigurert." });
    return;
  }
  headers["X-ReMaster-Migration-Secret"] = secret;

  try {
    const upstream = await fetch(`${base}/api/neural-beat/growth-measurements`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    response.status(upstream.status);
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.send(await upstream.text());
  } catch {
    response.status(502).json({ error: "Kunne ikke hente sammenligningen fra RealtyFlow." });
  }
}
