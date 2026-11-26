import { describe, expect, it } from "vitest";
import type { AdminSong } from "./admin-api";
import {
  audioBenchmarkSummary, compareModelWithOwner, firstFiveAudioCalibration,
  verifiedAudioReferences,
} from "./genre-classification-benchmark";

function track(id: string, label: string, oldGenre = "EDM", audio = true): AdminSong {
  return {
    id, title: "Test " + id, genre: label,
    audioUrl: audio ? "https://example.test/" + id + ".mp3" : undefined,
    metadata: {
      genreSource: "author", authorSelectedGenre: label,
      genreReviewLegacyGenre: oldGenre,
    },
  };
}

describe("human confirmed MP3 classification benchmark", () => {
  it("only includes confirmed songs with actual MP3 and exact owner label", () => {
    const tracks = [
      track("1", "power-rock", "EDM"),
      track("2", "relaxing", "EDM"),
      track("3", "chillout", "Electronic"),
      track("4", "deep-house", "EDM", false),
      { ...track("5", "rock"), metadata: { genreSource: "unverified", authorSelectedGenre: "rock" } },
      { ...track("6", "jazz"), genre: "edm" },
    ];
    const cases = verifiedAudioReferences(tracks);
    expect(cases.map(item => item.songId)).toEqual(["1", "2", "3"]);
    expect(cases.map(item => item.axis)).toEqual(["genre", "mood", "style"]);
    const summary = audioBenchmarkSummary(tracks);
    expect(summary.playableReferences).toBe(3);
    expect(summary.allVerified).toBe(5);
    expect(summary.missingAudio).toBe(1);
    expect(summary.genres).toBe(1);
    expect(summary.moods).toBe(1);
    expect(summary.styles).toBe(1);
    expect(summary.historicalDifferent).toBe(3);
    expect(summary.historicalEdm).toBe(2);
  });

  it("keeps historical EDM as an error baseline, never as the reference genre", () => {
    const cases = verifiedAudioReferences([track("1", "rock"), track("2", "relaxing")]);
    expect(cases[0].referenceLabel).toBe("rock");
    expect(cases[0].legacyLabel).toBe("EDM");
    const noModel = compareModelWithOwner(cases, []);
    expect(noModel).toEqual(expect.objectContaining({
      evaluated: 2, attempted: 0, correct: 0, abstained: 2,
      exactMatchRate: null,
    }));
  });

  it("selects five different labels including genre, mood and style", () => {
    const s = [
      track("a", "electronic"), track("b", "rock"),
      track("c", "ballad"), track("d", "relaxing"),
      track("e", "chillout"), track("f", "power-rock"),
      ...Array.from({ length: 70 }, (_, i) => track("z" + i, "relaxing")),
    ];
    const first = firstFiveAudioCalibration(s);
    expect(first).toHaveLength(5);
    expect(new Set(first.map(x => x.referenceLabel)).size).toBe(5);
    expect(new Set(first.map(x => x.axis))).toEqual(new Set(["genre", "mood", "style"]));
    expect(firstFiveAudioCalibration(s.slice().reverse()).map(x => x.songId))
      .toEqual(first.map(x => x.songId));
  });

  it("scores only compatible model dimensions and refuses invented success", () => {
    const cases = verifiedAudioReferences([
      track("one", "rock"), track("two", "relaxing"), track("three", "chillout"),
    ]);
    const result = compareModelWithOwner(cases, [
      { songId: "one", axis: "mood", predictedLabel: "relaxing" },
      { songId: "one", axis: "genre", predictedLabel: "edm" },
      { songId: "two", axis: "mood", predictedLabel: "relaxing" },
      { songId: "three", axis: "style", predictedLabel: null },
      { songId: "untrusted", axis: "genre", predictedLabel: "rock" },
    ]);
    expect(result).toEqual(expect.objectContaining({
      evaluated: 3, attempted: 2, correct: 1, abstained: 1,
      wrongElectronic: 1, exactMatchRate: 0.5,
    }));
    expect(result.byAxis.genre).toEqual({ attempted: 1, correct: 0 });
    expect(result.byAxis.mood).toEqual({ attempted: 1, correct: 1 });
    expect(result.byAxis.style).toEqual({ attempted: 0, correct: 0 });
  });
});
