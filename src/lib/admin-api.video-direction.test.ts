import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./supabase", () => ({
  getAdminSession: vi.fn(async () => ({ accessToken: "test-session" })),
}));

import { startSongPipeline } from "./admin-api";

describe("song-led video pipeline payload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("transmits the author's theme and lyrics while preserving existing options", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"status":"completed"}\\n\\n'));
          controller.close();
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onEvent = vi.fn();
    await startSongPipeline("track-1", {
      visualTheme: "  A mountain journey into morning light  ",
      songLyrics: "  I rise through the storm  ",
      autoSchedule: false,
      multilingualDescription: true,
      customImageUrls: ["https://example.org/original-image.png"],
    }, onEvent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/neural-beat");
    expect(request.method).toBe("POST");
    const payload = JSON.parse(String(request.body));
    expect(payload).toMatchObject({
      recordId: "track-1",
      visualTheme: "A mountain journey into morning light",
      songLyrics: "I rise through the storm",
      autoSchedule: false,
      multilingualDescription: true,
      customImageUrls: ["https://example.org/original-image.png"],
    });
    expect(onEvent).toHaveBeenCalledWith({ status: "completed" });
  });

  it("omits optional story fields on a fully automatic video", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: new ReadableStream({ start(controller) { controller.close(); } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await startSongPipeline("track-2", { visualTheme: "  ", songLyrics: "" }, vi.fn());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).not.toHaveProperty("visualTheme");
    expect(payload).not.toHaveProperty("songLyrics");
    expect(payload.recordId).toBe("track-2");
  });
});
