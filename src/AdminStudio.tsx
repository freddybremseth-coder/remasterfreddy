import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Music2, Play, RefreshCw, Upload, Youtube } from "lucide-react";
import LibraryCleanup from "./LibraryCleanup";
import PipelineAssets from "./PipelineAssets";
import PipelineVideoDirection from "./PipelineVideoDirection";
import StoryboardEditor, { applyContinuityNote, isValidStoryboard } from "./StoryboardEditor";
import RenderReadinessPanel from "./RenderReadinessPanel";
import { inspectRenderReadiness } from "./lib/render-readiness";
import { applyMusicSectionCues } from "./lib/storyboard-music-sections";
import PipelinePublishSettings from "./PipelinePublishSettings";
import YouTubeHealthCard from "./YouTubeHealthCard";
import { AdminSong, ImageKind, loadSongs, PipelineOptions, startSongPipeline, previewSongStoryboard, uploadSong, publishMissingArtShort, type StoryboardSceneTiming } from "./lib/admin-api";
import { isValidSceneTiming } from "./lib/local-audio-scene-cues";
import { YouTubeHealth } from "./lib/youtube-health";
import "./admin-studio.css";
import "./admin-upload.css";

interface PipelineEvent {
  status?: string;
  error?: string;
  steps?: Array<{ name: string; status: string; error?: string }>;
  output?: { youtubeUrl?: string };
}

interface AdminStudioProps {
  assetRefreshToken: number;
  onOpenImageBank: (kind: ImageKind) => void;
}

interface EditedStoryboard {
  songId: string;
  sourceKey: string;
  scenes: string[];
  approved: boolean;
  timing?: StoryboardSceneTiming;
}

function storyboardSourceKey(song: AdminSong, options: PipelineOptions): string {
  return JSON.stringify([song.id, song.title, song.genre || "", options.visualTheme?.trim() || "", options.songLyrics?.trim() || ""]);
}

export default function AdminStudio({ assetRefreshToken, onOpenImageBank }: AdminStudioProps) {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [shortsProcessingId, setShortsProcessingId] = useState<string | null>(null);
  const [shortsMessage, setShortsMessage] = useState("");
  const [pipelineEvent, setPipelineEvent] = useState<PipelineEvent | null>(null);
  const [preview, setPreview] = useState<EditedStoryboard | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [pendingRender, setPendingRender] = useState<{ songId: string; mode: "storyboard"; sourceKey: string; optionsKey: string; scenesKey: string; timingKey: string } | null>(null);
  const renderLock = useRef(false);
  const [youtubeHealth, setYouTubeHealth] = useState<YouTubeHealth | null>(null);
  const [pipelineOptions, setPipelineOptions] = useState<PipelineOptions>({
    customImageUrls: [],
    multilingualDescription: true,
    // Publiser på beste tidspunkt som standard — kan slås av per kjøring.
    autoSchedule: true,
  });
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [mp3Title, setMp3Title] = useState("");
  const [mp3Artist, setMp3Artist] = useState("Re-Master Freddy");
  const [mp3Genre, setMp3Genre] = useState<"" | "meditation" | "relaxing" | "alternative" | "dance" | "rock" | "ballad" | "pop" | "cinematic">("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

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

  function selectMp3(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setMp3File(file);
    setUploadMessage("");
    if (file) {
      setMp3Title(file.name.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ").trim());
    }
  }

  async function handleUpload() {
    if (!mp3File || !mp3Title.trim()) {
      setError("Velg en MP3-fil og skriv inn tittel.");
      return;
    }

    setUploading(true);
    setError("");
    setUploadMessage("");
    try {
      await uploadSong(mp3File, mp3Title, mp3Artist, mp3Genre);
      setUploadMessage("Sangen er lastet opp og lagt i publiseringskøen.");
      setMp3File(null);
      setMp3Title("");
      setMp3Artist("Re-Master Freddy");
      setMp3Genre("");
      await refreshSongs();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "MP3-opplastingen feilet.");
    } finally {
      setUploading(false);
    }
  }

  async function runPipeline(song: AdminSong) {
    // Keep the two-stage author confirmation for ALL video modes.
    if (renderLock.current || !pendingRender || pendingRender.songId !== song.id) return;
    const approvedStory = preview && preview.songId === song.id &&
      preview.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
      preview.approved && isValidStoryboard(preview.scenes) &&
      (preview.timing === undefined || isValidSceneTiming(preview.timing)) ? preview : null;
    if (pendingRender.optionsKey !== JSON.stringify(pipelineOptions) ||
        pendingRender.sourceKey !== storyboardSourceKey(song, pipelineOptions) ||
        (!approvedStory ||
          pendingRender.scenesKey !== JSON.stringify(approvedStory.scenes) ||
          pendingRender.timingKey !== JSON.stringify(approvedStory.timing ?? null))) {
      setError("Produksjonsvalgene eller storyboardet har endret seg. Bekreft videoproduksjonen på nytt.");
      setPendingRender(null);
      return;
    }
    if (!song.audioUrl || song.youtubeUrl || !youtubeHealth?.connected) {
      setError("Sangen må ha lyd, ikke være publisert, og YouTube må være tilkoblet.");
      return;
    }
    if (approvedStory?.timing && pipelineOptions.customImageUrls?.length) {
      setError("Fjern ekstrabilder når du bruker egne tidsmarkører med storyboard.");
      return;
    }

    renderLock.current = true;
    setPendingRender(null);
    setProcessingId(song.id);
    setPipelineEvent({ status: "running", steps: [] });
    setError("");

    try {
      const selectedStory = approvedStory;
      await startSongPipeline(song.id, {
        ...pipelineOptions,
        imageMode: "original",
        storyboardScenes: selectedStory?.scenes,
        sceneTiming: selectedStory?.timing,
      }, (event) => {
        if (event.type !== "heartbeat") setPipelineEvent(event);
      });
      setPipelineOptions(current => ({ ...current, visualTheme: "", songLyrics: "" }));
      setPreview(null);
      await refreshSongs();
    } catch (pipelineError) {
      const rawMessage = pipelineError instanceof Error ? pipelineError.message : "Pipelinen feilet.";
      const message = /ingen AI-bilder eller valgte bilder|no (ai |selected )?images (are )?available/i.test(rawMessage)
        ? "Steg 5 stoppet: Videomotoren fant ingen bilder. Storyboardet er godkjent, men ingen bilder ble generert eller overført fra bildebanken. Kontroller bildegenerering og koblingen mellom RealtyFlow og Re-Master før ny produksjon. " + rawMessage
        : rawMessage;
      setPipelineEvent({ status: "failed", error: message });
      setError(message);
    } finally {
      renderLock.current = false;
      setProcessingId(null);
    }
  }

  function requestRender(song: AdminSong) {
    if (renderLock.current || processingId || previewLoadingId) return;
    if (!song.audioUrl || song.youtubeUrl) {
      setError("Sangen mangler lyd eller har allerede en YouTube-video.");
      return;
    }
    if (!youtubeHealth?.connected) {
      setError("Koble Re-Master Freddy til YouTube-kanalen før videoproduksjon.");
      return;
    }
    const sourceKey = storyboardSourceKey(song, pipelineOptions);
    const approvedStory = preview?.songId === song.id && preview.sourceKey === sourceKey &&
      preview.approved && isValidStoryboard(preview.scenes) &&
      (preview.timing === undefined || isValidSceneTiming(preview.timing)) ? preview : null;
    if (!approvedStory) {
      setError("Lag og godkjenn storyboardet med åtte scener før du starter videoen.");
      return;
    }
    if (approvedStory?.timing && pipelineOptions.customImageUrls?.length) {
      setError("Fjern ekstrabilder før du bruker egne scenetider med storyboard.");
      return;
    }
    // Capture the entire selection to reject changes between confirmation and submit.
    setPendingRender({
      songId: song.id,
      mode: "storyboard",
      sourceKey,
      optionsKey: JSON.stringify(pipelineOptions),
      scenesKey: JSON.stringify(approvedStory.scenes),
      timingKey: JSON.stringify(approvedStory.timing ?? null),
    });
  }

  async function showStoryboard(song: AdminSong) {
    const sourceKey = storyboardSourceKey(song, pipelineOptions);
    setPendingRender(null);
    setPreviewLoadingId(song.id);
    setError("");
    try {
      const result = await previewSongStoryboard(song, pipelineOptions);
      setPreview({ songId: song.id, sourceKey, scenes: result.scenes, approved: false });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Kunne ikke lage storyboard-utkast.");
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function retryArtShort(song: AdminSong) {
    if (!youtubeHealth?.connected) {
      setError("Koble Re-Master Freddy til riktig YouTube-kanal før du lager Short.");
      return;
    }
    setShortsProcessingId(song.id);
    setShortsMessage("");
    setError("");
    try {
      const result = await publishMissingArtShort(song.id);
      if (result.status === "processing") {
        setShortsMessage(`Short for ${song.title} er allerede under produksjon.`);
      } else {
        setShortsMessage(`Short for ${song.title}: ${result.shortUrl || "Allerede publisert"}`);
      }
      await refreshSongs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lage Short");
    } finally {
      setShortsProcessingId(null);
    }
  }

  return (
    <section className="admin-card admin-studio">
      <YouTubeHealthCard onHealthChange={setYouTubeHealth} />

      <div className="admin-upload-panel">
        <div>
          <p className="admin-eyebrow">Ny sang</p>
          <h2>Last opp MP3</h2>
          <p>Filen lastes direkte til Supabase med en kortvarig, signert opplastingsadresse.</p>
        </div>
        <div className="admin-upload-grid">
          <label className="admin-file-field">
            <span>MP3-fil</span>
            <input type="file" accept="audio/mpeg,.mp3" onChange={selectMp3} />
            <strong>{mp3File?.name || "Velg fil"}</strong>
          </label>
          <label>
            <span>Tittel</span>
            <input value={mp3Title} onChange={(event) => setMp3Title(event.target.value)} placeholder="Sangtittel" />
          </label>
          <label>
            <span>Artist</span>
            <input value={mp3Artist} onChange={(event) => setMp3Artist(event.target.value)} />
          </label>
          <label>
            <span>Musikkategori og videostil</span>
            <select aria-label="Musikkategori og videostil" value={mp3Genre} onChange={(event) => setMp3Genre(event.target.value as typeof mp3Genre)}>
              <option value="">Automatisk analyse (standard video)</option>
              <option value="meditation">Meditation – Freddy Bremseth Art</option>
              <option value="relaxing">Relaxing – Freddy Bremseth Art</option>
              <option value="alternative">Alternative – Freddy Bremseth Art</option>
              <option value="dance">Dance / EDM</option>
              <option value="rock">Rock / Power Rock</option>
              <option value="ballad">Ballade / følelsesladet</option>
              <option value="pop">Pop</option>
              <option value="cinematic">Filmatisk / instrumental</option>
            </select>
          </label>
          <button className="admin-primary admin-upload-button" onClick={handleUpload} disabled={uploading || !mp3File || !mp3Title.trim()}>
            {uploading ? <Loader2 className="admin-spinner" size={17} /> : <Upload size={17} />}
            Last opp sang
          </button>
        </div>
        {uploadMessage && <div className="admin-success"><CheckCircle2 size={17} />{uploadMessage}</div>}
      </div>

      <PipelineVideoDirection value={pipelineOptions} onChange={setPipelineOptions} />

      <PipelineAssets
        value={pipelineOptions}
        onChange={setPipelineOptions}
        refreshToken={assetRefreshToken}
        onOpenImageBank={onOpenImageBank}
      />
      <PipelinePublishSettings value={pipelineOptions} onChange={setPipelineOptions} />

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

      {shortsMessage && <div className="admin-success"><CheckCircle2 size={17} />{shortsMessage}</div>}
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
                  {step.status === "failed" && step.error ? ` — ${step.error}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingRender && (() => {
        const song = songs.find(item => item.id === pendingRender.songId);
        const approvedStory = song && preview?.songId === song.id &&
          preview.sourceKey === pendingRender.sourceKey &&
          preview.approved && isValidStoryboard(preview.scenes) &&
          (preview.timing === undefined || isValidSceneTiming(preview.timing)) ? preview : null;
        const valid = Boolean(song?.audioUrl && !song.youtubeUrl && youtubeHealth?.connected &&
          storyboardSourceKey(song, pipelineOptions) === pendingRender.sourceKey &&
          JSON.stringify(pipelineOptions) === pendingRender.optionsKey &&
          Boolean(approvedStory &&
            JSON.stringify(approvedStory.scenes) === pendingRender.scenesKey &&
            JSON.stringify(approvedStory.timing ?? null) === pendingRender.timingKey &&
            (!approvedStory.timing || !pipelineOptions.customImageUrls?.length)));
        return (
          <div className="admin-render-confirmation" role="dialog" aria-modal="true" aria-labelledby="render-confirm-title">
            <div className="admin-render-confirmation-panel">
              <h3 id="render-confirm-title">Bekreft videoproduksjon</h3>
              <p><strong>{song?.title || "Ukjent sang"}</strong></p>
              <p><strong>Video med godkjent storyboard</strong></p>
              <p>Videoen bruker egne valgte bilder eller originale abstrakte bakgrunner laget lokalt. Gemini brukes ikke til bilder. Sang- og metadataanalyse kan bruke andre AI-tjenester. Hvis du fortsetter, starter videoproduksjon og eventuell YouTube-publisering etter valgene dine.</p>
              {approvedStory?.timing && <p>Scenestartene er knyttet til godkjent tidsplan.</p>}
              {!valid && <p role="alert">Valgene har endret seg. Avbryt og kontroller på nytt.</p>}
              <div className="admin-render-confirmation-actions">
                <button type="button" className="admin-secondary" onClick={() => setPendingRender(null)}>Avbryt – ingen kostnader</button>
                <button type="button" className="admin-primary" disabled={!valid || processingId !== null}
                  onClick={() => { if (song && valid) void runPipeline(song); }}>
                  Start video uten Gemini-bilder
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="admin-song-list">
        {loading && songs.length === 0 ? (
          <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Henter sanger …</div>
        ) : songs.length === 0 ? (
          <div className="admin-empty"><Music2 size={24} /> Ingen sanger funnet.</div>
        ) : (
          songs.map((song) => {
            const canProcess = Boolean(song.audioUrl && !song.youtubeUrl);
            const matchingPreview = preview?.songId === song.id &&
              preview.sourceKey === storyboardSourceKey(song, pipelineOptions) ? preview : null;
            const approved = Boolean(matchingPreview?.approved && isValidStoryboard(matchingPreview.scenes));
            const disabledReason = !canProcess
              ? "Sangen mangler lyd eller er allerede publisert."
              : !youtubeHealth?.connected
                ? "Koble Re-Master Freddy til riktig YouTube-kanal først."
                : approved ? "Lag video med godkjent storyboard." : "Lag og godkjenn de åtte scenene først.";

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
                    <>
                      <a href={song.youtubeUrl} target="_blank" rel="noreferrer">
                        Se på YouTube <ExternalLink size={14} />
                      </a>
                      {song.metadata?.shortsUrl && (
                        <a href={song.metadata.shortsUrl} target="_blank" rel="noreferrer">
                          Se Short <ExternalLink size={14} />
                        </a>
                      )}
                      {!song.metadata?.shortsUrl && (
                        <button
                          className="admin-secondary"
                          disabled={Boolean(shortsProcessingId) || !youtubeHealth?.connected || song.metadata?.shortsStatus === "needs-reconciliation"}
                          onClick={() => retryArtShort(song)}
                          title={song.metadata?.shortsError || "Lag Short av den publiserte sangen uten å laste opp fullversjonen igjen"}
                        >
                          {shortsProcessingId === song.id ? <Loader2 className="admin-spinner" size={15} /> : <Play size={15} />}
                          {song.metadata?.shortsStatus === "needs-reconciliation" ? "Kontroller YouTube først" : "Lag manglende Short"}
                        </button>
                      )}
                    </>
                  ) : song.audioUrl ? (
                    <span className="admin-ready">Klar</span>
                  ) : (
                    <span className="admin-missing">Mangler lyd</span>
                  )}
                </div>
                <div className="admin-song-actions">
                  {canProcess && (
                    <button
                      className="admin-secondary"
                      type="button"
                      disabled={processingId !== null || previewLoadingId !== null}
                      onClick={() => showStoryboard(song)}
                      title="Kostnadsfri forhåndsvisning av åtte tekstscener"
                    >
                      {previewLoadingId === song.id ? <Loader2 className="admin-spinner" size={16} /> : <Music2 size={16} />}
                      {matchingPreview ? "Oppdater storyboard" : "Se storyboard"}
                    </button>
                  )}
                  <button
                    className="admin-primary admin-run-button"
                    disabled={!canProcess || !approved || processingId !== null || previewLoadingId !== null || !youtubeHealth?.connected}
                    onClick={() => requestRender(song)}
                    title={disabledReason}
                  >
                    {processingId === song.id ? <Loader2 className="admin-spinner" size={16} /> : <Play size={16} />}
                    Lag video
                  </button>
                  {canProcess && (
                    <a
                      className="admin-secondary"
                      href={`https://realtyflow.chatgenius.pro/image-studio?${new URLSearchParams({
                        source: "remaster",
                        provider: "openart",
                        song: song.title,
                        genre: song.genre || "",
                        theme: pipelineOptions.visualTheme?.trim() || "",
                      }).toString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Forbered frivillige OpenArt-bilder for akkurat denne sangen. Bruker ingen kreditter før du bekrefter i bildestudioet."
                    >
                      OpenArt-bilder
                    </a>
                  )}
                </div>
                {matchingPreview && (
                  <RenderReadinessPanel
                    songId={song.id}
                    hasAudio={Boolean(song.audioUrl)}
                    alreadyPublished={Boolean(song.youtubeUrl)}
                    previewSongId={matchingPreview.songId}
                    sourceMatches={matchingPreview.sourceKey === storyboardSourceKey(song, pipelineOptions)}
                    approved={matchingPreview.approved}
                    scenes={matchingPreview.scenes}
                    youtubeConnected={Boolean(youtubeHealth?.connected)}
                    timing={matchingPreview.timing}
                    extraImageCount={pipelineOptions.customImageUrls?.length ?? 0}
                    currentlyProcessing={Boolean(processingId)}
                  />
                )}
                {matchingPreview && (
                  <StoryboardEditor
                    songTitle={song.title}
                    scenes={matchingPreview.scenes}
                    approved={matchingPreview.approved}
                    sceneTiming={matchingPreview.timing}
                    onApplyTiming={(timing) => setPreview(current => current?.songId === song.id &&
                      current.sourceKey === storyboardSourceKey(song, pipelineOptions)
                      ? { ...current, timing, approved: false } : current)}
                    onClearTiming={() => setPreview(current => current?.songId === song.id &&
                      current.timing !== undefined
                      ? { ...current, timing: undefined, approved: false } : current)}
                    onChangeScene={(index, text) => setPreview(current => current?.songId === song.id
                      ? { ...current, approved: false, scenes: current.scenes.map((scene, i) => i === index ? text : scene) }
                      : current)}
                    onApplyContinuity={(note) => setPreview(current => {
                      if (!current || current.songId !== song.id ||
                          current.sourceKey !== storyboardSourceKey(song, pipelineOptions)) return current;
                      const updated = applyContinuityNote(current.scenes, note);
                      return updated ? { ...current, scenes: updated, approved: false } : current;
                    })}
                    onApplyMusicSections={(sections) => setPreview(current => {
                      if (!current || current.songId !== song.id ||
                          current.sourceKey !== storyboardSourceKey(song, pipelineOptions)) return current;
                      const updated = applyMusicSectionCues(current.scenes, sections);
                      return updated ? { ...current, scenes: updated, approved: false } : current;
                    })}
                    onApprove={() => setPreview(current => current?.songId === song.id &&
                      current.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
                      isValidStoryboard(current.scenes) ? { ...current, approved: true } : current)}
                    onDiscard={() => setPreview(current => current?.songId === song.id ? null : current)}
                  />
                )}
              </article>
            );
          })
        )}
      </div>

      <LibraryCleanup />
    </section>
  );
}
