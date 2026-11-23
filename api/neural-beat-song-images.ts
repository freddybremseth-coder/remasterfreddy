import { requireAdmin } from "./_admin.js";

/** Authenticated owner-only forwarder for persisting ordered video images. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "PUT") {
    response.setHeader("Allow", "PUT");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const body = request.body || {};
  if (typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 17000) {
    response.status(400).json({ error: "Ugyldig bildeutvalg." });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  if (process.env.REALTYFLOW_MIGRATION_SECRET) {
    headers["X-ReMaster-Migration-Secret"] = process.env.REALTYFLOW_MIGRATION_SECRET;
  }
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/song-images`, {
      method: "PUT", headers, body: JSON.stringify(body),
      redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    const mime = upstream.headers.get("content-type") || "";
    response.setHeader("Cache-Control", "no-store");
    if (!mime.includes("application/json") || (upstream.status >= 300 && upstream.status < 400)) {
      response.status(502).json({ error: "RealtyFlow svarte ikke med gyldig bildelagring. Ingen lagring er bekreftet." });
      return;
    }
    const payload: unknown = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      response.status(502).json({ error: "Ugyldig svar fra serveren." });
      return;
    }
    response.status(upstream.status).json(payload);
  } catch {
    response.status(503).json({ error: "Kunne ikke kontakte RealtyFlow for å lagre bildene." });
  }
}
