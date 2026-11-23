import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("storyboard optional and explicit confirmation for both video modes", () => {
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

  it("allows simple video without a storyboard and offers optional detailed editing", () => {
    expect(source).toContain('function requestRender(song: AdminSong, mode: "simple" | "storyboard" = "simple")');
    expect(source).toContain("onClick={() => requestRender(song)}");
    expect(source).toContain('onClick={() => requestRender(song, "storyboard")}');
    expect(source).toContain("Lag med storyboard");
    expect(source).toContain('pendingRender.mode === "simple"');
    expect(source).toContain('pendingRender.mode === "storyboard"');
  });

  it("always opens an explicit confirmation, even when no storyboard is used", () => {
    expect(source).toContain("setPendingRender({");
    expect(source).toContain("optionsKey: JSON.stringify(pipelineOptions)");
    expect(source).toContain("Bekreft videoproduksjon");
    expect(source).toContain("Avbryt – ingen kostnader");
    expect(source).toContain("Start video uten Gemini-bilder");
    expect(source).toContain("onClick={() => { if (song && valid) void runPipeline(song); }}");
  });

  it("enforces song, YouTube and unchanged options before starting a render", () => {
    expect(source).toContain("if (renderLock.current || !pendingRender");
    expect(source).toContain("renderLock.current = true;");
    expect(source).toContain("renderLock.current = false;");
    expect(source).toContain("pendingRender.optionsKey !== JSON.stringify(pipelineOptions)");
    expect(source).toContain("JSON.stringify(pipelineOptions) === pendingRender.optionsKey");
    expect(source).toContain("isValidSceneTiming(preview.timing)");
    expect(source).toContain("song?.audioUrl && !song.youtubeUrl && youtubeHealth?.connected");
    expect(source).toContain("setPendingRender(null);");
  });

  it("the video uses original visuals without Gemini but discloses other services", () => {
    expect(source).toContain('imageMode: "original"');
    expect(source).toContain("Gemini brukes ikke til bilder.");
    expect(source).toContain("kan bruke andre AI-tjenester");
    expect(source).toContain("YouTube-publisering");
  });
});
