import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PipelineVideoDirection from "./PipelineVideoDirection";

describe("PipelineVideoDirection", () => {
  it("defaults to automatic direction and accepts an optional theme", () => {
    const onChange = vi.fn();
    render(<PipelineVideoDirection value={{ autoSchedule: true }} onChange={onChange} />);
    expect(screen.getByText("Automatisk AI-regi")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Videotema"), { target: { value: "Et tre gjennom fire årstider" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visualTheme: "Et tre gjennom fire årstider", autoSchedule: true }));
  });

  it("accepts lyrics and can clear both creative fields without clearing publishing settings", () => {
    const onChange = vi.fn();
    render(<PipelineVideoDirection value={{ visualTheme: "Nordisk vinter", songLyrics: "A new day", autoSchedule: false }} onChange={onChange} />);
    expect(screen.getByText("Ditt tema + AI")).toBeTruthy();
    fireEvent.click(screen.getByText("Tøm videotema og sangtekst"));
    expect(onChange).toHaveBeenCalledWith({ visualTheme: "", songLyrics: "", autoSchedule: false });
  });
});
