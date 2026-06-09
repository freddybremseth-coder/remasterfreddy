import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminSession } from "./supabase";
import {
  JOB_STATUS_LABELS,
  PIPELINE_STEP_LABELS,
  loadProductionJobs,
  sanitizeDiagnostics,
} from "./jobs";

vi.mock("./supabase", () => ({
  getAdminSession: vi.fn(),
}));

const getAdminSessionMock = vi.mocked(getAdminSession);

describe("production job API client", () => {
  beforeEach(() => {
    getAdminSessionMock.mockReset();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated admin sessions before calling the proxy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getAdminSessionMock.mockResolvedValue(null);

    await expect(loadProductionJobs()).rejects.toThrow("Adminøkten er utløpt");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose migration secret or service-role credentials from the browser", async () => {
    getAdminSessionMock.mockResolvedValue({
      accessToken: "admin-access-token",
      email: "freddy.bremseth@gmail.com",
    } as any);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await loadProductionJobs({ limit: 10 });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer admin-access-token");
    expect(headers["x-remaster-migration-secret"]).toBeUndefined();
    expect(headers["X-ReMaster-Migration-Secret"]).toBeUndefined();
    expect(JSON.stringify(headers)).not.toMatch(/service_role|migration/i);
  });

  it("sanitizes backend errors and preserves safe correlation IDs", async () => {
    getAdminSessionMock.mockResolvedValue({
      accessToken: "admin-access-token",
      email: "freddy.bremseth@gmail.com",
    } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "x-correlation-id": "rf_safe_0123456789abcdef01234567" }),
      json: async () => ({
        error: {
          code: "INTERNAL_ERROR",
          message: "postgres://user:password@example.supabase.co/db",
        },
      }),
    }));

    await expect(loadProductionJobs()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      correlationId: "rf_safe_0123456789abcdef01234567",
      message: "Kunne ikke hente produksjonsjobbene.",
    });
  });

  it("keeps Norwegian status and pipeline-step labels available", () => {
    expect(JOB_STATUS_LABELS.queued).toBe("I kø");
    expect(JOB_STATUS_LABELS.running).toBe("Kjører");
    expect(JOB_STATUS_LABELS.waiting_retry).toBe("Venter på nytt forsøk");
    expect(JOB_STATUS_LABELS.cancelled).toBe("Kansellert");
    expect(JOB_STATUS_LABELS.completed).toBe("Ferdig");
    expect(PIPELINE_STEP_LABELS.download_audio).toBe("Henter lydfil");
    expect(PIPELINE_STEP_LABELS.upload_youtube).toBe("Laster opp til YouTube");
  });

  it("redacts sensitive diagnostic details before UI rendering", () => {
    const sanitized = sanitizeDiagnostics({
      safe: "visible",
      lease_token: "secret-lease-token",
      nested: {
        inputConfig: { raw: true },
        message: "Bearer secret-token",
        connection: "postgres://user:password@example/db",
      },
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain("visible");
    expect(serialized).not.toMatch(/secret-lease-token|secret-token|postgres:\/\/|raw/i);
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("[REDACTED_CONNECTION_STRING]");
  });
});
