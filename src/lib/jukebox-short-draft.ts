import type {JukeboxDraft} from "./jukebox-drafts";

/** Create a separate private 45-second Shorts project from an existing Jukebox edit.
 * Keep media and ordering, but reflow the timeline to avoid using full-song
 * timestamps in a short format. Never change or persist the original draft. */
export function makeJukeboxShortDraft(
  source:JukeboxDraft, audioStartSeconds=0,
):JukeboxDraft{
  if(!Number.isFinite(audioStartSeconds)||audioStartSeconds<0||audioStartSeconds>3600)
    throw new Error("Ugyldig startpunkt i musikken.");
  return {
    ...source,format:"portrait",seconds:"45",audioStartSeconds,
    savedAt:Date.now(),
    clips:source.clips.map(clip=>({...clip,cueStart:undefined})),
  };
}
