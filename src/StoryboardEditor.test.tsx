import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StoryboardEditor, { isValidStoryboard } from "./StoryboardEditor";

const scenes = Array.from({ length: 8 }, (_, i) =>
  `A dramatic original music scene number ${i + 1} in a quiet woodland setting with soft natural daylight.`);

describe("author-approved storyboard", () => {
  it("shows eight editable scenes but does not spend or approve automatically", () => {
    const onChangeScene = vi.fn();
    const onApprove = vi.fn();
    render(<StoryboardEditor songTitle="Still I Rise" scenes={scenes}
      approved={false} onChangeScene={onChangeScene} onApprove={onApprove} onDiscard={vi.fn()} />);
    expect(screen.getByText(/Gratis tekstutkast/)).toBeTruthy();
    expect(screen.getAllByRole("textbox")).toHaveLength(8);
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Scene 3"), { target: { value: "A new foreground character walks toward a sunlit mountain path." } });
    expect(onChangeScene).toHaveBeenCalledWith(2, "A new foreground character walks toward a sunlit mountain path.");
    fireEvent.click(screen.getByRole("button", { name: "Godkjenn 8 scener" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete and duplicate scenes", () => {
    expect(isValidStoryboard(scenes)).toBe(true);
    expect(isValidStoryboard(scenes.slice(0, 7))).toBe(false);
    expect(isValidStoryboard([...scenes.slice(0, 7), scenes[0]])).toBe(false);
    expect(isValidStoryboard([...scenes.slice(0, 7), "too short"])).toBe(false);
  });

  it("renders approved status without requiring a second approval", () => {
    const onApprove = vi.fn();
    render(<StoryboardEditor songTitle="Roots" scenes={scenes} approved={true}
      onChangeScene={vi.fn()} onApprove={onApprove} onDiscard={vi.fn()} />);
    expect(screen.getByText("Storyboard godkjent")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Storyboard godkjent" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
