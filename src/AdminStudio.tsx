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
import { AdminSong, ImageKind, loadSongs, PipelineOptions, startSongPipeline, previewSongStoryboard, uploadSong, saveSongVideoImages, checkSongVideoImages, generatePrivateMp4Teaser, generatePrivateFullMp4, publishMissingArtShort, type PrivateMp4Teaser, type PrivateFullMp4, type VisualPreflightResult, type StoryboardSceneTiming } from "./lib/admin-api";
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
  const [verifiedImages, setVerifiedImages] = useState<Record<string, boolean>>({});
  const [youtubeHealth, setYouTubeHealth] = useState<YouTubeHealth | null>(null);
  const [pipelineOptions, setPipelineOptions] = useState<PipelineOptions>({
    customImageUrls: [],
    multilingualDescription: true,
    // Publiser på beste tidspunkt som standard — kan slås av per kjøring.
    autoSchedule: true,
  });
  // Local selections are an offline draft; confirmed selections are stored on the song record.
  const NEW_SONG_DRAFT = "__new_song__";
  const [activeSongId, setActiveSongId] = useState("");
  const [savedSongImages, setSavedSongImages] = useState<Record<string, string>>({});
  const [savingImages, setSavingImages] = useState(false);
  const [checkingImages, setCheckingImages] = useState(false);
  const [visualCheck, setVisualCheck] = useState<{
    songId: string; imagesKey: string; result: VisualPreflightResult;
  } | null>(null);
  const [visualCheckMessage, setVisualCheckMessage] = useState("");
  const [imageSaveMessage, setImageSaveMessage] = useState("");
  const [privateMp4LoadingId, setPrivateMp4LoadingId] = useState<string | null>(null);
  const [privateMp4, setPrivateMp4] = useState<{
    result: PrivateMp4Teaser; imageKey: string; scenesKey: string; sourceKey: string;
  } | null>(null);
  const [fullVideoGentleMotion, setFullVideoGentleMotion] = useState(true);
  const [privateFullMp4LoadingId, setPrivateFullMp4LoadingId] = useState<string | null>(null);
  const [privateFullMp4, setPrivateFullMp4] = useState<{
    result: PrivateFullMp4; imageKey: string; scenesKey: string;
    timingKey: string; sourceKey: string; gentleMotion: boolean;
  } | null>(null);
  const [songImages, setSongImages] = useState<Record<string, string[]>>(() => {
    try {
      const data: unknown = JSON.parse(window.localStorage.getItem("remaster-song-images-v1") || "{}");
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return Object.fromEntries(Object.entries(data).filter(([id, urls]) =>
        id && Array.isArray(urls) && urls.every(u => typeof u === "string" && u.startsWith("https://"))
      )) as Record<string, string[]>;
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("remaster-song-images-v1", JSON.stringify(songImages)); } catch {}
  }, [songImages]);
  const scopedOptions = { ...pipelineOptions, customImageUrls: songImages[activeSongId] || [] };
  function updateScopedOptions(next: PipelineOptions) {
    setPipelineOptions(current => ({ ...current, ...next, customImageUrls: [] }));
    if (activeSongId) setSongImages(current => ({ ...current, [activeSongId]: next.customImageUrls || [] }));
    setImageSaveMessage("");
    setPrivateMp4(null);
    setPrivateFullMp4(null);
    setVisualCheck(null);
    setVisualCheckMessage("");
    setPendingRender(null);
  }

  async function saveImageSelection() {
    const songId = activeSongId;
    if (!songId || songId === NEW_SONG_DRAFT || savingImages) return;
    const snapshot = [...(songImages[songId] || [])];
    setSavingImages(true);
    setVisualCheck(null);
    setVisualCheckMessage("");
    setImageSaveMessage("");
    setPrivateMp4(null);
    setPrivateFullMp4(null);
    setError("");
    try {
      await saveSongVideoImages(songId, snapshot);
      setSavedSongImages(current => ({ ...current, [songId]: JSON.stringify(snapshot) }));
      setImageSaveMessage("Bildene er lagret på sangen og kan hentes fra andre enheter.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bildene ble ikke lagret.");
    } finally {
      setSavingImages(false);
    }
  }
  async function inspectImageSelection() {
    const songId = activeSongId;
    if (!songId || songId === NEW_SONG_DRAFT || checkingImages) return;
    const imageUrls = [...(songImages[songId] || [])];
    const imagesKey = JSON.stringify(imageUrls);
    if (!imageUrls.length || savedSongImages[songId] !== imagesKey) {
      setError("Lagre bildevalgene på sangen før du kontrollerer videobildene.");
      return;
    }
    setCheckingImages(true);
    setVisualCheck(null);
    setVisualCheckMessage("");
    setError("");
    try {
      const result = await checkSongVideoImages(songId);
      setVisualCheck({ songId, imagesKey, result });
      setVisualCheckMessage("Alle valgte bilder er kontrollert på serveren. Ingen video er laget eller publisert.");
    } catch (err) {
      setVisualCheckMessage("");
      setError(err instanceof Error ? err.message : "Bildekontrollen feilet.");
    } finally {
      setCheckingImages(false);
    }
  }

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
      const fetched = await loadSongs();
      setSongs(fetched);
      // Server-confirmed selections override stale browser drafts.
      const saved = fetched.filter(song => Array.isArray(song.metadata?.remasterVideoImageUrls));
      setSongImages(current => {
        const next = { ...current };
        for (const song of saved) next[song.id] = [...(song.metadata?.remasterVideoImageUrls || [])];
        return next;
      });
      setSavedSongImages(current => {
        const next = { ...current };
        for (const song of saved) next[song.id] = JSON.stringify(song.metadata?.remasterVideoImageUrls || []);
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente sangene.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSongs();
  }, []);

  useEffect(() => {
    if (!activeSongId && songs.length && !mp3File) setActiveSongId((songs.find(song => song.audioUrl && !song.youtubeUrl) || songs[0]).id);
  }, [songs, activeSongId]);
  const readyCount = useMemo(
    () => songs.filter((song) => song.audioUrl && !song.youtubeUrl).length,
    [songs],
  );

  function selectMp3(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setMp3File(file);
    setUploadMessage("");
    if (file) {
      setActiveSongId(NEW_SONG_DRAFT);
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
      const draftImages = [...(songImages[NEW_SONG_DRAFT] || [])];
      const uploaded = await uploadSong(mp3File, mp3Title, mp3Artist, mp3Genre);
      let imagesSaved = false;
      if (uploaded?.id) {
        setSongImages(current => {
          const { [NEW_SONG_DRAFT]: _draft, ...rest } = current;
          return { ...rest, [uploaded.id]: draftImages };
        });
        setActiveSongId(uploaded.id);
        if (draftImages.length) {
          try {
            await saveSongVideoImages(uploaded.id, draftImages);
            setSavedSongImages(current => ({ ...current, [uploaded.id]: JSON.stringify(draftImages) }));
            imagesSaved = true;
          } catch (saveErr) {
            setError("MP3 er registrert, men videobildene ble ikke lagret på serveren: " +
              (saveErr instanceof Error ? saveErr.message : "Ukjent feil") +
              ". Velg sangen og trykk «Lagre bildevalg» for å prøve igjen.");
          }
        }
      }
      setUploadMessage(draftImages.length && !imagesSaved
        ? "Sangen er lastet opp. Bildevalgene må lagres før video kan startes."
        : "Sangen er lastet opp og bildevalgene er knyttet til riktig sang.");
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
    if (activeSongId !== song.id) { setPendingRender(null); setError("Velg riktig sang i bildevelgeren først."); return; }
    if (savedSongImages[song.id] !== JSON.stringify(songImages[song.id] || [])) {
      setError("Bildevalgene er ikke bekreftet lagret på sangen. Trykk «Lagre bildevalg» først.");
      setPendingRender(null);
      return;
    }
    const selectedOptions = { ...pipelineOptions, customImageUrls: songImages[song.id] || [] };
    if (visualCheck?.songId !== song.id ||
        visualCheck.imagesKey !== JSON.stringify(selectedOptions.customImageUrls)) {
      setError("Kjør «Kontroller videobilder» og få grønn bekreftelse før produksjon.");
      setPendingRender(null);
      return;
    }
    const approvedStory = preview && preview.songId === song.id &&
      preview.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
      preview.approved && isValidStoryboard(preview.scenes) &&
      (preview.timing === undefined || isValidSceneTiming(preview.timing)) ? preview : null;
    if (pendingRender.optionsKey !== JSON.stringify(selectedOptions) ||
        pendingRender.sourceKey !== storyboardSourceKey(song, pipelineOptions) ||
        (!approvedStory ||
          pendingRender.scenesKey !== JSON.stringify(approvedStory.scenes) ||
          pendingRender.timingKey !== JSON.stringify(approvedStory.timing ?? null))) {
      setError("Produksjonsvalgene eller storyboardet har endret seg. Bekreft videoproduksjonen på nytt.");
      setPendingRender(null);
      return;
    }
    if (!(selectedOptions.customImageUrls?.length)) {
      setError("Ingen videobilder er valgt. Velg de faktiske bildene fra bildebanken før produksjon. Systemet lager ikke fargede sirkler som erstatning.");
      return;
    }
    if (!selectedOptions.customImageUrls.every(url => verifiedImages[url] === true)) {
      setError("Ett eller flere valgte bilder er ikke bekreftet lastet inn. Kontroller forhåndsvisningen og prøv igjen.");
      return;
    }
    if (!song.audioUrl || song.youtubeUrl || !youtubeHealth?.connected) {
      setError("Sangen må ha lyd, ikke være publisert, og YouTube må være tilkoblet.");
      return;
    }
    if (approvedStory?.timing && selectedOptions.customImageUrls?.length !== 8) {
      setError("Ved egne scenetidspunkter må du velge nøyaktig åtte bilder – ett per storyboard-scene.");
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
        ...selectedOptions,
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
    if (activeSongId !== song.id) { setActiveSongId(song.id); setError("Kontroller bildevalgene for denne sangen før video."); return; }
    const selectedOptions = { ...pipelineOptions, customImageUrls: songImages[song.id] || [] };
    if (savedSongImages[song.id] !== JSON.stringify(selectedOptions.customImageUrls)) {
      setError("Lagre bildene på sangen før du åpner videoproduksjonen.");
      return;
    }
    if (visualCheck?.songId !== song.id ||
        visualCheck.imagesKey !== JSON.stringify(selectedOptions.customImageUrls)) {
      setError("Kontroller de valgte videobildene på serveren før du starter video.");
      return;
    }
    if (!song.audioUrl || song.youtubeUrl) {
      setError("Sangen mangler lyd eller har allerede en YouTube-video.");
      return;
    }
    if (!youtubeHealth?.connected) {
      setError("Koble Re-Master Freddy til YouTube-kanalen før videoproduksjon.");
      return;
    }
    if (!(selectedOptions.customImageUrls?.length)) {
      setError("Velg minst ett bilde i «Visuelle valg» før du starter. Uten valgte bilder kan videoen bli abstrakte sirkler.");
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
    if (approvedStory?.timing && selectedOptions.customImageUrls?.length !== 8) {
      setError("Ved egne scenetidspunkter må du velge nøyaktig åtte bilder – ett per storyboard-scene.");
      return;
    }
    // Capture the entire selection to reject changes between confirmation and submit.
    setPendingRender({
      songId: song.id,
      mode: "storyboard",
      sourceKey,
      optionsKey: JSON.stringify(selectedOptions),
      scenesKey: JSON.stringify(approvedStory.scenes),
      timingKey: JSON.stringify(approvedStory.timing ?? null),
    });
  }

  async function showStoryboard(song: AdminSong) {
    const sourceKey = storyboardSourceKey(song, pipelineOptions);
    setPendingRender(null);
    setPrivateMp4(null);
    setPrivateFullMp4(null);
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

  async function buildPrivateMp4(song: AdminSong) {
    const selected = songImages[song.id] || [];
    const imageKey = JSON.stringify(selected);
    const approved = preview?.songId === song.id &&
      preview.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
      preview.approved && isValidStoryboard(preview.scenes);
    if (!song.audioUrl || song.youtubeUrl || privateMp4LoadingId || privateFullMp4LoadingId || processingId || !approved || !preview ||
        activeSongId !== song.id || selected.length !== 8 ||
        savedSongImages[song.id] !== imageKey ||
        visualCheck?.songId !== song.id || visualCheck.imagesKey !== imageKey) {
      setError("Velg sangen, lagre og kontroller nøyaktig åtte bilder og godkjenn storyboardet før privat MP4-test.");
      return;
    }
    setPrivateMp4LoadingId(song.id);
    setPrivateMp4(null);
    setPrivateFullMp4(null);
    setError("");
    try {
      const result = await generatePrivateMp4Teaser(song.id, preview.scenes);
      setPrivateMp4({
        result, imageKey, scenesKey: JSON.stringify(preview.scenes),
        sourceKey: storyboardSourceKey(song, pipelineOptions),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Privat MP4-test feilet. Ingen YouTube-publisering er utført.");
    } finally {
      setPrivateMp4LoadingId(null);
    }
  }

  async function buildPrivateFullMp4(song: AdminSong) {
    const selected = songImages[song.id] || [];
    const imageKey = JSON.stringify(selected);
    const approved = preview?.songId === song.id &&
      preview.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
      preview.approved && isValidStoryboard(preview.scenes) &&
      (preview.timing === undefined || isValidSceneTiming(preview.timing));
    if (!song.audioUrl || song.youtubeUrl || privateFullMp4LoadingId || privateMp4LoadingId ||
        processingId || !approved || !preview ||
        activeSongId !== song.id || selected.length !== 8 ||
        savedSongImages[song.id] !== imageKey ||
        visualCheck?.songId !== song.id || visualCheck.imagesKey !== imageKey) {
      setError("Velg sangen, lagre og kontroller åtte bilder, og godkjenn storyboardet før fullengdevideo.");
      return;
    }
    setPrivateFullMp4LoadingId(song.id);
    setPrivateFullMp4(null);
    setError("");
    try {
      const result = await generatePrivateFullMp4(
        song.id, preview.scenes, preview.timing, fullVideoGentleMotion,
      );
      setPrivateFullMp4({
        result, imageKey, scenesKey: JSON.stringify(preview.scenes),
        timingKey: JSON.stringify(preview.timing ?? null),
        sourceKey: storyboardSourceKey(song, pipelineOptions),
        gentleMotion: fullVideoGentleMotion,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke lage privat fullengdevideo. Ingen video ble publisert.");
    } finally {
      setPrivateFullMp4LoadingId(null);
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

      <div className="pipeline-asset-field">
        <label htmlFor="remaster-song-images"><strong>Videobilder for sang</strong></label>
        <select id="remaster-song-images" value={activeSongId}
          onChange={event => { setActiveSongId(event.target.value); setPendingRender(null); setPreview(null); setPrivateMp4(null); setPrivateFullMp4(null); setVisualCheck(null); setVisualCheckMessage(""); }}>
          <option value="">Velg sang</option>
          <option value={NEW_SONG_DRAFT}>Ny sang – bilder før MP3-opplasting</option>
          {songs.filter(song => song.audioUrl).map(song => <option key={song.id} value={song.id}>{song.title}</option>)}
        </select>
        <small>Ved ny MP3: velg bildene før opplasting. Bildevalgene lagres på sangen i RealtyFlow etter opplasting. For eksisterende sanger: velg bilder og trykk «Lagre bildevalg».</small>
      </div>
      <PipelineAssets
        value={scopedOptions}
        onChange={updateScopedOptions}
        refreshToken={assetRefreshToken}
        onOpenImageBank={onOpenImageBank}
        onSaveSelection={activeSongId && activeSongId !== NEW_SONG_DRAFT
          ? () => { void saveImageSelection(); } : undefined}
        savingSelection={savingImages}
        saveSelectionDisabled={savingImages || Boolean(processingId) ||
          Boolean(songs.find(song => song.id === activeSongId)?.youtubeUrl) ||
          savedSongImages[activeSongId] === JSON.stringify(songImages[activeSongId] || [])}
        selectionSaved={savedSongImages[activeSongId] === JSON.stringify(songImages[activeSongId] || [])}
        imageSaveMessage={imageSaveMessage}
        onCheckSelection={activeSongId && activeSongId !== NEW_SONG_DRAFT
          ? () => { void inspectImageSelection(); } : undefined}
        checkingSelection={checkingImages}
        checkSelectionDisabled={checkingImages || savingImages || Boolean(processingId) ||
          !songImages[activeSongId]?.length ||
          savedSongImages[activeSongId] !== JSON.stringify(songImages[activeSongId] || [])}
        imageCheckMessage={visualCheckMessage}
      />
      {activeSongId && activeSongId !== NEW_SONG_DRAFT && (
        <div className="pipeline-asset-field">
          {visualCheck?.songId === activeSongId &&
           visualCheck.imagesKey === JSON.stringify(songImages[activeSongId] || []) && (
            <div aria-label="Bildeplan for åtte scener">
              <p><strong>Bildene i den planlagte videoen</strong></p>
              <div className="pipeline-slide-grid">
                {visualCheck.result.sceneMap.map(scene => (
                  <div key={scene.sceneNumber}>
                    <img src={(songImages[activeSongId] || [])[scene.imageNumber - 1]}
                      alt={`Scene ${scene.sceneNumber} bruker bilde ${scene.imageNumber}`} loading="lazy" />
                    <span>Scene {scene.sceneNumber}: bilde {scene.imageNumber}</span>
                  </div>
                ))}
              </div>
              <small>Dette er en kontroll av bildefiler og scenevalg, ikke en ferdig MP4-video.</small>
            </div>
          )}
        </div>
      )}
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
        const confirmedImages = song ? songImages[song.id] || [] : [];
        const confirmedOptions = { ...pipelineOptions, customImageUrls: confirmedImages };
        const imageCheckPassed = visualCheck?.songId === pendingRender.songId &&
          visualCheck.imagesKey === JSON.stringify(confirmedImages) &&
          savedSongImages[pendingRender.songId] === JSON.stringify(confirmedImages) && confirmedImages.length > 0 &&
          confirmedImages.every(url => verifiedImages[url] === true);
        const valid = Boolean(song?.audioUrl && !song.youtubeUrl && youtubeHealth?.connected &&
          storyboardSourceKey(song, pipelineOptions) === pendingRender.sourceKey &&
          JSON.stringify(confirmedOptions) === pendingRender.optionsKey &&
          Boolean(imageCheckPassed && approvedStory &&
            JSON.stringify(approvedStory.scenes) === pendingRender.scenesKey &&
            JSON.stringify(approvedStory.timing ?? null) === pendingRender.timingKey &&
            (!approvedStory.timing || confirmedImages.length === 8)));
        return (
          <div className="admin-render-confirmation" role="dialog" aria-modal="true" aria-labelledby="render-confirm-title">
            <div className="admin-render-confirmation-panel">
              <h3 id="render-confirm-title">Bekreft videoproduksjon</h3>
              <p><strong>{song?.title || "Ukjent sang"}</strong></p>
              <p><strong>Video med godkjent storyboard</strong></p>
              <p>Videoen skal bruke bildene du har valgt fra bildebanken. Ingen abstrakte sirkler er godkjent som erstatning. Gemini brukes ikke til bilder. Sang- og metadataanalyse kan bruke andre AI-tjenester. Videomotorens støtte for dette må fortsatt verifiseres. Hvis du fortsetter, starter videoproduksjon og eventuell YouTube-publisering etter valgene dine.</p>
              <p><strong>{confirmedImages.length} valgte videobilder</strong> – sjekk at dette er bildene du ønsker før produksjon.</p>
              <p role="status">{imageCheckPassed
                ? "Alle valgte bilder er lastet i forhåndsvisningen. RealtyFlow må fortsatt bekrefte at videoen bruker dem."
                : "Venter på bildekontroll. Videoen kan ikke startes før alle bildene kan vises."}</p>
              <div className="pipeline-slide-grid" aria-label="Bilder valgt til denne videoen">
                {confirmedImages.map((url, index) => <div key={`${url}-${index}`}><img src={url} alt={`Valgt videobilde ${index + 1}`} loading="eager"
                    onLoad={() => setVerifiedImages(current => current[url] === true ? current : { ...current, [url]: true })}
                    onError={() => setVerifiedImages(current => current[url] === false ? current : { ...current, [url]: false })} /><span>Bilde {index + 1}</span></div>)}
              </div>
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
            const songImageCount = (songImages[song.id] || []).length;
            const serverChecked = visualCheck?.songId === song.id &&
              visualCheck.imagesKey === JSON.stringify(songImages[song.id] || []);
            const disabledReason = !canProcess
              ? "Sangen mangler lyd eller er allerede publisert."
              : !youtubeHealth?.connected
                ? "Koble Re-Master Freddy til riktig YouTube-kanal først."
                : !songImageCount ? "Velg videobilder fra bildebanken først."
                : !serverChecked ? "Kontroller de valgte videobildene på serveren først."
                : approved ? "Lag video med godkjent storyboard og valgte bilder." : "Lag og godkjenn de åtte scenene først.";

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
                    disabled={!canProcess || !approved || !songImageCount ||
                        !serverChecked || processingId !== null || previewLoadingId !== null || !youtubeHealth?.connected}
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
                    extraImageCount={songImageCount}
                    currentlyProcessing={Boolean(processingId)}
                  />
                )}
                {matchingPreview && approved && (
                  <section className="admin-private-mp4-preview" aria-label="Privat MP4-test uten publisering">
                    <strong>Privat testvideo – 16 sekunder</strong>
                    <p>Test åtte storyboard-scener med åtte bilder og starten av sangen. Fast to sekunder per scene. Dette er ikke den ferdige videoen eller full scenetiming. Ingen YouTube, Gemini eller OpenArt.</p>
                    <button type="button" className="admin-secondary"
                      disabled={privateMp4LoadingId !== null || privateFullMp4LoadingId !== null || processingId !== null ||
                        songImageCount !== 8 || activeSongId !== song.id ||
                        savedSongImages[song.id] !== JSON.stringify(songImages[song.id] || []) ||
                        !serverChecked}
                      onClick={() => { void buildPrivateMp4(song); }}>
                      {privateMp4LoadingId === song.id ? "Lager privat MP4 …" : "Lag privat MP4-test (16 sek)"}
                    </button>
                    {songImageCount !== 8 && <small>Velg og lagre åtte bilder, ett per scene, før testen.</small>}
                    {privateMp4?.result.recordId === song.id &&
                     privateMp4.imageKey === JSON.stringify(songImages[song.id] || []) &&
                     privateMp4.scenesKey === JSON.stringify(matchingPreview.scenes) &&
                     privateMp4.sourceKey === storyboardSourceKey(song, pipelineOptions) && (
                      <div className="admin-private-mp4-result">
                        <p role="status">Privat MP4 ferdig. Avspillingslenken er gyldig i 15 minutter.</p>
                        <video controls playsInline preload="metadata"
                          src={privateMp4.result.signedUrl}
                          aria-label={`Privat MP4-forhåndsvisning av ${song.title}`} />
                        <a href={privateMp4.result.signedUrl} target="_blank" rel="noreferrer">
                          Åpne privat MP4 i ny fane <ExternalLink size={14} />
                        </a>
                      </div>
                    )}
                  </section>
                )}
                {matchingPreview && approved && (
                  <section className="admin-private-mp4-preview" aria-label="Privat musikkvideo i full lengde">
                    <strong>Komplett privat musikkvideo</strong>
                    <p>Lag en MP4 med hele sangen og åtte videobilder. Bruker godkjente scenetider hvis du har satt dem, ellers fordeles scenene jevnt. Videoen lagres privat og publiseres aldri automatisk.</p>
                    <label className="admin-private-motion-choice">
                      <input type="checkbox" checked={fullVideoGentleMotion}
                        onChange={event => {
                          setFullVideoGentleMotion(event.target.checked);
                          setPrivateFullMp4(null);
                        }} />
                      Rolig kamerabevegelse (Ken Burns)
                    </label>
                    <small>{matchingPreview.timing
                      ? "Godkjente tidsmarkører styrer sceneskiftene."
                      : "Ingen tidsmarkører godkjent – scenene deles jevnt over hele sangen."}</small>
                    <button type="button" className="admin-secondary"
                      disabled={privateFullMp4LoadingId !== null || privateMp4LoadingId !== null ||
                        processingId !== null || songImageCount !== 8 ||
                        activeSongId !== song.id ||
                        savedSongImages[song.id] !== JSON.stringify(songImages[song.id] || []) ||
                        !serverChecked}
                      onClick={() => { void buildPrivateFullMp4(song); }}>
                      {privateFullMp4LoadingId === song.id ? "Lager komplett privatvideo …" : "Lag privat fullengdevideo"}
                    </button>
                    {privateFullMp4?.result.recordId === song.id &&
                     privateFullMp4.imageKey === JSON.stringify(songImages[song.id] || []) &&
                     privateFullMp4.scenesKey === JSON.stringify(matchingPreview.scenes) &&
                     privateFullMp4.timingKey === JSON.stringify(matchingPreview.timing ?? null) &&
                     privateFullMp4.sourceKey === storyboardSourceKey(song, pipelineOptions) &&
                     privateFullMp4.gentleMotion === fullVideoGentleMotion && (
                      <div className="admin-private-mp4-result">
                        <p role="status">Privat fullengdevideo klar – {Math.round(privateFullMp4.result.durationSeconds)} sekunder. Avspillingslenken varer i 15 minutter.</p>
                        <video controls playsInline preload="metadata"
                          src={privateFullMp4.result.signedUrl}
                          aria-label={`Privat fullengdevideo av ${song.title}`} />
                        <a href={privateFullMp4.result.signedUrl} target="_blank" rel="noreferrer">
                          Åpne privat fullengdevideo <ExternalLink size={14} />
                        </a>
                        <small>Dette er et privat videoutkast, ikke sendt til YouTube. Merk: «Lag video» bruker en annen produksjons- og publiseringsflyt, og publiserer ikke automatisk denne godkjente private MP4-filen.</small>
                      </div>
                    )}
                  </section>
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
