import type { PipelineOptions } from "./lib/admin-api";
import "./pipeline-video-direction.css";

interface Props {
  value: PipelineOptions;
  onChange: (value: PipelineOptions) => void;
}

/** Optional song-specific direction; leaving it empty asks the engine to plan the visuals. */
export default function PipelineVideoDirection({ value, onChange }: Props) {
  return (
    <section className="pipeline-video-direction" aria-label="Videotema og AI-regi">
      <div className="video-direction-heading">
        <div>
          <strong>Videotema og AI-regi</strong>
          <span>Hver sang skal få sin egen visuelle historie, ikke en fast sommer- eller disco-mal.</span>
        </div>
        <span className="video-direction-mode">{value.visualTheme?.trim() ? "Ditt tema + AI" : "Automatisk AI-regi"}</span>
      </div>
      <label>
        <span>Hva skal videoen handle om? (valgfritt)</span>
        <textarea
          aria-label="Videotema"
          rows={3}
          maxLength={500}
          value={value.visualTheme || ""}
          onChange={event => onChange({ ...value, visualTheme: event.target.value })}
          placeholder="F.eks. en mann som reiser seg etter motgang, mørke fjell, storm, morgenlys og til slutt håp. Realistisk film, ingen neon eller DJ."
        />
      </label>
      <small>
        La feltet stå tomt for automatisk regi ut fra tittel, sjanger, stemning og tilgjengelig sanginformasjon.
        Eget tema styrer motivvalg og fargepalett.
      </small>
      <details className="video-direction-details">
        <summary>Legg til sangtekst for bedre historiefortelling</summary>
        <label>
          <span>Sangtekst eller kort sammendrag (valgfritt)</span>
          <textarea
            aria-label="Sangtekst eller sammendrag"
            rows={5}
            maxLength={5000}
            value={value.songLyrics || ""}
            onChange={event => onChange({ ...value, songLyrics: event.target.value })}
            placeholder="Lim inn teksten, eller beskriv sangens budskap, vendepunkter og refreng."
          />
        </label>
        <small>
          Teksten brukes som kreativ kontekst i denne kjøringen. Systemet analyserer foreløpig ikke
          selve MP3-lyden for å finne handling eller tekst.
        </small>
      </details>
      {(value.visualTheme || value.songLyrics) && (
        <button
          type="button"
          className="admin-secondary video-direction-clear"
          onClick={() => onChange({ ...value, visualTheme: "", songLyrics: "" })}
        >
          Tøm videotema og sangtekst
        </button>
      )}
    </section>
  );
}
