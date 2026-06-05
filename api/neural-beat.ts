import { requireAdmin } from "./_admin";

const allowedMethods = new Set(["GET", "POST", "PUT", "DELETE"]);

function getUpstreamUrl() {
  const base = process.env.REALTYFLOW_API_URL || "https://realtyflow.chatgenius.pro";
  return `${base.replace(/\/$/, "")}/api/neural-beat`;
}

export default async function handler(request: any, response: any) {
  const admin = await requireAdmin(request, response);
  if (!admin) return;

  const method = String(request.method || "GET").toUpperCase();
  if (!allowedMethods.has(method)) {
    response.setHeader("Allow", Array.from(allowedMethods).join(", "));
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const headers: Record<string, string> = {
    Accept: method === "POST" ? "text/event-stream, application/json" : "application/json",
    "Content-Type": "application/json",
    "X-ReMaster-Admin": admin.email,
  };

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (migrationSecret) headers["X-ReMaster-Migration-Secret"] = migrationSecret;

  const upstream = await fetch(getUpstreamUrl(), {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(request.body || {}),
  });

  const contentType = upstream.headers.get("content-type") || "application/json";
  response.status(upstream.status);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-store");

  if (contentType.includes("text/event-stream") && upstream.body) {
    response.setHeader("Connection", "keep-alive");
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        response.write(Buffer.from(value));
      }
      response.end();
    } catch (error) {
      response.end();
    }
    return;
  }

  const body = await upstream.text();
  response.send(body);
}
