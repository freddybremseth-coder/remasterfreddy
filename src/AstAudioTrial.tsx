import { useEffect, useRef, useState } from "react";
import type { AdminSong } from "./lib/admin-api";
import type { VerifiedAudioReference } from "./lib/genre-classification-benchmark";
import { AST_MODEL_ID, AST_MODEL_LICENSE, summarizeAstEvidence } from "./lib/browser-ast-evidence";
import type { AstSectionScores } from "./lib/browser-ast-evidence";
import { prepareBrowserAstAudioSegments } from "./lib/browser-clap-client";

interface Props { songs: readonly AdminSong[]; references: readonly VerifiedAudioReference[]; }
type Reply =
  | { type: "progress"; id: number; step: string; percent?: number }
  | { type: "result"; id: number; sections: AstSectionScores[] }
  | { type: "error"; id: number; message: string };

type Evidence = ReturnType<typeof summarizeAstEvidence>;
const groups = [
  { id: "genres", label: "Brede musikkategorier" },
  { id: "instruments", label: "Instrumenter og arrangement" },
  { id: "vocals", label: "Sang og stemmer" },
] as const;

/** Research only: no song writes, visual changes, or publishing. */
export default function AstAudioTrial({ songs, references }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const [selectedId, setSelectedId] = useState(references[0]?.songId || "");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [results, setResults] = useState<Record<string, Evidence>>({});
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => () => {
    controllerRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const selected = references.find(item => item.songId === selectedId);
  const result = selected ? results[selected.songId] : undefined;

  function stop() {
    idRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    setPercent(null);
    setStatus("AST-test avbrutt. Ingen informasjon er lagret.");
  }

  async function inspect() {
    if (running || !selected) return;
    const song = songs.find(item => item.id === selected.songId);
    if (!song?.audioUrl) { setError("Sangen mangler tilgjengelig MP3."); return; }
    const job = ++idRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError("");
    setCopyMessage("");
    setStatus("Henter tre korte lydutdrag lokalt fra Supabase …");
    setPercent(null);
    try {
      const clips = await prepareBrowserAstAudioSegments(song.audioUrl, controller.signal);
      if (job !== idRef.current || controller.signal.aborted) return;
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL("./workers/ast-audio.worker.ts", import.meta.url), {
          type: "module",
        });
      }
      const worker = workerRef.current;
      worker.onerror = () => {
        if (job !== idRef.current) return;
        setError("AST kunne ikke starte. Bruk en oppdatert nettleser med nok minne.");
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.onmessage = (event: MessageEvent<Reply>) => {
        if (job !== idRef.current || event.data?.id !== job) return;
        if (event.data.type === "progress") {
          setStatus(event.data.step);
          setPercent(typeof event.data.percent === "number" ? event.data.percent : null);
        } else if (event.data.type === "error") {
          setError(event.data.message);
          setRunning(false);
          setPercent(null);
        } else if (event.data.type === "result") {
          setResults(old => ({ ...old, [song.id]: summarizeAstEvidence(event.data.sections) }));
          setStatus("Uavhengig lydkontroll fullført. Ingen sjanger ble oppdatert.");
          setRunning(false);
          setPercent(null);
        }
      };
      setStatus("Laster AST-modellen (~91 MB første gang) …");
      worker.postMessage({ type: "inspect", id: job, audioClips: clips },
        clips.map(clip => clip.buffer));
    } catch (reason) {
      if (job !== idRef.current || controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Kunne ikke hente lydutdrag.");
      setRunning(false);
    } finally {
      if (job === idRef.current) controllerRef.current = null;
    }
  }

  async function copyReport() {
    const lines = [
      "RE-MASTER FREDDY — AST UAVHENGIG LYDKONTROLL",
      "Modell: " + AST_MODEL_ID + " | Lisens: " + AST_MODEL_LICENSE,
      "Tre lokale 16 kHz lydutdrag; lydbeskrivelser er IKKE sjangerfasit.",
      "Ingen lydfiler eller MP3-adresser er inkludert.",
    ];
    for (const entry of references) {
      const evidence = results[entry.songId];
      if (!evidence) continue;
      lines.push("", "Sang: " + entry.songTitle,
        "Eierbekreftet: " + entry.referenceLabel + " (" + entry.axis + ")");
      for (const group of groups) {
        const tags = evidence[group.id].map(x =>
          x.label + " (score " + x.score.toFixed(3) + ", deler " +
          x.sections + "/" + evidence.sections + ")");
        lines.push(group.label + ": " + (tags.join("; ") || "ingen blant topp 50"));
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyMessage("AST-rapporten er kopiert. Lim den inn her for sammenligning.");
    } catch {
      setCopyMessage("Nettleseren blokkerte kopiering. Resultatene er fortsatt synlige.");
    }
  }

  return <section className="admin-ast-trial" aria-label="Uavhengig AST-lydkontroll">
    <strong>Uavhengig lydkontroll – MIT AudioSet AST (eksperimentell)</strong>
    <p>AST kjenner igjen brede musikkategorier og instrumenter, men er <b>ikke</b> en presis
      sjangerklassifikator. Den laster ned omtrent 91 MB første gang og analyserer lokalt
      i nettleseren. Modell: {AST_MODEL_ID} ({AST_MODEL_LICENSE}).</p>
    <p>Velg én sang. Ingen lyd sendes til en betalt AI-tjeneste. Resultatene endrer ikke
      bekreftede sjangre, videomotiver, MP3 eller YouTube.</p>
    <div className="admin-ast-actions">
      <select aria-label="Velg sang for uavhengig lydkontroll" disabled={running}
        value={selected?.songId || ""} onChange={event => {
          setSelectedId(event.target.value); setError(""); setCopyMessage("");
        }}>
        {references.map(entry =>
          <option key={entry.songId} value={entry.songId}>{entry.songTitle}</option>)}
      </select>
      <button type="button" className="admin-secondary"
        disabled={running || !selected} onClick={() => { void inspect(); }}>
        {running ? "Undersøker lyden …" : result ? "Kjør AST på nytt" : "Undersøk lyden med AST"}
      </button>
    </div>
    {selected && <small>Eierens fasit: {selected.referenceLabel} ({selected.axis}). Den sendes ikke til modellen.</small>}
    {running && <div role="status" className="admin-ast-progress">
      {status}
      {percent !== null && <progress max={100} value={percent} aria-label="AST-nedlasting" />}
      <button type="button" className="admin-secondary" onClick={stop}>Avbryt</button>
    </div>}
    {error && <p role="alert" className="admin-genre-save-error">{error}</p>}
    {!running && status && !error && <small role="status">{status}</small>}
    {result && <div className="admin-ast-results">
      <strong>Lydbeskrivelser fra {result.sections} deler av sangen</strong>
      {groups.map(group => <div key={group.id} className="admin-ast-result-group">
        <b>{group.label}</b>
        {result[group.id].length ? <ul>
          {result[group.id].map(tag => <li key={tag.label}>
            {tag.label} – score {tag.score.toFixed(3)}, blant topp 50 i {tag.sections}/{result.sections} utdrag
          </li>)}
        </ul> : <small>Ingen etiketter fra denne gruppen blant de 50 høyest rangerte.</small>}
      </div>)}
      <small>Modellen kan finne flere lyder samtidig. Score er ikke dokumentert sikkerhet,
        og fravær fra topp 50 utelukker ingen musikksjanger.</small>
    </div>}
    {Object.keys(results).length > 0 && <div className="admin-ast-export">
      <button type="button" className="admin-secondary" onClick={() => { void copyReport(); }}>
        Kopier AST-testresultater
      </button>
      {copyMessage && <small role="status">{copyMessage}</small>}
    </div>}
    <small>Dette er kun en undersøkelse. Ingen automatisk sjangermerking, lagring eller publisering.
      Ved bytte av visning frigjøres modellen fra nettleserens arbeidsminne.</small>
  </section>;
}
