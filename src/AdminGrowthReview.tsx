import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { getAdminSession } from "./lib/supabase";

type TitleSuggestion = {
  videoId: string;
  currentTitle: string;
  titleSuggestion: { proposedTitle: string; status: "needs_approval" };
  seriesSuggestions: string[];
};

type GrowthBundle = {
  channelTitle: string;
  catalogMatchedVideos: number;
  titleSuggestions: TitleSuggestion[];
  seriesSuggestions: Array<{ videoId: string; currentTitle: string; seriesSuggestions: string[] }>;
  existingPlaylists: Array<{ playlistId: string; title: string; itemCount: number }>;
  relatedVideoReview: { status: string; pairs: unknown[] };
};

export default function AdminGrowthReview() {
  const [data, setData] = useState<GrowthBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const session = await getAdminSession();
      if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");
      const response = await fetch("/api/remaster-growth-packaging", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Kunne ikke hente vekstforslag.");
      setData(result as GrowthBundle);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kunne ikke hente vekstforslag.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <section className="admin-card recommendations-panel" aria-label="YouTube vekstforslag">
      <div className="recommendations-header">
        <div>
          <p className="admin-eyebrow">YouTube Growth · kun forslag</p>
          <h2>Vekstforslag for låter og Shorts</h2>
          <p>Bruker kun verifiserte Re-master-videoer og katalogdata. Ingen titler, spillelister eller Shorts endres her.</p>
        </div>
        <button type="button" className="admin-secondary" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />} Oppdater
        </button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {data && <>
        <p><strong>{data.catalogMatchedVideos}</strong> kataloglåter funnet på {data.channelTitle}. Alle forslag krever vurdering.</p>
        <h3>Forslag til mer søkbare titler</h3>
        {data.titleSuggestions.length === 0 ? <p>Ingen sikre tittelforslag ennå.</p> :
          <ul>{data.titleSuggestions.slice(0, 12).map((item) =>
            <li key={item.videoId}>
              <strong>{item.titleSuggestion.proposedTitle}</strong>
              <small style={{ display: "block" }}>Nå: {item.currentTitle} · Avventer godkjenning</small>
              <a href={`https://studio.youtube.com/video/${item.videoId}/edit`} target="_blank" rel="noreferrer">Åpne i YouTube Studio <ExternalLink size={13} /></a>
            </li>
          )}</ul>}
        <h3>Gjenkjennelige innholdsserier</h3>
        {data.seriesSuggestions.length === 0 ? <p>Ingen låter med dokumentert serietilknytning ennå.</p> :
          <ul>{data.seriesSuggestions.slice(0, 12).map((item) =>
            <li key={item.videoId}><strong>{item.currentTitle}</strong> – {item.seriesSuggestions.join(", ")}</li>
          )}</ul>}
        <h3>Eksisterende spillelister</h3>
        <ul>{data.existingPlaylists.slice(0, 12).map((item) =>
          <li key={item.playlistId}><a href={`https://www.youtube.com/playlist?list=${item.playlistId}`} target="_blank" rel="noreferrer">{item.title}</a> ({item.itemCount} videoer)</li>
        )}</ul>
        <h3>Shorts til hele låter</h3>
        <p>Eksakt Short→fullversjon-kobling må kontrolleres. Dette panelet melder ikke lenker som opprettet uten bekreftelse fra YouTube Studio.</p>
      </>}
      {loading && !data && <p>Henter vekstforslag …</p>}
    </section>
  );
}
