import { requireAdmin } from "./_admin";

function upstreamUrl() {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  return `${base.replace(/\/$/, "")}/api/youtube/status?brandId=remasterfreddy`;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  if (String(request.method || "GET").toUpperCase() !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (secret) headers["X-ReMaster-Migration-Secret"] = secret;

  const upstream = await fetch(upstreamUrl(), {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const data = await upstream.json().catch(() => ({}));
  response.setHeader("Cache-Control", "no-store");
  response.status(upstream.status).json(data);
}
