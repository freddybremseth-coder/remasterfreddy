import { useEffect, useState } from "react";
import { BarChart3, Eye, Loader2, RefreshCw, ThumbsUp, TrendingUp, Users, Video } from "lucide-react";
import { ChannelAnalytics, loadChannelAnalytics } from "./lib/admin-api";
import "./admin-analytics.css";

function formatNumber(value?: number) {
  return new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export default function AdminAnalytics() {
  const [data, setData] = useState<ChannelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadChannelAnalytics());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente kanalstatistikken.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const metrics = data?.metrics;
  const channel = data?.channel;
  const analysis = data?.analysis;

  return (
    <section className="admin-card analytics-panel">
      <div className="analytics-header">
        <div>
          <p className="admin-eyebrow">YouTube performance</p>
          <h2>Kanalstatistikk</h2>
          <p>{channel?.title || "Re-Master Freddy"} – faktiske kanaldata og AI-analyse.</p>
        </div>
        <button className="admin-secondary" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      {error && <div className="admin-error analytics-message">{error}</div>}

      <div className="analytics-metrics">
        <article><Users size={21} /><span>Abonnenter</span><strong>{formatNumber(channel?.subscriberCount)}</strong></article>
        <article><Eye size={21} /><span>Totale visninger</span><strong>{formatNumber(metrics?.totalViews || channel?.viewCount)}</strong></article>
        <article><Video size={21} /><span>Videoer</span><strong>{formatNumber(metrics?.videoCount || channel?.videoCount)}</strong></article>
        <article><ThumbsUp size={21} /><span>Engasjement</span><strong>{(metrics?.engagementRate || 0).toFixed(2)}%</strong></article>
        <article><BarChart3 size={21} /><span>Snittvisninger</span><strong>{formatNumber(metrics?.avgViews)}</strong></article>
        <article><TrendingUp size={21} /><span>AI-score</span><strong>{analysis?.overallScore || 0}/100</strong></article>
      </div>

      <div className="analytics-grid">
        <article className="analytics-section">
          <h3>Raskest voksende videoer</h3>
          <div className="analytics-video-list">
            {(data?.fastestGrowing || []).slice(0, 5).map((video) => (
              <a key={video.id} href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">
                {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : <div className="analytics-thumb" />}
                <span><strong>{video.title}</strong><small>{formatNumber(video.viewsPerDay)} visninger/dag</small></span>
              </a>
            ))}
          </div>
        </article>

        <article className="analytics-section">
          <h3>AI-vurdering</h3>
          <p className="analytics-summary">{analysis?.summary || "AI-analysen er ikke tilgjengelig ennå."}</p>
          <div className="analytics-points">
            {(analysis?.actionItems || []).slice(0, 5).map((item, index) => (
              <div key={`${item.action}-${index}`}>
                <span data-priority={item.priority}>{item.priority}</span>
                <p><strong>{item.action}</strong><small>{item.expectedImpact}</small></p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
