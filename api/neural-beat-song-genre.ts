import { requireAdmin } from "./_admin.js";

/** Owner-authenticated proxy; no render or YouTube actions. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "PUT") {
    response.setHeader("Allow", "PUT");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const body = request.body || {};
  const genres = new Set([
    "meditation", "relaxing", "alternative", "dance", "rock", "power-rock",
    "metal", "ballad", "pop", "electronic", "edm", "house", "deep-house", "techno", "trance", "chillout", "lofi", "downtempo", "acoustic", "folk", "country", "blues", "jazz",
    "classical", "soul", "latin", "chanson", "ambient", "cinematic",
  ]);
  if (typeof body !== "object" || Array.isArray(body) ||
      typeof body.recordId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.recordId) ||
      !(body.genre === null || (typeof body.genre === "string" && genres.has(body.genre)))) {
    response.status(400).json({ error: "Velg en gyldig sjanger og sang." });
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
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/song-genre`, {
      method: "PUT", headers, body: JSON.stringify({ recordId: body.recordId, genre: body.genre }),
      redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    response.setHeader("Cache-Control", "private, no-store");
    const mime = upstream.headers.get("content-type") || "";
    if (!mime.includes("application/json") || (upstream.status >= 300 && upstream.status < 400)) {
      response.status(502).json({ error: "RealtyFlow bekreftet ikke sjangerendringen." });
      return;
    }
    const payload: unknown = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      response.status(502).json({ error: "Ugyldig svar fra RealtyFlow." });
      return;
    }
    // Log only the route outcome, never the song ID, user identity or genre.
    console.info("[ReMasterGenreSave] Upstream status:", upstream.status);
    response.status(upstream.status).json(payload);
  } catch (error) {
    console.warn("[ReMasterGenreSave] Upstream transport failed:", error instanceof Error ? error.name : "unknown");
    response.status(503).json({ error: "Kunne ikke kontakte RealtyFlow. Ingen sjangerendring er bekreftet." });
  }
}
