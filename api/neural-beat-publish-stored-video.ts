import { requireAdmin } from "./_admin.js";

/** Upload exactly an already stored full-song video; never starts a render. */
export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  const body = request.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.recordId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.recordId) ||
      !Array.isArray(body.storyboardScenes) || body.storyboardScenes.length !== 8 ||
      body.confirmUpload !== true || body.privacyStatus !== "unlisted" ||
      JSON.stringify(body).length > 16000) {
    response.status(400).json({ error: "Bekreft sang, storyboard og ikke-oppført YouTube-opplasting." });
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
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/neural-beat/publish-stored-video`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(290000),
    });
    response.setHeader("Cache-Control", "private, no-store");
    if (upstream.status >= 300 && upstream.status < 400) {
      // A login redirect occurs BEFORE the upload route can execute.
      // Do not mistake it for a failed/ambiguous YouTube insertion.
      console.warn("[RemasterStoredPublishProxy] RealtyFlow login redirect", upstream.status);
      response.status(502).json({
        error: "RealtyFlow avviste tilkoblingen før YouTube-opplastingen startet. Ingen video ble sendt. Kontroller tilgangen før nytt forsøk.",
      });
      return;
    }
    if (!(upstream.headers.get("content-type") || "").includes("application/json")) {
      // A non-JSON upstream response can be a gateway error after work started.
      // Do NOT encourage blind retries when YouTube state is uncertain.
      console.warn("[RemasterStoredPublishProxy] Non-JSON upstream", upstream.status);
      response.status(502).json({
        error: "RealtyFlow ga ikke et gyldig publiseringssvar. Kontroller YouTube-kanalen før et nytt forsøk for å unngå duplikater.",
      });
      return;
    }
    const result = await upstream.json().catch(() => null);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      response.status(502).json({ error: "RealtyFlow returnerte ikke et gyldig publiseringssvar." });
      return;
    }
    response.status(upstream.status).json(result);
  } catch {
    response.status(503).json({
      error: "YouTube-opplastingen fikk ikke svar. Kontroller YouTube-kanalen før et nytt forsøk – unngå duplikater.",
    });
  }
}
