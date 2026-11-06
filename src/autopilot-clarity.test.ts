import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const control = fs.readFileSync(path.join(process.cwd(), "src/AutopilotControl.tsx"), "utf8");
const card = fs.readFileSync(path.join(process.cwd(), "src/RecommendationCard.tsx"), "utf8");

describe("Re-Master autopilot consent clarity", () => {
  it("explains that saving a mode does not start a background execution", () => {
    expect(control).toContain("Ingen automatisk tidsplan er konfigurert her");
    expect(control).toContain("Lagre valget");
    expect(control).toContain("metadataRequiresApprovalCount");
  });
  it("marks title changes as requiring a separate confirmation", () => {
    expect(card).toContain("Krever godkjenning");
    expect(card).toContain("Godkjenn og utfør tittelendring");
    expect(card).toContain("Autopilot endrer ikke tittelen");
  });
});
