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

  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
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

  const signResponse = await adminFetch("/api/neural-beat-upload", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name }),
  });
  const signed = await signResponse.json().catch(() => ({}));
  if (!signResponse.ok) throw new Error(signed.error || "Kunne ikke opprette sikker opplastingsadresse.");
  if (signed.method !== "signed") throw new Error("Opplastingen ble stoppet fordi sikker signert adresse mangler.");

  const uploadResponse = await fetch(String(signed.uploadUrl), {
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
