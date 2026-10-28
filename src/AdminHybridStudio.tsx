import { useEffect, useState } from "react";
import { loadSongs, type AdminSong } from "./lib/admin-api";
import { getAdminSession } from "./lib/supabase";

type Storyboard = {
  state: "PREVIEW_ONLY" | "NEEDS_DURATION" | "NEEDS_APPROVED_MEDIA";
  error?: string;
  message?: string;
  estimatedOpenArtCredits?: number;
  song?: { title: string; durationSeconds: number; hasOriginalAudio?: boolean };
  plan?: { lane: string; videos: number; images: number; slots: Array<{ assetId: string; kind: string; durationSeconds: number }> };
};

export default function AdminHybridStudio() {
  const [songs, setSongs] = useState<AdminSong[]>([]);
  const [songId, setSongId] = useState("");
  const [plan, setPlan] = useState<Storyboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    loadSongs().then(items => {
      setSongs(items);
      if (items.length) setSongId(items[0].id);
    }).catch(e => setError(e instanceof Error ? e.message : "Kunne ikke laste sanger"));
  }, []);
  async function preview() {
    if (!songId) return;
    setLoading(true); setError(""); setPlan(null);
    try {
      const session = await getAdminSession();
      if (!session) throw new Error("Logg inn på nytt");
      const res = await fetch(`/api/hybrid-song-preview?songId=${encodeURIComponent(songId)}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Forhåndsvisning utilgjengelig");
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukjent feil");
    } finally { setLoading(false); }
  }
  return <section className="admin-card">
    <h2>Hybrid Video Studio</h2>
    <p>Lag en forhåndsvisningsplan av godkjente videoklipp og bilder. Ingen generering, betaling, rendering eller publisering starter her.</p>
    <label htmlFor="hybrid-song">Velg sang</label>
    <select id="hybrid-song" value={songId} onChange={event => { setSongId(event.target.value); setPlan(null); }}>
      {songs.map(song => <option key={song.id} value={song.id}>{song.title || song.id}</option>)}
    </select>
    <button className="admin-primary" type="button" disabled={!songId || loading} onClick={preview}>
      {loading ? "Lager videoplan…" : "Vis videoplan (0 kreditter)"}
    </button>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {plan?.state === "NEEDS_APPROVED_MEDIA" && <p role="status">Ingen godkjente medier for denne sjangeren. Legg først klipp og bilder inn i RealtyFlows mediebibliotek.</p>}
    {plan?.state === "NEEDS_DURATION" && <p role="status">Sangen mangler registrert spilletid. Kontroller MP3-metadata.</p>}
    {plan?.state === "PREVIEW_ONLY" && plan.plan && <>
      <h3>Videoplan for {plan.song?.title}</h3>
      <p>Sjangerstil: {plan.plan.lane} · {plan.plan.videos} videoklipp · {plan.plan.images} bilder · {plan.song?.durationSeconds} sekunder · 0 OpenArt-kreditter</p>
      <ol>{plan.plan.slots.slice(0, 40).map((slot, index) =>
        <li key={index}>{slot.kind === "video" ? "Video" : "Bilde"} – {slot.durationSeconds.toFixed(1)} sek.</li>
      )}</ol>
      {plan.plan.slots.length > 40 && <p>Viser de første 40 av {plan.plan.slots.length} segmenter.</p>}
      <p>Kun plan: lyd, medier og overganger må kvalitetssikres før rendering.</p>
    </>}
  </section>;
}
