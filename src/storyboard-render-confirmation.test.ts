import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("storyboard required and explicit confirmation before video", () => {
  const source = readFileSync("src/AdminStudio.tsx", "utf8");

  it("passes a distinct song title, genre and art direction to optional OpenArt only on click", () => {
    expect(source).toContain('provider: "openart"');
    expect(source).toContain('song: song.title');
    expect(source).toContain('genre: song.genre || ""');
    expect(source).toContain('theme: pipelineOptions.visualTheme?.trim() || ""');
    expect(source).toContain('OpenArt-bilder');
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
  });

  it("requires approved storyboard for every full video", () => {
    expect(source).toContain('function requestRender(song: AdminSong)');
    expect(source).toContain("onClick={() => requestRender(song)}");
    expect(source).toContain('if (!approvedStory) {');
    expect(source).toContain('!approved || !songImageCount ||');
    expect(source).toContain('!serverChecked || processingId !== null');
    expect(source).toContain('mode: "storyboard"');
    expect(source).not.toContain('requestRender(song, "storyboard")');
    expect(source).not.toContain('Enkel video uten storyboard');
  });

  it("always opens an explicit confirmation for the approved storyboard", () => {
    expect(source).toContain("setPendingRender({");
    expect(source).toContain("optionsKey: JSON.stringify(selectedOptions)");
    expect(source).toContain("Bekreft YouTube-produksjon");
    expect(source).toContain("Avbryt – ingen kostnader");
    expect(source).toContain("Start YouTube-produksjon uten Gemini-bilder");
    expect(source).toContain("Fullengde musikkvideo til YouTube med godkjent storyboard");
    expect(source).toContain("onClick={() => { if (song && valid) void runPipeline(song); }}");
  });

  it("enforces song, YouTube and unchanged options before starting a render", () => {
    expect(source).toContain("if (renderLock.current || !pendingRender");
    expect(source).toContain("renderLock.current = true;");
    expect(source).toContain("renderLock.current = false;");
    expect(source).toContain("pendingRender.optionsKey !== JSON.stringify(selectedOptions)");
    expect(source).toContain("JSON.stringify(confirmedOptions) === pendingRender.optionsKey");
    expect(source).toContain("isValidSceneTiming(preview.timing)");
    expect(source).toContain("song?.audioUrl && !song.youtubeUrl && youtubeHealth?.connected");
    expect(source).toContain("setPendingRender(null);");
  });

  it("blocks rendering without selected images and previews the exact selections", () => {
    expect(source).toContain("Velg minst ett bilde");
    expect(source).toContain('selectedOptions.customImageUrls?.length');
    expect(source).toContain('Bilder valgt til denne videoen');
    expect(source).toContain('Valgt videobilde');
    expect(source).toContain("Ingen videobilder er valgt.");
  });

  it("blocks render until every selected image actually loads in the preview", () => {
    expect(source).toContain('const [verifiedImages, setVerifiedImages]');
    expect(source).toContain('confirmedImages.every(url => verifiedImages[url] === true)');
    expect(source).toContain('selectedOptions.customImageUrls.every(url => verifiedImages[url] === true)');
    expect(source).toContain('onLoad={() => setVerifiedImages');
    expect(source).toContain('onError={() => setVerifiedImages');
    expect(source).toContain('Venter på bildekontroll.');
  });

  it("maintains separate per-song image selections in the current browser", () => {
    expect(source).toContain('remaster-song-images-v1');
    expect(source).toContain('songImages[activeSongId] || []');
    expect(source).toContain('songImages[song.id] || []');
    expect(source).toContain('Videobilder for sang');
    expect(source).toContain('setActiveSongId(event.target.value)');
    expect(source).toContain('customImageUrls: songImages[song.id] || []');
  });

  it("moves image choices from MP3 upload draft to the new song record", () => {
    expect(source).toContain('const NEW_SONG_DRAFT = "__new_song__"');
    expect(source).toContain('setActiveSongId(NEW_SONG_DRAFT)');
    expect(source).toContain('const draftImages = [...(songImages[NEW_SONG_DRAFT] || [])]');
    expect(source).toContain('[uploaded.id]: draftImages');
    expect(source).toContain('await saveSongVideoImages(uploaded.id, draftImages)');
    expect(source).toContain('Ny sang – bilder før MP3-opplasting');
  });

  it("loads server-confirmed per-song images and blocks unsaved selections", () => {
    expect(source).toContain("setSavedSongImages");
    expect(source).toContain("song.metadata?.remasterVideoImageUrls");
    expect(source).toContain("await saveSongVideoImages(songId, snapshot)");
    expect(source).toContain("savedSongImages[song.id] !== JSON.stringify(songImages[song.id] || [])");
    expect(source).toContain("onSaveSelection={activeSongId && activeSongId !== NEW_SONG_DRAFT");
    expect(source).toContain("saveSelectionDisabled={savingImages");
  });

  it("offers a server-side visual check without AI and blocks video until it succeeds", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-visual-preflight.ts", "utf8");
    expect(source).toContain("async function inspectImageSelection()");
    expect(source).toContain("await checkSongVideoImages(songId)");
    expect(source).toContain("onCheckSelection={activeSongId && activeSongId !== NEW_SONG_DRAFT");
    expect(source).toContain("imageCheckMessage={visualCheckMessage}");
    expect(source).toContain("visualCheck.imagesKey !== JSON.stringify(selectedOptions.customImageUrls)");
    expect(source).toContain("Bildeplan for åtte scener");
    expect(source).toContain("Dette er en kontroll av bildefiler og scenevalg, ikke en ferdig MP4-video.");
    expect(client).toContain("/api/neural-beat-visual-preflight");
    expect(proxy).toContain("/api/neural-beat/visual-preflight");
    expect(proxy).not.toContain("uploadVideo(");
  });

  it("previews the eight saved selected images with approved timing without rendering", () => {
    const editor = readFileSync("src/StoryboardEditor.tsx", "utf8");
    const css = readFileSync("src/storyboard-editor.css", "utf8");
    expect(source).toContain('imageUrls={songImages[song.id] || []}');
    expect(source).toContain('imagesSaved={savedSongImages[song.id] === JSON.stringify(songImages[song.id] || [])}');
    expect(editor).toContain('aria-label="Bilder og sceneskift før MP4"');
    expect(editor).toContain('imageUrls[index]');
    expect(editor).toContain('sceneTiming.startsSeconds[index]');
    expect(editor).toContain("Bildevalgene er ennå ikke lagret på sangen.");
    expect(editor).toContain("Uten godkjente tidsmarkører fordeles scenene jevnt");
    expect(css).toContain(".storyboard-image-grid");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("corrects existing song genre with an owner-authenticated proxy without uploading audio or publishing", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-song-genre.ts", "utf8");
    expect(source).toContain("Kontroller sjanger –");
    expect(source).toContain("Lagre korrigert sjanger");
    expect(source).toContain("Ubekreftet sjanger (");
    expect(source).toContain("Sjekk elektronisk / Chillout / House (");
    expect(source).toContain("electronic|dance|house|techno|trance");
    expect(source).toContain('song.metadata?.genreSource !== "author"');
    expect(source).toContain('const suspectSongs = unverifiedSongs.filter');
    expect(source).toContain("filteredGenreSongs.map(");
    expect(source).toContain("correctSongGenre(song.id, selected)");
    expect(source).toContain("setPreview(null)");
    expect(source).toContain("ikke verifisert fra lyd");
    expect(source).toContain("Publiserte YouTube-videoer, eksisterende bilder og MP3-filen berøres ikke.");
    expect(client).toContain('adminFetch("/api/neural-beat-song-genre"');
    expect(client).toContain('method: "PUT"');
    expect(client).toContain("result.youtubeUnchanged !== true");
    expect(proxy).toContain("requireAdmin(request, response)");
    expect(proxy).toContain("/api/neural-beat/song-genre");
    expect(proxy).not.toContain("uploadVideo(");
    expect(proxy).not.toContain("startSongPipeline(");
  });

  it("offers real MP3 acoustic analysis without ever auto-assigning EDM/Chillout or publishing", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-audio-analysis.ts", "utf8");
    expect(source).toContain("Analyser MP3-lyd");
    expect(source).toContain("analyzeExistingMp3(song.id)");
    expect(source).toContain("Faktisk målt fra MP3");
    expect(source).toContain("Dynamikk i utdraget");
    expect(source).toContain("Tre ulike deler av sangen");
    expect(source).toContain("Begynnelsen");
    expect(source).toContain("Midten");
    expect(source).toContain("Slutten");
    expect(source).toContain("Dette er redaksjonell veiledning");
    expect(client).toContain("sectionLevelSpreadDb");
    expect(client).toContain("visualPacingHint");
    expect(source).toContain("Din bekreftede sjanger endres ikke.");
    expect(client).toContain('adminFetch("/api/neural-beat-audio-analysis"');
    expect(client).toContain('result.evidence !== "decoded_pcm"');
    expect(proxy).toContain("requireAdmin(request, response)");
    expect(proxy).toContain("/api/neural-beat/audio-analysis");
    expect(proxy).not.toContain("uploadVideo(");
  });

  it("supports explicit 16-second private MP4 preview without YouTube publication", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-private-video-preview.ts", "utf8");
    const deployment = readFileSync("vercel.json", "utf8");
    expect(source).toContain("async function buildPrivateMp4(song: AdminSong)");
    expect(source).toContain("Lag privat MP4-test (16 sek)");
    expect(source).toContain("generatePrivateMp4Teaser(song.id, preview.scenes)");
    expect(source).toContain("savedSongImages[song.id] !== imageKey");
    expect(source).toContain("selected.length !== 8");
    expect(source).toContain("visualCheck?.songId !== song.id");
    expect(source).toContain("<video controls playsInline preload");
    expect(source).toContain("Avspillingslenken er gyldig i 15 minutter");
    expect(client).toContain("/api/neural-beat-private-video-preview");
    expect(proxy).toContain("/api/neural-beat/private-video-preview");
    expect(proxy).not.toContain("uploadVideo(");
    expect(deployment).toContain("api/neural-beat-private-video-preview.ts");
  });

  it("exposes an owner-confirmed full-song MP4 test with timing, motion and no publish calls", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-private-full-video.ts", "utf8");
    const config = readFileSync("vercel.json", "utf8");
    expect(source).toContain("async function buildPrivateFullMp4(song: AdminSong)");
    expect(source).toContain("generatePrivateFullMp4(");
    expect(source).toContain("song.id, preview.scenes, preview.timing, fullVideoGentleMotion");
    expect(source).toContain("Lag privat fullengdevideo");
    expect(source).toContain("Rolig kamerabevegelse <small>Ken Burns-effekt</small>");
    expect(source).toContain("savedSongImages[song.id] !== imageKey");
    expect(source).toContain("visualCheck?.songId !== song.id");
    expect(source).toContain("selected.length !== 8");
    expect(source).toContain("Godkjenn og send lagret MP4 til YouTube");
    expect(source).toContain("publishApprovedStoredVideo(song)");
    expect(source).toContain("publishStoredFullVideo(song.id, approved.scenes, approved.timing, fullVideoGentleMotion)");
    expect(client).toContain("/api/neural-beat-private-full-video");
    expect(client).toContain("sceneTiming?: StoryboardSceneTiming");
    expect(proxy).toContain("/api/neural-beat/private-full-video");
    expect(proxy).not.toContain("uploadVideo(");
    expect(config).toContain("api/neural-beat-private-full-video.ts");
  });

  it("places full-length private video first, immediately AFTER storyboard approval, not before the editor", () => {
    const editor = source.indexOf("<StoryboardEditor");
    const approval = source.indexOf("onApprove={() => setPreview(", editor);
    const choice = source.indexOf("Storyboard godkjent – velg hvor videoen skal brukes", approval);
    const full = source.indexOf('aria-label="Privat musikkvideo i full lengde"', choice);
    const short = source.indexOf('aria-label="Privat MP4-test uten publisering"', full);
    expect(editor).toBeGreaterThan(0);
    expect(approval).toBeGreaterThan(editor);
    expect(choice).toBeGreaterThan(approval);
    expect(full).toBeGreaterThan(choice);
    expect(short).toBeGreaterThan(full);
    expect(source).toContain('Velg mellom en privat fullengdevideo for gjennomgang og en YouTube-produksjon.');
    const storyboard = readFileSync("src/StoryboardEditor.tsx", "utf8");
    expect(storyboard).toContain('Velg «Lag privat fullengdevideo» i feltet rett nedenfor.');
  });

  it("uses a full-row grid workspace for video reviews, with a wide responsive player and secondary 16-second option", () => {
    const css = readFileSync("src/admin-studio.css", "utf8");
    const row = css.indexOf(".admin-song-row {");
    const workspace = css.indexOf(".admin-song-row > .admin-video-workspace");
    const primary = source.indexOf('className="admin-private-mp4-preview admin-private-video-full"');
    const short = source.indexOf('className="admin-private-mp4-preview admin-private-video-short"');
    const editor = source.indexOf("<StoryboardEditor");
    expect(row).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(row);
    expect(css.slice(workspace, workspace + 200)).toContain("grid-column: 1 / -1");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("admin-private-mp4-result video");
    expect(css).toContain("aspect-ratio: 16 / 9");
    expect(css).toContain("@media (max-width: 620px)");
    expect(source).toContain('className="admin-video-workspace"');
    expect(source).toContain('className="admin-primary admin-private-full-action"');
    expect(editor).toBeLessThan(primary);
    expect(primary).toBeLessThan(short);
    expect(source).toContain("Spill av eller åpne privat fullengdevideo");
  });

  it("can reopen the last stored private MP4 after reload without storyboard or paid rendering", () => {
    const api = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-private-full-video.ts", "utf8");
    const css = readFileSync("src/admin-studio.css", "utf8");
    expect(api).toContain("export async function reopenLatestPrivateFullMp4(");
    expect(api).toContain('method: "GET"');
    expect(api).toContain("encodeURIComponent(recordId)");
    expect(proxy).toContain('request.method !== "POST" && request.method !== "GET"');
    expect(proxy).toContain('method: isReopen ? "GET" : "POST"');
    expect(source).toContain("async function openLastPrivateVideo(song: AdminSong)");
    expect(source).toContain("reopenLatestPrivateFullMp4(song.id)");
    expect(source).toContain("Se siste private video");
    expect(source).toContain("Åpne lagret MP4");
    expect(source).toContain("Forny lenken");
    expect(source).toContain("Dette er siste lagrede videoutkast.");
    expect(source).toContain('className="admin-reopened-private-video"');
    expect(source).toContain("latestPrivateVideo?.songId === song.id");
    expect(css).toContain(".admin-song-row > .admin-reopened-private-video");
    expect(css).toContain("grid-column: 1 / -1;");
    expect(css).toContain("aspect-ratio: 16 / 9;");
    expect(proxy).not.toContain("uploadVideo(");
  });

  it("shows an immediately discoverable player or an inline error after private full-song rendering", () => {
    expect(source).toContain('privateFullMp4LoadingId === song.id && (');
    expect(source).toContain('Når den er klar, vises spilleren rett under knappen.');
    expect(source).toContain('className="admin-private-video-error" role="alert"');
    expect(source).toContain('Videoen kunne ikke vises:');
    expect(source).toContain('Videoen er klar! Spill den av nedenfor.');
    expect(source).toContain('Spill av eller åpne privat fullengdevideo');
    expect(source).toContain('setPrivateFullMp4Error(null)');
    expect(source).toContain('setPrivateFullMp4Error(`${reason} Ingen video ble publisert.`)');
  });

  it("the video uses original visuals without Gemini but discloses other services", () => {
    expect(source).toContain('imageMode: "original"');
    expect(source).toContain("Gemini brukes ikke til bilder.");
    expect(source).toContain("kan bruke andre AI-tjenester");
    expect(source).toContain("YouTube-publisering");
    expect(source).toContain("Steg 5 stoppet: Videomotoren fant ingen bilder.");
  });
});
