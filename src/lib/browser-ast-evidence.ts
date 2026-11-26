/**
 * Independent AudioSet sound tagging; it is NOT a fine-grained genre classifier.
 * Based on MIT/ast-finetuned-audioset-10-10-0.4593, BSD-3-Clause.
 * Labels below are exact AudioSet id2label strings, not fabricated mappings.
 */
export const AST_MODEL_ID = "onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX";
export const AST_MODEL_LICENSE = "BSD-3-Clause";

export type AstScore = { label: string; score: number };
export type AstSectionScores = AstScore[];
export type AstTagEvidence = AstScore & { sections: number };

/**
 * Diagnostic presentation cutoff ONLY: NOT calibrated confidence, a probability
 * of genre correctness or a basis for any automated decision.
 * AudioSet's per-class scores can be tiny even for music recordings.
 */
export const AST_DIAGNOSTIC_SCORE_FLOOR = 0.05;
export function isAstRepeatedDisplaySignal(tag: AstTagEvidence, totalSections: number) {
  return totalSections > 0 && tag.score >= AST_DIAGNOSTIC_SCORE_FLOOR &&
    tag.sections >= Math.min(2, totalSections);
}

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
  // AudioSet is multi-label. A score is *not* a calibrated genre probability.
  // An absent class outside top-50 is unknown, not evidence that the sound
  // is absent. Keep full top suggestions to reveal what AST actually heard.
  const validSections = sectionScores.map(section => {
    const seen = new Set<string>();
    return section
      .filter(item => {
        if (!item || typeof item.label !== "string" || !item.label.trim() ||
            !Number.isFinite(item.score) || item.score < 0 || item.score > 1 ||
            seen.has(item.label)) return false;
        seen.add(item.label);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  });
  const labels = new Map<string, { total: number; count: number }>();
  for (const section of validSections) for (const item of section) {
    const old = labels.get(item.label) || { total: 0, count: 0 };
    labels.set(item.label, { total: old.total + item.score, count: old.count + 1 });
  }
  const toTag = (label: string): AstTagEvidence => ({
    label,
    // Mean across only sections where the tag was among the returned top-50.
    score: labels.get(label)!.total / labels.get(label)!.count,
    sections: labels.get(label)!.count,
  });
  const bucket = (accepted: readonly string[]) => accepted
    .filter(label => labels.has(label))
    .map(toTag)
    .sort((a, b) => b.sections - a.sections || b.score - a.score)
    .slice(0, 7);
  const overall = [...labels.keys()].map(toTag)
    .sort((a, b) => b.score - a.score || b.sections - a.sections)
    .slice(0, 8);
  return {
    sections: validSections.length,
    genres: bucket(musicGenres),
    instruments: bucket(instruments),
    vocals: bucket(vocals),
    // Diagnoses which sound classes dominate the classifier, even if they are
    // not in our hand-curated music/instrument lists.
    overall,
    bySection: validSections.map(section => section.slice(0, 5)),
    observed: labels.size,
  };
}
