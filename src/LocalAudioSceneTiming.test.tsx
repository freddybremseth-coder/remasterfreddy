import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LocalAudioSceneTiming, { formatSceneTime } from "./LocalAudioSceneTiming";

describe("cost-free local audio timing preview", () => {
  it("requires an explicit local file and tells the truth about renderer support", () => {
    render(<LocalAudioSceneTiming />);
    expect(screen.getByText(/Gratis forslag til sceneskift fra lydfil/)).toBeTruthy();
    expect(screen.getByText(/Filen lastes ikke opp/)).toBeTruthy();
    expect(screen.getByLabelText(/Velg lydfil for lokal analyse/)).toBeTruthy();
    expect(screen.getByText(/Dette identifiserer ikke sikkert vers eller refreng/)).toBeTruthy();
  });

  it("formats elapsed times", () => {
    expect(formatSceneTime(0)).toBe("0:00");
    expect(formatSceneTime(70.9)).toBe("1:10");
    expect(formatSceneTime(-1)).toBe("–");
  });
});
