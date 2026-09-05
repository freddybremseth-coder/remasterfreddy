import { getAdminSession } from "./supabase";

export type MixStyle =
  | "mediterranean-sunset"
  | "poolside"
  | "luxury-lounge"
  | "mediterranean-night"
  | "morning-chill";

export type VisualRegion = "any" | "north" | "south" | "inland" | "costa-calida";
export type VisualType = "mixed" | "villas" | "apartments" | "pools" | "sea-views" | "interiors";

export interface MixDraftInput {
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
  queue?: boolean;
}

export interface MixJob {
  id: string;
  title: string;
  style: MixStyle;
  target_minutes: number;
  crossfade_seconds: number;
  playlist_name: string;
  zenecohomes_enabled: boolean;
  visual_region: VisualRegion;
  visual_type: VisualType;
  sponsor_interval_minutes: number;
  cta_text?: string | null;
  track_ids: string[];
  status: "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
  pipeline_step: string;
  progress: number;
  youtube_video_id?: string | null;
  youtube_url?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

async function mixFetch(path: string, init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function jsonOrError(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data.code === "MIX_SCHEMA_NOT_READY") {
      throw new Error("Mix Studio-databasen er ikke installert i RealtyFlow ennå.");
    }
    throw new Error(data.error || "Mix Studio API-kallet feilet.");
  }
  return data;
}

export async function createMixDraft(input: MixDraftInput): Promise<MixJob> {
  const response = await mixFetch("/api/neural-beat-mixes", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await jsonOrError(response);
  if (!data.mix) throw new Error("Mix-utkastet ble lagret, men serveren returnerte ingen jobb.");
  return data.mix as MixJob;
}

export async function loadMixJobs(): Promise<MixJob[]> {
  const response = await mixFetch("/api/neural-beat-mixes", { method: "GET" });
  const data = await jsonOrError(response);
  return Array.isArray(data.mixes) ? data.mixes : [];
}

export async function queueMixJob(id: string): Promise<MixJob> {
  const response = await mixFetch("/api/neural-beat-mixes", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "queue" }),
  });
  const data = await jsonOrError(response);
  if (!data.mix) throw new Error("Mixen ble køet, men serveren returnerte ingen jobb.");
  return data.mix as MixJob;
}

export async function cancelMixJob(id: string): Promise<MixJob> {
  const response = await mixFetch("/api/neural-beat-mixes", {
    method: "PATCH",
    body: JSON.stringify({ id, action: "cancel" }),
  });
  const data = await jsonOrError(response);
  if (!data.mix) throw new Error("Mixen ble avbrutt, men serveren returnerte ingen jobb.");
  return data.mix as MixJob;
}
