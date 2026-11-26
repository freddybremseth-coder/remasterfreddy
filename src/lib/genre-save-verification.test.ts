import { describe, expect, it } from "vitest";
import { matchesPersistedGenre } from "./genre-save-verification";

describe("confirmed genre write verification", () => {
  it("rejects missing songs, unchanged EDM and unconfirmed model guesses", () => {
    expect(matchesPersistedGenre(undefined, "rock")).toBe(false);
    expect(matchesPersistedGenre({ genre: "EDM" }, "rock")).toBe(false);
    expect(matchesPersistedGenre({ genre: "rock", metadata: { genreSource: "unverified" } }, "rock")).toBe(false);
    expect(matchesPersistedGenre({ genre: "rock", metadata: { genreSource: "author" } }, "rock")).toBe(false);
    expect(matchesPersistedGenre({ genre: "rock", metadata: {
      genreSource: "author", authorSelectedGenre: "edm",
    } }, "rock")).toBe(false);
  });

  it("accepts only the exact owner-confirmed genre returned by fresh database read", () => {
    expect(matchesPersistedGenre({ genre: "power-rock", metadata: {
      genreSource: "author", authorSelectedGenre: "power-rock",
    } }, "power-rock")).toBe(true);
    expect(matchesPersistedGenre({ genre: "deep-house", metadata: {
      genreSource: "author", authorSelectedGenre: "deep-house",
    } }, "edm")).toBe(false);
  });

  it("separates clearing a wrong label from confirming a replacement", () => {
    expect(matchesPersistedGenre({ genre: null, metadata: {
      genreSource: "unverified",
    } }, null)).toBe(true);
    expect(matchesPersistedGenre({ genre: "EDM", metadata: {
      genreSource: "unverified",
    } }, null)).toBe(false);
    expect(matchesPersistedGenre({ genre: null, metadata: {
      genreSource: "author", authorSelectedGenre: "rock",
    } }, null)).toBe(false);
    expect(matchesPersistedGenre({ genre: null, metadata: {
      genreSource: "unverified", authorSelectedGenre: "rock",
    } }, null)).toBe(false);
  });
});
