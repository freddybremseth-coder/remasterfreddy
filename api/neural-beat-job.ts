import { getJobId, proxyJobRequest } from "./_realtyflow-jobs.js";

export default async function handler(request: any, response: any) {
  const id = getJobId(request);
  if (!id) {
    response.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid job id." } });
    return;
  }

  await proxyJobRequest(request, response, {
    allowedMethods: ["GET"],
    upstreamPath: `/api/neural-beat/jobs/${encodeURIComponent(id)}`,
  });
}
