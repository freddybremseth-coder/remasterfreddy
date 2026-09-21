import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Music2, Palette } from 'lucide-react';
import './music-art-gallery.css';

type ArtItem = { id: string; title: string; imageUrl: string; thumbnailUrl: string; artworkUrl: string };
type GalleryData = { songId: string; title: string; artist: string; youtubeUrl: string; artVisualMode: string; artworks: ArtItem[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function MusicArtGallery({ songId }: { songId: string }) {
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!UUID.test(songId)) { setError('This song gallery link is invalid.'); return; }
    let cancelled = false;
    fetch(`/api/art-gallery?songId=${encodeURIComponent(songId)}`, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'This song gallery is not published yet.' : 'The gallery could not be loaded.');
        return await response.json() as GalleryData;
      })
      .then((data) => { if (!cancelled) setGallery(data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Gallery unavailable'); });
    return () => { cancelled = true; };
  }, [songId]);

  const artwork = gallery?.artworks[selected];
  return (
    <main className="music-art-page">
      <header className="music-art-header">
        <a href="/" aria-label="Back to Re-Master Freddy"><ArrowLeft size={17} /> Re-Master Freddy</a>
        <a href="https://art.freddybremseth.com" target="_blank" rel="noreferrer"><Palette size={17} /> Freddy Bremseth Art <ExternalLink size={14} /></a>
      </header>
      {error ? <section className="music-art-status"><h1>Song art gallery</h1><p>{error}</p><a href="/">Explore Re-Master Freddy</a></section>
      : !gallery ? <section className="music-art-status"><h1>Song art gallery</h1><p>Loading artwork…</p></section>
      : <div className="music-art-content">
        <div className="music-art-intro"><span>RE-MASTER FREDDY × FREDDY BREMSETH ART</span><h1>{gallery.title}</h1>
          <p>Original music accompanied by an individually curated collection of artwork by Freddy Bremseth.</p>
          <a className="music-art-listen" href={gallery.youtubeUrl} target="_blank" rel="noreferrer"><Music2 size={18} /> Listen on YouTube <ExternalLink size={14} /></a>
        </div>
        {artwork && <section className="music-art-feature" aria-label="Selected artwork">
          <img src={artwork.imageUrl} alt={artwork.title} />
          <div><p>ARTWORK {selected + 1} / {gallery.artworks.length}</p><h2>{artwork.title}</h2>
            <a href={artwork.artworkUrl} target="_blank" rel="noreferrer">View artwork in the art gallery <ExternalLink size={16} /></a>
            <p className="music-art-credit">Artwork by Freddy Bremseth · Music by Re-Master Freddy</p>
          </div></section>}
        <section className="music-art-collection" aria-label="Artwork in this song"><h2>Artwork in this song</h2>
          <div className="music-art-grid">{gallery.artworks.map((item, index) => <button key={item.id} type="button" onClick={() => setSelected(index)} className={selected === index ? 'is-selected' : ''}>
            <img src={item.thumbnailUrl} alt={item.title} loading="lazy" /><span>{item.title}</span>
          </button>)}</div>
        </section>
        <footer className="music-art-footer"><a href="https://art.freddybremseth.com" target="_blank" rel="noreferrer">Explore all Freddy Bremseth Art</a><a href="/">More music from Re-Master Freddy</a></footer>
      </div>}
    </main>
  );
}
