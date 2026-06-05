import { getAdminSession } from "./supabase";

export interface AdminSong {
  id: string;
  title: string;
  artist?: string;
  audioUrl?: string;
  youtubeUrl?: string;
  genre?: string;
  mood?: string;
}

export type ImageKind = "image" | "logo" | "thumbnail";

export interface AdminImage {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  name?: string | null;
  kind: ImageKind;
  tags?: string[];
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  use_count?: number | null;
  created_at?: string;
}

export interface ChannelVideo {
  id: string;
  title: string;
  publishedAt: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewsPerDay?: number;
}

export interface ChannelAnalytics {
  channel?: {
    title: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    thumbnailUrl?: string;
  };
  metrics?: {
    totalViews: number;
    totalLikes: number;
    avgViews: number;
    avgLikes: number;
    engagementRate: number;
    videoCount: number;
  };
  topVideos?: ChannelVideo[];
  fastestGrowing?: ChannelVideo[];
  recentVideos?: ChannelVideo[];
  analysis?: {
    overallScore?: number;
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    actionItems?: Array<{ priority: string; action: string; expectedImpact: string }>;
    viralStrategy?: {
      titleFormulas?: string[];
      thumbnailTips?: string[];
      uploadSchedule?: string;
      contentGaps?: string[];
      trendingTopics?: string[];
    };
  } | null;
  mixes?: Array<{
    title: string;
    emoji?: string;
    mood?: string;
    description?: string;
    viralPotential?: string;
  }>;
}

async function adminFetch(path: string, init: RequestInit = {}) {
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

async function createSignedUpload(fileName: string) {
  const response = await adminFetch("/api/neural-beat-upload", {
    method: "POST",
    body: JSON.stringify({ fileName }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke opprette sikker opplastingsadresse.");
  if (data.method !== "signed" || !data.uploadUrl || !data.publicUrl) {
    throw new Error("Opplastingen ble stoppet fordi sikker signert adresse mangler.");
  }
  return data as { uploadUrl: string; publicUrl: string; method: "signed" };
}

export async function loadSongs(): Promise<AdminSong[]> {
  const response = await adminFetch("/api/neural-beat", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Kunne ikke hente sangene.");
  return Array.isArray(data.songs) ? data.songs : [];
}

export async function uploadSong(file: File, title: string, artist: string): Promise<AdminSong> {
  if (!file || !title.trim()) throw new Error("Velg en MP3-fil og skriv inn tittel.");
  if (file.type && file.type !== "audio/mpeg") throw new Error("Filen må være en MP3.");

  const signed = await createSignedUpload(file.name);
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/mpeg" },
    body: file,
  });
  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => "");
    throw new Error(`MP3-opplastingen feilet${details ? `: ${details}` : "."}`);
  }

  const registerResponse = await adminFetch("/api/neural-beat", {
    method: "PUT",
    body: JSON.stringify({
      title: title.trim(),
      artist: artist.trim() || "Re-Master Freddy",
      audioUrl: signed.publicUrl,
    }),
  });
  const registered = await registerResponse.json().catch(() => ({}));
  if (!registerResponse.ok || !registered.success) {
    throw new Error(registered.error || "MP3-en ble lastet opp, men sangen kunne ikke registreres.");
  }

  return registered.song as AdminSong;
}

export async function uploadImageAsset(file: File, kind: ImageKind): Promise<AdminImage> {
  if (!file.type.startsWith("image/")) throw new Error("Velg en gyldig bildefil.");
  const signed = await createSignedUpload(`${kind}-${file.name}`);
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "image/png" },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error("Bildeopplastingen feilet.");

  const saveResponse = await adminFetch("/api/neural-beat-image-bank", {
    method: "POST",
    body: JSON.stringify({
      url: signed.publicUrl,
      name: file.name,
      kind,
      sizeBytes: file.size,
      owner: "system",
    }),
  });
  const saved = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok || !saved.image) throw new Error(saved.error || "Bildet kunne ikke lagres i bildebanken.");
  return saved.image as AdminImage;
}

export async function loadImageBank(kind?: ImageKind): Promise<AdminImage[]> {
  const params = new URLSearchParams({ owner: "system", limit: "60" });
  if (kind) params.set("kind", kind);
  const response = await adminFetch(`/api/neural-beat-image-bank?${params.toString()}`, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke hente bildebanken.");
  return Array.isArray(data.images) ? data.images : [];
}

export async function deleteImageBankEntry(id: string): Promise<void> {
  const response = await adminFetch(`/api/neural-beat-image-bank?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke fjerne bildet fra bildebanken.");
}

export async function loadChannelAnalytics(): Promise<ChannelAnalytics> {
  const response = await adminFetch("/api/neural-beat-analytics", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Kunne ikke hente kanalstatistikken.");
  return data as ChannelAnalytics;
}

export async function startSongPipeline(recordId: string, onEvent: (event: any) => void) {
  const response = await adminFetch("/api/neural-beat", {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: JSON.stringify({ recordId, multilingualDescription: true }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Kunne ikke starte videopipelinen.");
  }

  if (!response.body) throw new Error("Serveren returnerte ingen pipeline-strøm.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const messages = buffer.split("\n\n");
    buffer = messages.pop() || "";

    for (const message of messages) {
      const line = message.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // Ignore malformed heartbeat or upstream chunks.
      }
    }
  }
}
