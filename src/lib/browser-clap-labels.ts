import type { MusicLabelAxis } from "./genre-classification-benchmark";

export const CLAP_MODEL_ID = "Xenova/clap-htsat-unfused";
export const CLAP_BROWSER_LIBRARY = "@huggingface/transformers@3.8.1";
export const CLAP_MODEL_LICENSE = "Apache-2.0";

/**
 * Explicit English audio descriptions, not old genre names, song titles,
 * owner-selected labels, lyrics or any user-specific metadata.
 * Scores are conditional similarities within EACH axis, not probabilities.
 */
export const CLAP_LABELS: Record<MusicLabelAxis, readonly { id: string; prompt: string }[]> = {
  genre: [
    { id: "rock", prompt: "Rock music featuring electric guitars and acoustic drums" },
    { id: "power-rock", prompt: "Powerful epic rock music with strong electric guitar riffs and driving drums" },
    { id: "ballad", prompt: "An emotional slow ballad with expressive melodic vocals" },
    { id: "chanson", prompt: "French chanson with expressive vocals and melodic accompaniment" },
    { id: "electronic", prompt: "Electronic music made with synthesizers and electronic instruments" },
    { id: "edm", prompt: "Fast electronic dance music with powerful beats and festival energy" },
    { id: "house", prompt: "House dance music with a steady four on the floor kick drum" },
    { id: "deep-house", prompt: "Deep house music with a gentle rhythmic electronic bass groove" },
    { id: "pop", prompt: "Pop music with memorable vocals, a catchy chorus and a polished arrangement" },
    { id: "metal", prompt: "Heavy metal music with distorted electric guitars and aggressive drums" },
    { id: "acoustic", prompt: "Acoustic music performed on unplugged guitar and natural instruments" },
    { id: "jazz", prompt: "Jazz music with improvised melodic instruments and swing rhythms" },
  ],
  mood: [
    { id: "relaxing", prompt: "Calm peaceful relaxing music for unwinding and resting" },
    { id: "meditation", prompt: "Slow meditative music intended for quiet reflection and mindfulness" },
    { id: "energetic", prompt: "Energetic uplifting vibrant music with a strong dynamic pulse" },
    { id: "melancholic", prompt: "Melancholic sad and reflective music with a subdued mood" },
    { id: "dramatic", prompt: "Dramatic intense cinematic music filled with tension" },
  ],
  style: [
    { id: "chillout", prompt: "Chillout lounge music with a smooth laid back atmosphere" },
    { id: "ambient", prompt: "Ambient atmospheric soundscape with gentle evolving textures" },
    { id: "lofi", prompt: "Lo fi music with a mellow beat and soft textured sound" },
    { id: "downtempo", prompt: "Slow downtempo electronic music with spacious rhythms" },
    { id: "cinematic", prompt: "Cinematic orchestral soundtrack music with a dramatic arrangement" },
    { id: "acoustic-style", prompt: "Organic unplugged instrumentation recorded with natural warmth" },
  ],
};

export interface ClapSimilarLabel { label: string; score: number }

export function interpretClapOutput(
  axis: MusicLabelAxis,
  raw: readonly ClapSimilarLabel[],
) {
  const candidates = CLAP_LABELS[axis];
  const canonical = new Map(candidates.map(x => [x.prompt, x.id]));
  const valid = raw
    .filter(x => canonical.has(x.label) && Number.isFinite(x.score) && x.score >= 0 && x.score <= 1)
    .map(x => ({ label: canonical.get(x.label)!, score: x.score }))
    .sort((a, b) => b.score - a.score);
  const best = valid[0], next = valid[1];
  const margin = best && next ? best.score - next.score : 0;
  // Uncalibrated CLAP similarity is NOT a calibrated percentage certainty.
  // A tiny separation is a reason to abstain, never a reason to force "EDM".
  const predictedLabel = best && next && margin >= 0.05 ? best.label : null;
  return {
    axis,
    predictedLabel,
    margin: Math.round(margin * 1000) / 1000,
    alternatives: valid.slice(0, 3),
    abstained: predictedLabel === null,
  };
}
