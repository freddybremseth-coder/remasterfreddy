import { getAdminSession } from "./supabase";

export interface YouTubeHealth {
  connected: boolean;
  configured: boolean;
  brandId?: string;
  reason?: string;
  message?: string;
  tokenSource?: string;
  reconnectUrl?: string;
  checkedAt?: string;
  channel?: {
    id: string;
    title: string;
    thumbnailUrl?: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
  };
}

export async function loadYouTubeHealth(): Promise<YouTubeHealth> {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  const response = await fetch("/api/youtube-health", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Kunne ikke kontrollere YouTube-tilkoblingen.");
  }
  return data as YouTubeHealth;
}
