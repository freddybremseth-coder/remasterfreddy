import { describe, expect, it } from "vitest";
import type { VerifiedAudioReference } from "./genre-classification-benchmark";
import { formatClapTrialReport } from "./clap-trial-report";
import { CLAP_LABELS, interpretClapOutput } from "./browser-clap-labels";

function reference(songId: string, songTitle: string, referenceLabel: string):
VerifiedAudioReference {
  return { songId, songTitle, axis: "genre", referenceLabel, legacyLabel: "EDM" };
}

describe("optional copyable, privacy-safe CLAP diagnostics", () => {
  it("reports all trials and distinguishes untested songs without sending their audio", () => {
    const refs = [reference("id-1", "Two Roads", "power-rock"),
      reference("id-2", "Second song", "rock")];
    const prompts = CLAP_LABELS.genre;
    const chanson = prompts.find(x => x.id === "chanson")!.prompt;
    const ballad = prompts.find(x => x.id === "ballad")!.prompt;
    const result = interpretClapOutput("genre", [
      { label: chanson, score: .649 },
      { label: ballad, score: .325 },
    ], [chanson, chanson, ballad]);
    const report = formatClapTrialReport(refs, [{ entry: refs[0], result }]);
    expect(report).toContain("Two Roads");
    expect(report).toContain("Testet: 1 | Ikke testet: 1");
    expect(report).toContain("Forslag: 1 | Usikkert: 0");
    expect(report).toContain("Sangdeler enige: 2/3");
    expect(report).toContain("Sangdeler, beste forslag: chanson | chanson | ballad");
    expect(report).toContain("Resultat: Ikke testet");
    expect(report).toContain("Bekreftet av eier: power-rock");
    expect(report).not.toContain("id-1");
    expect(report).not.toContain("https://");
  });

  it("does not falsely report a high margin as calibrated confidence", () => {
    const refs = [reference("a", "A", "rock")];
    const top = CLAP_LABELS.genre.find(x => x.id === "chanson")!.prompt;
    const second = CLAP_LABELS.genre.find(x => x.id === "rock")!.prompt;
    const trial = { entry: refs[0], result: interpretClapOutput("genre", [
      { label: top, score: .8 }, { label: second, score: .1 },
    ], [top, second, second]) };
    const report = formatClapTrialReport(refs, [trial]);
    expect(report).toContain("Resultat: Usikkert");
    expect(report).toContain("Sangdeler enige: 1/3");
    expect(report).toContain("IKKE sannsynligheter");
  });
});
