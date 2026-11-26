/**
 * Independent AudioSet sound tagging; it is NOT a fine-grained genre classifier.
 * Based on MIT/ast-finetuned-audioset-10-10-0.4593, BSD-3-Clause.
 * Labels below are exact AudioSet id2label strings, not fabricated mappings.
 */
export const AST_MODEL_ID = "onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX";
export const AST_MODEL_LICENSE = "BSD-3-Clause";

export type AstScore = { label: string; score: number };
export type AstSectionScores = AstScore[];

const musicGenres = [
  "Pop music", "Rock music", "Heavy metal", "Punk rock", "Grunge",
  "Progressive rock", "Rock and roll", "Psychedelic rock",
  "Rhythm and blues", "Soul music", "Reggae", "Country",
  "Funk", "Folk music", "Jazz", "Disco", "Classical music",
  "Electronic music", "House music", "Techno", "Dubstep",
  "Drum and bass", "Electronica", "Electronic dance music",
  "Ambient music", "Trance music", "Blues", "Dance music", "New-age music",
] as const;
const instruments = [
  "Guitar", "Electric guitar", "Bass guitar", "Acoustic guitar",
  "Piano", "Electric piano", "Keyboard (musical)",
  "Synthesizer", "Sampler", "Drum kit", "Drum machine",
  "Drum", "Percussion", "Bass drum", "Cymbal", "Hi-hat",
  "Violin, fiddle", "Saxophone", "Orchestra", "String section",
] as const;
const vocals = [
  "Singing", "Male singing", "Female singing", "Choir", "Rapping",
  "Vocal music", "A capella",
] as const;

export const AST_MUSIC_CATEGORIES = {
  genres: musicGenres,
  instruments,
  vocals,
};

export function summarizeAstEvidence(sectionScores: readonly AstSectionScores[]) {
  // AudioSet is multi-label. A score is *not* a calibrated genre probability;
  // missing items outside the top-50 are unknown, not evidence of absence.
  if (!sectionScores.length) return {
    sections: 0, genres: [], instruments: [], vocals: [], observed: 0,
  };
  const labels = new Map<string, { total: number; count: number }>();
  for (const section of sectionScores) {
    const seen = new Set<string>();
    for (const item of section) {
      if (!item || typeof item.label !== "string" ||
          !Number.isFinite(item.score) || item.score < 0 || item.score > 1 ||
          seen.has(item.label)) continue;
      seen.add(item.label);
      const old = labels.get(item.label) || { total: 0, count: 0 };
      labels.set(item.label, { total: old.total + item.score, count: old.count + 1 });
    }
  }
  const bucket = (accepted: readonly string[]) => accepted
    .filter(label => labels.has(label))
    .map(label => ({
      label,
      // Mean of observed (top-50) entries, not a probability.
      score: labels.get(label)!.total / labels.get(label)!.count,
      sections: labels.get(label)!.count,
    }))
    .sort((a, b) => b.sections - a.sections || b.score - a.score)
    .slice(0, 7);
  return {
    sections: sectionScores.length,
    genres: bucket(musicGenres),
    instruments: bucket(instruments),
    vocals: bucket(vocals),
    observed: labels.size,
  };
}
