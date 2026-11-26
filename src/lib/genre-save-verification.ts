/**
 * Verify the database state returned by a fresh, authenticated read.
 * A resolved HTTP PUT is not enough to claim an owner-confirmed genre.
 */
export interface GenrePersistenceState {
  genre?: string | null;
  metadata?: {
    genreSource?: string;
    authorSelectedGenre?: string;
  };
}

export function matchesPersistedGenre(
  song: GenrePersistenceState | null | undefined,
  requestedGenre: string | null,
): boolean {
  if (!song) return false;
  if (requestedGenre === null) {
    // Clearing a legacy label is NOT the same as confirming a new genre.
    return !song.genre && song.metadata?.genreSource !== "author" &&
      !song.metadata?.authorSelectedGenre;
  }
  return song.genre === requestedGenre &&
    song.metadata?.genreSource === "author" &&
    song.metadata?.authorSelectedGenre === requestedGenre;
}
