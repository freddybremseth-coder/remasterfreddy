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
    expect(source).toContain("Bekreft videoproduksjon");
    expect(source).toContain("Avbryt – ingen kostnader");
    expect(source).toContain("Start video uten Gemini-bilder");
    expect(source).toContain("Video med godkjent storyboard");
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
    expect(source).toContain("Lagre bildevalg for denne sangen");
  });

  it("offers a server-side visual check without AI and blocks video until it succeeds", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const proxy = readFileSync("api/neural-beat-visual-preflight.ts", "utf8");
    expect(source).toContain("async function inspectImageSelection()");
    expect(source).toContain("await checkSongVideoImages(songId)");
    expect(source).toContain("Kontroller videobilder – uten AI eller YouTube");
    expect(source).toContain("visualCheck.imagesKey !== JSON.stringify(selectedOptions.customImageUrls)");
    expect(source).toContain("Bildeplan for åtte scener");
    expect(source).toContain("Dette er en kontroll av bildefiler og scenevalg, ikke en ferdig MP4-video.");
    expect(client).toContain("/api/neural-beat-visual-preflight");
    expect(proxy).toContain("/api/neural-beat/visual-preflight");
    expect(proxy).not.toContain("uploadVideo(");
  });

  it("the video uses original visuals without Gemini but discloses other services", () => {
    expect(source).toContain('imageMode: "original"');
    expect(source).toContain("Gemini brukes ikke til bilder.");
    expect(source).toContain("kan bruke andre AI-tjenester");
    expect(source).toContain("YouTube-publisering");
    expect(source).toContain("Steg 5 stoppet: Videomotoren fant ingen bilder.");
  });
});
