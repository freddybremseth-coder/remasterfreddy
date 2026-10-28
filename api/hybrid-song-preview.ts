import { requireAdmin } from "./_admin.js";

/** Owner-authenticated read-only proxy to RealtyFlow storyboard preview. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }
  const songId = String(request.query?.songId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(songId)) {
    response.status(400).json({ error: "Valid song ID required" });
    return;
  }
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    response.status(503).json({ error: "RealtyFlow owner proxy is not configured" });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  try {
    const upstream = await fetch(
      `${base.replace(/\/$/, "")}/api/neural-beat/hybrid-song-preview?songId=${encodeURIComponent(songId)}`,
      { headers: { Accept: "application/json", "X-ReMaster-Admin": admin.email, "X-ReMaster-Migration-Secret": secret } },
    );
    const data = await upstream.json().catch(() => null);
    response.setHeader("Cache-Control", "no-store");
    if (!data) {
      response.status(502).json({ error: "RealtyFlow preview is not available yet" });
      return;
    }
    response.status(upstream.status).json(data);
  } catch {
    response.status(502).json({ error: "Could not contact RealtyFlow preview" });
  }
}
