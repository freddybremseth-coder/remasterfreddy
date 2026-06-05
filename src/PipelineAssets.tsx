import { useEffect, useState } from "react";
import { Image, Loader2, RefreshCw } from "lucide-react";
import { AdminImage, loadImageBank, PipelineOptions } from "./lib/admin-api";
import "./pipeline-assets.css";

interface PipelineAssetsProps {
  value: PipelineOptions;
  onChange: (value: PipelineOptions) => void;
}

export default function PipelineAssets({ value, onChange }: PipelineAssetsProps) {
  const [images, setImages] = useState<AdminImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setImages(await loadImageBank());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente bildebanken.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedImages = new Set(value.customImageUrls || []);
  const logos = images.filter((item) => item.kind === "logo");
  const thumbnails = images.filter((item) => item.kind === "thumbnail");
  const slides = images.filter((item) => item.kind === "image");

  function toggleSlide(url: string) {
    const next = new Set(selectedImages);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    onChange({ ...value, customImageUrls: Array.from(next) });
  }

  return (
    <div className="pipeline-assets">
      <div className="pipeline-assets-header">
        <div>
          <strong>Visuelle valg</strong>
          <span>Velg bilder som skal brukes i videoen.</span>
        </div>
        <button className="admin-secondary" type="button" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={15} /> : <RefreshCw size={15} />}
          Oppdater
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="pipeline-asset-selects">
        <label>
          <span>Logo</span>
          <select value={value.logoUrl || ""} onChange={(event) => onChange({ ...value, logoUrl: event.target.value || undefined })}>
            <option value="">Ingen egen logo</option>
            {logos.map((item) => <option key={item.id} value={item.url}>{item.name || "Logo"}</option>)}
          </select>
        </label>
        <label>
          <span>Thumbnail</span>
          <select value={value.customThumbnailUrl || ""} onChange={(event) => onChange({ ...value, customThumbnailUrl: event.target.value || undefined })}>
            <option value="">AI-generert thumbnail</option>
            {thumbnails.map((item) => <option key={item.id} value={item.url}>{item.name || "Thumbnail"}</option>)}
          </select>
        </label>
      </div>

      <div className="pipeline-slide-grid">
        {slides.length === 0 ? (
          <div className="pipeline-empty"><Image size={18} /> Ingen slideshow-bilder i bildebanken.</div>
        ) : (
          slides.map((item) => (
            <button key={item.id} type="button" className={selectedImages.has(item.url) ? "selected" : ""} onClick={() => toggleSlide(item.url)}>
              <img src={item.thumbnail_url || item.url} alt={item.name || "Slideshow"} loading="lazy" />
              <span>{item.name || "Bilde"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
