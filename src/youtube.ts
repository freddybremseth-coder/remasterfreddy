export const CHANNEL_HANDLE = "remaster-freddy";
export const CHANNEL_ID = "UCPAj3RNC2S_Nv7QV4-oYoIw";
export const UPLOADS_PLAYLIST_ID = "UUPAj3RNC2S_Nv7QV4-oYoIw";
export const CHANNEL_URL = `https://www.youtube.com/@${CHANNEL_HANDLE}`;

export type VideoItem = {
  id: string;
  title: string;
  published: string;
  url: string;
  thumbnail: string;
};

export const fallbackVideos: VideoItem[] = [
  {
    id: "zaZJv6s52M8",
    title: "Feel the energetic | The Steady Rock - Re-Master Freddy",
    published: "2026-06-01T21:12:56+00:00",
    url: "https://www.youtube.com/watch?v=zaZJv6s52M8",
    thumbnail: "https://i.ytimg.com/vi/zaZJv6s52M8/hqdefault.jpg",
  },
  {
    id: "f5Csl4VqJ2A",
    title: "Midnight Reflection (High Octane Peak Hour Mix) | energetic",
    published: "2026-05-29T07:34:57+00:00",
    url: "https://www.youtube.com/watch?v=f5Csl4VqJ2A",
    thumbnail: "https://i.ytimg.com/vi/f5Csl4VqJ2A/hqdefault.jpg",
  },
  {
    id: "iwYpbHyVUgU",
    title: "System Collapse | energetic EDM | Re-Master Freddy",
    published: "2026-05-27T18:07:22+00:00",
    url: "https://www.youtube.com/watch?v=iwYpbHyVUgU",
    thumbnail: "https://i.ytimg.com/vi/iwYpbHyVUgU/hqdefault.jpg",
  },
  {
    id: "O4QyFqBctRE",
    title: "VM 2026 - La oss strale",
    published: "2026-05-24T20:34:43+00:00",
    url: "https://www.youtube.com/watch?v=O4QyFqBctRE",
    thumbnail: "https://i.ytimg.com/vi/O4QyFqBctRE/hqdefault.jpg",
  },
  {
    id: "b2WSh4scVwc",
    title: "Sensual Grooves | Skin on Skin by Re-Master Freddy",
    published: "2026-05-24T18:10:48+00:00",
    url: "https://www.youtube.com/watch?v=b2WSh4scVwc",
    thumbnail: "https://i.ytimg.com/vi/b2WSh4scVwc/hqdefault.jpg",
  },
  {
    id: "KqCwf9SGbm4",
    title: "Solo Aqui (Intimate Edit) | Sensual Vibes by Re-Master Freddy",
    published: "2026-05-23T17:37:30+00:00",
    url: "https://www.youtube.com/watch?v=KqCwf9SGbm4",
    thumbnail: "https://i.ytimg.com/vi/KqCwf9SGbm4/hqdefault.jpg",
  },
];

export async function getChannelVideos() {
  try {
    const response = await fetch("/api/youtube", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`YouTube feed failed: ${response.status}`);
    }

    const payload = (await response.json()) as { videos?: VideoItem[] };
    return payload.videos?.length ? payload.videos : fallbackVideos;
  } catch {
    return fallbackVideos;
  }
}

