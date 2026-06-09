import {
  getCancelBody,
  getEventsQuery,
  normalizeJobId,
  proxyJobRequest,
} from "../../_realtyflow-jobs.js";

function pathParts(request: any) {
  const path = request.query?.path;
  if (Array.isArray(path)) return path.map(String);
  if (typeof path === "string") return path.split("/").filter(Boolean);
  return [];
}

function sendValidationError(response: any) {
  response.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid job route." } });
}

export default async function handler(request: any, response: any) {
  const parts = pathParts(request);
  const id = normalizeJobId(parts[0]);
  const action = parts[1] || "";
  const method = String(request.method || "GET").toUpperCase();

  if (!id || parts.length > 2) {
    sendValidationError(response);
    return;
  }

  if (parts.length === 1 && method === "GET") {
    await proxyJobRequest(request, response, {
      allowedMethods: ["GET"],
      upstreamPath: `/api/neural-beat/jobs/${encodeURIComponent(id)}`,
    });
    return;
  }

  if (action === "events" && method === "GET") {
    await proxyJobRequest(request, response, {
      allowedMethods: ["GET"],
      upstreamPath: `/api/neural-beat/jobs/${encodeURIComponent(id)}/events`,
      upstreamQuery: getEventsQuery(request),
    });
    return;
  }

  if (action === "retry" && method === "POST") {
    await proxyJobRequest(request, response, {
      allowedMethods: ["POST"],
      upstreamPath: `/api/neural-beat/jobs/${encodeURIComponent(id)}/retry`,
      body: {},
    });
    return;
  }

  if (action === "cancel" && method === "POST") {
    await proxyJobRequest(request, response, {
      allowedMethods: ["POST"],
      upstreamPath: `/api/neural-beat/jobs/${encodeURIComponent(id)}/cancel`,
      body: getCancelBody(request.body || {}),
    });
    return;
  }

  sendValidationError(response);
}
