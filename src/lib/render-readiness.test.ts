import { describe, expect, it } from "vitest";
import { inspectRenderReadiness, type RenderReadinessInput } from "./render-readiness";

const scenes = Array.from({ length: 8 }, (_, i) =>
  `The original song's visual scene number ${i + 1}, with a consistent character, olive grove, and cinematic light.`);

const valid: RenderReadinessInput = {
  songId: "song-17",
  hasAudio: true,
  alreadyPublished: false,
  previewSongId: "song-17",
  sourceMatches: true,
  approved: true,
  scenes,
  youtubeConnected: true,
  timing: { durationSeconds: 180, startsSeconds: [0, 21, 42, 65, 89, 111, 137, 158] },
  extraImageCount: 8,
  currentlyProcessing: false,
};

describe("free author storyboard production readiness", () => {
  it("approves a matching, unchanged eight-scene plan with valid timing", () => {
    const checks = inspectRenderReadiness(valid);
    expect(checks).toHaveLength(7);
    expect(checks.every(check => check.ok)).toBe(true);
    expect(checks.find(check => check.key === "timing")?.message).toContain("Serveren kontrollerer sanglengden");
  });

  it("blocks stale approval, wrong songs, broken timing and custom images before paid work", () => {
    const checks = inspectRenderReadiness({
      ...valid,
      previewSongId: "another-song",
      sourceMatches: false,
      approved: false,
      timing: { durationSeconds: 180, startsSeconds: [0, 20, 20, 66, 88, 110, 130, 160] },
      extraImageCount: 2,
      youtubeConnected: false,
    });
    expect(checks.filter(check => !check.ok).map(check => check.key))
      .toEqual(["storyboard", "approval", "timing", "images", "youtube"]);
  });

  it("supports older untimed plans while rejecting incomplete or duplicate scenes", () => {
    const untimed = inspectRenderReadiness({ ...valid, timing: undefined });
    expect(untimed.every(check => check.ok)).toBe(true);
    expect(untimed.find(check => check.key === "timing")?.message).toContain("jevnt fordelte");
    expect(inspectRenderReadiness({ ...valid, scenes: scenes.slice(0, 7) })
      .find(check => check.key === "storyboard")?.ok).toBe(false);
    expect(inspectRenderReadiness({ ...valid, scenes: [...scenes.slice(0, 7), scenes[0]] })
      .find(check => check.key === "storyboard")?.ok).toBe(false);
  });

  it("blocks absent audio, a published song and concurrent work", () => {
    const checks = inspectRenderReadiness({
      ...valid,
      hasAudio: false,
      alreadyPublished: true,
      currentlyProcessing: true,
    });
    expect(checks.find(check => check.key === "song")?.ok).toBe(false);
    expect(checks.find(check => check.key === "processing")?.ok).toBe(false);
  });
});
