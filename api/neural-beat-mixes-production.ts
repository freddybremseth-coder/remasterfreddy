import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!migrationSecret) {
    response.status(503).json({ error: "Re-Master Mix production proxy is not configured." });
    return;
  }

  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
    "X-ReMaster-Migration-Secret": migrationSecret,
  };

  try {
    const upstream = await fetch(
      `${base.replace(/\/$/, "")}/api/neural-beat/mixes/production`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(request.body || {}),
        cache: "no-store",
        redirect: "manual",
      },
    );

    if (upstream.status >= 300 && upstream.status < 400) {
      response.status(502).json({
        error: "RealtyFlow redirected the Mix production API to authentication. Proxy access is not enabled for this route.",
      });
      return;
    }

    const body = await upstream.text();
    let data: any = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      data = null;
    }

    if (!data || typeof data !== "object") {
      response.status(502).json({ error: "RealtyFlow Mix production API returned an invalid non-JSON response." });
      return;
    }

    response.status(upstream.status);
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.json(data);
  } catch {
    response.status(502).json({ error: "Could not reach the RealtyFlow Mix production API." });
  }
}
