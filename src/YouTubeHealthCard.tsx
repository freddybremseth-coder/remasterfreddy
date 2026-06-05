import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, Youtube } from "lucide-react";
import { loadYouTubeHealth, YouTubeHealth } from "./lib/youtube-health";
import "./youtube-health-card.css";

interface YouTubeHealthCardProps {
  onHealthChange?: (health: YouTubeHealth | null) => void;
}

function formatNumber(value?: number) {
  return new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export default function YouTubeHealthCard({ onHealthChange }: YouTubeHealthCardProps) {
  const [health, setHealth] = useState<YouTubeHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await loadYouTubeHealth();
      setHealth(result);
      onHealthChange?.(result);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Kunne ikke kontrollere YouTube-tilkoblingen.";
      setError(message);
      setHealth(null);
      onHealthChange?.(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const connected = Boolean(health?.connected && health.channel?.id);

  return (
    <section className={`youtube-health-card ${connected ? "is-connected" : "is-disconnected"}`}>
      <div className="youtube-health-icon">
        {loading ? <Loader2 className="admin-spinner" size={23} /> : connected ? <CheckCircle2 size={23} /> : <AlertTriangle size={23} />}
      </div>

      <div className="youtube-health-copy">
        <div className="youtube-health-title">
          <Youtube size={18} />
          <strong>{connected ? "YouTube er tilkoblet" : "YouTube må kontrolleres"}</strong>
        </div>

        {loading ? (
          <p>Kontrollerer Re-Master Freddy-kanalen …</p>
        ) : error ? (
          <p>{error}</p>
        ) : connected ? (
          <>
            <p>
              Kanal: <strong>{health?.channel?.title}</strong> · {formatNumber(health?.channel?.subscriberCount)} abonnenter · {formatNumber(health?.channel?.videoCount)} videoer
            </p>
            <small>
              Brand: {health?.brandId || "remasterfreddy"}
              {health?.tokenSource ? ` · Kilde: ${health.tokenSource}` : ""}
              {health?.checkedAt ? ` · Kontrollert ${new Date(health.checkedAt).toLocaleString("nb-NO")}` : ""}
            </small>
          </>
        ) : (
          <>
            <p>{health?.message || "Ingen gyldig Re-Master Freddy-tilkobling ble funnet."}</p>
            <small>Videoproduksjon er deaktivert til riktig kanal er tilkoblet.</small>
          </>
        )}
      </div>

      <div className="youtube-health-actions">
        <button className="admin-secondary" type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={15} />
          Kontroller
        </button>
        {!connected && health?.reconnectUrl && (
          <a className="admin-primary youtube-reconnect" href={health.reconnectUrl} target="_blank" rel="noreferrer">
            Koble til på nytt
            <ExternalLink size={15} />
          </a>
        )}
      </div>
    </section>
  );
}
