import { getAdminSession } from "./supabase";
import { matchesPersistedGenre } from "./genre-save-verification";

export interface AdminSong {
  id: string;
  title: string;
  artist?: string;
  audioUrl?: string;
  youtubeUrl?: string;
  genre?: string;
  mood?: string;
  metadata?: {
    artVisualMode?: "meditation" | "relaxing" | "alternative";
    shortsUrl?: string | null;
    shortsStatus?: string;
    shortsError?: string | null;
    /** Ordered video images stored on the song record in RealtyFlow. */
    remasterVideoImageUrls?: string[];
    /** Set only when the owner explicitly selected or corrected the genre. */
    genreSource?: "author" | "unverified" | string;
    authorSelectedGenre?: string;
    genreConfirmedAt?: string | null;
    /** Preserved first-seen legacy label used only for stable pilot sampling. */
    genreReviewLegacyGenre?: string;
  };
}

export type ImageKind = "image" | "logo" | "thumbnail";

export interface AdminImage {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  name?: string | null;
  kind: ImageKind;
  tags?: string[];
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  use_count?: number | null;
  created_at?: string;
  source?: "mine" | "music" | "art" | "other";
  category?: string;
  published?: boolean;
}

export interface StoryboardSceneTiming {
  durationSeconds: number;
  startsSeconds: number[];
}

export interface PipelineOptions {
  /** Zero-Gemini image path: user's own images or original locally generated backgrounds. */
  imageMode?: 'original';
  /** Optional creative direction for the next music video. */
  visualTheme?: string;
  /** Optional lyrics or story synopsis; used as creative context, not displayed. */
  songLyrics?: string;
  /** Eight text scenes approved for this song's render, not shared between songs. */
  storyboardScenes?: string[];
  /** Music-bound visual cuts, approved with eight storyboard scenes. */
  sceneTiming?: StoryboardSceneTiming;
  customImageUrls?: string[];
  logoUrl?: string;
  customThumbnailUrl?: string;
  autoSchedule?: boolean;
  customPublishAt?: string;
  multilingualDescription?: boolean;
}

export interface ChannelVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewsPerDay?: number;
}

export interface ChannelAnalytics {
  channel?: {
    title: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    thumbnailUrl?: string;
  };
  metrics?: {
    totalViews: number;
    totalLikes: number;
    avgViews: number;
    avgLikes: number;
    engagementRate: number;
    videoCount: number;
  };
  topVideos?: ChannelVideo[];
  fastestGrowing?: ChannelVideo[];
  recentVideos?: ChannelVideo[];
  analysis?: {
    overallScore?: number;
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    actionItems?: Array<{ priority: string; action: string; expectedImpact: string }>;
    viralStrategy?: {
      titleFormulas?: string[];
      thumbnailTips?: string[];
      uploadSchedule?: string;
      contentGaps?: string[];
      trendingTopics?: string[];
    };
  } | null;
  mixes?: Array<{
    title: string;
    emoji?: string;
    mood?: string;
    description?: string;
    viralPotential?: string;
  }>;
}

interface SignedUpload {
  uploadUrl: string;
  publicUrl: string;
  token: string;
  method: "supabase-signed-upload";
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function createSignedUpload(fileName: string): Promise<SignedUpload> {
  const response = await adminFetch("/api/neural-beat-upload", {
    method: "POST",
    body: JSON.stringify({ fileName }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke opprette sikker opplastingsadresse.");
  if (data.method !== "supabase-signed-upload" || !data.uploadUrl || !data.publicUrl || !data.token) {
    throw new Error("Opplastingen ble stoppet fordi sikker signert adresse eller token mangler.");
  }
  return data as SignedUpload;
}

async function putSignedFile(signed: SignedUpload, file: File, contentType: string) {
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => "");
    throw new Error(details || "Opplastingen til Supabase feilet.");
  }
}

export async function loadSongs(): Promise<AdminSong[]> {
  const response = await adminFetch("/api/neural-beat", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Kunne ikke hente sangene.");
  return Array.isArray(data.songs) ? data.songs : [];
}

/** Correct an existing song's internal genre; leaves MP3, images and YouTube unchanged. */
export async function correctSongGenre(recordId: string, genre: string | null): Promise<AdminSong> {
  const response = await adminFetch("/api/neural-beat-song-genre", {
    method: "PUT",
    body: JSON.stringify({ recordId, genre }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.saved !== true || result.recordId !== recordId ||
      result.genre !== genre || result.genreSource !== (genre ? "author" : "unverified") ||
      result.youtubeUnchanged !== true || !result.song || result.song.id !== recordId) {
    throw new Error(result.error || "Serveren bekreftet ikke sjangerendringen.");
  }
  // A successful PUT is not sufficient evidence that the saved genre survives
  // a fresh fetch from the actual song database. Verify before reporting success.
  const refreshed = (await loadSongs()).find(song => song.id === recordId);
  if (!refreshed) {
    throw new Error("RealtyFlow bekreftet ikke at sangen finnes etter lagring. Oppdater oversikten og prøv igjen.");
  }
  if (!matchesPersistedGenre(refreshed, genre)) {
    throw new Error("RealtyFlow bekreftet ikke at den nye sjangeren er lagret i databasen. Ingen endring er godkjent.");
  }
  return refreshed;
}

/** Read-only signal analysis from the actual uploaded MP3, not AI genre guessing. */
export interface AcousticAudioAnalysis {
  ready: true;
  recordId: string;
  evidence: "decoded_pcm";
  genreIdentification: "not_available";
  sampleSeconds: number;
  averageLevelDbfs: number;
  peakLevelDbfs: number;
  dynamicRangeDb: number;
  rhythm: "regular_pulse" | "weak_pulse" | "not_detected";
  tempoEstimateBpm: number | null;
  pulseCorrelation: number;
  durationSeconds?: number;
  sections?: Array<{
    label: "beginning" | "middle" | "ending";
    startSeconds: number;
    sampleSeconds: number;
    averageLevelDbfs: number;
    peakLevelDbfs: number;
    dynamicRangeDb: number;
    rhythm: "regular_pulse" | "weak_pulse" | "not_detected";
    tempoEstimateBpm: number | null;
    pulseCorrelation: number;
  }>;
  sectionLevelSpreadDb?: number;
  visualPacingHint?: "varying_energy" | "fairly_consistent_energy" | "insufficient_sections";
  genre: string | null;
  genreSource: "author" | "unverified";
  message: string;
}

export async function analyzeExistingMp3(recordId: string): Promise<AcousticAudioAnalysis> {
  const response = await adminFetch("/api/neural-beat-audio-analysis", {
    method: "POST", body: JSON.stringify({ recordId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ready !== true || result.recordId !== recordId ||
      result.evidence !== "decoded_pcm" || result.genreIdentification !== "not_available" ||
      typeof result.averageLevelDbfs !== "number" ||
      typeof result.peakLevelDbfs !== "number" ||
      typeof result.dynamicRangeDb !== "number") {
    throw new Error(result.error || "Kunne ikke bekrefte lydanalysen.");
  }
  return result as AcousticAudioAnalysis;
}

export async function publishMissingArtShort(songId: string): Promise<{ status: string; shortUrl: string | null }> {
  const response = await adminFetch("/api/neural-beat-art-short", {
    method: "POST",
    body: JSON.stringify({ songId }),
  });
  const raw = await response.text();
  let data: { error?: string; success?: boolean; status?: string; shortUrl?: string | null };
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok || !data.success) {
    const diagnostic = data.error
      || `Shorts-API svarte med HTTP ${response.status}${raw.trimStart().startsWith("<") ? " (HTML i stedet for JSON)" : ""}. Fullversjonen er ikke berørt.`;
    throw new Error(diagnostic);
  }
  return data as { status: string; shortUrl: string | null };
}

export async function uploadSong(file: File, title: string, artist: string, genre: "" | "meditation" | "relaxing" | "alternative" | "dance" | "rock" | "power-rock" | "metal" | "ballad" | "pop" | "acoustic" | "folk" | "country" | "blues" | "jazz" | "classical" | "soul" | "latin" | "chanson" | "ambient" | "electronic" | "edm" | "house" | "deep-house" | "techno" | "trance" | "chillout" | "lofi" | "downtempo" | "cinematic" = ""): Promise<AdminSong> {
  if (!file || !title.trim()) throw new Error("Velg en MP3-fil og skriv inn tittel.");
  if (file.type && file.type !== "audio/mpeg") throw new Error("Filen må være en MP3.");

  const signed = await createSignedUpload(file.name);
  try {
    await putSignedFile(signed, file, "audio/mpeg");
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : "Ukjent feil";
    throw new Error(`MP3-opplastingen feilet: ${message}`);
  }

  const registerResponse = await adminFetch("/api/neural-beat", {
    method: "PUT",
    body: JSON.stringify({
      title: title.trim(),
      artist: artist.trim() || "Re-Master Freddy",
      audioUrl: signed.publicUrl,
      ...(genre ? { genre } : {}),
    }),
  });
  const registered = await registerResponse.json().catch(() => ({}));
  if (!registerResponse.ok || !registered.success) {
    throw new Error(registered.error || "MP3-en ble lastet opp, men sangen kunne ikke registreres.");
  }

  return registered.song as AdminSong;
}

export async function uploadImageAsset(file: File, kind: ImageKind): Promise<AdminImage> {
  if (!file.type.startsWith("image/")) throw new Error("Velg en gyldig bildefil.");
  const signed = await createSignedUpload(`${kind}-${file.name}`);
  try {
    await putSignedFile(signed, file, file.type || "image/png");
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : "Ukjent feil";
    throw new Error(`Bildeopplastingen feilet: ${message}`);
  }

  const saveResponse = await adminFetch("/api/neural-beat-image-bank", {
    method: "POST",
    body: JSON.stringify({
      url: signed.publicUrl,
      name: file.name,
      kind,
      sizeBytes: file.size,
      owner: "system",
    }),
  });
  const saved = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok || !saved.image) throw new Error(saved.error || "Bildet kunne ikke lagres i bildebanken.");
  return saved.image as AdminImage;
}

/** Only a 16-second, signed-link MP4; never any YouTube publishing. */
export interface PrivateMp4Teaser {
  success: true;
  recordId: string;
  signedUrl: string;
  durationSeconds: number;
  sceneCount: number;
  expiresInSeconds: number;
  message: string;
}

export async function generatePrivateMp4Teaser(
  recordId: string,
  storyboardScenes: string[],
): Promise<PrivateMp4Teaser> {
  const response = await adminFetch("/api/neural-beat-private-video-preview", {
    method: "POST",
    body: JSON.stringify({ recordId, storyboardScenes }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true || result.recordId !== recordId ||
      typeof result.signedUrl !== "string" || !result.signedUrl.startsWith("https://") ||
      result.durationSeconds !== 16 || result.sceneCount !== 8) {
    throw new Error(result.error || "Kunne ikke lage privat MP4. Ingen video er publisert.");
  }
  return result as PrivateMp4Teaser;
}

/** Full soundtrack with eight scenes, stored privately and NEVER published. */
export interface PrivateFullMp4 {
  success: true;
  recordId: string;
  signedUrl: string;
  durationSeconds: number;
  sceneCount: 8;
  expiresInSeconds: number;
  sceneStartsSeconds: number[];
  usedApprovedTiming: boolean;
  gentleMotion: boolean;
  message: string;
}

export async function generatePrivateFullMp4(
  recordId: string,
  storyboardScenes: string[],
  sceneTiming?: StoryboardSceneTiming,
  gentleMotion = true,
): Promise<PrivateFullMp4> {
  const response = await adminFetch("/api/neural-beat-private-full-video", {
    method: "POST",
    body: JSON.stringify({ recordId, storyboardScenes, sceneTiming, gentleMotion }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true || result.recordId !== recordId ||
      result.sceneCount !== 8 ||
      typeof result.signedUrl !== "string" || !result.signedUrl.startsWith("https://") ||
      typeof result.durationSeconds !== "number" || result.durationSeconds <= 20 ||
      !Array.isArray(result.sceneStartsSeconds) || result.sceneStartsSeconds.length !== 8) {
    throw new Error(result.error || "Kunne ikke lage privat fullengdevideo. Ingen video er publisert.");
  }
  return result as PrivateFullMp4;
}

/** Upload only the previously rendered, author-approved MP4. Never re-renders images. */
export async function publishStoredFullVideo(
  recordId: string,
  storyboardScenes: string[],
  sceneTiming: StoryboardSceneTiming | undefined,
  gentleMotion: boolean,
): Promise<{ success: true; youtubeUrl: string; privacyStatus: "unlisted"; reusedStoredVideo: true }> {
  const response = await adminFetch("/api/neural-beat-publish-stored-video", {
    method: "POST",
    body: JSON.stringify({
      recordId, storyboardScenes, sceneTiming, gentleMotion,
      privacyStatus: "unlisted", confirmUpload: true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true || result.reusedStoredVideo !== true ||
      typeof result.youtubeUrl !== "string" || !result.youtubeUrl.startsWith("https://")) {
    throw new Error(result.error || "Kunne ikke laste opp den lagrede MP4-filen.");
  }
  return result;
}

/** A previously rendered video; requesting this NEVER renders or publishes again. */
export interface ReopenedPrivateFullMp4 {
  success: true;
  recordId: string;
  signedUrl: string;
  expiresInSeconds: number;
  createdAt: string | null;
  message: string;
}

export async function reopenLatestPrivateFullMp4(recordId: string): Promise<ReopenedPrivateFullMp4> {
  const response = await adminFetch(`/api/neural-beat-private-full-video?recordId=${encodeURIComponent(recordId)}`, {
    method: "GET",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true || result.recordId !== recordId ||
      typeof result.signedUrl !== "string" || !result.signedUrl.startsWith("https://") ||
      result.expiresInSeconds !== 900) {
    throw new Error(result.error || "Kunne ikke åpne den siste private MP4-filen.");
  }
  return result as ReopenedPrivateFullMp4;
}

/** Result of a server-side visual check. No video/AI/YouTube is involved. */
export interface VisualPreflightResult {
  ready: true;
  recordId: string;
  checkedImages: Array<{ imageNumber: number; format: "jpeg" | "png" | "webp"; sizeBytes: number }>;
  sceneMap: Array<{ sceneNumber: number; imageNumber: number; story?: string; startsAtSeconds?: number }>;
  message: string;
}

export async function checkSongVideoImages(
  recordId: string,
  storyboardScenes?: string[],
  sceneTiming?: StoryboardSceneTiming,
): Promise<VisualPreflightResult> {
  const response = await adminFetch("/api/neural-beat-visual-preflight", {
    method: "POST",
    body: JSON.stringify({ recordId, storyboardScenes, sceneTiming }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ready !== true || result.recordId !== recordId ||
      !Array.isArray(result.checkedImages) || !Array.isArray(result.sceneMap) ||
      result.sceneMap.length !== 8) {
    throw new Error(result.error || "Serveren kunne ikke bekrefte videobildene.");
  }
  return result as VisualPreflightResult;
}

/** Save the ordered image selection to the song record on the server. */
export async function saveSongVideoImages(recordId: string, imageUrls: string[]): Promise<string[]> {
  const response = await adminFetch("/api/neural-beat-song-images", {
    method: "PUT",
    body: JSON.stringify({ recordId, imageUrls }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.saved !== true || !Array.isArray(result.imageUrls)) {
    throw new Error(result.error || "Kunne ikke lagre videobildene på sangen.");
  }
  if (JSON.stringify(result.imageUrls) !== JSON.stringify(imageUrls)) {
    throw new Error("Serveren bekreftet et annet bildeutvalg enn det du valgte.");
  }
  return result.imageUrls as string[];
}

export type RemasterVisualSource = "mine" | "music" | "art" | "other";

export interface RemasterVisualPage {
  images: AdminImage[];
  total: number;
  page: number;
  limit: number;
  source: RemasterVisualSource;
}

/** Read-only paginated catalogue: image bank, music library, public art and other first-party assets. */
export async function loadRemasterVisualLibrary(options: {
  source: RemasterVisualSource; genre?: string; search?: string; page?: number; limit?: number;
}): Promise<RemasterVisualPage> {
  const params = new URLSearchParams({
    source: options.source,
    page: String(options.page ?? 0),
    limit: String(options.limit ?? 24),
  });
  if (options.genre && options.genre !== "all") params.set("genre", options.genre);
  if (options.search) params.set("search", options.search);
  const response = await adminFetch(`/api/neural-beat-visual-library?${params.toString()}`, { method: "GET" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(result.images) || !Number.isFinite(result.total)) {
    throw new Error(result.error || "Kunne ikke hente bilder fra Supabase.");
  }
  return result as RemasterVisualPage;
}

export async function loadImageBank(kind?: ImageKind): Promise<AdminImage[]> {
  const params = new URLSearchParams({ owner: "system", limit: "60" });
  if (kind) params.set("kind", kind);
  const response = await adminFetch(`/api/neural-beat-image-bank?${params.toString()}`, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke hente bildebanken.");
  return Array.isArray(data.images) ? data.images : [];
}

export async function deleteImageBankEntry(id: string): Promise<void> {
  const response = await adminFetch(`/api/neural-beat-image-bank?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke fjerne bildet fra bildebanken.");
}

export async function loadChannelAnalytics(): Promise<ChannelAnalytics> {
  const response = await adminFetch("/api/neural-beat-analytics", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke hente kanalstatistikken.");
  return data as ChannelAnalytics;
}

export interface StoryboardPreview {
  mode: "free-text-outline";
  title: string;
  scenes: string[];
  aiCalls: 0;
  imagesGenerated: 0;
}

/** Text-only; never calls the video renderer or AI image provider. */
export async function previewSongStoryboard(song: AdminSong, options: PipelineOptions): Promise<StoryboardPreview> {
  // A legacy database genre may still say EDM despite this being a rock
  // song. Preview only the exact owner-confirmed selection; the storyboard
  // must never turn old AI text labels into visual or musical "facts".
  const confirmedGenre = song.metadata?.genreSource === "author" &&
    typeof song.metadata.authorSelectedGenre === "string"
    ? song.metadata.authorSelectedGenre.trim() : "";
  const response = await adminFetch("/api/neural-beat-storyboard-preview", {
    method: "POST",
    body: JSON.stringify({
      title: song.title,
      genre: confirmedGenre || undefined,
      visualTheme: options.visualTheme?.trim() || undefined,
      songLyrics: options.songLyrics?.trim() || undefined,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Kunne ikke hente storyboard-utkast.");
  if (result.mode !== "free-text-outline" || !Array.isArray(result.scenes) ||
      result.scenes.length !== 8 || !result.scenes.every((scene: unknown) => typeof scene === "string")) {
    throw new Error("Ugyldig storyboard fra serveren.");
  }
  return result as StoryboardPreview;
}

export async function startSongPipeline(
  recordId: string,
  options: PipelineOptions,
  onEvent: (event: any) => void,
) {
  const response = await adminFetch("/api/neural-beat", {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: JSON.stringify({
      recordId,
      imageMode: 'original',
      visualTheme: options.visualTheme?.trim() || undefined,
      songLyrics: options.songLyrics?.trim() || undefined,
      storyboardScenes: options.storyboardScenes || undefined,
      sceneTiming: options.sceneTiming || undefined,
      customImageUrls: options.customImageUrls || [],
      logoUrl: options.logoUrl || undefined,
      customThumbnailUrl: options.customThumbnailUrl || undefined,
      autoSchedule: Boolean(options.autoSchedule),
      customPublishAt: options.customPublishAt || undefined,
      multilingualDescription: options.multilingualDescription !== false,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Kunne ikke starte videopipelinen.");
  }

  if (!response.body) throw new Error("Serveren returnerte ingen pipeline-strøm.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalStatus: "completed" | "failed" | null = null;
  let finalError = "";

  function handleMessage(message: string) {
    const line = message.split("\n").find(item => item.startsWith("data: "));
    if (!line) return;
    try {
      const event = JSON.parse(line.slice(6)) as { type?: string; status?: string; error?: string };
      if (event.type === "heartbeat") return;
      onEvent(event);
      if (event.status === "completed") finalStatus = "completed";
      if (event.status === "failed") {
        finalStatus = "failed";
        finalError = typeof event.error === "string" ? event.error : "";
      }
    } catch {
      // Ignore malformed upstream chunks. The final-state check below fails safely.
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() || "";
    for (const message of messages) handleMessage(message);
  }
  // Read any trailing complete frame from the final chunk.
  if (buffer.trim()) handleMessage(buffer);
  if (finalStatus === "failed") throw new Error(finalError || "Videoproduksjonen feilet. Regien er beholdt for ny prøving.");
  if (finalStatus !== "completed") throw new Error("Videoproduksjonen ble avsluttet uten bekreftelse. Regien er beholdt.");
}

export interface JukeboxJob {
  id: string;
  song_id: string;
  song_title: string;
  format: "landscape" | "portrait";
  duration_seconds: number | null;
  state: "queued" | "rendering" | "ready" | "failed" | "cancelled";
  error?: string | null;
  previewUrl?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  youtube_video_id?: string | null;
  created_at: string;
}

export async function loadJukeboxJobs(): Promise<JukeboxJob[]> {
  const response = await adminFetch("/api/neural-beat-jukebox?limit=20", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke hente Jukebox-jobber.");
  return Array.isArray(data.jobs) ? data.jobs : [];
}

/** Queue only; does not trigger YouTube publication. */
export async function queueJukeboxVideo(input: {
  songId: string; format: "landscape" | "portrait"; seconds?: 15 | 30 | 45 | 60;
}): Promise<{ job: JukeboxJob; reused: boolean }> {
  const response = await adminFetch("/api/neural-beat-jukebox", {
    method: "POST", body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.job) throw new Error(data.error || "Kunne ikke legge Jukebox-video i kø.");
  return { job: data.job as JukeboxJob, reused: Boolean(data.reused) };
}

/** Read-only preflight, never queues or publishes a video. */
export interface PrivateJukeboxReadiness {
  checks:Array<{id:string;ready:boolean}>;
  privateMediaReady:boolean;
  sectionPlacementReady:boolean;
  photoIntakeConfigured:boolean;
  liveRenderingVerified:boolean;
  canStartPrivateRender:boolean;
  note:string;
}
export async function loadPrivateJukeboxReadiness():Promise<PrivateJukeboxReadiness>{
  const response=await adminFetch("/api/neural-beat-jukebox-readiness",{method:"GET"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!Array.isArray(data.checks))
    throw new Error(data.error||"Privat renderstatus er ikke tilgjengelig.");
  return data as PrivateJukeboxReadiness;
}

/** Read-only private photo upload status for one owner-scoped job. */
export interface JukeboxPrivateSceneStatus {
  jobId:string;
  songId:string;
  sceneCount:number;
  scenes:Array<{
    index:number;
    kind:"image"|"video"|null;
    status:"awaiting_upload"|"metadata_verified_only"|"rejected_metadata"|"invalid_reservation";
  }>;
  contiguous:boolean;
  allUploadedMetadataMatches:boolean;
  workerDecoded:false;
  canStartPrivateRender:false;
  publish:false;
  note:string;
}
export async function loadJukeboxPrivateSceneStatus(jobId:string):Promise<JukeboxPrivateSceneStatus>{
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId))
    throw new Error("Oppgi en gyldig Jukebox-jobb-ID.");
  const response=await adminFetch("/api/neural-beat-jukebox-scene-status?jobId="+encodeURIComponent(jobId),{method:"GET"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!Array.isArray(data.scenes))
    throw new Error(data.error||"Privat bildestatus er ikke tilgjengelig.");
  return data as JukeboxPrivateSceneStatus;
}
