import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const control = readFileSync("src/AutopilotControl.tsx", "utf8");
const settings = readFileSync("src/lib/autopilot-settings.ts", "utf8");
const recommendations = readFileSync("src/AdminRecommendations.tsx", "utf8");

describe("Re-Master execute-and-measure autopilot", () => {
  it("exposes guarded execution in settings and UI", () => {
    expect(settings).toContain('"execute_guarded"');
    expect(settings).toContain('allowMetadataUpdates: safeMode === "execute_guarded"');
    expect(settings).toContain("executedCount");
    expect(control).toContain('label: "Utfør og mål"');
    expect(control).toContain("Maks tiltak per kjøring");
  });

  it("keeps autonomous titles and thumbnails behind the safety boundary", () => {
    expect(control).toContain("Titler og thumbnails endres ikke automatisk");
    expect(control).toContain("beskrivelser og tags forbedres, logges og måles");
    expect(recommendations).toContain("utføres automatisk, logges og måles");
  });
});
