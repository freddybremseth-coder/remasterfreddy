import { getAdminSession } from "./supabase";

export type RecommendationPriority = "critical" | "high" | "medium" | "low";
export type RecommendationEffort = "easy" | "medium" | "hard";
export type RecommendationActionType = "update_metadata" | "create_content" | "strategy" | "schedule";

export interface RecommendationAction {
  type: RecommendationActionType;
  videoId?: string | null;
  currentTitle?: string | null;
  newTitle?: string | null;
  newDescription?: string | null;
  newTags?: string[] | null;
  details?: string | null;
}

export interface Recommendation {
  id: string;
  type: string;
  priority: RecommendationPriority;
  title: string;
  description: string;
  impact: string;
  effort: RecommendationEffort;
  action: RecommendationAction;
}

export interface RecommendationBundle {
  recommendations: Recommendation[];
  channelHealth?: {
    score: number;
    trend: "up" | "down" | "stable";
    summary: string;
  };
  quickWins?: string[];
  weeklyGoals?: string[];
  stats?: {
    avgViews?: number;
    engagementRate?: number;
    totalViews?: number;
    videoCount?: number;
  };
  channel?: {
    title?: string;
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
  };
}

async function recommendationsFetch(init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  return fetch("/api/neural-beat-recommendations", {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function loadRecommendations(): Promise<RecommendationBundle> {
  const response = await recommendationsFetch({ method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Kunne ikke hente anbefalingene.");
  }

  return {
    ...data,
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
  } as RecommendationBundle;
}

export async function executeRecommendation(action: RecommendationAction) {
  const response = await recommendationsFetch({
    method: "POST",
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "Tiltaket kunne ikke utføres.");
  }
  return data as { success: boolean; message?: string; plan?: string; updates?: Record<string, unknown> };
}
