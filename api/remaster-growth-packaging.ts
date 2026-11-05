import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    response.status(503).json({ error: "Sikker RealtyFlow-tilkobling er ikke konfigurert." });
    return;
  }

  const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/api/remaster/growth-packaging`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-ReMaster-Admin": admin.email,
        "X-ReMaster-Migration-Secret": secret,
      },
      cache: "no-store",
    });
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.status(upstream.status).send(await upstream.text());
  } catch {
    response.status(502).json({ error: "Kunne ikke hente vekstforslag fra RealtyFlow." });
  }
}
