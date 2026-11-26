import type { MusicLabelAxis } from "./genre-classification-benchmark";
import type { ClapSimilarLabel } from "./browser-clap-labels";

export type BrowserClapReply =
  | { type: "progress"; id: number; step: string; percent?: number }
  | { type: "result"; id: number; axis: MusicLabelAxis; scores: ClapSimilarLabel[]; clipWinners: string[] }
  | { type: "error"; id: number; message: string };

export function isFirstPartyMusicFile(url: string, supabaseBase: string | undefined) {
  if (!url || !supabaseBase) return false;
  try {
    const audio = new URL(url), supabase = new URL(supabaseBase);
    return audio.protocol === "https:" &&
      audio.origin === supabase.origin &&
      audio.pathname.startsWith("/storage/v1/object/public/assets/") &&
      /\.(mp3|wav|m4a|flac)$/i.test(audio.pathname);
  } catch { return false; }
}

/**
 * Choose the CENTER of each third of the song. Unlike first/middle/last
 * excerpts, this avoids a long intro, silence at the head, or a fading outro.
 * For short tracks each excerpt occupies up to one third, never overlapping.
 */
export function representativeClapOffsets(totalFrames: number, clipFrames: number): [number, number, number] {
  if (!Number.isInteger(totalFrames) || !Number.isInteger(clipFrames) ||
      clipFrames < 1 || totalFrames < 3 * clipFrames) {
    throw new Error("Sangen er for kort til tre uavhengige lydutdrag.");
  }
  const third = totalFrames / 3;
  return [0, 1, 2].map(part =>
    Math.min(totalFrames - clipFrames,
      Math.max(0, Math.floor((part + 0.5) * third - clipFrames / 2)))) as [number, number, number];
}

/**
 * Obtain a 10s 48kHz mono segment in the BROWSER only, after user click.
 * No audio, owner label, title, lyric or old genre is sent to an AI provider.
 * Assumes the song is already part of first-party Supabase public storage.
 */
export async function prepareBrowserClapAudioSegments(
  url: string,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  const supabaseBase = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!isFirstPartyMusicFile(url, supabaseBase)) {
    throw new Error("Kun MP3 fra din registrerte Supabase-lydbank kan analyseres.");
  }
  const response = await fetch(url, { signal, mode: "cors", cache: "no-store" });
  if (!response.ok) throw new Error("Kunne ikke hente MP3 fra din lydbank.");
  const limit = 32 * 1024 * 1024;
  const length = Number(response.headers.get("content-length") || "0");
  if (length > limit) throw new Error("MP3-filen overskrider sikkerhetsgrensen på 32 MB.");
  // Enforce the cap on the actual stream as well; Content-Length may be absent.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Nettleseren støtter ikke sikker avspilling av lydfilen.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error("MP3-filen er for stor for en lokal test.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (bytes < 1024) throw new Error("MP3-filen er for kort eller tom.");
  const encoded = new Uint8Array(bytes);
  let cursor = 0;
  for (const part of chunks) { encoded.set(part, cursor); cursor += part.length; }

  const audio = new AudioContext({ sampleRate: 48_000 });
  try {
    const decoded = await audio.decodeAudioData(encoded.buffer);
    const rate = decoded.sampleRate;
    if (!decoded.length || !decoded.numberOfChannels || rate <= 0) {
      throw new Error("Ingen dekodet lyd ble funnet.");
    }
    if (decoded.duration < 6) throw new Error("Sangen er for kort til tre uavhengige lydutdrag.");
    const duration = Math.min(10, decoded.duration / 3);
    const samples = Math.min(decoded.length, Math.floor(duration * rate));
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, n) => decoded.getChannelData(n));
    if (rate !== 48_000) {
      // decodeAudioData normally resamples to AudioContext sample rate.
      throw new Error("Nettleseren kunne ikke levere lyd i 48 kHz.");
    }
    const offsets = representativeClapOffsets(decoded.length, samples);
    return offsets.map(offset => {
      const mono = new Float32Array(samples);
      for (const channel of channels) {
        for (let i = 0; i < samples; i++) mono[i] += channel[offset + i] / channels.length;
      }
      return mono;
    });
  } finally { await audio.close(); }
}

/** Compatibility helper for one-section consumers. New CLAP trials use 3 segments. */
export async function prepareBrowserClapAudio(
  url: string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const segments = await prepareBrowserClapAudioSegments(url, signal);
  return segments[1];
}
