import { requireAdmin } from "./_admin.js";

export const config = { maxDuration: 300 };

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const base = (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (secret) headers["X-ReMaster-Migration-Secret"] = secret;
  const upstream = await fetch(`${base}/api/neural-beat/art-short`, {
    method: "POST",
    headers,
    body: JSON.stringify({ songId: request.body?.songId }),
  });
  const raw = await upstream.text();
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.status(upstream.status).send(raw);
}
