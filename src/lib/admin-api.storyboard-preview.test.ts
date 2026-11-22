import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./supabase", () => ({
  getAdminSession: vi.fn(async () => ({ accessToken: "test-session" })),
}));

import { previewSongStoryboard, startSongPipeline } from "./admin-api";

const approved = Array.from({ length: 8 }, (_, i) =>
  `An authored cinematic scene number ${i + 1}, with distinct framing in the same rugged workshop.`);

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data };
}
function sseSuccess() {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"status":"completed"}\n\n'));
        controller.close();
      },
    }),
  };
}

describe("cost-free scene preview and approved storyboard transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the text preview endpoint without starting a render", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ mode: "free-text-outline", title: "Still I Rise", scenes: approved, aiCalls: 0, imagesGenerated: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await previewSongStoryboard({ id: "song-1", title: "Still I Rise", genre: "rock" }, {
      visualTheme: "Hope returns at dawn", songLyrics: "I rise through the storm",
    });
    expect(result.scenes).toHaveLength(8);
    expect(result.aiCalls).toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/neural-beat-storyboard-preview");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "Still I Rise", genre: "rock",
      visualTheme: "Hope returns at dawn", songLyrics: "I rise through the storm",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the exact approved scene texts only when rendering is requested", async () => {
    const fetchMock = vi.fn(async () => sseSuccess());
    vi.stubGlobal("fetch", fetchMock);
    await startSongPipeline("song-1", {
      visualTheme: "Rising after the storm",
      storyboardScenes: approved,
      autoSchedule: false,
    }, vi.fn());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/neural-beat");
    const body = JSON.parse(String(init.body));
    expect(body.storyboardScenes).toEqual(approved);
    expect(body.recordId).toBe("song-1");
  });
});
