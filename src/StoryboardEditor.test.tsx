import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StoryboardEditor, { applyContinuityNote, isValidStoryboard } from "./StoryboardEditor";

const scenes = Array.from({ length: 8 }, (_, i) =>
  `A dramatic original music scene number ${i + 1} in a quiet woodland setting with soft natural daylight.`);

function mount(approved = false, overrides: Record<string, unknown> = {}) {
  const onChangeScene = vi.fn();
  const onApplyContinuity = vi.fn();
  const onApplyMusicSections = vi.fn();
  const onApprove = vi.fn();
  const onDiscard = vi.fn();
  render(<StoryboardEditor songTitle="Still I Rise" scenes={scenes}
    approved={approved} onChangeScene={onChangeScene} onApplyContinuity={onApplyContinuity}
    onApplyMusicSections={onApplyMusicSections}
    onApprove={onApprove} onDiscard={onDiscard} {...overrides} />);
  return { onChangeScene, onApplyContinuity, onApplyMusicSections, onApprove, onDiscard };
}

describe("author-approved storyboard", () => {
  it("shows the eight-stage outline and one editable scene without spending or approving", () => {
    const { onChangeScene, onApprove } = mount();
    expect(screen.getByText(/Gratis tekstutkast/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Scene [1-8]/ })).toHaveLength(8);
    expect(screen.getAllByRole("textbox")).toHaveLength(2); // Continuity field + active scene.
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Scene 1"), { target: { value: "An adult enters a sunlit mountain path at dawn, keeping the same jacket throughout." } });
    expect(onChangeScene).toHaveBeenCalledWith(0, "An adult enters a sunlit mountain path at dawn, keeping the same jacket throughout.");
    fireEvent.click(screen.getByRole("button", { name: "Godkjenn 8 scener" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("can select a scene or show every scene in a responsive list", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Scene 3/ }));
    expect(screen.getByLabelText("Scene 3")).toBeTruthy();
    expect(screen.queryByLabelText("Scene 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vis alle scener" }));
    expect(screen.getAllByRole("textbox")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Vis én scene" })).toBeTruthy();
  });

  it("adds a single shared visual note to all scenes without changing unrelated text", () => {
    const note = "Same older farmer in beige jacket, olive grove in Biar and warm muted colors";
    const updated = applyContinuityNote(scenes, note);
    expect(updated).not.toBeNull();
    expect(updated?.every((scene, i) => scene.startsWith(scenes[i]) && scene.includes(note))).toBe(true);
    expect(applyContinuityNote(updated!, note)).toEqual(updated);
    const { onApplyContinuity } = mount();
    fireEvent.change(screen.getByLabelText(/Faste visuelle detaljer/), { target: { value: note } });
    fireEvent.click(screen.getByRole("button", { name: "Legg til i alle 8 scener" }));
    expect(onApplyContinuity).toHaveBeenCalledWith(note);
  });

  it("rejects a continuity note that exceeds any scene limit", () => {
    const longScenes = scenes.map((scene, i) => scene + "x".repeat(900 - i));
    const note = "A very detailed shared character and environment description";
    expect(applyContinuityNote(longScenes, note)).toBeNull();
    expect(applyContinuityNote(scenes, "short")).toBeNull();
  });

  it("edits musical section cues without creating a render or approving the story", () => {
    const { onApplyMusicSections, onApprove } = mount();
    expect(screen.getAllByRole("combobox")).toHaveLength(8);
    fireEvent.change(screen.getByLabelText("Musikkdel scene 5"), { target: { value: "instrumental" } });
    fireEvent.click(screen.getByRole("button", { name: "Legg musikkplanen til scenene" }));
    expect(onApplyMusicSections).toHaveBeenCalledTimes(1);
    expect(onApplyMusicSections.mock.calls[0][0][4]).toBe("instrumental");
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("rejects incomplete and duplicate scenes", () => {
    expect(isValidStoryboard(scenes)).toBe(true);
    expect(isValidStoryboard(scenes.slice(0, 7))).toBe(false);
    expect(isValidStoryboard([...scenes.slice(0, 7), scenes[0]])).toBe(false);
    expect(isValidStoryboard([...scenes.slice(0, 7), "too short"])).toBe(false);
  });

  it("renders approved status without allowing accidental reapproval or continuity changes", () => {
    const { onApprove } = mount(true);
    expect(screen.getByText("Storyboard godkjent")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Storyboard godkjent" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Faste visuelle detaljer/), {
      target: { value: "Same older farmer in beige jacket and olive grove in Biar" },
    });
    expect((screen.getByRole("button", { name: "Legg til i alle 8 scener" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Musikkdel scene 1") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Legg musikkplanen til scenene" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onApprove).not.toHaveBeenCalled();
  });
});
