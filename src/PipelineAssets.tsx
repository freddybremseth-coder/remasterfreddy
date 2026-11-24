import { useEffect, useState } from "react";
import { Image, Images, Loader2, RefreshCw, Upload } from "lucide-react";
import { AdminImage, ImageKind, loadImageBank, loadRemasterVisualLibrary, type RemasterVisualSource, PipelineOptions } from "./lib/admin-api";
import "./pipeline-assets.css";

interface PipelineAssetsProps {
  value: PipelineOptions;
  onChange: (value: PipelineOptions) => void;
  refreshToken?: number;
  onOpenImageBank: (kind: ImageKind) => void;
  onSaveSelection?: () => void;
  savingSelection?: boolean;
  saveSelectionDisabled?: boolean;
  selectionSaved?: boolean;
  imageSaveMessage?: string;
  onCheckSelection?: () => void;
  checkingSelection?: boolean;
  checkSelectionDisabled?: boolean;
  imageCheckMessage?: string;
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

export default function PipelineAssets({
  value, onChange, refreshToken = 0, onOpenImageBank,
  onSaveSelection, savingSelection = false, saveSelectionDisabled = false,
  selectionSaved = false, imageSaveMessage,
  onCheckSelection, checkingSelection = false, checkSelectionDisabled = false, imageCheckMessage,
}: PipelineAssetsProps) {
  const [images, setImages] = useState<AdminImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<RemasterVisualSource>("mine");
  const [genre, setGenre] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [libraryPage, setLibraryPage] = useState(0);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [libraryImages, setLibraryImages] = useState<AdminImage[]>([]);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");

  useEffect(() => {
    if (source === "mine") {
      setLibraryImages([]);
      setLibraryTotal(0);
      setLibraryLoading(false);
      setLibraryError("");
      return;
    }
    let cancelled = false;
    setLibraryLoading(true);
    setLibraryError("");
    loadRemasterVisualLibrary({
      source, genre: source === "music" ? genre : undefined,
      search: searchTerm, page: libraryPage, limit: 24,
    }).then(result => {
      if (cancelled) return;
      setLibraryTotal(result.total);
      setLibraryImages(current => libraryPage === 0
        ? result.images
        : [...current, ...result.images.filter(next => !current.some(old => old.id === next.id))]);
    }).catch(err => {
      if (!cancelled) setLibraryError(err instanceof Error ? err.message : "Kunne ikke laste bildene.");
    }).finally(() => { if (!cancelled) setLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [source, genre, searchTerm, libraryPage, refreshToken, libraryRefresh]);

  function chooseSource(next: RemasterVisualSource) {
    setSource(next);
    setLibraryImages([]);
    setLibraryPage(0);
    setSearchInput("");
    setSearchTerm("");
  }

  function searchLibrary() {
    setLibraryImages([]);
    setLibraryPage(0);
    setSearchTerm(searchInput.trim());
    setLibraryRefresh(n => n + 1);
  }


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
  const visibleSlides = source === "mine"
    ? slides.filter(item => !searchTerm || (item.name || "").toLowerCase().includes(searchTerm.toLowerCase()))
    : libraryImages;
  const visibleCount = source === "mine" ? visibleSlides.length : libraryTotal;
  const selectedLogo = logos.find((item) => item.url === value.logoUrl);
  const selectedThumbnail = thumbnails.find((item) => item.url === value.customThumbnailUrl);

  const [imageLimitMessage, setImageLimitMessage] = useState("");
  function toggleSlide(url: string) {
    const next = new Set(selectedImages);
    if (next.has(url)) {
      next.delete(url);
    } else if (next.size >= 8) {
      setImageLimitMessage("Maks åtte bilder kan velges per video. Fjern et bilde før du velger et nytt.");
      return;
    } else {
      next.add(url);
    }
    setImageLimitMessage("");
    onChange({ ...value, customImageUrls: Array.from(next) });
  }

  return (
    <div className="pipeline-assets">
      <div className="pipeline-assets-header">
        <div>
          <strong>Visuelle valg</strong>
          <span>Velg bilder som skal brukes i videoen.</span>
        </div>
        <button className="admin-secondary" type="button" onClick={() => {
          void refresh();
          setLibraryRefresh(n => n + 1);
        }} disabled={loading || libraryLoading}>
          {loading || libraryLoading ? <Loader2 className="admin-spinner" size={15} /> : <RefreshCw size={15} />}
          Oppdater
        </button>
      </div>

      <section className="pipeline-openart-option" aria-label="Valgfrie OpenArt-bilder">
        <div>
          <strong>Vil du bruke filmatiske AI-bilder?</strong>
          <p>OpenArt er valgfritt. Lag ett og ett bilde i RealtyFlow Bilde Studio med eget samtykke til kredittbruk, og send godkjente bilder direkte til Re-Master-bildebanken. Video krever et godkjent storyboard og valgte bilder, men OpenArt er valgfritt.</p>
          <p>OpenArt-kreditter og eurokostnad må kontrolleres hos leverandøren. Målbudsjettet er 10 € per måned; dette skjermbildet kan ikke håndheve en kontoomfattende beløpsgrense.</p>
        </div>
        <a className="admin-secondary" target="_blank" rel="noopener noreferrer"
          href="https://realtyflow.chatgenius.pro/image-studio?source=remaster&provider=openart">
          Åpne OpenArt bildestudio
        </a>
        <small>Etter at bildene er sendt til Re-Master: Klikk «Oppdater» over og velg de nye bildene nedenfor.</small>
      </section>

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

      <div className="pipeline-library-controls">
        <label>
          <span>Bildesamling</span>
          <select aria-label="Bildesamling" value={source} onChange={event => chooseSource(event.target.value as RemasterVisualSource)}>
            <option value="mine">Mine valgte Re-master-bilder</option>
            <option value="music">Musikkbilder – disco, rock og andre sjangre</option>
            <option value="art">Kunstgalleri – forhåndsvisninger</option>
            <option value="other">Andre egne bilder fra Supabase</option>
          </select>
        </label>
        {source === "music" && (
          <label>
            <span>Musikksjanger</span>
            <select aria-label="Musikksjanger" value={genre} onChange={event => {
              setGenre(event.target.value);
              setLibraryPage(0);
              setLibraryImages([]);
            }}>
              <option value="all">Alle sjangre</option>
              <option value="dance">Dance / disco / neon</option>
              <option value="rock">Rock</option>
              <option value="dream">Drømmende</option>
              <option value="nostalgic">Nostalgisk</option>
              <option value="romantic">Romantisk</option>
              <option value="sensual">Sensuell</option>
            </select>
          </label>
        )}
        <label>
          <span>Søk etter bilder</span>
          <input aria-label="Søk etter bilder" value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") searchLibrary(); }}
            placeholder={source === "art" ? "Søk etter kunstverkets tittel" : "Søk i samlingen"} />
        </label>
        <button type="button" className="admin-secondary" onClick={searchLibrary}>Søk</button>
      </div>
      <p role="status">{visibleCount} bilder i valgt samling · {selectedImages.size} av maks 8 videobilder valgt.</p>
      {selectedImages.size > 0 && (
        <div className="pipeline-chosen-images" aria-label="Valgte bilder i videorekkefølge">
          {Array.from(selectedImages).map((url, index) => (
            <button type="button" key={url} onClick={() => toggleSlide(url)}
              title="Fjern dette bildet fra videoen">
              <img src={url} alt={`Valgt bilde ${index + 1}`} loading="lazy" />
              <span>{index + 1}. Fjern</span>
            </button>
          ))}
        </div>
      )}
      {onSaveSelection && (
        <div className="pipeline-image-action-toolbar" role="group" aria-label="Lagre og kontroller videobilder">
          <div className="pipeline-image-action-caption" role="status">
            <strong>{selectedImages.size} / 8 bilder valgt</strong>
            <small>{savingSelection ? "Lagrer bildevalg …" :
              selectionSaved ? "Lagret på sangen" : "Endringer er ikke lagret"}</small>
          </div>
          <button type="button" className="admin-primary pipeline-image-save"
            disabled={saveSelectionDisabled || savingSelection}
            onClick={onSaveSelection}>
            {savingSelection ? "Lagrer …" : "Lagre bildevalg"}
          </button>
          {onCheckSelection && (
            <button type="button" className="admin-secondary pipeline-image-check"
              disabled={checkSelectionDisabled || checkingSelection}
              onClick={onCheckSelection}>
              {checkingSelection ? "Kontrollerer …" : "Kontroller bilder"}
            </button>
          )}
          {imageSaveMessage && <small className="pipeline-image-action-message" role="status">{imageSaveMessage}</small>}
          {imageCheckMessage && <small className="pipeline-image-action-message" role="status">{imageCheckMessage}</small>}
        </div>
      )}
      {imageLimitMessage && <p role="alert">{imageLimitMessage}</p>}
      {libraryError && <p className="admin-error" role="alert">{libraryError}</p>}
      {source === "art" && (
        <p className="pipeline-library-note">Kunstarkivet viser kun visningsfiler. Salgsoriginaler og trykkfiler forblir private. Upubliserte verk må velges bevisst.</p>
      )}
      {source === "music" && (
        <p className="pipeline-library-note">Disco-/neonbildene blir bare brukt når du velger dem til en sang – ingen automatisk stilblanding.</p>
      )}
      <div className="pipeline-slide-grid">
        {visibleSlides.length === 0 ? (
          source === "mine" ? (
            <EmptyAssetState
              icon="image"
              message="Ingen slideshow-bilder er lastet opp"
              action="Gå til Bildebank og last opp bilder"
              onClick={() => onOpenImageBank("image")}
            />
          ) : <p className="pipeline-empty">{libraryLoading ? "Henter bilder …" : "Ingen bilder funnet i denne samlingen."}</p>
        ) : (
          visibleSlides.map((item) => (
            <button key={item.id} type="button" className={selectedImages.has(item.url) ? "selected" : ""}
              onClick={() => toggleSlide(item.url)} aria-pressed={selectedImages.has(item.url)}>
              <img src={item.thumbnail_url || item.url} alt={item.name || "Slideshow"} loading="lazy" />
              <span>{item.name || "Bilde"}</span>
              {item.category && <small>{item.category}</small>}
            </button>
          ))
        )}
      </div>
      {source !== "mine" && libraryImages.length < libraryTotal && (
        <button type="button" className="admin-secondary pipeline-load-more"
          disabled={libraryLoading} onClick={() => setLibraryPage(page => page + 1)}>
          {libraryLoading ? "Henter flere …" : `Vis flere bilder (${libraryImages.length} av ${libraryTotal})`}
        </button>
      )}
    </div>
  );
}
