import { isValidSceneTiming } from "./local-audio-scene-cues";

export interface RenderReadinessInput {
  songId: string;
  hasAudio: boolean;
  alreadyPublished: boolean;
  previewSongId?: string;
  sourceMatches: boolean;
  approved: boolean;
  scenes?: string[];
  youtubeConnected: boolean;
  timing?: { durationSeconds: number; startsSeconds: number[] };
  extraImageCount: number;
  currentlyProcessing: boolean;
}

export interface ReadinessCheck {
  key: string;
  title: string;
  ok: boolean;
  message: string;
}

/**
 * Free, deterministic preflight for the editor. It does not contact upstream
 * media services, analyze a song, render or authorize publishing. Backend still
 * validates independently; a successful checklist is not a render guarantee.
 */
export function inspectRenderReadiness(input: RenderReadinessInput): ReadinessCheck[] {
  const scenes = input.scenes ?? [];
  const normalized = scenes.map(scene => typeof scene === "string" ? scene.trim().replace(/\s+/g, " ") : "");
  const scenesValid = normalized.length === 8 &&
    normalized.every(scene => scene.length >= 25 && scene.length <= 1000) &&
    new Set(normalized.map(scene => scene.toLocaleLowerCase())).size === 8;
  const timingValid = input.timing === undefined || isValidSceneTiming(input.timing);
  return [
    {
      key: "song",
      title: "Sang og lydfil",
      ok: Boolean(input.songId && input.hasAudio && !input.alreadyPublished),
      message: !input.hasAudio ? "Sangen mangler lydfil. Last opp lyd før du går videre."
        : input.alreadyPublished ? "Denne sangen har allerede YouTube-video. Ikke start en ny produksjon."
        : "Sangen har en registrert lydfil og er ikke merket som publisert.",
    },
    {
      key: "storyboard",
      title: "Åtte scener",
      ok: scenesValid && input.previewSongId === input.songId && input.sourceMatches,
      message: !scenesValid ? "Storyboardet må ha åtte forskjellige scener, hver på 25–1000 tegn."
        : input.previewSongId !== input.songId || !input.sourceMatches
          ? "Storyboardet er ikke knyttet til gjeldende sang og regi. Oppdater forhåndsvisningen."
          : "Alle åtte sceneinstruksjoner er gyldige og knyttet til riktig sang.",
    },
    {
      key: "approval",
      title: "Forfattergodkjenning",
      ok: input.approved && input.previewSongId === input.songId && input.sourceMatches,
      message: input.approved && input.previewSongId === input.songId && input.sourceMatches
        ? "Storyboardet er godkjent for denne sangen."
        : "Gjennomgå og godkjenn storyboardet før video.",
    },
    {
      key: "timing",
      title: "Scenetidspunkter",
      ok: timingValid,
      message: !timingValid
        ? "Tidsplanen inneholder ugyldige starttidspunkter. Analyser og godkjenn på nytt."
        : input.timing
          ? "Åtte scenestarter er gyldige. Serveren kontrollerer sanglengden før betalte AI-kall."
          : "Ingen egen tidsplan. Videoen vil bruke jevnt fordelte bilder.",
    },
    {
      key: "images",
      title: "Bildefordeling",
      ok: input.extraImageCount > 0 && (!input.timing || input.extraImageCount === 8),
      message: input.extraImageCount === 0
        ? "Ingen bilder valgt. Velg faktiske bilder fra bildebanken før produksjon – abstrakte sirkler blir ikke brukt som automatisk reserve."
        : input.timing && input.extraImageCount !== 8
          ? "Ved egne scenestarter må du velge nøyaktig åtte bilder – ett per scene."
          : `${input.extraImageCount} bilder valgt for videoen. Kontroller bildene i produksjonsbekreftelsen.`,
    },
    {
      key: "youtube",
      title: "YouTube-tilkobling",
      ok: input.youtubeConnected,
      message: input.youtubeConnected
        ? "YouTube-tilkoblingen er bekreftet av administrasjonen."
        : "YouTube-tilkoblingen er ikke bekreftet. Oppdater kanalstatus før video.",
    },
    {
      key: "processing",
      title: "Pågående produksjon",
      ok: !input.currentlyProcessing,
      message: input.currentlyProcessing
        ? "En produksjon pågår. Start ikke en ny samtidig."
        : "Ingen videoproduksjon er startet fra dette skjermbildet.",
    },
  ];
}
