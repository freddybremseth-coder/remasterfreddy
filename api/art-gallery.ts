const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const songId = typeof request.query?.songId === 'string' ? request.query.songId : '';
  if (!UUID.test(songId)) return response.status(400).json({ error: 'Invalid song ID' });
  const base = (process.env.REALTYFLOW_API_URL || 'https://realtyflow.chatgenius.pro').replace(/\/$/, '');
  try {
    const upstream = await fetch(`${base}/api/public/remaster-art-gallery?songId=${encodeURIComponent(songId)}`, {
      headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'manual',
    });
    if (upstream.status >= 300 && upstream.status < 400) return response.status(502).json({ error: 'Gallery backend unavailable' });
    const data = await upstream.json().catch(() => null);
    if (!data || typeof data !== 'object') return response.status(502).json({ error: 'Invalid gallery response' });
    response.setHeader('Cache-Control', upstream.ok ? 'public, max-age=120, s-maxage=300' : 'no-store');
    return response.status(upstream.status).json(data);
  } catch {
    return response.status(502).json({ error: 'Gallery backend unavailable' });
  }
}
