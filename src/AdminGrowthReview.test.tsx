import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AdminGrowthReview from "./AdminGrowthReview";

vi.mock("./lib/supabase", () => ({
  getAdminSession: vi.fn(async () => ({ accessToken: "test-token" })),
}));

describe("AdminGrowthReview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows read-only suggestions from a verified channel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        channelTitle: "Re-Master Freddy",
        catalogMatchedVideos: 1,
        titleSuggestions: [{
          videoId: "zJO0g9vkNPk",
          currentTitle: "Minimal Slowed Down Groove",
          titleSuggestion: { proposedTitle: "Focused Energy | Minimal Slowed Down Groove", status: "needs_approval" },
          seriesSuggestions: ["Focused Energy"],
        }],
        seriesSuggestions: [],
        existingPlaylists: [],
        relatedVideoReview: { status: "requires_explicit_short_to_track_mapping", pairs: [] },
      }),
    })));
    render(<AdminGrowthReview />);
    expect(await screen.findByText("Focused Energy | Minimal Slowed Down Groove")).toBeInTheDocument();
    expect(screen.getByText(/Avventer godkjenning/)).toBeInTheDocument();
    expect(screen.getByText(/Ingen titler, spillelister eller Shorts endres her/)).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/remaster-growth-packaging", expect.objectContaining({ cache: "no-store" })));
    vi.unstubAllGlobals();
  });
});
