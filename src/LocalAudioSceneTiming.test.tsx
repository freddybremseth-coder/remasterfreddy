import { describe, expect, it, vi } from "vitest";
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

function mount(approvedTiming?: { durationSeconds: number; startsSeconds: number[] }) {
  const onApplyTiming = vi.fn();
  const onClearTiming = vi.fn();
  render(<LocalAudioSceneTiming approvedTiming={approvedTiming}
    onApplyTiming={onApplyTiming} onClearTiming={onClearTiming} />);
  return { onApplyTiming, onClearTiming };
}

describe("cost-free local audio timing used by FFmpeg only after approval", () => {
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
    vi.unstubAllGlobals();
  });

  it("formats elapsed times", () => {
    expect(formatSceneTime(0)).toBe("0:00");
    expect(formatSceneTime(70.9)).toBe("1:10");
    expect(formatSceneTime(-1)).toBe("–");
  });
});
