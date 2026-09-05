import { requireAdmin } from "./_admin.js";

const allowedMethods = new Set(["GET", "POST", "PATCH"]);

function getUpstreamUrl(request: any) {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const query = request.url?.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  return `${base.replace(/\/$/, "")}/api/neural-beat/mixes${query}`;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  const method = String(request.method || "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    response.setHeader("Allow", Array.from(allowedMethods).join(", "));
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!migrationSecret) {
    response.status(503).json({ error: "Re-Master Mix proxy is not configured." });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
    "X-ReMaster-Migration-Secret": migrationSecret,
  };

  try {
    const upstream = await fetch(getUpstreamUrl(request), {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(request.body || {}),
      cache: "no-store",
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      response.status(502).json({
        error: "RealtyFlow redirected the Mix API to authentication. Proxy access is not enabled for this route.",
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
      response.status(502).json({ error: "RealtyFlow Mix API returned an invalid non-JSON response." });
      return;
    }

    response.status(upstream.status);
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    response.json(data);
  } catch {
    response.status(502).json({ error: "Could not reach the RealtyFlow Mix API." });
  }
}
