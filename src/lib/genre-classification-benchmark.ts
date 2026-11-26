import type { AdminSong } from "./admin-api";

/**
 * Human-verified audio benchmark, no inference calls.
 * Keep genre, mood and listening style separate: "relaxing" is not "rock".
 * The old automatic genre is only historical evidence, NEVER reference truth.
 */
export type MusicLabelAxis = "genre" | "mood" | "style";

export interface VerifiedAudioReference {
  songId: string;
  songTitle: string;
  axis: MusicLabelAxis;
  referenceLabel: string;
  legacyLabel: string | null;
}

const REFERENCE_AXIS: Record<string, MusicLabelAxis> = {
  rock: "genre", "power-rock": "genre", metal: "genre", ballad: "genre",
  pop: "genre", acoustic: "genre", folk: "genre", country: "genre",
  blues: "genre", jazz: "genre", classical: "genre", soul: "genre",
  latin: "genre", chanson: "genre", alternative: "genre",
  electronic: "genre", edm: "genre", dance: "genre", house: "genre",
  "deep-house": "genre", techno: "genre", trance: "genre",
  relaxing: "mood", meditation: "mood",
  chillout: "style", ambient: "style", lofi: "style",
  downtempo: "style", cinematic: "style",
};

function normalize(text: string | undefined | null) {
  return (text || "").trim().toLowerCase();
}

/** Only actual saved owner labels AND a playable MP3 are reference evidence. */
export function verifiedAudioReferences(songs: readonly AdminSong[]): VerifiedAudioReference[] {
  return songs.flatMap(song => {
    const meta = song.metadata;
    const label = normalize(meta?.authorSelectedGenre);
    const axis = REFERENCE_AXIS[label];
    if (!song.id || !song.audioUrl || meta?.genreSource !== "author" ||
        !label || !axis || normalize(song.genre) !== label) {
      return [];
    }
    const original = meta?.genreReviewLegacyGenre?.trim() || null;
    return [{
      songId: song.id,
      songTitle: song.title,
      axis,
      referenceLabel: label,
      legacyLabel: original,
    }];
  }).sort((a, b) => a.songId.localeCompare(b.songId));
}

export function audioBenchmarkSummary(songs: readonly AdminSong[]) {
  const cases = verifiedAudioReferences(songs);
  const allVerified = songs.filter(song => song.metadata?.genreSource === "author" &&
    Boolean(song.metadata?.authorSelectedGenre));
  const historical = cases.filter(song => Boolean(song.legacyLabel));
  return {
    allVerified: allVerified.length,
    playableReferences: cases.length,
    missingAudio: allVerified.filter(song => !song.audioUrl).length,
    distinctReferenceLabels: new Set(cases.map(song => song.referenceLabel)).size,
    genres: cases.filter(song => song.axis === "genre").length,
    moods: cases.filter(song => song.axis === "mood").length,
    styles: cases.filter(song => song.axis === "style").length,
    historicalCount: historical.length,
    historicalDifferent: historical.filter(song =>
      normalize(song.legacyLabel) !== song.referenceLabel).length,
    historicalEdm: historical.filter(song =>
      ["edm", "electronic dance music"].includes(normalize(song.legacyLabel))).length,
  };
}

/**
 * Select five diverse references by AUTHOR LABEL, never title or old EDM tag.
 * Never reselect after predictions; keep the same pilot set for fair comparisons.
 */
export function firstFiveAudioCalibration(songs: readonly AdminSong[]): VerifiedAudioReference[] {
  const references = verifiedAudioReferences(songs);
  const priority = [
    "power-rock", "electronic", "ballad", "relaxing", "chillout",
    "rock", "chanson", "meditation", "deep-house", "pop",
  ];
  const selected: VerifiedAudioReference[] = [];
  const selectedIds = new Set<string>();
  const add = (entry?: VerifiedAudioReference) => {
    if (!entry || selectedIds.has(entry.songId) || selected.length >= 5) return;
    selected.push(entry);
    selectedIds.add(entry.songId);
  };
  // Prefer one track per label before any duplicates; example genres include
  // rock, electronic and ballad, plus an independent mood when available.
  for (const label of priority) add(references.find(item => item.referenceLabel === label));
  for (const reference of references) {
    if (selected.length >= 5) break;
    if (!selected.some(item => item.referenceLabel === reference.referenceLabel)) add(reference);
  }
  for (const reference of references) add(reference);
  return selected;
}

/**
 * Five calibration examples are NOT counted as blind test accuracy.
 * Evaluate on the remaining verified files after choosing model and labels.
 */
export function splitAudioCalibration(songs: readonly AdminSong[]) {
  const calibration = firstFiveAudioCalibration(songs);
  const calibrationIds = new Set(calibration.map(item => item.songId));
  const holdout = verifiedAudioReferences(songs).filter(item => !calibrationIds.has(item.songId));
  return { calibration, holdout };
}

/** Pure evaluator for future licensed, audio-only model predictions. */
export interface IndependentAudioPrediction {
  songId: string;
  axis: MusicLabelAxis;
  predictedLabel: string | null;
}

export function compareModelWithOwner(
  reference: readonly VerifiedAudioReference[],
  predictions: readonly IndependentAudioPrediction[],
) {
  const lookup = new Map<string, IndependentAudioPrediction>();
  for (const prediction of predictions) {
    if (!prediction.songId || !["genre", "mood", "style"].includes(prediction.axis)) continue;
    const key = prediction.songId + ":" + prediction.axis;
    if (!lookup.has(key)) lookup.set(key, prediction);
  }
  let analyzed = 0;
  let attempted = 0;
  let correct = 0;
  let wrongElectronic = 0;
  const byAxis = { genre: { attempted: 0, correct: 0 },
    mood: { attempted: 0, correct: 0 },
    style: { attempted: 0, correct: 0 } };
  for (const item of reference) {
    const result = lookup.get(item.songId + ":" + item.axis);
    if (!result) continue;
    analyzed++;
    const predicted = normalize(result.predictedLabel);
    if (!predicted) continue;
    attempted++;
    byAxis[item.axis].attempted++;
    if (predicted === item.referenceLabel) {
      correct++;
      byAxis[item.axis].correct++;
    } else if (item.axis === "genre" && ["edm", "electronic dance music"].includes(predicted)) {
      wrongElectronic++;
    }
  }
  return {
    evaluated: reference.length,
    analyzed,
    notTested: reference.length - analyzed,
    attempted,
    correct,
    wrongElectronic,
    abstained: analyzed - attempted,
    exactMatchRate: attempted ? correct / attempted : null,
    byAxis,
  };
}
