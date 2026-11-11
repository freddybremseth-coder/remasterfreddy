import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Re-Master partial guarded metadata status", () => {
  it("does not imply a title was updated when only safe metadata was applied", () => {
    const source = fs.readFileSync("src/RecommendationCard.tsx", "utf8");
    expect(source).toContain("Metadata utført · tittel venter");
    expect(source).toContain("Tittelen er ikke endret.");
    expect(source).toContain('guardedMetadataCompleted ? "completed"');
    expect(source).toContain("Godkjenn metadataforslag inkl. tittel");
    expect(source).toContain("hele metadataforslaget (tittel, beskrivelse og tags)");
  });
});
