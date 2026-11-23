import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("two-stage confirmation before paid video rendering", () => {
  const source = readFileSync("src/AdminStudio.tsx", "utf8");

  it("opens a confirmation instead of calling the expensive pipeline on the first click", () => {
    expect(source).toContain("onClick={() => requestRender(song)}");
    expect(source).toContain("setPendingRender({ songId: song.id, sourceKey, scenesKey: JSON.stringify(preview.scenes) })");
    expect(source).toContain("Bekreft videoproduksjon");
    expect(source).toContain("Start bildegenerering og video");
    expect(source).toContain("Avbryt – ingen kostnader");
  });

  it("validates unchanged song, plan, YouTube connection and synchronous single-flight lock", () => {
    expect(source).toContain("if (renderLock.current) return;");
    expect(source).toContain("renderLock.current = true;");
    expect(source).toContain("renderLock.current = false;");
    expect(source).toContain("pendingRender.scenesKey !== JSON.stringify(preview.scenes)");
    expect(source).toContain("storyboardSourceKey(song, pipelineOptions) === pendingRender.sourceKey");
    expect(source).toContain("youtubeHealth?.connected && song.audioUrl && !song.youtubeUrl");
    expect(source).toContain("setPendingRender(null);");
  });

  it("keeps explicit publishing and potential paid costs visible to the author", () => {
    expect(source).toContain("betalte AI-bilder");
    expect(source).toContain("YouTube i henhold til publiseringsvalgene dine");
    expect(source).toContain("onClick={() => setPendingRender(null)}");
  });
});
