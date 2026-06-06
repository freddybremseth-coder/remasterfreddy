import { CheckCircle2, Clock3, History, XCircle } from "lucide-react";
import type { RecommendationActionHistory } from "./lib/recommendations";
import "./recommendation-history.css";

interface RecommendationHistoryProps {
  items: RecommendationActionHistory[];
}

function statusLabel(status: RecommendationActionHistory["status"]) {
  switch (status) {
    case "planned": return "Planlagt";
    case "ready": return "Klar";
    case "published": return "Publisert";
    case "completed": return "Fullført";
    case "failed": return "Feilet";
    default: return status;
  }
}

function actionLabel(actionType: string) {
  switch (actionType) {
    case "update_metadata": return "Metadata";
    case "create_content": return "Nytt innhold";
    case "schedule": return "Publiseringsplan";
    case "strategy": return "Strategi";
    default: return actionType.replace(/_/g, " ");
  }
}

function statusIcon(status: RecommendationActionHistory["status"]) {
  if (status === "completed" || status === "published") return <CheckCircle2 size={16} />;
  if (status === "failed") return <XCircle size={16} />;
  return <Clock3 size={16} />;
}

function relevantDate(item: RecommendationActionHistory) {
  return item.executed_at || item.reviewed_at || item.created_at;
}

export default function RecommendationHistory({ items }: RecommendationHistoryProps) {
  return (
    <section className="recommendation-history">
      <div className="recommendation-history-header">
        <div>
          <p className="admin-eyebrow">RealtyFlow growth_actions</p>
          <h3>Utføringshistorikk</h3>
          <p>Godkjente og utførte tiltak lagret i det eksisterende RealtyFlow-schemaet.</p>
        </div>
        <span><History size={17} /> {items.length} tiltak</span>
      </div>

      {items.length === 0 ? (
        <div className="recommendation-history-empty">
          <History size={21} />
          Ingen tiltak er godkjent ennå.
        </div>
      ) : (
        <div className="recommendation-history-list">
          {items.slice(0, 20).map((item) => (
            <article key={item.id}>
              <div className={`history-status status-${item.status}`}>
                {statusIcon(item.status)}
              </div>
              <div className="history-copy">
                <div>
                  <strong>{item.content}</strong>
                  <span>{actionLabel(item.action_type)}</span>
                </div>
                {item.expected_outcome && <p>{item.expected_outcome}</p>}
                <small>{new Date(relevantDate(item)).toLocaleString("nb-NO")}</small>
              </div>
              <span className={`history-status-label status-${item.status}`}>
                {statusLabel(item.status)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
