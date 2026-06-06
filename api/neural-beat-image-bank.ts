import { requireAdmin } from "./_admin.js";

const allowedMethods = new Set(["GET", "POST", "DELETE", "PATCH"]);

function upstreamUrl(request: any) {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const query = request.url?.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  return `${base.replace(/\/$/, "")}/api/neural-beat/image-bank${query}`;
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

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (migrationSecret) headers["X-ReMaster-Migration-Secret"] = migrationSecret;

  const upstream = await fetch(upstreamUrl(request), {
    method,
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(request.body || {}),
  });

  const body = await upstream.text();
  response.status(upstream.status);
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(body);
}
