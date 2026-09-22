import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, RefreshCw, Rocket } from "lucide-react";
import AdminMixStudio from "./AdminMixStudio";
import {
  createMixDraft,
  loadMixJobs,
  startMixProduction,
  type MixDraftInput,
  type MixJob,
} from "./lib/mix-api";
import {
  isYoutubeReconnectError,
  REALTYFLOW_YOUTUBE_RECONNECT_URL,
} from "./lib/youtube-reconnect";

const DRAFT_KEY = "remaster-mediterranean-mix-draft-v1";
const ACTIVE_JOB_KEY = "remaster-mix-active-job-v1";
const STALE_HEARTBEAT_MS = 8 * 60_000;

export function mixStepLabel(step: string): string {
  const labels: Record<string, string> = {
    draft: "Utkast lagret",
    queued: "Ligger i produksjonskøen",
    queued_v2: "Ligger i produksjonskøen",
    verifying_youtube_connection: "Kontrollerer YouTube-kanalen",
    building_crossfade_audio: "Setter sammen sangene og overgangene",
    selecting_visuals: "Henter utvalgte bilder",
    downloading_visuals_v4: "Laster ned kunst- eller bokbilder",
    rendering_visuals_v4: "Lager videobildene og legger på musikken",
    video_ready_v4: "Videoen er ferdig rendret",
    video_verified_v4: "Kontrollerer videoen",
    preparing_youtube_upload: "Klargjør opplasting til YouTube",
    completed: "Ferdig publisert",
    failed: "Produksjonen feilet",
    render_stalled_needs_review: "Renderingen stoppet. Nytt forsøk krever feilsøking.",
  };
  return labels[step] || step.replace(/_/g, " ");
}


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
  const [draftRevision, setDraftRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [checkedAt, setCheckedAt] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reconnectRequired =
    job?.error_code === "YOUTUBE_RECONNECT_REQUIRED" ||
    isYoutubeReconnectError(job?.error_message) ||
    isYoutubeReconnectError(error);

  const applyJob = useCallback((next: MixJob) => {
    setJob(next);
    setCheckedAt(Date.now());
    try { window.localStorage.setItem(ACTIVE_JOB_KEY, next.id); } catch { /* no local storage */ }
  }, []);

  const refreshJob = useCallback(async () => {
    try {
      const jobs = await loadMixJobs();
      let savedId: string | null = null;
      try { savedId = window.localStorage.getItem(ACTIVE_JOB_KEY); } catch { /* no local storage */ }
      // An active production job beats an old stored draft or another completed mix.
      const next = jobs.find(item => item.status === "running" || item.status === "queued")
        || jobs.find(item => item.id === savedId)
        || jobs.find(item => item.status !== "draft")
        || null;
      if (next) applyJob(next);
      else { setJob(null); setCheckedAt(Date.now()); }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente produksjonsstatus.");
    } finally {
      setLoadingHistory(false);
    }
  }, [applyJob]);

  useEffect(() => { void refreshJob(); }, [refreshJob]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = window.setInterval(() => { void refreshJob(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, refreshJob]);

  async function saveServerDraft() {
    setBusy(true); setError(""); setMessage("");
    try {
      const jobs = await loadMixJobs();
      const active = jobs.find(item => item.status === "running" || item.status === "queued");
      if (active) {
        applyJob(active);
        throw new Error("En miks produseres allerede. Se statusen nedenfor; ikke start en kopi.");
      }
      const saved = await createMixDraft(readSavedDraft());
      applyJob(saved);
      setMessage("Utkastet er lagret i produksjonsdatabasen.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Kunne ikke lagre mix-utkastet.");
    } finally { setBusy(false); }
  }

  async function startProduction() {
    setBusy(true); setError(""); setMessage("");
    try {
      const jobs = await loadMixJobs();
      const active = jobs.find(item => item.status === "running" || item.status === "queued");
      if (active) {
        applyJob(active);
        setMessage("Miksen er allerede i produksjon. Du trenger ikke starte den på nytt.");
        return;
      }
      const draft = readSavedDraft();
      const identicalStalled = jobs.find(item=>
        item.error_code === "MIX_RENDER_STALLED_NEEDS_REVIEW" &&
        item.status === "failed" && !item.youtube_url &&
        item.title.trim().toLowerCase() === draft.title.trim().toLowerCase() &&
        item.target_minutes === draft.targetMinutes &&
        item.input_snapshot?.visualPlan?.brand === draft.promotionBrand &&
        item.track_ids.length === draft.selectedSongIds.length &&
        item.track_ids.every((trackId,index)=>trackId===draft.selectedSongIds[index])
      );
      if (identicalStalled) {
        applyJob(identicalStalled);
        throw new Error("Denne miksen stoppet allerede under rendering. Ingen ny kopi blir laget før feilen er rettet.");
      }
      if (draft.targetMinutes !== 30) {
        throw new Error("Velg 30 minutter og lagre utkastet først. 60–180 minutter er foreløpig planleggingsmodus.");
      }
      const saved = await createMixDraft(draft);
      applyJob(saved);
      const result = await startMixProduction(saved.id);
      applyJob(result.mix);
      setMessage(result.started
        ? "Produksjonen er startet. Status og fremdrift hentes automatisk fra serveren."
        : "Miksen er køet. Systemets gjenopprettingsjobb håndterer produksjonsstart.");
    } catch (productionError) {
      setError(productionError instanceof Error ? productionError.message : "Kunne ikke starte produksjonen.");
    } finally { setBusy(false); }
  }

  function restoreFailedSelection() {
    if(!job || job.status!=="failed" || job.error_code!=="MIX_PROMOTION_SELECTION_INVALID" ||
      job.youtube_upload_started_at || job.youtube_video_id) return;
    const plan=job.input_snapshot?.visualPlan;
    if(!plan)return;
    try {
      const existing=window.localStorage.getItem(DRAFT_KEY);
      if(existing)window.localStorage.setItem(DRAFT_KEY+"-backup-before-recovery",existing);
      const original=existing?JSON.parse(existing) as Partial<MixDraftInput>:{};
      const brand=plan.brand||plan.source||plan.promotionBrand||(job.zenecohomes_enabled?"zeneco":"none");
      const restored:MixDraftInput={
        ...original,
        title:job.title,style:job.style,targetMinutes:job.target_minutes,
        crossfadeSeconds:job.crossfade_seconds,playlist:job.playlist_name,
        zenEcoHomesEnabled:brand==="zeneco",promotionBrand:brand,
        artStyles:plan.artStyles||[],artCollections:plan.artCollections||[],artIds:plan.artIds||[],
        bookSeries:plan.bookSeries||[],bookLanguages:plan.bookLanguages||[],bookIds:plan.bookIds||[],
        thumbnailStyle:plan.thumbnailStyle||"automatic",thumbnailTitle:plan.thumbnailTitle||"",
        commentStyle:plan.commentStyle||"detailed",
        visualRegion:job.visual_region,visualType:job.visual_type,
        visualTypes:plan.visualTypes||[job.visual_type],
        sponsorIntervalMinutes:job.sponsor_interval_minutes,ctaText:job.cta_text||"",
        selectedSongIds:[...job.track_ids],queue:false,
      };
      window.localStorage.setItem(DRAFT_KEY,JSON.stringify(restored));
      setDraftRevision(value=>value+1);
      setMessage(`«${job.title}» er gjenopprettet i Mix Studio ovenfor. Rett den navngitte stilkonflikten og lagre utkastet før du eventuelt starter en ny produksjon. Ingenting er startet automatisk.`);
      setError("");
    }catch {
      setError("Kunne ikke gjenopprette produksjonsutkastet. Prøv på nytt etter at nettleserens lokale lagring er tilgjengelig.");
    }
  }

  const running = job?.status === "running" || job?.status === "queued";
  const renderNeedsReview = job?.error_code === "MIX_RENDER_STALLED_NEEDS_REVIEW";
  const heartbeatTime = job?.heartbeat_at || job?.updated_at || null;
  const lastHeartbeatMs = heartbeatTime ? Date.parse(heartbeatTime) : Number.NaN;
  const stale = job?.status === "running" && Number.isFinite(lastHeartbeatMs)
    && checkedAt > 0 && checkedAt - lastHeartbeatMs > STALE_HEARTBEAT_MS;
  const percent = Math.max(0, Math.min(100, job?.progress || 0));

  return (
    <>
      <AdminMixStudio key={draftRevision} />

      <section className="admin-card admin-mix-studio">
        <div className="mix-section-heading">
          <div>
            <p className="admin-eyebrow">Produksjon</p>
            <h3>Produser en 30-minutters Re-Master Freddy-miks</h3>
            <p>
              Velg sanger og promotering over. Produksjonen henter bare godkjente bolig-, kunst- eller bokbilder,
              bygger crossfade-lyd, legger inn riktig CTA, og publiserer miksen på Re-Master Freddy-kanalen.
            </p>
          </div>
          <button className="admin-secondary" onClick={() => void refreshJob()} disabled={busy || loadingHistory}>
              <RefreshCw size={16} /> Oppdater status
            </button>
        </div>

        {reconnectRequired && (
          <div className="admin-error">
            <div>
              <strong>YouTube må kobles til på nytt.</strong>{" "}
              Google har utløpt eller tilbakekalt Re-Master Freddy-tokenet. Ingen ny rendering er nødvendig.
            </div>
            <a
              className="admin-primary"
              href={REALTYFLOW_YOUTUBE_RECONNECT_URL}
            >
              Koble YouTube til på nytt <ExternalLink size={15} />
            </a>
          </div>
        )}

        {error && !reconnectRequired && <div className="admin-error">{error}</div>}
        {message && <div className="admin-success"><Check size={16} /> {message}</div>}

        {loadingHistory && <p role="status">Henter aktiv miks og produksjonsstatus fra serveren …</p>}
        {job && !loadingHistory && (
          <div className="mix-section mix-live-production" role="region" aria-label="Status for mikseproduksjon">
            <div className="mix-section-heading">
              <div>
                <p className="admin-eyebrow">Din produksjonsjobb</p>
                <h3>{job.title}</h3>
                <p>{job.status === "completed" ? "Publisert" : job.status === "failed" ? "Feilet"
                  : job.status === "queued" ? "Venter på produksjonsmotoren"
                  : job.status === "running" ? "Produksjonen kjører på serveren"
                  : job.status === "cancelled" ? "Avbrutt" : "Lagret utkast"}</p>
              </div>
              <strong className="mix-live-percent">{percent}%</strong>
            </div>
            <div className="mix-live-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={percent} aria-label="Fremdrift for mikseproduksjon">
              <div style={{width:`${percent}%`}}/>
            </div>
            <strong>{mixStepLabel(job.pipeline_step)}</strong>
            {running && (
              <p className="mix-live-note">
                En 30-minutters video må først rendres og lastes opp. Prosentsatsen oppdateres
                når serveren rapporterer fremdrift; du kan lukke siden uten å avbryte jobben.
              </p>
            )}
            {heartbeatTime && (
              <small>
                Siste registrerte status: {new Date(heartbeatTime).toLocaleString("nb-NO")}.
                {checkedAt > 0 && <> Kontrollert: {new Date(checkedAt).toLocaleTimeString("nb-NO")}.</>}
              </small>
            )}
            {stale && (
              <div className="admin-error" role="alert">
                <AlertCircle size={16}/>
                Ingen ny status fra produksjonsmotoren på over åtte minutter. Jobben kan fremdeles
                kjøre eller være under gjenoppretting. Ikke start en ny kopi; bruk «Oppdater status».
              </div>
            )}
            {renderNeedsReview && (
              <div className="admin-error" role="alert">Renderingen av denne miksen stoppet gjentatte ganger. Automatisk omstart er deaktivert. Valgte sanger og kunstverk er bevart; ikke start en kopi før videomotoren er kontrollert.</div>
            )}
            {job.status === "failed" && job.error_message && (
              <div className="admin-error" role="alert">{job.error_message}</div>
            )}
            {job.status === "failed" && job.error_code === "MIX_PROMOTION_SELECTION_INVALID" &&
              !job.youtube_upload_started_at && !job.youtube_video_id && (
              <div className="mix-recovery-panel">
                <p>Dette er en konflikt mellom et manuelt valgt verk og bildenes stil-/kolleksjonsfiltre. Ingen YouTube-opplasting er startet. Du kan hente tilbake nøyaktig de samme sangene, valgte verkene og filtrene og se hvilket bilde som må justeres.</p>
                <button type="button" className="admin-secondary" onClick={restoreFailedSelection}>
                  Gjenopprett dette utkastet og vis bildet som må rettes
                </button>
                <small>Dette starter ikke produksjonen på nytt. Ditt tidligere lagrede lokale utkast sikkerhetskopieres.</small>
              </div>
            )}
            {job.youtube_url && (
              <a href={job.youtube_url} target="_blank" rel="noreferrer" className="admin-primary">
                Åpne ferdig miks på YouTube <ExternalLink size={15}/>
              </a>
            )}
            <small>Jobb-ID: {job.id}</small>
          </div>
        )}


        <div className="mix-production-footer">
          <div>
            <strong>Produksjonsgrense nå: 30 minutter</strong>
            <span>Lengre mixer kan lagres som utkast og aktiveres når segmentert long-form-render er ferdig.</span>
          </div>
          <div className="mix-actions">
            <a className="admin-secondary" href={REALTYFLOW_YOUTUBE_RECONNECT_URL}>
              YouTube-tilkobling <ExternalLink size={15} />
            </a>
            <button className="admin-secondary" onClick={saveServerDraft} disabled={busy || loadingHistory || running}>
              {busy ? <Loader2 className="admin-spinner" size={17} /> : <Check size={17} />}
              Lagre på server
            </button>
            <button className="admin-primary" onClick={startProduction} disabled={busy || loadingHistory || running}>
              {busy ? <Loader2 className="admin-spinner" size={17} /> : <Rocket size={17} />}
              {running ? "Miks er allerede i produksjon" : "Produser og publiser 30-min miks"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
