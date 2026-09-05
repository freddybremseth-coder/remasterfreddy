import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, Rocket } from "lucide-react";
import AdminMixStudio from "./AdminMixStudio";
import {
  createMixDraft,
  loadMixJobs,
  startMixProduction,
  type MixDraftInput,
  type MixJob,
} from "./lib/mix-api";

const DRAFT_KEY = "remaster-mediterranean-mix-draft-v1";

function readSavedDraft(): MixDraftInput {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) throw new Error("Lagre mix-utkastet i Mix Studio først.");
  const draft = JSON.parse(raw) as MixDraftInput;
  if (!Array.isArray(draft.selectedSongIds) || draft.selectedSongIds.length < 2) {
    throw new Error("Velg minst to sanger og lagre mix-utkastet først.");
  }
  return { ...draft, queue: false };
}

export default function AdminMixStudioProduction() {
  const [job, setJob] = useState<MixJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshJob = useCallback(async () => {
    if (!job) return;
    try {
      const jobs = await loadMixJobs();
      const current = jobs.find((candidate) => candidate.id === job.id);
      if (current) setJob(current);
    } catch {
      // Status refresh is best-effort. The production job itself is durable.
    }
  }, [job]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(refreshJob, 10000);
    return () => window.clearInterval(timer);
  }, [job, refreshJob]);

  async function saveServerDraft() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await createMixDraft(readSavedDraft());
      setJob(saved);
      setMessage("Utkastet er lagret i produksjonsdatabasen.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre mix-utkastet.");
    } finally {
      setBusy(false);
    }
  }

  async function startProduction() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const draft = readSavedDraft();
      if (draft.targetMinutes !== 30) {
        throw new Error("Velg 30 minutter og lagre utkastet først. 60–180 minutter er foreløpig planleggingsmodus.");
      }
      const saved = await createMixDraft(draft);
      const result = await startMixProduction(saved.id);
      setJob(result.mix);
      setMessage(
        result.started
          ? "Produksjonsworkflow startet. Status oppdateres automatisk."
          : "Mixen er køet. Recovery-worker starter den automatisk.",
      );
    } catch (productionError) {
      setError(productionError instanceof Error ? productionError.message : "Kunne ikke starte produksjonen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminMixStudio />

      <section className="admin-card admin-mix-studio">
        <div className="mix-section-heading">
          <div>
            <p className="admin-eyebrow">Produksjon</p>
            <h3>Test Mediterranean Mix i produksjon</h3>
            <p>
              Første produksjonsmodus er kontrollert til 30 minutter. Lagre planen over, og start deretter hele
              kjeden: crossfade, ZenEcoHomes-bilder, render, YouTube, spilleliste og kommentar.
            </p>
          </div>
          {job && (
            <button className="admin-secondary" onClick={refreshJob} disabled={busy}>
              <RefreshCw size={16} /> Oppdater status
            </button>
          )}
        </div>

        {error && <div className="admin-error">{error}</div>}
        {message && <div className="admin-success"><Check size={16} /> {message}</div>}

        {job && (
          <div className="mix-track-summary">
            <strong>Status: {job.status}</strong>
            <span>{job.pipeline_step || "venter"}</span>
            <span>{job.progress || 0}%</span>
            {job.error_message && <span>{job.error_message}</span>}
            {job.youtube_url && (
              <a href={job.youtube_url} target="_blank" rel="noreferrer">
                Åpne på YouTube <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}

        <div className="mix-production-footer">
          <div>
            <strong>Produksjonsgrense nå: 30 minutter</strong>
            <span>Lengre mixer kan lagres som utkast og aktiveres når segmentert long-form-render er ferdig.</span>
          </div>
          <div className="mix-actions">
            <button className="admin-secondary" onClick={saveServerDraft} disabled={busy}>
              {busy ? <Loader2 className="admin-spinner" size={17} /> : <Check size={17} />}
              Lagre på server
            </button>
            <button className="admin-primary" onClick={startProduction} disabled={busy}>
              {busy ? <Loader2 className="admin-spinner" size={17} /> : <Rocket size={17} />}
              Start 30-min produksjonstest
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
