import { useState } from "react";
import { analyzeLocalAudioFile } from "./lib/local-audio-scene-cues";

export function formatSceneTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return "–";
  const total = Math.floor(time);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function LocalAudioSceneTiming() {
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [starts, setStarts] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function selectAudio(file: File | undefined) {
    setFileName(file?.name || "");
    setDuration(null);
    setStarts([]);
    setError("");
    setNote("");
    if (!file) return;
    setBusy(true);
    try {
      const analyzed = await analyzeLocalAudioFile(file);
      setDuration(analyzed.duration);
      setStarts(analyzed.starts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lokal lydanalyse mislyktes.");
    } finally {
      setBusy(false);
    }
  }

  function editStart(index: number, value: string) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || !duration || index === 0) return;
    const next = starts.slice();
    next[index] = Math.round(seconds * 10) / 10;
    if (next[index] <= next[index - 1] || next[index] >= (next[index + 1] ?? duration)) {
      setNote("Tidspunktet må være senere enn forrige og tidligere enn neste scene.");
      return;
    }
    setStarts(next);
    setNote("Endret i lokal forhåndsvisning. Tidsmarkørene er ennå ikke koblet til videorendereren.");
  }

  return (
    <div className="storyboard-audio-timing">
      <strong>Gratis forslag til sceneskift fra lydfil</strong>
      <p>Velg sangens MP3 eller annen lydfil på datamaskinen. Nettleseren analyserer lokale endringer i lydstyrke og foreslår åtte tidspunkter. Filen lastes ikke opp av denne funksjonen. Dette identifiserer ikke sikkert vers eller refreng.</p>
      <label className="storyboard-audio-picker">
        <span>Velg lydfil for lokal analyse</span>
        <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" disabled={busy}
          onChange={event => void selectAudio(event.target.files?.[0])} />
      </label>
      {busy && <p role="status">Analyserer lyd lokalt …</p>}
      {error && <p role="alert">{error}</p>}
      {duration !== null && starts.length === 8 && (
        <>
          <p role="status"><strong>{fileName}</strong> · Sanglengde {formatSceneTime(duration)} · 8 foreslåtte scenestarter</p>
          <div className="storyboard-audio-timeline" aria-label="Foreslåtte tidsmarkører">
            {starts.map((time, i) => (
              <label key={i}>
                <span>Scene {i + 1}</span>
                {i === 0 ? <strong>0:00</strong> : (
                  <input type="number" aria-label={`Starttid scene ${i + 1}`}
                    value={time} min={0} max={Math.floor(duration)} step="0.1"
                    onChange={event => editStart(i, event.target.value)} />
                )}
                <small>{formatSceneTime(time)}</small>
              </label>
            ))}
          </div>
          <p>Dette er en kontrollvisning. Dagens videopipeline bruker fortsatt egen scenefordeling; tidspunktene sendes ikke til renderer eller YouTube.</p>
        </>
      )}
      {note && <p role="status">{note}</p>}
    </div>
  );
}
