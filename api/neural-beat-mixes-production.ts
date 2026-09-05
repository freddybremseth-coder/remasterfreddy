import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (migrationSecret) headers["X-ReMaster-Migration-Secret"] = migrationSecret;

  const upstream = await fetch(
    `${base.replace(/\/$/, "")}/api/neural-beat/mixes/production`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(request.body || {}),
      cache: "no-store",
    },
  );

  const body = await upstream.text();
  response.status(upstream.status);
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.send(body);
}
