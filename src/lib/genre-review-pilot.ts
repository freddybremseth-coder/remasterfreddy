import type { AdminSong } from "./admin-api";

/**
 * Small, stable, intentionally diverse listening pilot.
 * Legacy genres identify sampling strata, NEVER training truth.
 * No model, paid inference, genre mutation, or publishing occurs here.
 */
export type GenrePilotStratum = "edm" | "house" | "calm" | "electronic" | "other";

export function legacyGenreStratum(genre: string | undefined): GenrePilotStratum {
  const label = (genre || "").trim().toLowerCase();
  if (/\b(house|techno|trance)\b/.test(label)) return "house";
  if (/\b(chill|ambient|relax|meditat|lo-?fi|downtempo)\b/.test(label)) return "calm";
  if (/\b(edm|electronic dance music)\b/.test(label)) return "edm";
  if (/\b(electronic|dance)\b/.test(label)) return "electronic";
  return "other";
}

export function planGenreReviewPilot(songs: readonly AdminSong[], limit = 20): AdminSong[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return [];
  const strata: GenrePilotStratum[] = ["edm", "house", "calm", "electronic", "other"];
  const candidates = songs
    .filter(song => Boolean(song.audioUrl) && Boolean(song.id))
    .slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const seen = new Set<string>();
  const grouped = new Map(strata.map(group => [group, [] as AdminSong[]]));
  for (const song of candidates) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    grouped.get(legacyGenreStratum(song.genre))!.push(song);
  }
  const selected: AdminSong[] = [];
  // Round-robin prevents the old 97-EDM catalog skew from dominating review.
  while (selected.length < limit) {
    let added = false;
    for (const group of strata) {
      const next = grouped.get(group)!.shift();
      if (next) {
        selected.push(next);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

export function genreReviewPilotProgress(songs: readonly AdminSong[]) {
  const reviewed = songs.filter(song => song.metadata?.genreSource === "author" &&
    typeof song.metadata?.authorSelectedGenre === "string" &&
    song.metadata.authorSelectedGenre.trim().length > 0);
  return {
    total: songs.length,
    reviewed: reviewed.length,
    remaining: songs.length - reviewed.length,
    genres: new Set(reviewed.map(song => song.metadata!.authorSelectedGenre!.trim().toLowerCase())).size,
  };
}
