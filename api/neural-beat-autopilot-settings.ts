import { requireAdmin } from "./_admin.js";

function upstreamUrl() {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  return `${base.replace(/\/$/, "")}/api/neural-beat/autopilot-settings`;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "PUT") {
    response.setHeader("Allow", "GET, PUT");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (secret) headers["X-ReMaster-Migration-Secret"] = secret;

  const upstream = await fetch(upstreamUrl(), {
    method,
    headers,
    body: method === "PUT" ? JSON.stringify(request.body || {}) : undefined,
    cache: "no-store",
  });

  const body = await upstream.text();
  response.status(upstream.status);
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(body);
}
