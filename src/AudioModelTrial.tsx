import { useEffect, useRef, useState } from "react";
import type { AdminSong } from "./lib/admin-api";
import type { VerifiedAudioReference, IndependentAudioPrediction } from "./lib/genre-classification-benchmark";
import { compareModelWithOwner } from "./lib/genre-classification-benchmark";
import { CLAP_MODEL_ID, CLAP_MODEL_LICENSE, interpretClapOutput } from "./lib/browser-clap-labels";
import type { BrowserClapReply } from "./lib/browser-clap-client";
import { prepareBrowserClapAudio } from "./lib/browser-clap-client";

type Result = ReturnType<typeof interpretClapOutput>;
type Run = { entry: VerifiedAudioReference; result: Result };
const axisName = { genre: "sjanger", mood: "stemning", style: "stil" };

interface Props {
  songs: readonly AdminSong[];
  references: readonly VerifiedAudioReference[];
}

/**
 * Explicitly-clicked, temporary local experiment; never writes to DB.
 * Only 48kHz PCM + target axis reaches the browser Worker. No genre
 * ground truth, title, lyrics, legacy labels or YouTube data reach the model.
 */
export default function AudioModelTrial({ songs, references }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef(0);
  const [running, setRunning] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Run[]>([]);

  useEffect(() => () => {
    abortRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  function stop() {
    abortRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
    abortRef.current = null;
    jobIdRef.current++;
    setRunning(null);
    setStatus("Testen er avbrutt. Ingen forslag er lagret.");
    setPercent(null);
  }

  async function run(entry: VerifiedAudioReference) {
    if (running || !references.some(x => x.songId === entry.songId)) return;
    const song = songs.find(x => x.id === entry.songId);
    if (!song?.audioUrl) {
      setError("Denne sangen har ingen tilgjengelig MP3.");
      return;
    }
    const id = ++jobIdRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(entry.songId);
    setError("");
    setStatus("Henter 10 sekunder lyd fra egen Supabase-bank …");
    setPercent(null);
    try {
      const audio = await prepareBrowserClapAudio(song.audioUrl, controller.signal);
      if (id !== jobIdRef.current || controller.signal.aborted) return;
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./workers/clap-audio.worker.ts", import.meta.url), {
          type: "module",
        });
      }
      const worker = workerRef.current;
      worker.onerror = () => {
        if (id !== jobIdRef.current) return;
        setError("Kunne ikke starte lydmodellen. Prøv en nyere nettleser eller en datamaskin med mer minne.");
        setRunning(null);
        worker.terminate();
        workerRef.current = null;
      };
      worker.onmessage = (event: MessageEvent<BrowserClapReply>) => {
        if (id !== jobIdRef.current || !event.data || event.data.id !== id) return;
        if (event.data.type === "progress") {
          setStatus(event.data.step);
          setPercent(typeof event.data.percent === "number" ? event.data.percent : null);
        } else if (event.data.type === "error") {
          setError(event.data.message);
          setRunning(null);
          setPercent(null);
        } else if (event.data.type === "result") {
          const interpreted = interpretClapOutput(entry.axis, event.data.scores);
          setResults(previous => [...previous.filter(x => x.entry.songId !== entry.songId),
            { entry, result: interpreted }]);
          setStatus("Lokal lydanalyse fullført. Resultatet er ikke lagret.");
          setRunning(null);
          setPercent(null);
        }
      };
      setStatus("Starter nettlesermodellen (første gang: omtrent 160 MB nedlasting) …");
      worker.postMessage({ type: "classify", id, axis: entry.axis, audio }, [audio.buffer]);
    } catch (e) {
      if (id !== jobIdRef.current || controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Kunne ikke lese MP3 i nettleseren.");
      setRunning(null);
    } finally {
      if (id === jobIdRef.current) abortRef.current = null;
    }
  }

  const predictions: IndependentAudioPrediction[] = results.map(x => ({
    songId: x.entry.songId, axis: x.entry.axis, predictedLabel: x.result.predictedLabel,
  }));
  const comparison = compareModelWithOwner(references, predictions);

  return (
    <section className="admin-genre-clap" aria-label="Lokal lydmodelltest">
      <strong>Prøv en ekte lydmodell – gratis i din egen nettleser</strong>
      <p>Modell: <b>{CLAP_MODEL_ID}</b> ({CLAP_MODEL_LICENSE}).
        Første gang lastes omtrent 160 MB modellfiler ned fra Hugging Face.
        Lyd hentes fra din Supabase-bank og analyseres <b>lokalt i nettleseren</b>.
        Ingen lyd sendes til en ekstern AI-tjeneste og ingen betalt API brukes.</p>
      <p>Velg én sang om gangen. Modellen får bare 10 sekunder med lyd og hvilken type
        analyse som ønskes – ikke sangnavn, tidligere sjanger eller dine fasitsvar.
        Likhetsscore er <b>ikke</b> en prosentvis sikkerhetsvurdering.
        På langsom mobil eller med lite minne kan modellen feile.</p>
      <ul className="admin-genre-clap-list">
        {references.map(entry => {
          const prior = results.find(result => result.entry.songId === entry.songId);
          const isRunning = running === entry.songId;
          const guess = prior?.result.predictedLabel;
          return (
            <li key={entry.songId}>
              <div>
                <b>{entry.songTitle}</b>
                <small>Din fasit: {entry.referenceLabel} · {axisName[entry.axis]}</small>
              </div>
              <button type="button" className="admin-secondary" disabled={Boolean(running)}
                onClick={() => { void run(entry); }}>
                {isRunning ? "Analyserer …" : prior ? "Test på nytt" : "Analyser lyd lokalt"}
              </button>
              {prior && (
                <div className="admin-genre-clap-result">
                  <strong>{!guess ? "Usikkert – ingen sjanger tvunget frem" :
                    guess === entry.referenceLabel ? "Samsvar med din fasit" : "Modellforslaget avviker fra din fasit"}</strong>
                  <span>Forslag: {guess || "Avstår"}. Avstand til nest høyeste: {prior.result.margin.toFixed(3)}.</span>
                  <small>Alternativer: {prior.result.alternatives.map(item =>
                    item.label + " (" + item.score.toFixed(3) + ")").join(" · ")}</small>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {running && (
        <div role="status" className="admin-genre-clap-status">
          {status}
          {percent !== null && <progress max={100} value={percent} aria-label="Nedlasting av modell" />}
          <button type="button" className="admin-secondary" onClick={stop}>
            Avbryt testen
          </button>
        </div>
      )}
      {error && <p role="alert" className="admin-genre-save-error">{error}</p>}
      {!running && status && !error && <small role="status">{status}</small>}
      <div className="admin-genre-clap-summary" role="status">
        <strong>{comparison.analyzed} av {references.length} sanger er analysert.</strong>
        <small>Modellen ga et forslag på {comparison.attempted} av disse.
          Eksakte treff: {comparison.correct}.
          Usikre analyser (avstår): {comparison.abstained}.
          Ikke testet: {comparison.notTested}.
          Feilaktige EDM-forslag på sjangeraksen: {comparison.wrongElectronic}.</small>
        <small>Modellen er foreløpig kun en eksperimentell sammenligning.
          Forslag er ikke bekreftede fakta og endrer aldri dine sjangre.</small>
      </div>
      <small>Modellforslagene finnes bare på denne siden frem til den lukkes.
        Ingen sanger, bilder eller YouTube-data oppdateres.</small>
    </section>
  );
}
