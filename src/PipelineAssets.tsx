import { useEffect, useState } from "react";
import { Image, Images, Loader2, RefreshCw, Upload } from "lucide-react";
import { AdminImage, ImageKind, loadImageBank, PipelineOptions } from "./lib/admin-api";
import "./pipeline-assets.css";

interface PipelineAssetsProps {
  value: PipelineOptions;
  onChange: (value: PipelineOptions) => void;
  refreshToken?: number;
  onOpenImageBank: (kind: ImageKind) => void;
}

function assetPreview(item?: AdminImage) {
  if (!item) return null;
  return (
    <div className="pipeline-selected-preview">
      <img src={item.thumbnail_url || item.url} alt={item.name || item.kind} loading="lazy" />
      <span>{item.name || (item.kind === "logo" ? "Logo" : "Thumbnail")}</span>
    </div>
  );
}

function EmptyAssetState({
  icon,
  message,
  action,
  onClick,
}: {
  icon: "image" | "upload";
  message: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="pipeline-empty">
      {icon === "image" ? <Image size={18} /> : <Upload size={18} />}
      <span>{message}</span>
      <button className="admin-secondary" type="button" onClick={onClick}>{action}</button>
    </div>
  );
}

export default function PipelineAssets({ value, onChange, refreshToken = 0, onOpenImageBank }: PipelineAssetsProps) {
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
  }, [refreshToken]);

  const selectedImages = new Set(value.customImageUrls || []);
  const logos = images.filter((item) => item.kind === "logo");
  const thumbnails = images.filter((item) => item.kind === "thumbnail");
  const slides = images.filter((item) => item.kind === "image");
  const selectedLogo = logos.find((item) => item.url === value.logoUrl);
  const selectedThumbnail = thumbnails.find((item) => item.url === value.customThumbnailUrl);

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

      <div className="pipeline-asset-counts" aria-label="Tilgjengelige visuelle ressurser">
        <span><Images size={14} /> {slides.length} slideshow-bilder</span>
        <span><Image size={14} /> {logos.length} logoer</span>
        <span><Image size={14} /> {thumbnails.length} thumbnails</span>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="pipeline-asset-selects">
        <div className="pipeline-asset-field">
          <label>
            <span>Logo</span>
            <select value={value.logoUrl || ""} onChange={(event) => onChange({ ...value, logoUrl: event.target.value || undefined })}>
              <option value="">Ingen egen logo</option>
              {logos.map((item) => <option key={item.id} value={item.url}>{item.name || "Logo"}</option>)}
            </select>
          </label>
          {selectedLogo ? assetPreview(selectedLogo) : logos.length === 0 ? (
            <EmptyAssetState
              icon="upload"
              message="Ingen logoer er lastet opp"
              action="Gå til Bildebank og last opp logo"
              onClick={() => onOpenImageBank("logo")}
            />
          ) : (
            <small className="pipeline-default-note">Standardvalg: Ingen egen logo</small>
          )}
        </div>

        <div className="pipeline-asset-field">
          <label>
            <span>Thumbnail</span>
            <select value={value.customThumbnailUrl || ""} onChange={(event) => onChange({ ...value, customThumbnailUrl: event.target.value || undefined })}>
              <option value="">AI-generert thumbnail</option>
              {thumbnails.map((item) => <option key={item.id} value={item.url}>{item.name || "Thumbnail"}</option>)}
            </select>
          </label>
          {selectedThumbnail ? assetPreview(selectedThumbnail) : thumbnails.length === 0 ? (
            <EmptyAssetState
              icon="upload"
              message="Ingen egne thumbnails er lastet opp"
              action="Gå til Bildebank og last opp thumbnail"
              onClick={() => onOpenImageBank("thumbnail")}
            />
          ) : (
            <small className="pipeline-default-note">Standardvalg: AI-generert thumbnail</small>
          )}
        </div>
      </div>

      <div className="pipeline-slide-grid">
        {slides.length === 0 ? (
          <EmptyAssetState
            icon="image"
            message="Ingen slideshow-bilder er lastet opp"
            action="Gå til Bildebank og last opp bilder"
            onClick={() => onOpenImageBank("image")}
          />
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
