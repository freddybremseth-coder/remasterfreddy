import { describe, expect, it } from "vitest";
import { recommendSceneStarts } from "./local-audio-scene-cues";

describe("local audio scene start suggestions", () => {
  it("returns eight chronological suggestions beginning at zero", () => {
    const frames = Array.from({ length: 480 }, (_, i) =>
      i < 100 ? 0.1 : i < 160 ? 0.6 : i < 270 ? 0.25 : i < 350 ? 0.85 : 0.3);
    const starts = recommendSceneStarts(frames, 240);
    expect(starts).not.toBeNull();
    expect(starts).toHaveLength(8);
    expect(starts?.[0]).toBe(0);
    expect(starts!.every((time, i) => i === 0 || time > starts![i - 1])).toBe(true);
    expect(starts![7]).toBeLessThan(240);
  });

  it("can suggest evenly spaced markers for steady quiet music", () => {
    const starts = recommendSceneStarts(Array(360).fill(0.2), 180)!;
    expect(starts).toHaveLength(8);
    expect(starts[1]).toBeCloseTo(22.5, 1);
  });

  it("rejects invalid audio duration and broken level data", () => {
    expect(recommendSceneStarts([1, 2, 3], 200)).toBeNull();
    expect(recommendSceneStarts(Array(80).fill(0.5), 0)).toBeNull();
    expect(recommendSceneStarts(Array(80).fill(0.5), Infinity)).toBeNull();
    expect(recommendSceneStarts(Array(80).fill(NaN), 120)).toBeNull();
    expect(recommendSceneStarts(Array(80).fill(-1), 120)).toBeNull();
  });
});
