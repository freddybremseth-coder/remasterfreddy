import { ChangeEvent, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { AdminImage, ImageKind, uploadImageAsset } from "./lib/admin-api";

interface AssetUploadProps {
  onUploaded: (image: AdminImage) => void;
}

export default function AssetUpload({ onUploaded }: AssetUploadProps) {
  const [kind, setKind] = useState<ImageKind>("image");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");
    setError("");
    try {
      const image = await uploadImageAsset(file, kind);
      onUploaded(image);
      setMessage("Bildet er lagt til i bildebanken.");
      event.target.value = "";
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Bildeopplastingen feilet.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="asset-upload-control">
      <select value={kind} onChange={(event) => setKind(event.target.value as ImageKind)} disabled={uploading}>
        <option value="image">Vanlig bilde</option>
        <option value="logo">Logo</option>
        <option value="thumbnail">Thumbnail</option>
      </select>
      <label className="admin-primary asset-upload-button">
        {uploading ? <Loader2 className="admin-spinner" size={16} /> : <Upload size={16} />}
        Last opp bilde
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
      </label>
      {message && <small className="asset-success">{message}</small>}
      {error && <small className="asset-error">{error}</small>}
    </div>
  );
}
