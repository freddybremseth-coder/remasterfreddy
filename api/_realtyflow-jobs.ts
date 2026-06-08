import { requireAdmin } from "./_admin.js";

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_STATUSES = new Set(["queued", "running", "waiting_retry", "completed", "failed", "cancelled"]);

const SAFE_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "ADMIN_FORBIDDEN",
  "RATE_LIMITED",
  "JOB_NOT_FOUND",
  "JOB_SCHEMA_NOT_READY",
  "JOB_DUPLICATE_ACTIVE",
  "INVALID_JOB_TRANSITION",
  "INVALID_PIPELINE_STEP_TRANSITION",
  "RETRY_LIMIT_REACHED",
  "YOUTUBE_UPLOAD_AMBIGUOUS",
  "CANCELLATION_REQUIRES_MANUAL_REVIEW",
  "VALIDATION_FAILED",
  "INTERNAL_ERROR",
]);

function realtyFlowBase() {
  return (process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro").replace(/\/$/, "");
}

function queryValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || "");
  return typeof value === "string" ? value : "";
}

export function getJobId(request: any) {
  const id = queryValue(request.query?.id);
  return JOB_ID_PATTERN.test(id) ? id : "";
}

export function getForwardedQuery(request: any, allowedKeys: string[]) {
  const params = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = queryValue(request.query?.[key]);
    if (value) params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function clampInteger(value: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return String(fallback);
  return String(Math.min(max, Math.max(min, parsed)));
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function getJobsQuery(request: any) {
  const params = new URLSearchParams();
  const status = queryValue(request.query?.status);
  const songId = queryValue(request.query?.songId).trim();
  const limit = queryValue(request.query?.limit);

  if (JOB_STATUSES.has(status)) params.set("status", status);
  if (songId) params.set("songId", truncate(songId, 160));
  params.set("limit", clampInteger(limit, 1, 50, 50));

  return `?${params.toString()}`;
}

export function getEventsQuery(request: any) {
  const params = new URLSearchParams();
  const limit = queryValue(request.query?.limit);
  const afterSequence = queryValue(request.query?.afterSequence);

  params.set("limit", clampInteger(limit, 1, 100, 100));
  if (/^\d+$/.test(afterSequence)) params.set("afterSequence", clampInteger(afterSequence, 0, 999999999, 0));

  return `?${params.toString()}`;
}

export function getCancelBody(body: any) {
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  return { reason: truncate(reason || "Cancelled from Re-Master Admin", 240) };
}

function safeCorrelationId(upstream: Response, data: any) {
  const header = upstream.headers.get("x-correlation-id");
  return header || data?.correlationId || data?.error?.correlationId || undefined;
}

function safeErrorCode(data: any, fallbackStatus: number) {
  const code = String(data?.error?.code || data?.code || "");
  if (SAFE_ERROR_CODES.has(code)) return code;
  if (fallbackStatus === 401) return "AUTH_REQUIRED";
  if (fallbackStatus === 403) return "ADMIN_FORBIDDEN";
  if (fallbackStatus === 404) return "JOB_NOT_FOUND";
  if (fallbackStatus === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

function safeErrorMessage(code: string, status: number) {
  switch (code) {
    case "JOB_SCHEMA_NOT_READY":
      return "Jobbkøen er ikke aktivert i dette miljøet ennå.";
    case "AUTH_REQUIRED":
      return "Adminøkten er utløpt. Logg inn på nytt.";
    case "ADMIN_FORBIDDEN":
      return "Du har ikke tilgang til produksjonsjobbene.";
    case "RATE_LIMITED":
      return "For mange forespørsler. Vent litt og prøv igjen.";
    case "JOB_NOT_FOUND":
      return "Jobben finnes ikke.";
    case "RETRY_LIMIT_REACHED":
      return "Retry-grensen er nådd.";
    case "INVALID_JOB_TRANSITION":
      return "Jobben kan ikke flyttes til ønsket status.";
    case "YOUTUBE_UPLOAD_AMBIGUOUS":
      return "YouTube-opplasting kan være startet og krever manuell kontroll.";
    case "CANCELLATION_REQUIRES_MANUAL_REVIEW":
      return "Jobben krever manuell kontroll før den kan stoppes trygt.";
    default:
      return status >= 500 ? "RealtyFlow svarte med en trygg intern feil." : "Forespørselen kunne ikke fullføres.";
  }
}

function sendSafeError(response: any, status: number, code: string, correlationId?: string) {
  response.status(status);
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (correlationId) response.setHeader("x-correlation-id", correlationId);
  response.json({
    error: {
      code,
      message: safeErrorMessage(code, status),
      correlationId,
    },
  });
}

export async function proxyJobRequest(
  request: any,
  response: any,
  options: {
    allowedMethods: string[];
    upstreamPath: string;
    upstreamQuery?: string;
    body?: unknown;
  },
) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  const method = String(request.method || "GET").toUpperCase();
  if (!options.allowedMethods.includes(method)) {
    response.setHeader("Allow", options.allowedMethods.join(", "));
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const secret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (!secret) {
    sendSafeError(response, 503, "INTERNAL_ERROR");
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
    "x-remaster-migration-secret": secret,
  };

  try {
    const upstream = await fetch(`${realtyFlowBase()}${options.upstreamPath}${options.upstreamQuery || ""}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(options.body || {}),
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    const correlationId = safeCorrelationId(upstream, data);
    if (!upstream.ok) {
      sendSafeError(response, upstream.status, safeErrorCode(data, upstream.status), correlationId);
      return;
    }

    response.status(upstream.status);
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-store");
    if (correlationId) response.setHeader("x-correlation-id", correlationId);
    response.send(text || "{}");
  } catch {
    sendSafeError(response, 502, "INTERNAL_ERROR");
  }
}
