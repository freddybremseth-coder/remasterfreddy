import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AutopilotControl.tsx"), "utf8");

describe("guarded scheduled autopilot health warnings", () => {
  it("warns when the expected daily run is missing after the grace period", () => {
    expect(source).toContain("missingScheduledRun");
    expect(source).toContain("60 * 60 * 1000");
    expect(source).toContain("Den forventede daglige kjøringen er ikke registrert");
  });
  it("does not attempt recovery or grant metadata authority", () => {
    expect(source).toContain("Ingen automatisk omstart er utført");
    expect(source).toContain("Titler og thumbnails endres ikke automatisk");
  });
});
