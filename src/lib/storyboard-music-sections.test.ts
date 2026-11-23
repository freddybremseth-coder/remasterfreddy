import { describe, expect, it } from "vitest";
import { applyMusicSectionCues, DEFAULT_MUSIC_SECTIONS, readMusicSectionCues } from "./storyboard-music-sections";

const scenes = Array.from({ length: 8 }, (_, i) =>
  `One cohesive film scene ${i + 1} with the same character in an olive grove at morning light.`);

describe("author-controlled music structure without audio or AI calls", () => {
  it("adds correct intro, verse, pre-chorus, chorus and instrumental direction to approved text", () => {
    const result = applyMusicSectionCues(scenes, DEFAULT_MUSIC_SECTIONS);
    expect(result).not.toBeNull();
    expect(result?.[0]).toContain("Music cue: Intro");
    expect(result?.[2]).toContain("Music cue: Pre-chorus");
    expect(result?.[3]).toContain("Music cue: Refreng");
    expect(result?.[6]).toContain("Music cue: Instrumental");
    expect(readMusicSectionCues(result!)).toEqual(DEFAULT_MUSIC_SECTIONS);
  });

  it("replaces a cue on edit instead of appending duplicates", () => {
    const first = applyMusicSectionCues(scenes, DEFAULT_MUSIC_SECTIONS)!;
    const sections = DEFAULT_MUSIC_SECTIONS.map((s, i) => i === 3 ? "instrumental" as const : s);
    const revised = applyMusicSectionCues(first, sections)!;
    expect(revised[3]).toContain("Music cue: Instrumental");
    expect(revised[3]).not.toContain("Music cue: Refreng");
    expect((revised[3].match(/Music cue:/g) || [])).toHaveLength(1);
    expect(applyMusicSectionCues(revised, sections)).toEqual(revised);
    expect(revised[3]).toContain("One cohesive film scene 4");
  });

  it("refuses incomplete plans or scene text beyond the server's 1000-character limit", () => {
    expect(applyMusicSectionCues(scenes.slice(1), DEFAULT_MUSIC_SECTIONS)).toBeNull();
    expect(applyMusicSectionCues(scenes, DEFAULT_MUSIC_SECTIONS.slice(1))).toBeNull();
    const longScenes = [...scenes];
    longScenes[5] += "x".repeat(930);
    expect(applyMusicSectionCues(longScenes, DEFAULT_MUSIC_SECTIONS)).toBeNull();
  });
});
