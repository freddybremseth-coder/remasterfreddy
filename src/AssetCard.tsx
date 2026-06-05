import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { AdminImage, deleteImageBankEntry } from "./lib/admin-api";

interface AssetCardProps {
  image: AdminImage;
  onDeleted: (id: string) => void;
}

export default function AssetCard({ image, onDeleted }: AssetCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    const label = image.name || "bildet";
    if (!window.confirm(`Fjerne ${label} fra bildebanken?`)) return;

    setDeleting(true);
    setError("");
    try {
      await deleteImageBankEntry(image.id);
      onDeleted(image.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Kunne ikke fjerne bildet.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="asset-card">
      <div className="asset-preview">
        <img src={image.thumbnail_url || image.url} alt={image.name || image.kind} loading="lazy" />
        <span>{image.kind}</span>
      </div>
      <div className="asset-meta">
        <strong>{image.name || "Uten navn"}</strong>
        <small>Brukt {image.use_count || 0} ganger</small>
      </div>
      <button className="asset-delete" type="button" onClick={remove} disabled={deleting} title="Fjern fra bildebanken">
        {deleting ? <Loader2 className="admin-spinner" size={15} /> : <Trash2 size={15} />}
      </button>
      {error && <small className="asset-error">{error}</small>}
    </article>
  );
}
