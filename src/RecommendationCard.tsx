import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { executeRecommendation, Recommendation } from "./lib/recommendations";

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function execute() {
    const confirmed = window.confirm(
      `Utføre tiltaket «${recommendation.title}»?\n\n${recommendation.description}`,
    );
    if (!confirmed) return;

    setRunning(true);
    setResult("");
    setError("");
    try {
      const response = await executeRecommendation(recommendation.action);
      setResult(response.message || response.plan || "Tiltaket er utført.");
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : "Tiltaket kunne ikke utføres.");
    } finally {
      setRunning(false);
    }
  }

  const metadataAction = recommendation.action.type === "update_metadata";

  return (
    <article className="recommendation-card">
      <div className="recommendation-card-header">
        <div>
          <span className={`recommendation-priority priority-${recommendation.priority}`}>{recommendation.priority}</span>
          <h3>{recommendation.title}</h3>
        </div>
        <span className="recommendation-effort">{recommendation.effort}</span>
      </div>

      <p>{recommendation.description}</p>
      <div className="recommendation-impact"><strong>Forventet effekt:</strong> {recommendation.impact}</div>

      {metadataAction && (
        <div className="recommendation-change-preview">
          {recommendation.action.currentTitle && (
            <div><small>Nåværende tittel</small><span>{recommendation.action.currentTitle}</span></div>
          )}
          {recommendation.action.newTitle && (
            <div><small>Ny tittel</small><strong>{recommendation.action.newTitle}</strong></div>
          )}
          {recommendation.action.newTags && recommendation.action.newTags.length > 0 && (
            <div><small>Nye tags</small><span>{recommendation.action.newTags.join(", ")}</span></div>
          )}
          {recommendation.action.videoId && (
            <a href={`https://www.youtube.com/watch?v=${recommendation.action.videoId}`} target="_blank" rel="noreferrer">
              Se video <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      {result && <div className="recommendation-result"><CheckCircle2 size={16} />{result}</div>}
      {error && <div className="admin-error recommendation-error">{error}</div>}

      <button className="admin-primary recommendation-run" type="button" onClick={execute} disabled={running}>
        {running ? <Loader2 className="admin-spinner" size={16} /> : <PlayCircle size={16} />}
        Utfør etter godkjenning
      </button>
    </article>
  );
}
