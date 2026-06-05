import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Music2, Play, RefreshCw, Youtube } from "lucide-react";
import { AdminSong, loadSongs, startSongPipeline } from "./lib/admin-api";

interface PipelineEvent {
  status?: string;
  error?: string;
  steps?: Array<{ name: string; status: string; error?: string }>;
  output?: { youtubeUrl?: string };
}

export default function AdminStudio() {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [pipelineEvent, setPipelineEvent] = useState<PipelineEvent | null>(null);

  async function refreshSongs() {
    setLoading(true);
    setError("");
    try {
      setSongs(await loadSongs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente sangene.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSongs();
  }, []);

  const readyCount = useMemo(
    () => songs.filter((song) => song.audioUrl && !song.youtubeUrl).length,
    [songs],
  );

  async function runPipeline(song: AdminSong) {
    setProcessingId(song.id);
    setPipelineEvent({ status: "running", steps: [] });
    setError("");

    try {
      await startSongPipeline(song.id, (event) => {
        if (event.type !== "heartbeat") setPipelineEvent(event);
      });
      await refreshSongs();
    } catch (pipelineError) {
      const message = pipelineError instanceof Error ? pipelineError.message : "Pipelinen feilet.";
      setPipelineEvent({ status: "failed", error: message });
      setError(message);
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <section className="admin-card admin-studio">
      <div className="admin-studio-header">
        <div>
          <p className="admin-eyebrow">Publiseringskø</p>
          <h2>Sanger klare for YouTube</h2>
          <p>{readyCount} av {songs.length} sanger har lyd og mangler YouTube-video.</p>
        </div>
        <button className="admin-secondary" onClick={refreshSongs} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      {error && (
        <div className="admin-error admin-inline-message">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      {pipelineEvent && (
        <div className={`admin-pipeline-status ${pipelineEvent.status === "failed" ? "is-error" : ""}`}>
          <div className="admin-pipeline-title">
            {pipelineEvent.status === "completed" ? <CheckCircle2 size={18} /> : <Loader2 className={pipelineEvent.status === "running" ? "admin-spinner" : ""} size={18} />}
            <strong>
              {pipelineEvent.status === "completed"
                ? "Video ferdig"
                : pipelineEvent.status === "failed"
                  ? "Pipeline feilet"
                  : "Video produseres"}
            </strong>
          </div>
          {pipelineEvent.error && <p>{pipelineEvent.error}</p>}
          {pipelineEvent.steps && pipelineEvent.steps.length > 0 && (
            <div className="admin-step-list">
              {pipelineEvent.steps.map((step) => (
                <span key={step.name} data-status={step.status}>
                  {step.name}: {step.status}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="admin-song-list">
        {loading && songs.length === 0 ? (
          <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Henter sanger …</div>
        ) : songs.length === 0 ? (
          <div className="admin-empty"><Music2 size={24} /> Ingen sanger funnet.</div>
        ) : (
          songs.map((song) => {
            const canProcess = Boolean(song.audioUrl && !song.youtubeUrl);
            return (
              <article className="admin-song-row" key={song.id}>
                <div className="admin-song-icon">
                  {song.youtubeUrl ? <Youtube size={20} /> : <Music2 size={20} />}
                </div>
                <div className="admin-song-copy">
                  <strong>{song.title || "Uten tittel"}</strong>
                  <span>{song.artist || "Re-Master Freddy"}{song.genre ? ` · ${song.genre}` : ""}</span>
                </div>
                <div className="admin-song-state">
                  {song.youtubeUrl ? (
                    <a href={song.youtubeUrl} target="_blank" rel="noreferrer">
                      Se på YouTube <ExternalLink size={14} />
                    </a>
                  ) : song.audioUrl ? (
                    <span className="admin-ready">Klar</span>
                  ) : (
                    <span className="admin-missing">Mangler lyd</span>
                  )}
                </div>
                <button
                  className="admin-primary admin-run-button"
                  disabled={!canProcess || processingId !== null}
                  onClick={() => runPipeline(song)}
                >
                  {processingId === song.id ? <Loader2 className="admin-spinner" size={16} /> : <Play size={16} />}
                  Lag video
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
