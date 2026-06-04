const CHANNEL_ID = "UCPAj3RNC2S_Nv7QV4-oYoIw";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function decodeEntity(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntity(match[1].trim()) : "";
}

function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 12).map(([, entry]) => {
    const id = readTag(entry, "yt:videoId");
    const title = readTag(entry, "title");
    const published = readTag(entry, "published");

    return {
      id,
      title,
      published,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  });
}

export default async function handler(_request, response) {
  try {
    const feed = await fetch(FEED_URL, {
      headers: {
        "user-agent": "Re-Master-Freddy/1.0",
        accept: "application/xml,text/xml",
      },
    });

    if (!feed.ok) {
      throw new Error(`Feed responded ${feed.status}`);
    }

    const xml = await feed.text();
    const videos = parseFeed(xml).filter((video) => video.id && video.title);

    response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.status(200).json({ channelId: CHANNEL_ID, videos });
  } catch (error) {
    response.status(502).json({
      error: "Could not read the YouTube feed.",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

