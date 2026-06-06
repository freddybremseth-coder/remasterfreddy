import { requireAdmin } from "./_admin.js";

function upstreamUrl() {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  return `${base.replace(/\/$/, "")}/api/neural-beat/upload`;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  if (String(request.method || "").toUpperCase() !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const fileName = String(request.body?.fileName || "").trim();
  if (!fileName) {
    response.status(400).json({ error: "fileName is required." });
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (migrationSecret) headers["X-ReMaster-Migration-Secret"] = migrationSecret;

  const upstream = await fetch(upstreamUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify({ fileName }),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    response.status(upstream.status).json({
      error: data.error || "Could not create a secure upload URL.",
    });
    return;
  }

  if (data.method !== "signed" || !data.uploadUrl || !data.token || !data.publicUrl) {
    response.status(502).json({ error: "The upload service did not return a secure signed URL." });
    return;
  }

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    uploadUrl: data.uploadUrl,
    token: data.token,
    publicUrl: data.publicUrl,
    method: "signed",
    expiresIn: Number(data.expiresIn || 600),
  });
}
