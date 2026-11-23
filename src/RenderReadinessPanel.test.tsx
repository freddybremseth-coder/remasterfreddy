import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RenderReadinessPanel from "./RenderReadinessPanel";

const scenes = Array.from({ length: 8 }, (_, i) =>
  `The musical story scene ${i + 1} takes place at a quiet Spanish olive grove with the same farmer.`);

describe("no-cost render readiness interface", () => {
  it("shows user-readable blocking reasons instead of falsely reporting a render success", () => {
    render(<RenderReadinessPanel
      songId="song-1" hasAudio={true} alreadyPublished={false}
      previewSongId="song-1" sourceMatches={true} approved={false}
      scenes={scenes} youtubeConnected={false} extraImageCount={0}
      currentlyProcessing={false}
    />);
    expect(screen.getByText("Gratis kontroll før videoproduksjon")).toBeTruthy();
    expect(screen.getByText("4 av 7 kontroller bestått")).toBeTruthy();
    expect(screen.getByText(/Gjennomgå og godkjenn storyboardet/)).toBeTruthy();
    expect(screen.getByText(/Ingen bilder valgt/)).toBeTruthy();
    expect(screen.getByText(/YouTube-tilkoblingen er ikke bekreftet/)).toBeTruthy();
    expect(screen.getByText(/Den starter ikke AI-bilder/)).toBeTruthy();
  });

  it("qualifies a passed checklist as a local check, not a guaranteed render", () => {
    render(<RenderReadinessPanel
      songId="song-1" hasAudio={true} alreadyPublished={false}
      previewSongId="song-1" sourceMatches={true} approved={true}
      scenes={scenes} youtubeConnected={true} extraImageCount={8}
      currentlyProcessing={false}
    />);
    expect(screen.getByText("Alle lokale kontroller bestått")).toBeTruthy();
    expect(screen.getByText(/Dette garanterer ikke at AI-bilder/)).toBeTruthy();
  });
});
