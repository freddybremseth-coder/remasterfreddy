import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  House,
  Loader2,
  Music2,
  RefreshCw,
  Save,
  Sparkles,
  Waves,
} from "lucide-react";
import { AdminSong, loadSongs } from "./lib/admin-api";
import "./admin-mix-studio.css";

type MixStyle =
  | "mediterranean-sunset"
  | "poolside"
  | "luxury-lounge"
  | "mediterranean-night"
  | "morning-chill";

type VisualRegion = "any" | "north" | "south" | "inland" | "costa-calida";
type VisualType = "mixed" | "villas" | "apartments" | "pools" | "sea-views" | "interiors";

type MixDraft = {
  title: string;
  style: MixStyle;
  targetMinutes: number;
  crossfadeSeconds: number;
  playlist: string;
  zenEcoHomesEnabled: boolean;
  visualRegion: VisualRegion;
  visualType: VisualType;
  sponsorIntervalMinutes: number;
  ctaText: string;
  selectedSongIds: string[];
};

const DRAFT_KEY = "remaster-mediterranean-mix-draft-v1";

const styleProfiles: Record<
  MixStyle,
  {
    label: string;
    playlist: string;
    keywords: string[];
    songerPrompt: string;
  }
> = {
  "mediterranean-sunset": {
    label: "Mediterranean Sunset",
    playlist: "🌅 Mediterranean Sunset Deep House",
    keywords: ["deep", "house", "chill", "melodic", "sunset", "dream", "ambient", "downtempo", "warm"],
    songerPrompt:
      "Melodic deep house, Mediterranean sunset atmosphere, 116 BPM, warm deep bass, soft four-on-the-floor kick, airy synth pads, gentle plucked melody, subtle tropical percussion, elegant and relaxing, luxurious poolside mood, emotional but uplifting, smooth gradual build, no aggressive EDM drop, DJ-friendly intro and outro.",
  },
  poolside: {
    label: "Poolside House",
    playlist: "🌊 Poolside Deep House",
    keywords: ["house", "pool", "summer", "tropical", "chill", "uplifting", "groove"],
    songerPrompt:
      "Poolside deep house, 117 BPM, warm rolling bass, soft punchy kick, crisp shaker percussion, dreamy synth plucks, subtle tropical textures, elegant summer feeling, relaxed luxury resort energy, catchy instrumental hook, smooth breakdown, gentle final build, no festival drop, DJ-friendly intro and outro.",
  },
  "luxury-lounge": {
    label: "Luxury Lounge",
    playlist: "🍸 Luxury Lounge & Deep House",
    keywords: ["lounge", "deep", "smooth", "sensual", "chill", "soul", "ambient"],
    songerPrompt:
      "Sophisticated luxury lounge deep house, 115 BPM, warm bass groove, soft house drums, atmospheric pads, elegant piano chords, subtle guitar textures, spacious reverb, premium Mediterranean hotel-lounge feeling, relaxed and uplifting, smooth transitions, restrained melodic hook, no aggressive drops.",
  },
  "mediterranean-night": {
    label: "Mediterranean Night",
    playlist: "🌙 Mediterranean Nights",
    keywords: ["night", "deep", "sensual", "dream", "atmospheric", "house", "hypnotic"],
    songerPrompt:
      "Mediterranean night lounge deep house, 116 BPM, deep warm bass, muted synth chords, subtle saxophone accents, soft electronic percussion, atmospheric pads, intimate luxury rooftop mood, elegant, hypnotic and relaxed, slow evolving arrangement, smooth DJ-friendly intro and outro.",
  },
  "morning-chill": {
    label: "Morning Chill",
    playlist: "☀️ Morning Chill — Costa Blanca",
    keywords: ["morning", "uplifting", "chill", "happy", "sunrise", "gentle", "house"],
    songerPrompt:
      "Gentle Mediterranean morning chill house, 114 BPM, warm bass, soft house kick, airy pads, delicate piano, light guitar textures, subtle organic percussion, fresh coastal sunrise mood, optimistic and calm, elegant gradual progression, smooth instrumental arrangement, no hard drop.",
  },
};

const DEFAULT_DRAFT: MixDraft = {
  title: "Mediterranean Sunset Deep House Mix #001 — Costa Blanca Luxury Vibes",
  style: "mediterranean-sunset",
  targetMinutes: 30,
  crossfadeSeconds: 8,
  playlist: styleProfiles["mediterranean-sunset"].playlist,
  zenEcoHomesEnabled: true,
  visualRegion: "any",
  visualType: "mixed",
  sponsorIntervalMinutes: 20,
  ctaText: "Dreaming of a home in Spain? Explore Costa Blanca at ZenEcoHomes.com",
  selectedSongIds: [],
};

function songSearchText(song: AdminSong) {
  return `${song.title || ""} ${song.genre || ""} ${song.mood || ""}`.toLowerCase();
}

function recommendedTrackCount(targetMinutes: number) {
  // Until exact audio duration is exposed by the catalog API, use a conservative
  // four-minute planning average. The long-running renderer will calculate the
  // exact duration before production starts.
  return Math.max(4, Math.min(60, Math.ceil(targetMinutes / 4)));
}

export default function AdminMixStudio() {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<MixDraft>(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      return saved ? { ...DEFAULT_DRAFT, ...JSON.parse(saved) } : DEFAULT_DRAFT;
    } catch {
      return DEFAULT_DRAFT;
    }
  });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refreshSongs() {
    setLoading(true);
    setError("");
    try {
      setSongs(await loadSongs());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunne ikke hente sangkatalogen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSongs();
  }, []);

  const availableSongs = useMemo(() => songs.filter((song) => Boolean(song.audioUrl)), [songs]);
  const selectedSongs = useMemo(
    () => draft.selectedSongIds.map((id) => songs.find((song) => song.id === id)).filter(Boolean) as AdminSong[],
    [draft.selectedSongIds, songs],
  );

  const targetTrackCount = recommendedTrackCount(draft.targetMinutes);
  const estimatedMinutes = selectedSongs.length * 4;
  const prompt = styleProfiles[draft.style].songerPrompt;

  function patchDraft(patch: Partial<MixDraft>) {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function changeStyle(style: MixStyle) {
    patchDraft({
      style,
      playlist: styleProfiles[style].playlist,
    });
  }

  function toggleSong(id: string) {
    patchDraft({
      selectedSongIds: draft.selectedSongIds.includes(id)
        ? draft.selectedSongIds.filter((songId) => songId !== id)
        : [...draft.selectedSongIds, id],
    });
  }

  function autoSelect() {
    const profile = styleProfiles[draft.style];
    const ranked = availableSongs
      .map((song) => {
        const text = songSearchText(song);
        const score = profile.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 2 : 0), 0)
          + (song.genre?.toLowerCase().includes("house") ? 2 : 0)
          + (song.mood?.toLowerCase().includes("chill") ? 1 : 0);
        return { song, score };
      })
      .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));

    patchDraft({ selectedSongIds: ranked.slice(0, targetTrackCount).map(({ song }) => song.id) });
  }

  function saveDraft() {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="admin-card admin-mix-studio">
      <div className="mix-hero">
        <div>
          <p className="admin-eyebrow">Mediterranean Mix Studio</p>
          <h2>Lag lange YouTube-mixer med ZenEcoHomes</h2>
          <p>
            Sett sammen Re-Master Freddy-spor til 30–180 minutters deep-house-mixer og klargjør
            Costa Blanca-bilder, sponsorinnslag, CTA og riktig YouTube-spilleliste i én produksjonsplan.
          </p>
        </div>
        <div className="mix-hero-badges">
          <span><Waves size={16} /> Deep House</span>
          <span><House size={16} /> ZenEcoHomes</span>
          <span><Music2 size={16} /> {selectedSongs.length} spor</span>
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      <div className="mix-grid mix-grid-main">
        <label>
          <span>Mix-tittel</span>
          <input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} />
        </label>
        <label>
          <span>Sound</span>
          <select value={draft.style} onChange={(event) => changeStyle(event.target.value as MixStyle)}>
            {Object.entries(styleProfiles).map(([id, profile]) => (
              <option value={id} key={id}>{profile.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Mållengde</span>
          <select value={draft.targetMinutes} onChange={(event) => patchDraft({ targetMinutes: Number(event.target.value) })}>
            <option value={30}>30 minutter</option>
            <option value={60}>60 minutter</option>
            <option value={90}>90 minutter</option>
            <option value={120}>2 timer</option>
            <option value={180}>3 timer</option>
          </select>
        </label>
        <label>
          <span>Crossfade</span>
          <select value={draft.crossfadeSeconds} onChange={(event) => patchDraft({ crossfadeSeconds: Number(event.target.value) })}>
            <option value={4}>4 sekunder</option>
            <option value={6}>6 sekunder</option>
            <option value={8}>8 sekunder</option>
            <option value={10}>10 sekunder</option>
            <option value={12}>12 sekunder</option>
          </select>
        </label>
      </div>

      <div className="mix-section">
        <div className="mix-section-heading">
          <div>
            <p className="admin-eyebrow">Musikk</p>
            <h3>Velg spor</h3>
            <p>
              Målet tilsvarer omtrent {targetTrackCount} spor med dagens planleggingsestimat. Eksakt spilletid
              beregnes av rendereren før publisering.
            </p>
          </div>
          <div className="mix-actions">
            <button className="admin-secondary" onClick={refreshSongs} disabled={loading}>
              {loading ? <Loader2 className="admin-spinner" size={16} /> : <RefreshCw size={16} />}
              Oppdater
            </button>
            <button className="admin-primary" onClick={autoSelect} disabled={loading || availableSongs.length === 0}>
              <Sparkles size={16} /> Velg automatisk
            </button>
          </div>
        </div>

        <div className="mix-track-summary">
          <strong>{selectedSongs.length} valgte spor</strong>
          <span>≈ {estimatedMinutes} min planlagt lyd</span>
          <span>{availableSongs.length} spor med tilgjengelig lyd</span>
        </div>

        <div className="mix-song-picker">
          {loading && availableSongs.length === 0 ? (
            <div className="admin-empty"><Loader2 className="admin-spinner" size={22} /> Henter sangene …</div>
          ) : availableSongs.length === 0 ? (
            <div className="admin-empty">Ingen spor med lyd er tilgjengelige ennå.</div>
          ) : (
            availableSongs.map((song) => {
              const active = draft.selectedSongIds.includes(song.id);
              return (
                <button
                  type="button"
                  className={`mix-song-option ${active ? "active" : ""}`}
                  key={song.id}
                  onClick={() => toggleSong(song.id)}
                >
                  <span className="mix-checkbox">{active && <Check size={14} />}</span>
                  <span>
                    <strong>{song.title || "Uten tittel"}</strong>
                    <small>{song.genre || "Ukjent genre"}{song.mood ? ` · ${song.mood}` : ""}</small>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="mix-section mix-sponsor-section">
        <div className="mix-section-heading">
          <div>
            <p className="admin-eyebrow">Visual Engine</p>
            <h3>ZenEcoHomes-integrasjon</h3>
            <p>Bruk bolig- og livsstilsbilder som en rolig premium-bakgrunn uten å gjøre musikkvideoen til en hard annonse.</p>
          </div>
          <label className="mix-toggle">
            <input
              type="checkbox"
              checked={draft.zenEcoHomesEnabled}
              onChange={(event) => patchDraft({ zenEcoHomesEnabled: event.target.checked })}
            />
            <span>{draft.zenEcoHomesEnabled ? "Aktiv" : "Av"}</span>
          </label>
        </div>

        <div className="mix-grid">
          <label>
            <span>Område</span>
            <select value={draft.visualRegion} onChange={(event) => patchDraft({ visualRegion: event.target.value as VisualRegion })} disabled={!draft.zenEcoHomesEnabled}>
              <option value="any">Hele porteføljen</option>
              <option value="north">Costa Blanca North</option>
              <option value="south">Costa Blanca South</option>
              <option value="inland">Inland</option>
              <option value="costa-calida">Costa Cálida</option>
            </select>
          </label>
          <label>
            <span>Bildetype</span>
            <select value={draft.visualType} onChange={(event) => patchDraft({ visualType: event.target.value as VisualType })} disabled={!draft.zenEcoHomesEnabled}>
              <option value="mixed">Mixed</option>
              <option value="villas">Villas</option>
              <option value="apartments">Apartments</option>
              <option value="pools">Pools</option>
              <option value="sea-views">Sea views</option>
              <option value="interiors">Interiors</option>
            </select>
          </label>
          <label>
            <span>Sponsorinnslag</span>
            <select value={draft.sponsorIntervalMinutes} onChange={(event) => patchDraft({ sponsorIntervalMinutes: Number(event.target.value) })} disabled={!draft.zenEcoHomesEnabled}>
              <option value={10}>Hvert 10. minutt</option>
              <option value={15}>Hvert 15. minutt</option>
              <option value={20}>Hvert 20. minutt</option>
              <option value={30}>Hvert 30. minutt</option>
            </select>
          </label>
          <label>
            <span>YouTube-spilleliste</span>
            <input value={draft.playlist} onChange={(event) => patchDraft({ playlist: event.target.value })} />
          </label>
        </div>

        <label className="mix-full-field">
          <span>CTA i video / beskrivelse</span>
          <input value={draft.ctaText} onChange={(event) => patchDraft({ ctaText: event.target.value })} disabled={!draft.zenEcoHomesEnabled} />
        </label>

        <div className="mix-sponsor-preview">
          <span>Presented by</span>
          <strong>ZenEcoHomes.com</strong>
          <small>{draft.ctaText}</small>
          <a href="https://zenecohomes.com" target="_blank" rel="noreferrer">
            Forhåndsvis nettside <ExternalLink size={13} />
          </a>
        </div>
      </div>

      <div className="mix-section">
        <div className="mix-section-heading">
          <div>
            <p className="admin-eyebrow">Songer Prompt Generator</p>
            <h3>Lag flere låter i samme lydunivers</h3>
            <p>Prompten følger valgt sound og er laget for lange, sømløse YouTube-mixer.</p>
          </div>
          <button className="admin-secondary" onClick={copyPrompt}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Kopiert" : "Kopier prompt"}
          </button>
        </div>
        <div className="mix-prompt">{prompt}</div>
      </div>

      <div className="mix-production-footer">
        <div>
          <strong>Produksjonsplan klar</strong>
          <span>
            {selectedSongs.length} spor · mål {draft.targetMinutes} min · {draft.crossfadeSeconds}s crossfade · {draft.zenEcoHomesEnabled ? "ZenEcoHomes på" : "uten sponsor"}
          </span>
        </div>
        <button className="admin-primary" onClick={saveDraft}>
          {saved ? <Check size={17} /> : <Save size={17} />}
          {saved ? "Lagret" : "Lagre mix-utkast"}
        </button>
      </div>

      <div className="mix-next-step">
        <Sparkles size={18} />
        <p>
          Produksjonsmotoren er aktiv. Lagre utkastet, og bruk produksjonskortet under for å starte Mix Worker som henter
          ZenEcoHomes-bilder, bygger crossfade-lyd, animerer bildene, legger inn sponsorsegmenter, genererer chapters/SEO
          og publiserer den første 30-minutters testen til YouTube.
        </p>
      </div>
    </section>
  );
}
