import { getAdminSession } from "./supabase";

export type JobStatus = "queued" | "running" | "waiting_retry" | "completed" | "failed" | "cancelled";

export type PipelineStep =
  | "pending"
  | "download_audio"
  | "analyze_song"
  | "generate_metadata"
  | "prepare_images"
  | "render_video"
  | "compose_thumbnail"
  | "upload_youtube"
  | "set_thumbnail"
  | "add_playlist"
  | "persist_results"
  | "completed";

export interface ProductionJob {
  id: string;
  songId: string;
  status: JobStatus;
  pipelineStep: PipelineStep;
  progress: number;
  retryCount: number;
  maxRetries: number;
  retryClassification?: string;
  timestamps: {
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    heartbeatAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    cancelRequestedAt: string | null;
    nextRetryAt: string | null;
    youtubeUploadStartedAt: string | null;
  };
  error: {
    code: string | null;
    message: string | null;
  };
  manualReview: {
    required: boolean;
    reason: string | null;
  };
  youtube: {
    videoId: string | null;
    url: string | null;
  };
}

export interface ProductionJobEvent {
  sequence: number;
  eventType: string;
  level: "debug" | "info" | "warn" | "error";
  status: JobStatus | null;
  pipelineStep: PipelineStep | null;
  message: string | null;
  details: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}

export interface JobFilters {
  status?: JobStatus;
  songId?: string;
  limit?: number;
}

export interface JobApiError extends Error {
  code: string;
  correlationId?: string;
  status?: number;
}

export interface CancelJobResult {
  result: "cancelled" | "cancellation_requested" | "manual_review_required" | "already_terminal";
  job: ProductionJob;
  correlationId?: string;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "I kø",
  running: "Kjører",
  waiting_retry: "Venter på retry",
  completed: "Ferdig",
  failed: "Feilet",
  cancelled: "Avbrutt",
};

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  pending: "Venter",
  download_audio: "Henter lydfil",
  analyze_song: "Analyserer sang",
  generate_metadata: "Lager metadata",
  prepare_images: "Klargjør bilder",
  render_video: "Produserer video",
  compose_thumbnail: "Lager thumbnail",
  upload_youtube: "Laster opp til YouTube",
  set_thumbnail: "Setter thumbnail",
  add_playlist: "Legger til i spilleliste",
  persist_results: "Lagrer resultat",
  completed: "Ferdig",
};

export const CANCEL_RESULT_LABELS: Record<CancelJobResult["result"], string> = {
  cancelled: "Jobben ble stoppet.",
  cancellation_requested: "Jobben stopper ved neste trygge checkpoint.",
  manual_review_required: "Ekstern sideeffekt kan ha startet. Kontroller manuelt.",
  already_terminal: "Jobben var allerede ferdig eller stoppet.",
};

export function shortJobId(id: string) {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : "";
}

export function isTerminalJob(job: Pick<ProductionJob, "status">) {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

export function isActiveJob(job: Pick<ProductionJob, "status">) {
  return job.status === "queued" || job.status === "running" || job.status === "waiting_retry";
}

export function canRetryJob(job: ProductionJob) {
  return (
    job.status === "failed" &&
    job.retryCount < job.maxRetries &&
    !job.manualReview.required &&
    !(job.timestamps.youtubeUploadStartedAt && !job.youtube.videoId)
  );
}

export function canCancelJob(job: ProductionJob) {
  return isActiveJob(job);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "Ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("no-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function sanitizeMessage(value: unknown, fallback: string) {
  const message = typeof value === "string" && value.trim() ? value.trim() : fallback;
  if (/postgres:\/\/|supabase\.co\/db|service_role|oauth|access_token|lease_token|input_config/i.test(message)) {
    return fallback;
  }
  return message.replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]");
}

async function jobFetch(path: string, init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      sanitizeMessage(data?.error?.message || data?.message, "Kunne ikke hente produksjonsjobbene."),
    ) as JobApiError;
    error.code = String(data?.error?.code || data?.code || "INTERNAL_ERROR");
    error.correlationId = data?.error?.correlationId || data?.correlationId || response.headers.get("x-correlation-id") || undefined;
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function loadProductionJobs(filters: JobFilters = {}): Promise<ProductionJob[]> {
  const params = new URLSearchParams({ limit: String(filters.limit || 50) });
  if (filters.status) params.set("status", filters.status);
  if (filters.songId?.trim()) params.set("songId", filters.songId.trim());
  const data = await jobFetch(`/api/neural-beat-jobs?${params.toString()}`, { method: "GET" });
  return Array.isArray(data.jobs) ? data.jobs : [];
}

export async function loadProductionJob(id: string): Promise<ProductionJob> {
  const data = await jobFetch(`/api/neural-beat-job?id=${encodeURIComponent(id)}`, { method: "GET" });
  return data.job as ProductionJob;
}

export async function loadProductionJobEvents(id: string, limit = 100): Promise<ProductionJobEvent[]> {
  const data = await jobFetch(`/api/neural-beat-job-events?id=${encodeURIComponent(id)}&limit=${limit}`, { method: "GET" });
  return Array.isArray(data.events) ? data.events : [];
}

export async function retryProductionJob(id: string): Promise<ProductionJob> {
  const data = await jobFetch(`/api/neural-beat-job-retry?id=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.job as ProductionJob;
}

export async function cancelProductionJob(id: string, reason: string): Promise<CancelJobResult> {
  const data = await jobFetch(`/api/neural-beat-job-cancel?id=${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return data as CancelJobResult;
}
