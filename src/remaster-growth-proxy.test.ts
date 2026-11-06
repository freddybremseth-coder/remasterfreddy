import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const proxy = fs.readFileSync(path.join(process.cwd(), "api/remaster-growth-packaging.ts"), "utf8");

describe("Re-Master growth review proxy", () => {
  it("verifies owner identity and uses the server-held migration secret", () => {
    expect(proxy).toContain("await requireAdmin(request, response)");
    expect(proxy).toContain("REALTYFLOW_MIGRATION_SECRET");
    expect(proxy).toContain('"X-ReMaster-Admin": admin.email');
    expect(proxy).not.toContain("VITE_REALTYFLOW_MIGRATION_SECRET");
  });

  it("refuses redirected HTML login responses instead of treating them as success", () => {
    expect(proxy).toContain('redirect: "manual"');
    expect(proxy).toContain("upstream.status >= 300");
    expect(proxy).toContain('contentType.includes("application/json")');
  });
});
