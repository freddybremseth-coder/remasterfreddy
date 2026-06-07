import { useEffect, useRef, useState } from "react";
import { Image, Loader2, RefreshCw } from "lucide-react";
import AssetCard from "./AssetCard";
import AssetUpload from "./AssetUpload";
import { AdminImage, ImageKind, loadImageBank } from "./lib/admin-api";
import "./admin-assets.css";
import "./admin-assets-responsive.css";
import "./admin-assets-actions.css";

const filters: Array<{ id: "all" | ImageKind; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "image", label: "Bilder" },
  { id: "logo", label: "Logoer" },
  { id: "thumbnail", label: "Thumbnails" },
];

interface AdminAssetsProps {
  intent?: { kind: ImageKind; id: number } | null;
  onImageBankChanged?: () => void;
}

export default function AdminAssets({ intent, onImageBankChanged }: AdminAssetsProps) {
  const [images, setImages] = useState<AdminImage[]>([]);
  const [filter, setFilter] = useState<"all" | ImageKind>("all");
  const [uploadKind, setUploadKind] = useState<ImageKind>("image");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!intent) return;
    setFilter(intent.kind);
    setUploadKind(intent.kind);
    window.requestAnimationFrame(() => {
      uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [intent?.id]);

  function handleUploaded(image: AdminImage) {
    setUploadKind(image.kind);
    if (filter !== "all" && filter !== image.kind) {
      setFilter(image.kind);
      setImages([image]);
    } else {
      setImages((items) => [image, ...items.filter((item) => item.id !== image.id)]);
    }
    onImageBankChanged?.();
  }

  function handleDeleted(id: string) {
    setImages((items) => items.filter((item) => item.id !== id));
    onImageBankChanged?.();
  }

  return (
    <section className="admin-card assets-panel">
      <div className="assets-header">
        <div>
          <p className="admin-eyebrow">Visuelle ressurser</p>
          <h2>Bildebank</h2>
          <p>Last opp og gjenbruk bilder, logoer og thumbnails i Re-Master Freddy-pipelinen.</p>
        </div>
        <button className="admin-secondary" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
          Oppdater
        </button>
      </div>

      <div className="assets-toolbar">
        <div className="assets-filters">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => {
                setFilter(item.id);
                if (item.id !== "all") setUploadKind(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div ref={uploadRef}>
          <AssetUpload onUploaded={handleUploaded} presetKind={uploadKind} />
        </div>
      </div>

      {error && <div className="admin-error assets-message">{error}</div>}

      <div className="assets-grid">
        {loading && images.length === 0 ? (
          <div className="admin-empty"><Loader2 className="admin-spinner" size={24} /> Henter bildebank …</div>
        ) : images.length === 0 ? (
          <div className="admin-empty"><Image size={24} /> Ingen bilder i denne kategorien.</div>
        ) : (
          images.map((image) => (
            <AssetCard key={image.id} image={image} onDeleted={handleDeleted} />
          ))
        )}
      </div>
    </section>
  );
}
