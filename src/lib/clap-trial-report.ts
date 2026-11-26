import type { VerifiedAudioReference, IndependentAudioPrediction } from "./genre-classification-benchmark";
import { compareModelWithOwner } from "./genre-classification-benchmark";
import { CLAP_MODEL_ID, CLAP_BROWSER_LIBRARY, interpretClapOutput } from "./browser-clap-labels";

export interface LocalClapTrial {
  entry: VerifiedAudioReference;
  result: ReturnType<typeof interpretClapOutput>;
}

/**
 * Owner-initiated clipboard export for troubleshooting.
 * The report contains NO MP3 URLs, audio content, authentication, user ID,
 * environment variables, or third-party requests. Never runs automatically.
 */
export function formatClapTrialReport(
  references: readonly VerifiedAudioReference[],
  trials: readonly LocalClapTrial[],
) {
  const relevantIds = new Set(references.map(x => x.songId));
  const safe = trials.filter(x => relevantIds.has(x.entry.songId));
  const predictions: IndependentAudioPrediction[] = safe.map(x => ({
    songId: x.entry.songId, axis: x.entry.axis, predictedLabel: x.result.predictedLabel,
  }));
  const counts = compareModelWithOwner(references, predictions);
  const lines = [
    "RE-MASTER FREDDY — LOKAL CLAP-LYDTEST",
    "Modell: " + CLAP_MODEL_ID + " | Nettleserbibliotek: " + CLAP_BROWSER_LIBRARY,
    "Metode: 3 x opptil 10 s fra midten av hver tredjedel av sangen; kun lyd til lokal modell.",
    "Status: Eksperimentell test, ingen automatiske sjangerendringer eller publisering.",
    "Merk: CLAP-scorene er relative likhetsscorer, IKKE sannsynligheter eller kalibrert sikkerhet.",
    "",
    "Antall i testgruppen: " + counts.evaluated,
    "Testet: " + counts.analyzed + " | Ikke testet: " + counts.notTested,
    "Forslag: " + counts.attempted + " | Usikkert: " + counts.abstained,
    "Eksakte samsvar: " + counts.correct + " | Feilaktige EDM-forslag: " + counts.wrongElectronic,
    "",
  ];
  for (const reference of references) {
    const trial = safe.find(x => x.entry.songId === reference.songId &&
      x.entry.axis === reference.axis);
    lines.push("Sang: " + reference.songTitle);
    lines.push("Bekreftet av eier: " + reference.referenceLabel + " (" + reference.axis + ")");
    if (!trial) {
      lines.push("Resultat: Ikke testet", "");
      continue;
    }
    const result = trial.result;
    lines.push("Resultat: " + (result.predictedLabel || "Usikkert – ingen bestemt etikett"));
    lines.push("Sangdeler enige: " + result.sectionsAgree + "/" + result.sectionsAnalyzed);
    lines.push("Sangdeler, beste forslag: " + (result.sectionLeaders.join(" | ") || "ikke registrert"));
    lines.push("Gjennomsnittsmargin: " + result.margin.toFixed(3));
    lines.push("Beste alternativer: " + result.alternatives.map(x =>
      x.label + " " + x.score.toFixed(3)).join(", "));
    lines.push("Stemmer med eier: " + (result.predictedLabel === reference.referenceLabel ? "ja" : "nei"));
    lines.push("");
  }
  return lines.join("\n").trim();
}
