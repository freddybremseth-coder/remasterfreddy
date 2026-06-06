import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BrainCircuit, CheckCircle2, Loader2, RefreshCw, Target } from "lucide-react";
import AutopilotControl from "./AutopilotControl";
import RecommendationCard from "./RecommendationCard";
import RecommendationHistory from "./RecommendationHistory";
import { loadRecommendations } from "./lib/recommendations";
import type { RecommendationBundle } from "./lib/recommendations";
import "./admin-recommendations.css";

export default function AdminRecommendations() {
  const [bundle, setBundle] = useState<RecommendationBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setBundle(await loadRecommendations());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente anbefalingene.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const recommendations = bundle?.recommendations || [];
  const highPriorityCount = useMemo(
    () => recommendations.filter((item) => item.priority === "critical" || item.priority === "high").length,
    [recommendations],
  );

  return (
    <section className="admin-card recommendations-panel">
      <div className="recommendations-header">
        <div>
          <p className="admin-eyebrow">Manuell godkjenningskø</p>
          <h2>Smarte anbefalinger</h2>
          <p>AI foreslår tiltak, men ingenting utføres før du godkjenner det.</p>
        </div>
        <button className="admin-secondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      {error && (
        <div className="admin-error recommendations-message">
          <AlertCircle size={17} />
          {error}
        </div>
      )}

      <AutopilotControl />

      <div className="recommendations-summary">
        <article>
          <BrainCircuit size={21} />
          <span>Kanalhelse</span>
          <strong>{bundle?.channelHealth?.score || 0}/100</strong>
          <small>{bundle?.channelHealth?.summary || "Ingen analyse ennå"}</small>
        </article>
        <article>
          <Target size={21} />
          <span>Høy prioritet</span>
          <strong>{highPriorityCount}</strong>
          <small>Av {recommendations.length} anbefalinger</small>
        </article>
        <article>
          <CheckCircle2 size={21} />
          <span>Engasjement</span>
          <strong>{(bundle?.stats?.engagementRate || 0).toFixed(2)}%</strong>
          <small>{bundle?.stats?.videoCount || 0} analyserte videoer</small>
        </article>
      </div>

      <div className="recommendations-goals">
        <article>
          <h3>Hurtiggevinster</h3>
          <ul>
            {(bundle?.quickWins || []).slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </article>
        <article>
          <h3>Mål denne uken</h3>
          <ul>
            {(bundle?.weeklyGoals || []).slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </article>
      </div>

      <div className="recommendations-list">
        {loading && recommendations.length === 0 ? (
          <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Analyserer kanalen …</div>
        ) : recommendations.length === 0 ? (
          <div className="admin-empty"><CheckCircle2 size={24} /> Ingen nye anbefalinger.</div>
        ) : (
          recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onExecuted={refresh}
            />
          ))
        )}
      </div>

      <RecommendationHistory items={bundle?.actionHistory || []} />
    </section>
  );
}
