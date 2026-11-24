import { requireAdmin } from "./_admin.js";

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  const query = request.url?.includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-ReMaster-Admin": admin.email,
  };
  if (process.env.REALTYFLOW_MIGRATION_SECRET) {
    headers["X-ReMaster-Migration-Secret"] = process.env.REALTYFLOW_MIGRATION_SECRET;
  }
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/visual-library${query}`, {
      headers, method: "GET", signal: AbortSignal.timeout(18000), redirect: "manual",
    });
    response.setHeader("Cache-Control", "private, no-store");
    if (!(upstream.headers.get("content-type") || "").includes("application/json") ||
        (upstream.status >= 300 && upstream.status < 400)) {
      response.status(502).json({ error: "Bildesamlingen svarte ikke med gyldig data." });
      return;
    }
    const body = await upstream.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      response.status(502).json({ error: "Ugyldig svar fra bildesamlingen." });
      return;
    }
    response.status(upstream.status).json(body);
  } catch {
    response.status(503).json({ error: "Kunne ikke kontakte bildesamlingen." });
  }
}
