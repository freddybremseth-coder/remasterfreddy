/// <reference lib="webworker" />
import { AST_MODEL_ID, type AstScore, type AstSectionScores } from "../lib/browser-ast-evidence";

type Request = { type: "inspect"; id: number; audioClips: Float32Array[] };
type Reply =
  | { type: "progress"; id: number; step: string; percent?: number }
  | { type: "result"; id: number; sections: AstSectionScores[] }
  | { type: "error"; id: number; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
type AstClassifier = (audio: Float32Array, options: { top_k: number }) => Promise<AstScore[]>;
let currentId: number | null = null;
let modelPromise: Promise<AstClassifier> | null = null;

function send(reply: Reply) { scope.postMessage(reply); }
async function getModel(id: number): Promise<AstClassifier> {
  if (!modelPromise) {
    modelPromise = (async () => {
      send({ type: "progress", id, step: "Laster AudioSet-modellen lokalt (~91 MB) …" });
      const url = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
      const lib = await import(/* @vite-ignore */ url);
      if (typeof lib.pipeline !== "function") throw new Error("Nettleserbiblioteket kunne ikke åpnes.");
      const model = await lib.pipeline("audio-classification", AST_MODEL_ID, {
        device: "wasm",
        dtype: "q8",
        progress_callback: (update: { progress?: number }) => {
          if (currentId !== null) send({
            type: "progress", id: currentId, step: "Laster og klargjør lydmodellen …",
            percent: typeof update.progress === "number" ?
              Math.max(0, Math.min(100, update.progress)) : undefined,
          });
        },
      });
      return model as AstClassifier;
    })().catch((error: unknown) => { modelPromise = null; throw error; });
  }
  return modelPromise;
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!request || request.type !== "inspect") return;
  const { id, audioClips } = request;
  if (!Number.isSafeInteger(id) || currentId !== null) {
    send({ type: "error", id, message: "En uavhengig lydanalyse kjører allerede." });
    return;
  }
  if (!Array.isArray(audioClips) || audioClips.length !== 3 ||
      audioClips.some(clip => !(clip instanceof Float32Array) ||
        clip.length < 16_000 * 2 || clip.length > 16_000 * 10)) {
    send({ type: "error", id, message: "Ugyldige eller for lange lydutdrag." });
    return;
  }
  currentId = id;
  try {
    const model = await getModel(id);
    const sections: AstSectionScores[] = [];
    for (let i = 0; i < audioClips.length; i++) {
      send({ type: "progress", id, step: "Undersøker lydutdrag " + (i + 1) + " av 3 …" });
      const predictions = await model(audioClips[i], { top_k: 50 });
      if (!Array.isArray(predictions) || !predictions.every(item =>
        typeof item?.label === "string" && Number.isFinite(item.score) &&
        item.score >= 0 && item.score <= 1)) {
        throw new Error("Modellen returnerte uventede lydetiketter.");
      }
      sections.push(predictions);
    }
    send({ type: "result", id, sections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ukjent modellfeil.";
    send({ type: "error", id,
      message: "Uavhengig lydmodell kunne ikke kjøres lokalt: " + message.slice(0, 170) });
  } finally { currentId = null; }
};
