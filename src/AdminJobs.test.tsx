import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminJobs, { JOB_POLL_INTERVAL_MS } from "./AdminJobs";
import {
  cancelProductionJob,
  loadProductionJob,
  loadProductionJobEvents,
  loadProductionJobs,
  retryProductionJob,
  type JobApiError,
  type ProductionJob,
  type ProductionJobEvent,
} from "./lib/jobs";

vi.mock("./lib/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/jobs")>();
  return {
    ...actual,
    loadProductionJobs: vi.fn(),
    loadProductionJob: vi.fn(),
    loadProductionJobEvents: vi.fn(),
    retryProductionJob: vi.fn(),
    cancelProductionJob: vi.fn(),
  };
});

const loadJobsMock = vi.mocked(loadProductionJobs);
const loadJobMock = vi.mocked(loadProductionJob);
const loadEventsMock = vi.mocked(loadProductionJobEvents);
const retryJobMock = vi.mocked(retryProductionJob);
const cancelJobMock = vi.mocked(cancelProductionJob);

function job(overrides: Partial<ProductionJob> = {}): ProductionJob {
  return {
    id: "9d4feb61-fdcd-4492-857b-64c5d88ab919",
    songId: "REMASTER-SCHEMA-SMOKE-20260608-test",
    status: "queued",
    pipelineStep: "pending",
    progress: 0,
    retryCount: 0,
    maxRetries: 3,
    retryClassification: "unknown",
    timestamps: {
      createdAt: "2026-06-08T12:00:00.000Z",
      updatedAt: "2026-06-08T12:01:00.000Z",
      startedAt: null,
      heartbeatAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelRequestedAt: null,
      nextRetryAt: null,
      youtubeUploadStartedAt: null,
    },
    error: { code: null, message: null },
    manualReview: { required: false, reason: null },
    youtube: { videoId: null, url: null },
    ...overrides,
  };
}

function event(overrides: Partial<ProductionJobEvent> = {}): ProductionJobEvent {
  return {
    sequence: 1,
    eventType: "job_cancelled",
    level: "info",
    status: "cancelled",
    pipelineStep: "pending",
    message: "Job cancelled before worker side effects",
    details: {},
    correlationId: "44444444-4444-4444-8444-444444444444",
    createdAt: "2026-06-08T12:02:00.000Z",
    ...overrides,
  };
}

function apiError(code: string, message: string, correlationId = "rf_error_0123456789abcdef01234567") {
  const error = new Error(message) as JobApiError;
  error.code = code;
  error.correlationId = correlationId;
  error.status = code === "JOB_SCHEMA_NOT_READY" ? 503 : 500;
  return error;
}

function renderJobs() {
  return render(<AdminJobs pollIntervalMs={JOB_POLL_INTERVAL_MS} />);
}

describe("AdminJobs", () => {
  beforeEach(() => {
    loadJobsMock.mockReset();
    loadJobMock.mockReset();
    loadEventsMock.mockReset();
    retryJobMock.mockReset();
    cancelJobMock.mockReset();
    vi.restoreAllMocks();
    loadEventsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading state while jobs are loading", () => {
    loadJobsMock.mockReturnValue(new Promise(() => undefined));
    renderJobs();
    expect(screen.getByText("Henter produksjonsjobber …")).toBeInTheDocument();
  });

  it("shows the required empty state when there are no jobs", async () => {
    loadJobsMock.mockResolvedValue([]);
    renderJobs();

    expect(await screen.findByText("Ingen produksjonsjobber ennå.")).toBeInTheDocument();
    expect(screen.getByText("Jobbkøen er klar, men dagens videopipeline er ennå ikke koblet til den.")).toBeInTheDocument();
  });

  it("renders safe job DTO fields without lease token or raw input", async () => {
    loadJobsMock.mockResolvedValue([
      {
        ...job({
          status: "running",
          pipelineStep: "render_video",
          progress: 47,
          youtube: { videoId: "yt-1", url: "https://youtube.com/watch?v=yt-1" },
        }),
        leaseToken: "secret-lease-token",
        inputConfig: { raw: true },
      } as ProductionJob,
    ]);

    renderJobs();

    expect(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test")).toBeInTheDocument();
    expect(screen.getAllByText("Kjører").length).toBeGreaterThan(0);
    expect(screen.getByText(/Produserer video/)).toBeInTheDocument();
    expect(screen.getByText("47%")).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(screen.queryByText(/secret-lease-token/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inputConfig|input_config|raw/)).not.toBeInTheDocument();
  });

  it("opens job details and shows events in sequence order", async () => {
    const selected = job({ status: "cancelled" });
    loadJobsMock.mockResolvedValue([selected]);
    loadJobMock.mockResolvedValue(selected);
    loadEventsMock.mockResolvedValue([
      event({ sequence: 2, eventType: "second_event" }),
      event({ sequence: 1, eventType: "first_event" }),
    ]);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));

    expect(await screen.findByText("Full jobb-ID")).toBeInTheDocument();
    const first = await screen.findByText("#1 first_event");
    const second = screen.getByText("#2 second_event");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/Correlation ID:/).length).toBeGreaterThan(0);
  });

  it("shows schema-not-ready with correlation ID", async () => {
    loadJobsMock.mockRejectedValue(apiError("JOB_SCHEMA_NOT_READY", "schema missing", "rf_schema_0123456789abcdef01234567"));

    renderJobs();

    expect(await screen.findByText("JOB_SCHEMA_NOT_READY")).toBeInTheDocument();
    expect(screen.getByText(/Jobbkøen er ikke aktivert/)).toBeInTheDocument();
    expect(screen.getByText("Correlation ID: rf_schema_0123456789abcdef01234567")).toBeInTheDocument();
  });

  it("shows safe backend errors with correlation ID", async () => {
    loadJobsMock.mockRejectedValue(apiError("INTERNAL_ERROR", "Trygg intern feil", "rf_internal_0123456789abcdef01234567"));

    renderJobs();

    expect(await screen.findByText("INTERNAL_ERROR")).toBeInTheDocument();
    expect(screen.getByText("Trygg intern feil")).toBeInTheDocument();
    expect(screen.getByText("Correlation ID: rf_internal_0123456789abcdef01234567")).toBeInTheDocument();
  });

  it("shows retry only when the job is allowed to retry", async () => {
    const failed = job({ status: "failed", error: { code: "TEST_FAILED", message: "Test failure" } });
    loadJobsMock.mockResolvedValue([failed]);
    loadJobMock.mockResolvedValue(failed);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));

    expect(await screen.findByRole("button", { name: /Retry/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument();
  });

  it("hides retry when manual review or retry limit blocks it", async () => {
    const blocked = job({
      status: "failed",
      retryCount: 3,
      maxRetries: 3,
      manualReview: { required: true, reason: "Manual check" },
    });
    loadJobsMock.mockResolvedValue([blocked]);
    loadJobMock.mockResolvedValue(blocked);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));

    await screen.findByText("Manual check");
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });

  it("runs retry through the API and refreshes state after confirmation", async () => {
    const failed = job({ status: "failed" });
    loadJobsMock.mockResolvedValue([failed]);
    loadJobMock.mockResolvedValue(failed);
    retryJobMock.mockResolvedValue(job({ status: "queued" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));
    fireEvent.click(await screen.findByRole("button", { name: /Retry/ }));

    await waitFor(() => expect(retryJobMock).toHaveBeenCalledWith(failed.id));
    expect(await screen.findByText("Jobben er lagt tilbake i køen.")).toBeInTheDocument();
  });

  it("shows cancel only for active jobs and presents cancel result safely", async () => {
    const active = job({ status: "queued" });
    const cancelled = job({ status: "cancelled" });
    loadJobsMock.mockResolvedValue([active]);
    loadJobMock.mockResolvedValue(active);
    cancelJobMock.mockResolvedValue({
      result: "cancelled",
      job: cancelled,
      correlationId: "rf_cancel_0123456789abcdef01234567",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));

    await waitFor(() => expect(cancelJobMock).toHaveBeenCalledWith(active.id, expect.stringContaining("Cancelled")));
    expect(await screen.findByText("Jobben ble stoppet.")).toBeInTheDocument();
  });

  it("explains manual-review cancellation results", async () => {
    const active = job({ status: "running" });
    loadJobsMock.mockResolvedValue([active]);
    loadJobMock.mockResolvedValue(active);
    cancelJobMock.mockResolvedValue({
      result: "manual_review_required",
      job: job({ status: "running", manualReview: { required: true, reason: "Upload may have started" } }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));
    fireEvent.click(await screen.findByRole("button", { name: /Cancel/ }));

    expect(await screen.findByText("Ekstern sideeffekt kan ha startet. Kontroller manuelt.")).toBeInTheDocument();
  });

  it("stops polling when jobs are terminal", async () => {
    loadJobsMock.mockResolvedValue([job({ status: "completed" })]);

    renderJobs();
    await screen.findAllByText("Ferdig");
    expect(loadJobsMock).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    await act(async () => {
      vi.advanceTimersByTime(JOB_POLL_INTERVAL_MS * 2);
    });

    expect(loadJobsMock).toHaveBeenCalledTimes(1);
  });

  it("filters visible jobs by active and failed views", async () => {
    loadJobsMock.mockResolvedValue([
      job({ id: "11111111-1111-4111-8111-111111111111", songId: "active-song", status: "queued" }),
      job({ id: "22222222-2222-4222-8222-222222222222", songId: "failed-song", status: "failed" }),
      job({ id: "33333333-3333-4333-8333-333333333333", songId: "done-song", status: "completed" }),
    ]);

    renderJobs();
    expect(await screen.findByText("active-song")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Visning"), { target: { value: "active" } });
    expect(screen.getByText("active-song")).toBeInTheDocument();
    expect(screen.queryByText("failed-song")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Visning"), { target: { value: "failed" } });
    expect(screen.getByText("failed-song")).toBeInTheDocument();
    expect(screen.queryByText("active-song")).not.toBeInTheDocument();
  });

  it("renders sanitized diagnostics details from events", async () => {
    const selected = job({ status: "cancelled" });
    loadJobsMock.mockResolvedValue([selected]);
    loadJobMock.mockResolvedValue(selected);
    loadEventsMock.mockResolvedValue([
      event({ details: { safe: "visible", access_token: "[REDACTED]" } }),
    ]);

    renderJobs();
    fireEvent.click(await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test"));

    fireEvent.click(await screen.findByText("Diagnostics"));
    const details = screen.getByText(/visible/).closest("pre");
    expect(details).toHaveTextContent("[REDACTED]");
    expect(details).not.toHaveTextContent("secret-token");
  });

  it("shows YouTube links without implying deletion on cancel", async () => {
    const active = job({
      status: "queued",
      youtube: { videoId: "yt-123", url: "https://youtube.com/watch?v=yt-123" },
    });
    loadJobsMock.mockResolvedValue([active]);
    loadJobMock.mockResolvedValue(active);

    renderJobs();
    const row = await screen.findByText("REMASTER-SCHEMA-SMOKE-20260608-test");
    expect(within(row.closest("article") as HTMLElement).getByRole("link", { name: /YouTube/ })).toHaveAttribute("href", "https://youtube.com/watch?v=yt-123");
    fireEvent.click(row);

    expect(await screen.findByText(/yt-123/)).toBeInTheDocument();
    expect(screen.queryByText(/slettet/i)).not.toBeInTheDocument();
  });
});
