import { requireAdmin } from "./_admin.js";

const allowedMethods = new Set(["GET", "POST"]);
function upstreamUrl(request: any) {
  const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
  const query = request.url?.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  return base + "/api/neural-beat/jukebox" + query;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  const method = String(request.method || "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) return response.status(503).json({ error: "Jukebox proxy is not configured." });

  // Never allow browser-selected origin, external URL, token, or publication flag.
  const input = request.body || {};
  if (method === "POST" && (
    !input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).some(key => !["songId", "format", "seconds"].includes(key))
  )) return response.status(400).json({ error: "Invalid Jukebox request." });

  try {
    const upstream = await fetch(upstreamUrl(request), {
      method, cache: "no-store", redirect: "manual",
      headers: {
        Accept: "application/json", "Content-Type": "application/json",
        "X-ReMaster-Admin": admin.email, "X-ReMaster-Migration-Secret": secret,
      },
      body: method === "GET" ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(60000),
    });
    const body = await upstream.text();
    let data: unknown;
    try { data = body ? JSON.parse(body) : {}; } catch { data = null; }
    if (!data || typeof data !== "object" || (upstream.status >= 300 && upstream.status < 400)) {
      return response.status(502).json({ error: "Invalid Jukebox backend response." });
    }
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(upstream.status).json(data);
  } catch {
    return response.status(502).json({ error: "Jukebox backend unavailable." });
  }
}
