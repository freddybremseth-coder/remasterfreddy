import { getJobsQuery, proxyJobRequest } from "../_realtyflow-jobs.js";

export default async function handler(request: any, response: any) {
  await proxyJobRequest(request, response, {
    allowedMethods: ["GET"],
    upstreamPath: "/api/neural-beat/jobs",
    upstreamQuery: getJobsQuery(request),
  });
}
