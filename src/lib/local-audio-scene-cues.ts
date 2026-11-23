import type { StoryboardSceneTiming } from "./admin-api";

/** Mirror the backend's fail-closed timing contract before author approval. */
export function isValidSceneTiming(value: StoryboardSceneTiming | null | undefined): value is StoryboardSceneTiming {
  if (!value) return false;
  const { durationSeconds: duration, startsSeconds: starts } = value;
  return Number.isFinite(duration) && duration >= 8 && duration <= 7200 &&
    Array.isArray(starts) && starts.length === 8 && starts[0] === 0 &&
    starts.every((start, i) => Number.isFinite(start) && start >= 0 &&
      start < duration && (i === 0 || start - starts[i - 1] >= 1)) &&
    duration - starts[7] >= 1;
}

/** Local-only approximate scene changes based on changes in windowed RMS energy.
 * This is NOT a beat/chorus detector and never claims precise music structure.
 */
export function recommendSceneStarts(levels: readonly number[], duration: number, sceneCount = 8): number[] | null {
  if (!Number.isFinite(duration) || duration < 8 || duration > 7200 ||
      !Number.isInteger(sceneCount) || sceneCount < 2 || sceneCount > 16 ||
      levels.length < sceneCount * 2 || levels.some(v => !Number.isFinite(v) || v < 0)) return null;
  const minGap = duration / (sceneCount * 2);
  const resolution = duration / levels.length;
  const smoothed = levels.map((_, i) => {
    let total = 0, count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(levels.length - 1, i + 2); j++) {
      total += levels[j]; count++;
    }
    return total / count;
  });
  const selected: number[] = [0];
  for (let scene = 1; scene < sceneCount; scene++) {
    const target = duration * scene / sceneCount;
    const lower = Math.max(selected[selected.length - 1] + minGap, target - duration / (sceneCount * 3));
    const upper = Math.min(duration - (sceneCount - scene) * minGap, target + duration / (sceneCount * 3));
    let bestTime = Math.max(lower, Math.min(upper, target));
    let bestScore = -Infinity;
    for (let i = 3; i < smoothed.length - 3; i++) {
      const time = i * resolution;
      if (time < lower || time > upper) continue;
      const before = smoothed[i - 3] + smoothed[i - 2] + smoothed[i - 1];
      const after = smoothed[i + 1] + smoothed[i + 2] + smoothed[i + 3];
      const difference = Math.abs(after - before) / 3;
      // Bias toward approximate equal spacing; these are scene suggestions, not a transcript.
      const score = difference - Math.abs(time - target) / duration * 0.15;
      if (score > bestScore) { bestScore = score; bestTime = time; }
    }
    selected.push(Math.round(bestTime * 10) / 10);
  }
  return selected.every((start, i) => i === 0 || start > selected[i - 1]) ? selected : null;
}

/** Web Audio decoding stays on the user's device; no uploads or model calls. */
export async function analyzeLocalAudioFile(file: File): Promise<{ duration: number; starts: number[] }> {
  if (!file || file.size > 60 * 1024 * 1024) throw new Error("Lydfilen er for stor (maks 60 MB).");
  if (!/\.(mp3|wav|m4a|ogg)$/i.test(file.name) && !file.type.startsWith("audio/")) {
    throw new Error("Velg en lydfil (MP3, WAV, M4A eller OGG).");
  }
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) throw new Error("Nettleseren støtter ikke lokal lydanalyse.");
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration < 8 || buffer.duration > 7200) throw new Error("Sanglengden må være mellom 8 sekunder og 2 timer.");
    const frames = Math.max(16, Math.ceil(buffer.duration * 2));
    const levels: number[] = [];
    const channelCount = Math.min(buffer.numberOfChannels, 2);
    const channels = Array.from({ length: channelCount }, (_, i) => buffer.getChannelData(i));
    for (let frame = 0; frame < frames; frame++) {
      const start = Math.floor(frame * buffer.length / frames);
      const end = Math.min(buffer.length, Math.floor((frame + 1) * buffer.length / frames));
      const stride = Math.max(1, Math.floor((end - start) / 700));
      let squares = 0, n = 0;
      for (let sample = start; sample < end; sample += stride) {
        for (const channel of channels) { squares += channel[sample] ** 2; n++; }
      }
      levels.push(n ? Math.sqrt(squares / n) : 0);
    }
    const starts = recommendSceneStarts(levels, buffer.duration);
    if (!starts) throw new Error("Kunne ikke foreslå sceneskift for denne lydfilen.");
    return { duration: buffer.duration, starts };
  } finally {
    await context.close();
  }
}
