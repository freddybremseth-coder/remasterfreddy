import { describe, expect, it } from "vitest";
import type { AdminSong } from "./admin-api";
import { genreReviewPilotProgress, legacyGenreStratum, planGenreReviewPilot } from "./genre-review-pilot";

function song(id: string, genre: string, confirmed = false, audio = true): AdminSong {
  return {
    id, title: `Track ${id}`, genre,
    audioUrl: audio ? `https://example.test/${id}.mp3` : undefined,
    metadata: confirmed ? { genreSource: "author", authorSelectedGenre: genre } : undefined,
  };
}

describe("human-reviewed genre validation pilot", () => {
  it("stratifies legacy labels without trusting them as verified genre", () => {
    expect(legacyGenreStratum("EDM")).toBe("edm");
    expect(legacyGenreStratum("Electronic Dance Music")).toBe("edm");
    expect(legacyGenreStratum("Deep House")).toBe("house");
    expect(legacyGenreStratum("Meditation Ambient")).toBe("calm");
    expect(legacyGenreStratum("Chillout")).toBe("calm");
    expect(legacyGenreStratum("Electronic")).toBe("electronic");
    expect(legacyGenreStratum("Rock")).toBe("other");
  });

  it("picks a reproducible 20-song sample rather than twenty old EDM songs", () => {
    const tracks = [
      ...Array.from({ length: 90 }, (_, i) => song(`edm-${i.toString().padStart(3, "0")}`, "EDM")),
      ...Array.from({ length: 7 }, (_, i) => song(`house-${i}`, "Deep House")),
      ...Array.from({ length: 6 }, (_, i) => song(`calm-${i}`, "Ambient")),
      ...Array.from({ length: 5 }, (_, i) => song(`elec-${i}`, "Electronic")),
      ...Array.from({ length: 4 }, (_, i) => song(`rock-${i}`, "Rock")),
      song("missing", "Rock", false, false),
    ];
    const selected = planGenreReviewPilot(tracks);
    expect(selected).toHaveLength(20);
    expect(new Set(selected.map(item => item.id)).size).toBe(20);
    const groups = new Set(selected.map(item => legacyGenreStratum(item.genre)));
    expect(groups.size).toBe(5);
    expect(selected.filter(item => item.genre === "EDM").length).toBeLessThan(15);
    expect(selected.find(item => item.id === "missing")).toBeUndefined();
    expect(planGenreReviewPilot(tracks.slice().reverse()).map(item => item.id))
      .toEqual(selected.map(item => item.id));
  });

  it("retains manually confirmed songs in the sample for an honest progress count", () => {
    const tracks = Array.from({ length: 30 }, (_, i) => song(
      `t-${i.toString().padStart(2, "0")}`, i % 3 === 0 ? "rock" : "EDM", i < 4,
    ));
    const selected = planGenreReviewPilot(tracks);
    const progress = genreReviewPilotProgress(selected);
    expect(progress.total).toBe(20);
    expect(progress.reviewed).toBe(4);
    expect(progress.remaining).toBe(16);
    expect(progress.genres).toBe(2);
    expect(planGenreReviewPilot(tracks.map(item => ({
      ...item, genre: item.id === selected[9].id ? "chanson" : item.genre,
      metadata: item.id === selected[9].id
        ? { genreSource: "author", authorSelectedGenre: "chanson" }
        : item.metadata,
    }))).some(item => item.id === selected[9].id)).toBe(true);
  });

  it("does not call AI or modify songs, images or YouTube", () => {
    expect(planGenreReviewPilot([song("one", "EDM")], 101)).toEqual([]);
    expect(genreReviewPilotProgress([song("two", "House", false)]).reviewed).toBe(0);
  });
});
