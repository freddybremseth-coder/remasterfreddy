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

async function adminFetch(path: string, init: RequestInit = {}) {
  const session = await getAdminSession();
  if (!session) throw new Error("Adminøkten er utløpt. Logg inn på nytt.");

  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  return response;
}

export async function loadSongs(): Promise<AdminSong[]> {
  const response = await adminFetch("/api/neural-beat", { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Kunne ikke hente sangene.");
  return Array.isArray(data.songs) ? data.songs : [];
}

export async function startSongPipeline(recordId: string, onEvent: (event: any) => void) {
  const response = await adminFetch("/api/neural-beat", {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: JSON.stringify({
      recordId,
      multilingualDescription: true,
    }),
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
