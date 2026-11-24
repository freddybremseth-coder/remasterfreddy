/** Editable editorial music cues. They describe visual intent, not measured MP3 beat timings. */
export const MUSIC_SECTIONS = [
  "intro", "verse", "prechorus", "chorus", "instrumental", "bridge", "outro",
] as const;
export type MusicSection = typeof MUSIC_SECTIONS[number];

export const musicSectionLabels: Record<MusicSection, string> = {
  intro: "Intro",
  verse: "Vers",
  prechorus: "Før refreng",
  chorus: "Refreng",
  instrumental: "Instrumental",
  bridge: "Bro",
  outro: "Outro",
};

const visualDirections: Record<MusicSection, string> = {
  intro: "establish the world with a restrained opening composition",
  verse: "advance the lyrical story through a concrete gesture or detail",
  prechorus: "build anticipation through perspective, light or movement",
  chorus: "show the main emotional idea with a strong cinematic frame",
  instrumental: "emphasize atmosphere, landscape, texture or nonverbal motion",
  bridge: "introduce a fresh angle or reflective turning point",
  outro: "resolve the story calmly and echo the opening visual",
};

export const DEFAULT_MUSIC_SECTIONS: MusicSection[] = [
  "intro", "verse", "prechorus", "chorus", "verse", "chorus", "instrumental", "outro",
];

/** Editorial templates: these are suggested scene arcs, never inferred MP3 structure. */
export const MUSIC_PLAN_PRESETS = [
  {
    id: "story",
    label: "Historiefortelling",
    description: "Fra rolig åpning til vendepunkt og avslutning",
    sections: ["intro", "verse", "verse", "prechorus", "chorus", "bridge", "chorus", "outro"],
  },
  {
    id: "rock",
    label: "Rock og kraft",
    description: "Oppbygging, sterke refreng og avsluttende klimaks",
    sections: ["intro", "verse", "prechorus", "chorus", "verse", "bridge", "chorus", "outro"],
  },
  {
    id: "calm",
    label: "Rolig og kunstnerisk",
    description: "Mer rom for stemning, instrumenter og ettertanke",
    sections: ["intro", "instrumental", "verse", "instrumental", "verse", "bridge", "instrumental", "outro"],
  },
] as const satisfies ReadonlyArray<{
  id: string; label: string; description: string; sections: readonly MusicSection[];
}>;

const cuePattern = /\s*\[Music cue: (?:Intro|Verse|Pre-chorus|Chorus|Instrumental|Bridge|Outro) — [^\]]*\]/g;

export function applyMusicSectionCues(scenes: readonly string[], sections: readonly MusicSection[]): string[] | null {
  if (scenes.length !== 8 || sections.length !== 8 ||
      !sections.every(section => MUSIC_SECTIONS.includes(section)) ||
      !scenes.every(scene => typeof scene === "string")) return null;

  const updated = scenes.map((scene, index) => {
    const base = scene.replace(cuePattern, "").trim();
    const section = sections[index];
    const label = section === "prechorus" ? "Pre-chorus" : section.charAt(0).toUpperCase() + section.slice(1);
    return `${base} [Music cue: ${label} — ${visualDirections[section]}]`;
  });
  const clean = updated.map(scene => scene.trim().replace(/\s+/g, " "));
  return clean.every(scene => scene.length >= 25 && scene.length <= 1000) &&
    new Set(clean.map(scene => scene.toLocaleLowerCase())).size === 8 ? updated : null;
}

export function readMusicSectionCues(scenes: readonly string[]): MusicSection[] {
  return scenes.map((scene, index) => {
    const matches = [...scene.matchAll(/\[Music cue: (Intro|Verse|Pre-chorus|Chorus|Instrumental|Bridge|Outro) — /g)];
    const name = matches[matches.length - 1]?.[1];
    return MUSIC_SECTIONS.find(section =>
      (section === "prechorus" ? "Pre-chorus" : section.charAt(0).toUpperCase() + section.slice(1)) === name,
    ) ?? DEFAULT_MUSIC_SECTIONS[index] ?? "verse";
  });
}
