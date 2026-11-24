import { useState } from "react";
import LocalAudioSceneTiming from "./LocalAudioSceneTiming";
import type { StoryboardSceneTiming } from "./lib/admin-api";
import { applyMusicSectionCues, readMusicSectionCues, MUSIC_SECTIONS, MUSIC_PLAN_PRESETS, SCENE_CAMERA_PLAN, musicSectionLabels, type MusicSection } from "./lib/storyboard-music-sections";
import "./storyboard-editor.css";

const sceneStages = [
  "Åpning", "Detalj", "Utvikling", "Stemning",
  "Vendepunkt", "Høydepunkt", "Avslutning", "Siste bilde",
] as const;

interface Props {
  songTitle: string;
  scenes: string[];
  approved: boolean;
  imageUrls?: string[];
  imagesSaved?: boolean;
  onChangeScene: (index: number, text: string) => void;
  onApplyContinuity: (note: string) => void;
  onApplyMusicSections: (sections: MusicSection[]) => void;
  sceneTiming?: StoryboardSceneTiming;
  onApplyTiming: (timing: StoryboardSceneTiming) => void;
  onClearTiming: () => void;
  onApprove: () => void;
  onDiscard: () => void;
}

export function isValidStoryboard(scenes: string[]): boolean {
  if (scenes.length !== 8) return false;
  const clean = scenes.map(scene => scene.trim().replace(/\s+/g, " "));
  return clean.every(scene => scene.length >= 25 && scene.length <= 1000) &&
    new Set(clean.map(scene => scene.toLocaleLowerCase())).size === 8;
}

/** No image/model calls. Keeps the author's exact text and appends a shared visual anchor only once. */
export function applyContinuityNote(scenes: string[], rawNote: string): string[] | null {
  if (scenes.length !== 8 || scenes.some(scene => typeof scene !== "string")) return null;
  const note = rawNote.trim().replace(/\s+/g, " ");
  if (note.length < 8 || note.length > 250) return null;
  const addition = ` Faste visuelle detaljer: ${note}`;
  const updated = scenes.map(scene => {
    const trimmed = scene.trim();
    return trimmed.toLocaleLowerCase().includes(note.toLocaleLowerCase())
      ? trimmed
      : `${trimmed}${addition}`;
  });
  return updated.some(scene => scene.length > 1000) || !isValidStoryboard(updated) ? null : updated;
}

/** Text-only continuity review: no generated images, no AI credits and no paid rendering. */
export default function StoryboardEditor({
  songTitle, scenes, approved, imageUrls = [], imagesSaved = false, onChangeScene, onApplyContinuity, onApplyMusicSections,
  sceneTiming, onApplyTiming, onClearTiming, onApprove, onDiscard,
}: Props) {
  const [continuity, setContinuity] = useState("");
  const [musicSections, setMusicSections] = useState<MusicSection[]>(() => readMusicSectionCues(scenes));
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const valid = isValidStoryboard(scenes);
  const hasEightImages = imageUrls.length === 8 && new Set(imageUrls).size === 8;
  const hasTiming = Boolean(sceneTiming && sceneTiming.startsSeconds.length === 8);
  const displayTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const continuityResult = applyContinuityNote(scenes, continuity);
  const hasChanges = continuityResult !== null && continuityResult.some((scene, i) => scene !== scenes[i]);
  const canApply = !approved && hasChanges;
  const musicResult = applyMusicSectionCues(scenes, musicSections);
  const canApplyMusic = !approved && musicResult !== null && musicResult.some((scene, i) => scene !== scenes[i]);

  function applyMusicPlan() {
    if (!canApplyMusic) return;
    onApplyMusicSections(musicSections);
    setReviewMessage("Musikkdelene er lagt til i alle åtte sceneinstruksjonene. Kontroller teksten før godkjenning.");
  }

  function applyNote() {
    if (!canApply) return;
    onApplyContinuity(continuity);
    setReviewMessage("Felles detaljer er lagt til. Kontroller alle åtte scenene før godkjenning.");
  }

  return (
    <section className="storyboard-editor" aria-label={`Storyboard for ${songTitle}`}>
      <div className="storyboard-editor-heading">
        <div>
          <strong>Storyboard: {songTitle}</strong>
          <p>Gratis tekstutkast · 8 scener · Ingen bilder eller video er laget ennå.</p>
        </div>
        <span className="storyboard-editor-status">{approved ? "Godkjent" : "Utkast"}</span>
      </div>
      <p>Kontroller at personer, klær, steder og farger er gjennomgående. Dette er en tekstlig gjennomgang, ikke en AI-analyse av bilder.</p>

      <div className="storyboard-continuity">
        <label htmlFor="storyboard-continuity-note"><strong>Faste visuelle detaljer</strong> (valgfritt)</label>
        <p>Beskriv for eksempel samme person, olivenlund, klær og fargetoner. Legg beskrivelsen til i alle åtte scenene med ett klikk.</p>
        <textarea
          id="storyboard-continuity-note"
          value={continuity}
          maxLength={250}
          rows={2}
          placeholder="Samme eldre bonde i beige jakke, olivenlund ved Biar, naturlig lys og dempede jordfarger."
          onChange={event => { setContinuity(event.target.value); setReviewMessage(""); }}
        />
        <div className="storyboard-continuity-actions">
          <button type="button" className="admin-secondary" disabled={!canApply} onClick={applyNote}>
            Legg til i alle 8 scener
          </button>
          {continuity.trim() && !continuityResult && (
            <span role="alert">Beskrivelsen må være 8–250 tegn, og alle scenene må ha plass til teksten.</span>
          )}
        </div>
        {reviewMessage && <p role="status">{reviewMessage}</p>}
      </div>

      <div className="storyboard-music-plan">
        <strong>Musikkplan – intro, vers og refreng</strong>
        <p>Velg hvilken del av sangen hver scene skal illustrere. Dette er manuell kreativ regi, ikke automatisk lydanalyse eller nøyaktige tidsmarkører. Bildene fordeles fortsatt av eksisterende videopipeline.</p>
        <div className="storyboard-music-presets" role="group" aria-label="Forslag til musikalsk oppbygning">
          {MUSIC_PLAN_PRESETS.map(plan => (
            <button
              type="button"
              className="admin-secondary"
              key={plan.id}
              title={plan.description}
              disabled={approved}
              aria-pressed={musicSections.every((section, index) => section === plan.sections[index])}
              onClick={() => {
                setMusicSections([...plan.sections]);
                setReviewMessage("Musikkforslaget er valgt. Trykk «Legg musikkplanen til scenene» for å bruke det.");
              }}
            >
              {plan.label}
            </button>
          ))}
        </div>
        <small>Forslagene er dramaturgiske maler, ikke automatisk gjenkjenning av refrenget. Du kan endre hver scene før du bruker planen. Når du legger planen til, får hver scene også forskjellig forslag til kamerautsnitt og overgang. Dette er tekstinstruksjoner, ikke ferdig renderte effekter.</small>
        <div className="storyboard-music-grid">
          {musicSections.map((section, index) => (
            <div key={index}>
              <span>Musikkdel {index + 1}</span>
              <select
                aria-label={`Musikkdel scene ${index + 1}`}
                value={section}
                disabled={approved}
                onChange={event => {
                  const value = event.target.value as MusicSection;
                  setMusicSections(current => current.map((item, i) => i === index ? value : item));
                  setReviewMessage("");
                }}
              >
                {MUSIC_SECTIONS.map(item => <option value={item} key={item}>{musicSectionLabels[item]}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button type="button" className="admin-secondary" disabled={!canApplyMusic} onClick={applyMusicPlan}>
          Legg musikkplanen til scenene
        </button>
        {musicResult === null && <p role="alert">Musikkplanen får ikke plass i scenetekstene. Forkort en scene før du legger den til.</p>}
      </div>

      <LocalAudioSceneTiming scenes={scenes} approvedTiming={sceneTiming} onApplyTiming={onApplyTiming} onClearTiming={onClearTiming} />

      <section className="storyboard-image-plan" aria-label="Bilder og sceneskift før MP4">
        <div className="storyboard-image-plan-heading">
          <strong>Bilder og sceneskift i fullengdevideoen</strong>
          <span>{hasEightImages ? "8 bilder valgt" : `${imageUrls.length} av 8 bilder valgt`}</span>
        </div>
        <p>Dette er en planvisning med de valgte originalbildene, ikke en ferdig video.
          {hasTiming
            ? " Tidene kommer fra din godkjente sceneplan."
            : " Uten godkjente tidsmarkører fordeles scenene jevnt over sangen ved rendering."}
        </p>
        {!imagesSaved && <p className="storyboard-image-warning" role="status">Bildevalgene er ennå ikke lagret på sangen. Lagre og kontroller dem før MP4-produksjon.</p>}
        {!hasEightImages && <p className="storyboard-image-warning" role="status">Velg åtte forskjellige bilder for å vise nøyaktig bilde per scene.</p>}
        <div className="storyboard-image-grid">
          {scenes.map((_, index) => (
            <div className="storyboard-image-card" key={index}>
              {hasEightImages ? (
                <img src={imageUrls[index]} alt={`Valgt bilde til scene ${index + 1}`} loading="lazy" />
              ) : (
                <div className="storyboard-image-placeholder">Bilde {index + 1}</div>
              )}
              <div className="storyboard-image-card-copy">
                <strong>Scene {index + 1} · {musicSectionLabels[musicSections[index]]}</strong>
                <small>{hasTiming && sceneTiming
                  ? `${displayTime(sceneTiming.startsSeconds[index])}–${displayTime(index === 7 ? sceneTiming.durationSeconds : sceneTiming.startsSeconds[index + 1])}`
                  : "Tid beregnes ved rendering"}</small>
                <small>{SCENE_CAMERA_PLAN[index].label}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="storyboard-review-header">
        <strong>Se rekkefølgen</strong>
        <button type="button" className="admin-secondary" onClick={() => setShowAll(current => !current)}>
          {showAll ? "Vis én scene" : "Vis alle scener"}
        </button>
      </div>
      <div className="storyboard-timeline" aria-label="Sceneoversikt">
        {scenes.map((scene, index) => (
          <button
            type="button"
            className={selected === index ? "storyboard-timeline-item is-selected" : "storyboard-timeline-item"}
            aria-pressed={selected === index}
            key={index}
            onClick={() => { setSelected(index); setShowAll(false); }}
          >
            <span>Scene {index + 1}</span>
            <strong>{sceneStages[index]} · {musicSectionLabels[musicSections[index]]}</strong>
            <small>{SCENE_CAMERA_PLAN[index].label}</small>
            <small>{scene.trim().slice(0, 100)}{scene.trim().length > 100 ? "…" : ""}</small>
          </button>
        ))}
      </div>
      <ol className={showAll ? "storyboard-scene-grid" : "storyboard-scene-grid storyboard-scene-grid-single"}>
        {scenes.map((scene, index) => (
          (showAll || index === selected) && (
            <li key={index}>
              <label htmlFor={`storyboard-scene-${index}`}>Scene {index + 1} – {sceneStages[index]}</label>
              <textarea
                id={`storyboard-scene-${index}`}
                aria-label={`Scene ${index + 1}`}
                value={scene}
                maxLength={1000}
                rows={5}
                onChange={event => { setReviewMessage(""); onChangeScene(index, event.target.value); }}
              />
              <small>{scene.length} / 1000 tegn</small>
            </li>
          )
        ))}
      </ol>
      {!valid && <p className="storyboard-editor-error" role="alert">Alle åtte scener må være ulike og ha 25–1000 tegn.</p>}
      <div className="storyboard-editor-actions">
        <button className="admin-primary" type="button" disabled={!valid || approved} onClick={onApprove}>
          {approved ? "Storyboard godkjent" : "Godkjenn 8 scener"}
        </button>
        <button className="admin-secondary" type="button" onClick={onDiscard}>Lukk utkastet</button>
      </div>
      {approved && <p className="storyboard-editor-confirmation">
        Storyboard godkjent{sceneTiming ? " med musikkstyrte sceneskift" : ""}. Velg «Lag privat fullengdevideo» i feltet rett nedenfor. 16-sekunders testen er et eget alternativ.
      </p>}
    </section>
  );
}
