import { useState } from "react";
import { analyzeLocalAudioFile, isValidSceneTiming } from "./lib/local-audio-scene-cues";
import type { StoryboardSceneTiming } from "./lib/admin-api";

export function formatSceneTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return "–";
  const total = Math.floor(time);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

interface Props {
  approvedTiming?: StoryboardSceneTiming;
  onApplyTiming: (timing: StoryboardSceneTiming) => void;
  onClearTiming: () => void;
}

export default function LocalAudioSceneTiming({ approvedTiming, onApplyTiming, onClearTiming }: Props) {
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [starts, setStarts] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const candidate = duration === null ? null : { durationSeconds: duration, startsSeconds: starts };
  const validCandidate = isValidSceneTiming(candidate);
  const isCurrentPlan = Boolean(approvedTiming && validCandidate &&
    JSON.stringify(approvedTiming) === JSON.stringify(candidate));

  async function selectAudio(file: File | undefined) {
    // A newly selected file must invalidate approval of the old soundtrack.
    onClearTiming();
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
    if (next[index] - next[index - 1] < 1 ||
        (next[index + 1] ?? duration) - next[index] < 1) {
      setNote("Scenene må ha minst ett sekund mellom hvert skift.");
      return;
    }
    onClearTiming();
    setStarts(next);
    setNote("Tidspunktene er endret. Bruk planen og godkjenn storyboardet på nytt.");
  }

  return (
    <div className="storyboard-audio-timing">
      <strong>Gratis forslag til sceneskift fra lydfil</strong>
      <p>Velg nøyaktig samme sanginnspilling som allerede ligger i køen. Nettleseren foreslår åtte sceneskift basert på lokal lydenergi. Filen lastes ikke opp av denne funksjonen. Dette identifiserer ikke sikkert vers eller refreng.</p>
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
          <div className="storyboard-audio-timing-actions">
            <button className="admin-secondary" type="button"
              disabled={!validCandidate || isCurrentPlan}
              onClick={() => {
                if (!isValidSceneTiming(candidate)) return;
                onApplyTiming({ durationSeconds: candidate.durationSeconds, startsSeconds: [...candidate.startsSeconds] });
                setNote("Tidsplanen er lagt til storyboardet. Godkjenn alle scenene på nytt før video.");
              }}>
              {isCurrentPlan ? "Tidspunkter lagt til" : "Bruk tidspunktene i videoen"}
            </button>
            {!validCandidate && <span role="alert">Alle åtte scenene må ha minst ett sekund mellom starttidene og slutten av sangen.</span>}
          </div>
          <p>Etter godkjenning bruker videorendereren disse starttidene med cirka 0,25 sekunders tidsoppløsning. Systemet kontrollerer sanglengden på serveren før betalt produksjon, men dette er ikke automatisk takt- eller refrenganalyse.</p>
        </>
      )}
      {note && <p role="status">{note}</p>}
    </div>
  );
}
