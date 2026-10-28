import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ReMaster song upload contract", () => {
  it("matches RealtyFlow's signed ticket method", () => {
    const proxy = readFileSync("api/neural-beat-upload.ts", "utf8");
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    expect(proxy).toContain('data.method !== "supabase-signed-upload"');
    expect(proxy).toContain('method: "supabase-signed-upload"');
    expect(client).toContain('method: "supabase-signed-upload"');
    expect(client).toContain('data.method !== "supabase-signed-upload"');
  });

  it("sends signed upload bytes without pretending the signing token is a Bearer JWT", () => {
    const client = readFileSync("src/lib/admin-api.ts", "utf8");
    const putStart = client.indexOf("async function putSignedFile");
    const putEnd = client.indexOf("export async function loadSongs", putStart);
    const put = client.slice(putStart, putEnd);
    expect(put).toContain('fetch(signed.uploadUrl');
    expect(put).not.toContain("Authorization:");
    expect(put).toContain("body: file");
  });
});
