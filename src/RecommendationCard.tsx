import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, Loader2, PlayCircle } from "lucide-react";
import { executeRecommendation } from "./lib/recommendations";
import type { Recommendation, RecommendationExecution } from "./lib/recommendations";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onExecuted?: () => void | Promise<void>;
}

function statusLabel(status?: RecommendationExecution["status"]) {
  switch (status) {
    case "planned": return "Planlagt";
    case "ready": return "Klar";
    case "published": return "Publisert";
    case "completed": return "Fullført";
    case "failed": return "Feilet";
    default: return "Ikke utført";
  }
}

export default function RecommendationCard({ recommendation, onExecuted }: RecommendationCardProps) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [execution, setExecution] = useState<RecommendationExecution | null>(recommendation.execution || null);

  useEffect(() => {
    setExecution(recommendation.execution || null);
  }, [recommendation.execution]);

  const locked = Boolean(execution && ["planned", "ready", "published", "completed"].includes(execution.status));

  async function execute() {
    if (locked) return;
    const confirmed = window.confirm(
      `Utføre tiltaket «${recommendation.title}»?\n\n${recommendation.description}`,
    );
    if (!confirmed) return;

    setRunning(true);
    setResult("");
    setError("");
    try {
      const response = await executeRecommendation(recommendation);
      setResult(response.message || response.plan || "Tiltaket er utført.");
      if (response.history) {
        setExecution({
          historyId: response.history.id,
          status: response.history.status,
          reviewedAt: response.history.reviewed_at,
          executedAt: response.history.executed_at,
        });
      }
      await onExecuted?.();
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : "Tiltaket kunne ikke utføres.");
    } finally {
      setRunning(false);
    }
  }

  const metadataAction = recommendation.action.type === "update_metadata";

  return (
    <article className={`recommendation-card ${locked ? "recommendation-locked" : ""}`}>
      <div className="recommendation-card-header">
        <div>
          <span className={`recommendation-priority priority-${recommendation.priority}`}>{recommendation.priority}</span>
          <h3>{recommendation.title}</h3>
        </div>
        <div className="recommendation-status-stack">
          <span className="recommendation-effort">{recommendation.effort}</span>
          <span className={`recommendation-execution status-${execution?.status || "new"}`}>
            {execution?.status === "completed" || execution?.status === "published"
              ? <CheckCircle2 size={13} />
              : <Clock3 size={13} />}
            {statusLabel(execution?.status)}
          </span>
        </div>
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
          {recommendation.action.newDescription && (
            <div><small>Ny beskrivelse</small><span>{recommendation.action.newDescription}</span></div>
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

      {execution?.executedAt && (
        <small className="recommendation-timestamp">
          Utført {new Date(execution.executedAt).toLocaleString("nb-NO")}
        </small>
      )}
      {!execution?.executedAt && execution?.reviewedAt && (
        <small className="recommendation-timestamp">
          Godkjent {new Date(execution.reviewedAt).toLocaleString("nb-NO")}
        </small>
      )}

      {result && <div className="recommendation-result"><CheckCircle2 size={16} />{result}</div>}
      {error && <div className="admin-error recommendation-error">{error}</div>}

      <button
        className="admin-primary recommendation-run"
        type="button"
        onClick={execute}
        disabled={running || locked}
      >
        {running ? <Loader2 className="admin-spinner" size={16} /> : locked ? <CheckCircle2 size={16} /> : <PlayCircle size={16} />}
        {locked ? statusLabel(execution?.status) : "Utfør etter godkjenning"}
      </button>
    </article>
  );
}
