import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("./lib/local-audio-scene-cues", async (original) => {
  const actual = await original<typeof import("./lib/local-audio-scene-cues")>();
  return {
    ...actual,
    analyzeLocalAudioFile: vi.fn(async () => ({
      duration: 180,
      starts: [0, 20, 45, 67, 91, 111, 134, 158],
    })),
  };
});

import LocalAudioSceneTiming, { formatSceneTime } from "./LocalAudioSceneTiming";

function mount(approvedTiming?: { durationSeconds: number; startsSeconds: number[] }, scenes?: string[]) {
  const onApplyTiming = vi.fn();
  const onClearTiming = vi.fn();
  render(<LocalAudioSceneTiming scenes={scenes} approvedTiming={approvedTiming}
    onApplyTiming={onApplyTiming} onClearTiming={onClearTiming} />);
  return { onApplyTiming, onClearTiming };
}

describe("cost-free local audio timing used by FFmpeg only after approval", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("requires an explicit local file and accurately describes rendering support", () => {
    mount();
    expect(screen.getByText(/Gratis forslag til sceneskift fra lydfil/)).toBeTruthy();
    expect(screen.getByText(/Filen lastes ikke opp/)).toBeTruthy();
    expect(screen.getByLabelText(/Velg lydfil for lokal analyse/)).toBeTruthy();
    expect(screen.getByText(/Dette identifiserer ikke sikkert vers eller refreng/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Bruk tidspunktene i videoen" })).toBeNull();
  });

  it("keeps a local soundtrack private until the author explicitly applies valid starts", async () => {
    const onFetch = vi.fn();
    vi.stubGlobal("fetch", onFetch);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:local-playback"),
      revokeObjectURL: vi.fn(),
    });
    const { onApplyTiming, onClearTiming } = mount();
    const input = screen.getByLabelText(/Velg lydfil for lokal analyse/);
    fireEvent.change(input, { target: { files: [new File(["mp3"], "song.mp3", { type: "audio/mpeg" })] } });
    await waitFor(() => expect(screen.getByText(/8 foreslåtte scenestarter/)).toBeTruthy());
    expect(onClearTiming).toHaveBeenCalledOnce();
    expect(onApplyTiming).not.toHaveBeenCalled();
    expect(onFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bruk tidspunktene i videoen" }));
    expect(onApplyTiming).toHaveBeenCalledExactlyOnceWith({
      durationSeconds: 180,
      startsSeconds: [0, 20, 45, 67, 91, 111, 134, 158],
    });
    expect(onFetch).not.toHaveBeenCalled();
  });

  it("seeks between playback markers and assigns the current playhead to a scene only after user action", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:local-playback"),
      revokeObjectURL: vi.fn(),
    });
    const { onApplyTiming, onClearTiming } = mount();
    fireEvent.change(screen.getByLabelText(/Velg lydfil for lokal analyse/), {
      target: { files: [new File(["mp3"], "song.mp3", { type: "audio/mpeg" })] },
    });
    await waitFor(() => expect(screen.getByLabelText("Avspillingsposisjon: 0:00 / 3:00")).toBeTruthy());
    const audio = document.getElementById("storyboard-local-audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Hopp til scene 3" }));
    expect(audio.currentTime).toBe(45);
    fireEvent.change(screen.getByLabelText("Avspillingsposisjon: 0:45 / 3:00"), { target: { value: "49.2" } });
    expect(audio.currentTime).toBe(49.2);
    fireEvent.click(screen.getByRole("button", { name: "Sett start for scene 3 ved avspillingsposisjonen" }));
    expect((screen.getByLabelText("Starttid scene 3") as HTMLInputElement).value).toBe("49.2");
    expect(onApplyTiming).not.toHaveBeenCalled();
    expect(onClearTiming).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bruk tidspunktene i videoen" }));
    expect(onApplyTiming).toHaveBeenCalledWith({
      durationSeconds: 180,
      startsSeconds: [0, 20, 49.2, 67, 91, 111, 134, 158],
    });
  });

  it("plays the eight scene cards locally and changes the active visual at scene boundaries", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:local-scene-preview"),
      revokeObjectURL: vi.fn(),
    });
    const scenes = Array.from({ length: 8 }, (_, i) =>
      `Distinct original scene number ${i + 1} with warm cinematic light and the same character.`);
    const { onApplyTiming } = mount(undefined, scenes);
    fireEvent.change(screen.getByLabelText(/Velg lydfil for lokal analyse/), {
      target: { files: [new File(["mp3"], "song.mp3", { type: "audio/mpeg" })] },
    });
    await waitFor(() => expect(screen.getByLabelText("Gratis visuell gjennomspilling")).toBeTruthy());
    expect(screen.getByText(scenes[0])).toBeTruthy();
    const audio = document.getElementById("storyboard-local-audio") as HTMLAudioElement;
    Object.defineProperty(audio, "currentTime", { configurable: true, writable: true, value: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Forhåndsvis scene 4" }));
    expect(audio.currentTime).toBe(67);
    expect(screen.getByText(scenes[3])).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forhåndsvis scene 4" }).getAttribute("aria-pressed")).toBe("true");
    expect(onApplyTiming).not.toHaveBeenCalled();
    expect(screen.getByText(/illustrert tekstvisning, ikke bilder fra en AI-modell/)).toBeTruthy();
  });

  it("formats elapsed times", () => {
    expect(formatSceneTime(0)).toBe("0:00");
    expect(formatSceneTime(70.9)).toBe("1:10");
    expect(formatSceneTime(-1)).toBe("–");
  });
});
