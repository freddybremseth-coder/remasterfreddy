import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { getAdminSession } from "./lib/supabase";

type Counters = { viewCount: number; likeCount: number; commentCount: number };
type Measurement = {
  actionId: string;
  videoId: string;
  baseline: Counters & { observedAt: string };
  current: Counters | null;
  currentObservedAt: string | null;
  elapsedDays: number;
  change: { views: number; likes: number; comments: number } | null;
  milestoneEligibility: { day7: boolean; day14: boolean; day30: boolean };
  measurementType: "cumulative_observation";
};

function number(value: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0, signDisplay: "always" }).format(value);
}

export default function AdminGrowthMeasurements() {
  const [rows, setRows] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const session = await getAdminSession();
      if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
      const response = await fetch("/api/neural-beat-growth-measurements", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kunne ikke hente resultatmålingene.");
      setRows(Array.isArray(data.entries) ? data.entries : []);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke hente resultatmålingene.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="admin-card analytics-panel" aria-label="Før og etter YouTube-tiltak">
      <div className="analytics-header">
        <div>
          <p className="admin-eyebrow">Målbare endringer</p>
          <h2>Før og etter tiltak</h2>
          <p>Faktiske, kumulative YouTube-tall etter metadataendringer. Dette viser utvikling, ikke dokumentert årsak.</p>
        </div>
        <button type="button" className="admin-secondary" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />} Oppdater
        </button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {loaded && rows.length === 0 && <p>Ingen nye tiltak med registrerte før-tall ennå. Målingen starter ved neste metadataendring.</p>}
      {rows.length > 0 && (
        <div className="analytics-video-list">
          {rows.slice(0, 30).map((row) => (
            <article key={row.actionId} className="analytics-section">
              <h3><a href={`https://www.youtube.com/watch?v=${row.videoId}`} target="_blank" rel="noreferrer">YouTube-video {row.videoId}</a></h3>
              <p>{row.elapsedDays.toFixed(1)} dager siden førmålingen · Start: {row.baseline.viewCount.toLocaleString("nb-NO")} visninger</p>
              {row.current && row.change ? (
                <p><strong>{row.current.viewCount.toLocaleString("nb-NO")} visninger ({number(row.change.views)})</strong> · Likerklikk {number(row.change.likes)} · Kommentarer {number(row.change.comments)}</p>
              ) : <p>Videoens oppdaterte tall er ikke tilgjengelige.</p>}
              <small>7 dager: {row.milestoneEligibility.day7 ? "passert" : "venter"} · 14 dager: {row.milestoneEligibility.day14 ? "passert" : "venter"} · 30 dager: {row.milestoneEligibility.day30 ? "passert" : "venter"}. Egne historiske målepunkter kommer senere.</small>
            </article>
          ))}
        </div>
      )}
      {loading && !loaded && <p>Henter før- og ettermålinger …</p>}
    </section>
  );
}
