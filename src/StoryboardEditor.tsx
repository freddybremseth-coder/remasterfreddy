import "./storyboard-editor.css";

interface Props {
  songTitle: string;
  scenes: string[];
  approved: boolean;
  onChangeScene: (index: number, text: string) => void;
  onApprove: () => void;
  onDiscard: () => void;
}

export function isValidStoryboard(scenes: string[]): boolean {
  if (scenes.length !== 8) return false;
  const clean = scenes.map(scene => scene.trim().replace(/\s+/g, " "));
  return clean.every(scene => scene.length >= 25 && scene.length <= 1000) &&
    new Set(clean.map(scene => scene.toLocaleLowerCase())).size === 8;
}

/** Text-only preview: images and final video are generated only after explicit approval. */
export default function StoryboardEditor({ songTitle, scenes, approved, onChangeScene, onApprove, onDiscard }: Props) {
  const valid = isValidStoryboard(scenes);
  return (
    <section className="storyboard-editor" aria-label={`Storyboard for ${songTitle}`}>
      <div className="storyboard-editor-heading">
        <div>
          <strong>Storyboard: {songTitle}</strong>
          <p>Gratis tekstutkast · 8 scener · Ingen bilder eller video er laget ennå.</p>
        </div>
        <span className="storyboard-editor-status">{approved ? "Godkjent" : "Utkast"}</span>
      </div>
      <p>Endre motiv, karakterer, miljø eller handling i hver scene. Scenene sendes til bildegeneratoren akkurat slik du godkjenner dem.</p>
      <ol className="storyboard-scene-grid">
        {scenes.map((scene, index) => (
          <li key={index}>
            <label htmlFor={`storyboard-scene-${index}`}>Scene {index + 1}</label>
            <textarea
              id={`storyboard-scene-${index}`}
              aria-label={`Scene ${index + 1}`}
              value={scene}
              maxLength={1000}
              rows={4}
              onChange={event => onChangeScene(index, event.target.value)}
            />
          </li>
        ))}
      </ol>
      {!valid && <p className="storyboard-editor-error" role="alert">Alle åtte scener må være ulike og ha 25–1000 tegn.</p>}
      <div className="storyboard-editor-actions">
        <button className="admin-primary" type="button" disabled={!valid || approved} onClick={onApprove}>
          {approved ? "Storyboard godkjent" : "Godkjenn 8 scener"}
        </button>
        <button className="admin-secondary" type="button" onClick={onDiscard}>Lukk utkastet</button>
      </div>
      {approved && <p className="storyboard-editor-confirmation">Klart for produksjon. Klikk «Lag video» ved sangen for å starte bilde- og videogenerering.</p>}
    </section>
  );
}
