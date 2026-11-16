import { readFileSync } from "node:fs";
import { test, expect } from "vitest";

test("public homepage ships an H1 in initial HTML without executing JavaScript", () => {
  const html = readFileSync("index.html", "utf8");
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>/);
  expect(root).not.toBeNull();
  const rootMarkup = root![1];
  expect(rootMarkup.match(/<h1(?:\s[^>]*)?>/g)).toHaveLength(1);
  expect(rootMarkup).toMatch(/<h1>Re-Master Freddy<\/h1>/);
  expect(rootMarkup).toContain("youtube.com/channel/UCPAj3RNC2S_Nv7QV4-oYoIw");
  expect(html).toMatch(/<script type="module" src="\/src\/main\.tsx"><\/script>/);
});
