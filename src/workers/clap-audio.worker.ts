/// <reference lib="webworker" />

import { CLAP_LABELS, CLAP_MODEL_ID } from "../lib/browser-clap-labels";
import type { MusicLabelAxis } from "../lib/genre-classification-benchmark";

interface Request { type: "classify"; id: number; axis: MusicLabelAxis; audioClips: Float32Array[] }
type RawScore = { score: number; label: string };
const scope = self as unknown as DedicatedWorkerGlobalScope;

let currentJob: number | null = null;
let classifierPromise: Promise<(audio: Float32Array, labels: string[]) => Promise<RawScore[]>> | null = null;
function status(id: number, step: string, percent?: number) {
  scope.postMessage({ type: "progress", id, step, percent });
}
function failed(id: number, message: string) {
  scope.postMessage({ type: "error", id, message });
}

async function loadClassifier(id: number) {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      status(id, "Laster ned CLAP-modellen til nettleseren (omtrent 160 MB) …");
      // A pinned ESM CDN import means no new server dependency or paid API key.
      // This ONLY downloads model code/weights. The song audio stays in this browser.
      const libraryUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
      const lib = await import(/* @vite-ignore */ libraryUrl);
      if (typeof lib.pipeline !== "function") throw new Error("Lydmodellbiblioteket kunne ikke lastes.");
      const task = await lib.pipeline("zero-shot-audio-classification", CLAP_MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        progress_callback: (entry: { status?: string; progress?: number }) => {
          if (currentJob !== null) {
            const value = typeof entry.progress === "number" ? Math.max(0, Math.min(100, entry.progress)) : undefined;
            status(currentJob, "Laster ned/klargjør modell …", value);
          }
        },
      });
      return task as (audio: Float32Array, labels: string[]) => Promise<RawScore[]>;
    })().catch((error: unknown) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!request || request.type !== "classify") return;
  const { id, axis, audioClips } = request;
  if (!Number.isSafeInteger(id) || currentJob !== null) {
    failed(id, "En lydanalyse kjører allerede.");
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(CLAP_LABELS, axis) ||
      !Array.isArray(audioClips) || audioClips.length !== 3 ||
      audioClips.some(audio => !(audio instanceof Float32Array) ||
        audio.length < 48_000 * 2 || audio.length > 48_000 * 10)) {
    failed(id, "Ugyldig eller for langt lydutdrag for en lokal test.");
    return;
  }
  currentJob = id;
  try {
    const classifier = await loadClassifier(id);
    const prompts = CLAP_LABELS[axis].map(label => label.prompt);
    const sums = new Map(prompts.map(prompt => [prompt, 0]));
    const clipWinners: string[] = [];
    for (let section = 0; section < audioClips.length; section++) {
      status(id, "Analyserer del " + (section + 1) + " av 3 lokalt i nettleseren …");
      const output = await classifier(audioClips[section], prompts);
      if (!Array.isArray(output) || output.length !== prompts.length ||
          output.some(x => !prompts.includes(x.label) || !Number.isFinite(x.score) ||
            x.score < 0 || x.score > 1)) {
        throw new Error("Lydmodellen returnerte ikke gyldige resultater.");
      }
      const top = output.slice().sort((a, b) => b.score - a.score)[0];
      clipWinners.push(top.label);
      for (const candidate of output) sums.set(candidate.label, sums.get(candidate.label)! + candidate.score);
    }
    scope.postMessage({
      type: "result", id, axis,
      clipWinners,
      scores: prompts.map(label => ({ label, score: sums.get(label)! / audioClips.length })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent feil i lokal modell.";
    failed(id, "CLAP kunne ikke kjøres i denne nettleseren. " + message.slice(0, 190));
  } finally {
    currentJob = null;
  }
};
