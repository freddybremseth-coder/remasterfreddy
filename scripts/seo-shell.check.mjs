import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("index.html", root), "utf8");
const app = readFileSync(new URL("src/App.tsx", root), "utf8");
const built = new URL("dist/index.html", root);

function checkShell(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  const headings = [...body.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/gi)];
  assert.equal(headings.length, 1, "Exactly one initial server-delivered H1");
  assert.equal(headings[0][1].trim(), "RE-MASTER FREDDY");
  assert.match(body, /<div id="root">[\s\S]*<h1>RE-MASTER FREDDY<\/h1>/);
  assert.match(body, /Summer house, night-drive EDM and chill electronic beats/);
  // Vite moves module scripts into <head> in the built HTML.
  assert.match(html, /<script[^>]+type="module"/);
}
test("Original React heading and static HTML use identical title", () => {
  assert.match(app, /<h1>RE-MASTER FREDDY<\/h1>/);
  checkShell(source);
});
test("Built public HTML also contains the real crawlable H1", { skip: !existsSync(built) }, () => {
  checkShell(readFileSync(built, "utf8"));
});

test("Admin SPA routes are explicitly noindex despite static homepage fallback", () => {
  const config = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
  for (const path of ["/admin", "/admin/(.*)"]) {
    const entry = (config.headers ?? []).find((rule) => rule.source === path);
    assert.ok(entry, `Missing response header for ${path}`);
    const value = (entry.headers ?? []).find((header) => header.key.toLowerCase() === "x-robots-tag")?.value;
    assert.match(value ?? "", /\\bnoindex\\b/);
  }
});
