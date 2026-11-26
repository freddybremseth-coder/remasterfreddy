import { describe, expect, it } from "vitest";
import { CLAP_LABELS, CLAP_MODEL_LICENSE, interpretClapOutput } from "./browser-clap-labels";
import { isFirstPartyMusicFile } from "./browser-clap-client";

describe("locally computed CLAP audio trial guardrails", () => {
  it("uses distinct, static natural-language candidates without seeing owner labels", () => {
    expect(CLAP_MODEL_LICENSE).toBe("Apache-2.0");
    expect(CLAP_LABELS.genre.some(x => x.id === "rock")).toBe(true);
    expect(CLAP_LABELS.genre.some(x => x.id === "edm")).toBe(true);
    expect(CLAP_LABELS.mood.some(x => x.id === "relaxing")).toBe(true);
    expect(CLAP_LABELS.style.some(x => x.id === "chillout")).toBe(true);
    for (const group of Object.values(CLAP_LABELS)) {
      expect(new Set(group.map(x => x.id)).size).toBe(group.length);
      expect(group.every(x => x.prompt.length >= 12)).toBe(true);
    }
  });

  it("never turns a near-tie into a fabricated EDM or Chillout diagnosis", () => {
    const rock = CLAP_LABELS.genre.find(x => x.id === "rock")!.prompt;
    const edm = CLAP_LABELS.genre.find(x => x.id === "edm")!.prompt;
    const result = interpretClapOutput("genre", [
      { label: edm, score: 0.51 },
      { label: rock, score: 0.49 },
    ]);
    expect(result.predictedLabel).toBe(null);
    expect(result.abstained).toBe(true);
    expect(result.alternatives.map(x => x.label)).toEqual(["edm", "rock"]);
  });

  it("compares independent axes and ignores invalid or fabricated output labels", () => {
    const mood = CLAP_LABELS.mood.find(x => x.id === "relaxing")!.prompt;
    const meditation = CLAP_LABELS.mood.find(x => x.id === "meditation")!.prompt;
    const result = interpretClapOutput("mood", [
      { label: mood, score: 0.8 },
      { label: meditation, score: 0.1 },
      { label: "Owner chose rock", score: 1 },
      { label: mood, score: Number.NaN },
    ]);
    expect(result.predictedLabel).toBe("relaxing");
    expect(result.axis).toBe("mood");
    expect(result.alternatives.length).toBe(2);
    expect(interpretClapOutput("genre", []).predictedLabel).toBe(null);
  });

  it("abstains when independent song sections disagree, even with a large average margin", () => {
    const prompts = CLAP_LABELS.genre;
    const rock = prompts.find(x => x.id === "rock")!.prompt;
    const chanson = prompts.find(x => x.id === "chanson")!.prompt;
    const edm = prompts.find(x => x.id === "edm")!.prompt;
    const scores = [
      { label: rock, score: 0.75 },
      { label: chanson, score: 0.16 },
      { label: edm, score: 0.09 },
    ];
    const disagreement = interpretClapOutput("genre", scores, [chanson, edm, rock]);
    expect(disagreement.predictedLabel).toBe(null);
    expect(disagreement.sectionsAnalyzed).toBe(3);
    expect(disagreement.sectionsAgree).toBe(1);
    const agreement = interpretClapOutput("genre", scores, [rock, chanson, rock]);
    expect(agreement.predictedLabel).toBe("rock");
    expect(agreement.sectionsAgree).toBe(2);
  });

  it("denies arbitrary audio hosts, signed remote inputs, and SSRF paths", () => {
    const base = "https://example.supabase.co";
    expect(isFirstPartyMusicFile(
      "https://example.supabase.co/storage/v1/object/public/assets/music/song.mp3",
      base,
    )).toBe(true);
    for (const url of [
      "http://example.supabase.co/storage/v1/object/public/assets/1.mp3",
      "https://another.supabase.co/storage/v1/object/public/assets/1.mp3",
      "https://example.supabase.co/storage/v1/object/sign/assets/private.mp3",
      "https://example.supabase.co/storage/v1/object/public/other/1.mp3",
      "https://example.supabase.co/storage/v1/object/public/assets/1.exe",
      "https://127.0.0.1/file.mp3",
      "not-a-url",
    ]) {
      expect(isFirstPartyMusicFile(url, base)).toBe(false);
    }
    expect(isFirstPartyMusicFile(
      "https://example.supabase.co/storage/v1/object/public/assets/1.mp3",
      undefined,
    )).toBe(false);
  });
});
