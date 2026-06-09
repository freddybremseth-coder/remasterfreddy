import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCancelBody, getEventsQuery, getJobsQuery, proxyJobRequest, sanitizeJobPayload } from "../../../api/_realtyflow-jobs";

function responseMock() {
  return {
    headers: {} as Record<string, string>,
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function requestMock(overrides: Record<string, unknown> = {}) {
  return {
    method: "GET",
    headers: { authorization: "Bearer admin-token" },
    query: {},
    body: {},
    ...overrides,
  };
}

describe("Re-Master job proxy helpers", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.REALTYFLOW_API_URL = "https://realtyflow.example";
    process.env.REALTYFLOW_MIGRATION_SECRET = "server-only-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.REALTYFLOW_API_URL;
    delete process.env.REALTYFLOW_MIGRATION_SECRET;
  });

  it("clamps forwarded job and event filters server-side", () => {
    const jobs = getJobsQuery(requestMock({
      query: {
        status: "drop table",
        songId: "s".repeat(200),
        limit: "5000",
      },
    }));
    expect(jobs).toContain("limit=50");
    expect(jobs).not.toContain("status=");
    expect(new URLSearchParams(jobs.slice(1)).get("songId")).toHaveLength(160);

    const events = getEventsQuery(requestMock({
      query: {
        limit: "-5",
        afterSequence: "12",
      },
    }));
    expect(events).toBe("?limit=1&afterSequence=12");
  });

  it("limits cancel reason before forwarding it upstream", () => {
    expect(getCancelBody({ reason: "" })).toEqual({ reason: "Cancelled from Re-Master Admin" });
    expect(getCancelBody({ reason: "x".repeat(300) }).reason).toHaveLength(240);
  });

  it("rejects unauthenticated requests before upstream calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = responseMock();

    await proxyJobRequest(requestMock({ headers: {} }), response, {
      allowedMethods: ["GET"],
      upstreamPath: "/api/neural-beat/jobs",
      upstreamQuery: "?limit=50",
    });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin Supabase users", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: "other@example.com" }),
    }));
    const response = responseMock();

    await proxyJobRequest(requestMock(), response, {
      allowedMethods: ["GET"],
      upstreamPath: "/api/neural-beat/jobs",
      upstreamQuery: "?limit=50",
    });

    expect(response.statusCode).toBe(403);
  });

  it("forwards the migration secret only from the server to RealtyFlow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: "freddy.bremseth@gmail.com", id: "admin-user" }),
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobs: [] }), {
        status: 200,
        headers: { "content-type": "application/json", "x-correlation-id": "rf_test_0123456789abcdef01234567" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const response = responseMock();

    await proxyJobRequest(requestMock(), response, {
      allowedMethods: ["GET"],
      upstreamPath: "/api/neural-beat/jobs",
      upstreamQuery: "?limit=50",
    });

    const [, upstreamInit] = fetchMock.mock.calls[1];
    expect(upstreamInit.headers["x-remaster-migration-secret"]).toBe("server-only-secret");
    expect(String(response.payload)).not.toContain("server-only-secret");
    expect(response.headers["x-correlation-id"]).toBe("rf_test_0123456789abcdef01234567");
  });

  it("redacts sensitive fields from successful upstream job payloads", () => {
    const sanitized = sanitizeJobPayload({
      job: {
        id: "9d4feb61-fdcd-4492-857b-64c5d88ab919",
        lease_token: "secret-lease-token",
        input_config: { raw: true },
        nested: {
          connectionString: "postgres://user:password@example/db",
          message: "Bearer secret-token",
          note: "connection failed for postgres://user:password@example/db",
        },
      },
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain("9d4feb61-fdcd-4492-857b-64c5d88ab919");
    expect(serialized).not.toMatch(/secret-lease-token|input_config|raw|postgres:\/\/|secret-token/i);
    expect(serialized).toContain("[REDACTED_CONNECTION_STRING]");
  });

  it("maps schema-not-ready without returning raw Postgres details", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: "freddy.bremseth@gmail.com", id: "admin-user" }),
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: "JOB_SCHEMA_NOT_READY",
          message: 'relation "public.remaster_pipeline_jobs" does not exist',
          correlationId: "rf_schema_0123456789abcdef01234567",
        },
      }), { status: 503, headers: { "content-type": "application/json" } })));
    const response = responseMock();

    await proxyJobRequest(requestMock(), response, {
      allowedMethods: ["GET"],
      upstreamPath: "/api/neural-beat/jobs",
      upstreamQuery: "?limit=50",
    });

    expect(response.statusCode).toBe(503);
    expect(response.payload).toEqual({
      error: {
        code: "JOB_SCHEMA_NOT_READY",
        message: "Jobbkøen er ikke aktivert i dette miljøet ennå.",
        correlationId: "rf_schema_0123456789abcdef01234567",
      },
    });
    expect(JSON.stringify(response.payload)).not.toMatch(/remaster_pipeline_jobs|relation "|postgres:\/\//i);
  });
});
