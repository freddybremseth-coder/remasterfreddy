/** Display-only scene lookup for the audio playhead.
 * No media rendering, uploads, network calls or AI inference. */
export function sceneIndexAtTime(starts: readonly number[], time: number): number {
  if (starts.length !== 8 || !Number.isFinite(time) || starts.some(x => !Number.isFinite(x))) return 0;
  let active = 0;
  for (let i = 1; i < starts.length; i++) {
    if (time < starts[i]) break;
    active = i;
  }
  return active;
}

export const previewSceneColors = [
  ["#132a3c", "#284d66"], ["#243846", "#536b70"],
  ["#27374d", "#536678"], ["#313c4e", "#726a69"],
  ["#34394f", "#676183"], ["#39384b", "#82726c"],
  ["#243e4b", "#587277"], ["#203344", "#4b596b"],
] as const;
