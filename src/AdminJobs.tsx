import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  StopCircle,
} from "lucide-react";
import {
  CANCEL_RESULT_LABELS,
  JOB_STATUS_LABELS,
  PIPELINE_STEP_LABELS,
  canCancelJob,
  canRetryJob,
  cancelProductionJob,
  formatDateTime,
  isActiveJob,
  isTerminalJob,
  loadProductionJob,
  loadProductionJobEvents,
  loadProductionJobs,
  retryProductionJob,
  shortJobId,
  type JobApiError,
  type JobStatus,
  type ProductionJob,
  type ProductionJobEvent,
} from "./lib/jobs";
import "./admin-jobs.css";

export const JOB_POLL_INTERVAL_MS = 7000;

type ViewFilter = "all" | "active" | "failed";

function friendlyError(error: unknown) {
  const jobError = error as Partial<JobApiError>;
  const code = jobError.code || "INTERNAL_ERROR";
  const correlationId = jobError.correlationId;
  const message = code === "JOB_SCHEMA_NOT_READY"
    ? "Jobbkøen er ikke aktivert i dette miljøet ennå. Produksjonsjobber kan vises når schema/RPC-er er på plass."
    : error instanceof Error
      ? error.message
      : "Kunne ikke hente produksjonsjobbene.";
  return { code, message, correlationId };
}

function statusClass(status: JobStatus) {
  return `jobs-status jobs-status-${status.replace("_", "-")}`;
}

function sortedEvents(events: ProductionJobEvent[]) {
  return [...events].sort((left, right) => Number(left.sequence) - Number(right.sequence));
}

function sortJobs(jobs: ProductionJob[]) {
  return [...jobs].sort((left, right) => {
    const leftTime = new Date(left.timestamps.updatedAt || left.timestamps.createdAt).getTime();
    const rightTime = new Date(right.timestamps.updatedAt || right.timestamps.createdAt).getTime();
    return rightTime - leftTime;
  });
}

function safeDetails(details: Record<string, unknown>) {
  return JSON.stringify(details || {}, null, 2);
}

interface AdminJobsProps {
  pollIntervalMs?: number;
}

export default function AdminJobs({ pollIntervalMs = JOB_POLL_INTERVAL_MS }: AdminJobsProps) {
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<ProductionJob | null>(null);
  const [events, setEvents] = useState<ProductionJobEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "">("");
  const [songFilter, setSongFilter] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState<{ code: string; message: string; correlationId?: string } | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const loaded = await loadProductionJobs({
        status: statusFilter || undefined,
        songId: songFilter || undefined,
        limit: 50,
      });
      setJobs(sortJobs(loaded));
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [songFilter, statusFilter]);

  const fetchDetails = useCallback(async (jobId: string, silent = false) => {
    if (!silent) setDetailsLoading(true);
    setError(null);
    try {
      const [job, history] = await Promise.all([
        loadProductionJob(jobId),
        loadProductionJobEvents(jobId, 100),
      ]);
      setSelectedJob(job);
      setEvents(sortedEvents(history));
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      if (!silent) setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedJob(null);
      setEvents([]);
      return;
    }
    fetchDetails(selectedId);
  }, [fetchDetails, selectedId]);

  useEffect(() => {
    const hasActiveJobs = jobs.some(isActiveJob) || Boolean(selectedJob && !isTerminalJob(selectedJob));
    if (!hasActiveJobs) return undefined;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetchJobs(true);
      if (selectedId) fetchDetails(selectedId, true);
    };

    const interval = window.setInterval(tick, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [fetchDetails, fetchJobs, jobs, pollIntervalMs, selectedId, selectedJob]);

  const visibleJobs = useMemo(() => {
    if (viewFilter === "active") return jobs.filter(isActiveJob);
    if (viewFilter === "failed") return jobs.filter((job) => job.status === "failed");
    return jobs;
  }, [jobs, viewFilter]);

  async function refreshAll() {
    await fetchJobs();
    if (selectedId) await fetchDetails(selectedId);
  }

  async function retryJob(job: ProductionJob) {
    if (!canRetryJob(job)) return;
    const confirmed = window.confirm(`Prøve jobb ${shortJobId(job.id)} på nytt?`);
    if (!confirmed) return;
    setActionLoading(`retry:${job.id}`);
    setActionMessage("");
    setError(null);
    try {
      const updated = await retryProductionJob(job.id);
      setActionMessage("Jobben er lagt tilbake i køen.");
      setSelectedJob(updated);
      await refreshAll();
    } catch (retryError) {
      setError(friendlyError(retryError));
    } finally {
      setActionLoading("");
    }
  }

  async function cancelJob(job: ProductionJob) {
    if (!canCancelJob(job)) return;
    const confirmed = window.confirm(
      `Stoppe jobb ${shortJobId(job.id)}?\n\nDette sletter ikke eventuelle YouTube-sideeffekter.`,
    );
    if (!confirmed) return;
    setActionLoading(`cancel:${job.id}`);
    setActionMessage("");
    setError(null);
    try {
      const result = await cancelProductionJob(job.id, "Cancelled from Re-Master Admin job status UI");
      setActionMessage(CANCEL_RESULT_LABELS[result.result]);
      setSelectedJob(result.job);
      await refreshAll();
    } catch (cancelError) {
      setError(friendlyError(cancelError));
    } finally {
      setActionLoading("");
    }
  }

  return (
    <section className="admin-card jobs-panel">
      <div className="jobs-header">
        <div>
          <p className="admin-eyebrow">Durable jobbkø</p>
          <h2>Produksjonsjobber</h2>
          <p>Read-only oversikt over den nye jobbkøen. Dagens videopipeline er fortsatt uendret og oppretter ikke jobber automatisk ennå.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={refreshAll} disabled={loading || detailsLoading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      <div className="jobs-filters" aria-label="Filtrer produksjonsjobber">
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as JobStatus | "")}>
            <option value="">Alle statuser</option>
            {Object.entries(JOB_STATUS_LABELS).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Song ID</span>
          <div className="jobs-search">
            <Search size={15} />
            <input value={songFilter} onChange={(event) => setSongFilter(event.target.value)} placeholder="Filtrer på song ID" />
          </div>
        </label>
        <label>
          <span>Visning</span>
          <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value as ViewFilter)}>
            <option value="all">Alle jobber</option>
            <option value="active">Kun aktive</option>
            <option value="failed">Kun feilede</option>
          </select>
        </label>
      </div>

      {error && (
        <div className="admin-error jobs-message" role="alert">
          <AlertCircle size={17} />
          <div>
            <strong>{error.code}</strong>
            <span>{error.message}</span>
            {error.correlationId && <small>Correlation ID: {error.correlationId}</small>}
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="admin-success jobs-message">
          <CheckCircle2 size={17} />
          {actionMessage}
        </div>
      )}

      <div className="jobs-layout">
        <div className="jobs-list" aria-label="Produksjonsjobbliste">
          {loading && jobs.length === 0 ? (
            <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Henter produksjonsjobber …</div>
          ) : visibleJobs.length === 0 ? (
            <div className="admin-empty">
              <Clock3 size={24} />
              <div>
                <strong>Ingen produksjonsjobber ennå.</strong>
                <span>Jobbkøen er klar, men dagens videopipeline er ennå ikke koblet til den.</span>
              </div>
            </div>
          ) : (
            visibleJobs.map((job) => (
              <article
                key={job.id}
                className={`jobs-row ${selectedId === job.id ? "is-selected" : ""}`}
              >
                <button type="button" className="jobs-row-main" onClick={() => setSelectedId(job.id)}>
                  <span className="jobs-id">{shortJobId(job.id)}</span>
                  <span className="jobs-song">{job.songId}</span>
                  <span className={statusClass(job.status)}>{JOB_STATUS_LABELS[job.status]}</span>
                  <span className="jobs-step">{PIPELINE_STEP_LABELS[job.pipelineStep]} <small>{job.pipelineStep}</small></span>
                  <span className="jobs-progress"><i style={{ width: `${job.progress}%` }} />{job.progress}%</span>
                  <span className="jobs-retry">{job.retryCount}/{job.maxRetries}</span>
                  <span className="jobs-time">{formatDateTime(job.timestamps.updatedAt)}</span>
                  {job.manualReview.required && <span className="jobs-review"><ShieldAlert size={14} /> Manuell</span>}
                  {job.error.code && <span className="jobs-error-code">{job.error.code}</span>}
                </button>
                {job.youtube.url && (
                  <a className="jobs-youtube jobs-row-youtube" href={job.youtube.url} target="_blank" rel="noreferrer">
                    YouTube <ExternalLink size={13} />
                  </a>
                )}
              </article>
            ))
          )}
        </div>

        <aside className="jobs-detail" aria-label="Jobbdetaljer">
          {!selectedId ? (
            <div className="jobs-detail-empty">
              <History size={24} />
              <strong>Velg en jobb</strong>
              <span>Detaljer og eventhistorikk vises her.</span>
            </div>
          ) : detailsLoading && !selectedJob ? (
            <div className="jobs-detail-empty"><Loader2 className="admin-spinner" size={24} /> Henter jobbdetaljer …</div>
          ) : selectedJob ? (
            <>
              <div className="jobs-detail-header">
                <div>
                  <p className="admin-eyebrow">Jobbdetaljer</p>
                  <h3>{shortJobId(selectedJob.id)}</h3>
                </div>
                <span className={statusClass(selectedJob.status)}>{JOB_STATUS_LABELS[selectedJob.status]}</span>
              </div>

              <dl className="jobs-meta">
                <div><dt>Full jobb-ID</dt><dd>{selectedJob.id}</dd></div>
                <div><dt>Song ID</dt><dd>{selectedJob.songId}</dd></div>
                <div><dt>Status</dt><dd>{JOB_STATUS_LABELS[selectedJob.status]} <code>{selectedJob.status}</code></dd></div>
                <div><dt>Steg</dt><dd>{PIPELINE_STEP_LABELS[selectedJob.pipelineStep]} <code>{selectedJob.pipelineStep}</code></dd></div>
                <div><dt>Fremdrift</dt><dd>{selectedJob.progress}%</dd></div>
                <div><dt>Retry</dt><dd>{selectedJob.retryCount}/{selectedJob.maxRetries}</dd></div>
                <div><dt>Opprettet</dt><dd>{formatDateTime(selectedJob.timestamps.createdAt)}</dd></div>
                <div><dt>Oppdatert</dt><dd>{formatDateTime(selectedJob.timestamps.updatedAt)}</dd></div>
                <div><dt>Cancel requested</dt><dd>{formatDateTime(selectedJob.timestamps.cancelRequestedAt)}</dd></div>
                <div><dt>Safe error</dt><dd>{selectedJob.error.code || "Ingen"}{selectedJob.error.message ? `: ${selectedJob.error.message}` : ""}</dd></div>
                <div><dt>Manual review</dt><dd>{selectedJob.manualReview.required ? selectedJob.manualReview.reason || "Krever manuell kontroll" : "Nei"}</dd></div>
                <div>
                  <dt>YouTube</dt>
                  <dd>
                    {selectedJob.youtube.url ? (
                      <a href={selectedJob.youtube.url} target="_blank" rel="noreferrer">
                        {selectedJob.youtube.videoId || "Åpne video"} <ExternalLink size={13} />
                      </a>
                    ) : selectedJob.youtube.videoId || "Ikke satt"}
                  </dd>
                </div>
              </dl>

              <div className="jobs-actions">
                {canRetryJob(selectedJob) && (
                  <button className="admin-secondary" type="button" onClick={() => retryJob(selectedJob)} disabled={Boolean(actionLoading)}>
                    {actionLoading === `retry:${selectedJob.id}` ? <Loader2 className="admin-spinner" size={15} /> : <RotateCcw size={15} />}
                    Retry
                  </button>
                )}
                {canCancelJob(selectedJob) && (
                  <button className="admin-secondary jobs-danger" type="button" onClick={() => cancelJob(selectedJob)} disabled={Boolean(actionLoading)}>
                    {actionLoading === `cancel:${selectedJob.id}` ? <Loader2 className="admin-spinner" size={15} /> : <StopCircle size={15} />}
                    Cancel
                  </button>
                )}
                {!canRetryJob(selectedJob) && !canCancelJob(selectedJob) && (
                  <span className="jobs-terminal"><Ban size={14} /> Ingen handlinger tilgjengelig</span>
                )}
              </div>

              <div className="jobs-events">
                <div className="jobs-events-header">
                  <h4>Eventhistorikk</h4>
                  <span>{events.length} hendelser</span>
                </div>
                {events.length === 0 ? (
                  <div className="jobs-events-empty">Ingen events registrert ennå.</div>
                ) : (
                  events.map((event) => (
                    <article className={`jobs-event level-${event.level}`} key={`${event.sequence}-${event.eventType}`}>
                      <div className="jobs-event-top">
                        <strong>#{event.sequence} {event.eventType}</strong>
                        <time>{formatDateTime(event.createdAt)}</time>
                      </div>
                      <div className="jobs-event-grid">
                        <span>{event.level}</span>
                        <span>{event.status ? JOB_STATUS_LABELS[event.status] : "Ingen status"}</span>
                        <span>{event.pipelineStep ? PIPELINE_STEP_LABELS[event.pipelineStep] : "Ingen steg"}</span>
                      </div>
                      {event.message && <p>{event.message}</p>}
                      {event.correlationId && <small>Correlation ID: {event.correlationId}</small>}
                      {Object.keys(event.details || {}).length > 0 && (
                        <details>
                          <summary>Diagnostics</summary>
                          <pre>{safeDetails(event.details)}</pre>
                        </details>
                      )}
                    </article>
                  ))
                )}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
