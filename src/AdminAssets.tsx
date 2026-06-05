import { useEffect, useState } from "react";
import { Image, Loader2, RefreshCw } from "lucide-react";
import { AdminImage, ImageKind, loadImageBank } from "./lib/admin-api";
import "./admin-assets.css";

const filters: Array<{ id: "all" | ImageKind; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "image", label: "Bilder" },
  { id: "logo", label: "Logoer" },
  { id: "thumbnail", label: "Thumbnails" },
];

export default function AdminAssets() {
  const [images, setImages] = useState<AdminImage[]>([]);
  const [filter, setFilter] = useState<"all" | ImageKind>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh(kind: "all" | ImageKind = filter) {
    setLoading(true);
    setError("");
    try {
      setImages(await loadImageBank(kind === "all" ? undefined : kind));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente bildebanken.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh(filter);
  }, [filter]);

  return (
    <section className="admin-card assets-panel">
      <div className="assets-header">
        <div>
          <p className="admin-eyebrow">Visuelle ressurser</p>
          <h2>Bildebank</h2>
          <p>Gjenbruk bilder, logoer og thumbnails i Re-Master Freddy-pipelinen.</p>
        </div>
        <button className="admin-secondary" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      <div className="assets-filters">
        {filters.map((item) => (
          <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <div className="admin-error assets-message">{error}</div>}

      <div className="assets-grid">
        {loading && images.length === 0 ? (
          <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Henter bildebank …</div>
        ) : images.length === 0 ? (
          <div className="admin-empty"><Image size={24} /> Ingen bilder i denne kategorien.</div>
        ) : (
          images.map((image) => (
            <article className="asset-card" key={image.id}>
              <div className="asset-preview">
                <img src={image.thumbnail_url || image.url} alt={image.name || image.kind} loading="lazy" />
                <span>{image.kind}</span>
              </div>
              <div className="asset-meta">
                <strong>{image.name || "Uten navn"}</strong>
                <small>Brukt {image.use_count || 0} ganger</small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
