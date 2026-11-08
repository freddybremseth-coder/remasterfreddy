import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const control = fs.readFileSync(path.join(process.cwd(), "src/AutopilotControl.tsx"), "utf8");
const card = fs.readFileSync(path.join(process.cwd(), "src/RecommendationCard.tsx"), "utf8");

describe("Re-Master autopilot consent clarity", () => {
  it("distinguishes scheduled guarded runs from saving or manual execution", () => {
    expect(control).toContain("20:10 UTC");
    expect(control).toContain("Lagring utfører ikke tiltak umiddelbart");
    expect(control).toContain("unsavedChanges || mode === \"off\"");
    expect(control).toContain("metadataRequiresApprovalCount");
  });
  it("marks title changes as requiring a separate confirmation", () => {
    expect(card).toContain("Krever godkjenning");
    expect(card).toContain("Godkjenn metadataforslag inkl. tittel");
    expect(card).toContain("Autopilot endrer ikke tittelen");
  });
});
