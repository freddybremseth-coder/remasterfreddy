import { useEffect, useRef, useState } from "react";
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
  const [audioUrl, setAudioUrl] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectVersion = useRef(0);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
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
    const version = ++selectVersion.current;
    if (audioRef.current) audioRef.current.pause();
    setAudioUrl("");
    setPlayhead(0);
    // A newly selected file must invalidate approval of the old soundtrack.
    onClearTiming();
    setFileName(file?.name || "");
    setDuration(null);
    setStarts([]);
    setError("");
    setNote("");
    if (!file) { setBusy(false); return; }
    if (typeof URL.createObjectURL !== "function") {
      setError("Denne nettleseren støtter ikke lokal lydavspilling.");
      return;
    }
    setAudioUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const analyzed = await analyzeLocalAudioFile(file);
      if (version !== selectVersion.current) return;
      setDuration(analyzed.duration);
      setStarts(analyzed.starts);
    } catch (e) {
      if (version === selectVersion.current) setError(e instanceof Error ? e.message : "Lokal lydanalyse mislyktes.");
    } finally {
      if (version === selectVersion.current) setBusy(false);
    }
  }

  function seek(time: number) {
    if (!audioRef.current || duration === null) return;
    const bounded = Math.max(0, Math.min(duration, time));
    audioRef.current.currentTime = bounded;
    setPlayhead(bounded);
  }

  function setSceneAtPlayhead(index: number) {
    if (index === 0 || duration === null) return;
    editStart(index, String(Math.round(playhead * 10) / 10));
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
      {audioUrl && (
        <div className="storyboard-audio-player">
          <label htmlFor="storyboard-local-audio"><strong>Lytt til sangen og finn sceneskiftene</strong></label>
          <audio id="storyboard-local-audio" ref={audioRef} controls preload="metadata"
            src={audioUrl}
            onTimeUpdate={event => setPlayhead(event.currentTarget.currentTime)}
            onSeeked={event => setPlayhead(event.currentTarget.currentTime)} />
          {duration !== null && (
            <>
              <label htmlFor="storyboard-audio-position">Avspillingsposisjon: {formatSceneTime(playhead)} / {formatSceneTime(duration)}</label>
              <input id="storyboard-audio-position" type="range" min="0" max={duration} step="0.1"
                value={Math.min(duration, playhead)}
                onChange={event => seek(Number(event.target.value))} />
              <div className="storyboard-audio-track" aria-label="Scenegrenser langs sangen">
                {starts.slice(1).map((time, i) => (
                  <button key={i + 1} type="button" aria-label={`Hopp til scene ${i + 2}`}
                    title={`Scene ${i + 2}: ${formatSceneTime(time)}`}
                    className="storyboard-audio-track-marker"
                    style={{ left: `${time / duration * 100}%` }}
                    onClick={() => seek(time)} />
                ))}
                <div aria-hidden="true" className="storyboard-audio-track-playhead"
                  style={{ left: `${playhead / duration * 100}%` }} />
              </div>
              <p>Avspillingen bruker kun den valgte lydfilen i nettleseren. Hopp til en scene med markørene, eller bruk avspillingsposisjonen som ny scenestart.</p>
            </>
          )}
        </div>
      )}
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
                {i > 0 && <button className="admin-secondary" type="button"
                  aria-label={`Sett start for scene ${i + 1} ved avspillingsposisjonen`}
                  onClick={() => setSceneAtPlayhead(i)}>
                  Sett ved avspilling
                </button>}
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
