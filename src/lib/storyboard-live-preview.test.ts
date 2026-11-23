import { describe, expect, it } from "vitest";
import { sceneIndexAtTime } from "./storyboard-live-preview";

const starts = [0, 20, 45, 67, 91, 111, 134, 158];
describe("synchronized storyboard scene selection", () => {
  it("shows the correct scene before, on and after a boundary", () => {
    expect(sceneIndexAtTime(starts, 0)).toBe(0);
    expect(sceneIndexAtTime(starts, 19.99)).toBe(0);
    expect(sceneIndexAtTime(starts, 20)).toBe(1);
    expect(sceneIndexAtTime(starts, 44.99)).toBe(1);
    expect(sceneIndexAtTime(starts, 45)).toBe(2);
    expect(sceneIndexAtTime(starts, 150)).toBe(6);
    expect(sceneIndexAtTime(starts, 179.9)).toBe(7);
  });
  it("does not crash on missing or invalid timing", () => {
    expect(sceneIndexAtTime([], 12)).toBe(0);
    expect(sceneIndexAtTime(starts.slice(1), 40)).toBe(0);
    expect(sceneIndexAtTime(starts, Number.NaN)).toBe(0);
  });
});
