# Re-Master Freddy

**Re-Master Freddy is an AI-assisted EDM / house music channel engine that turns songs into YouTube-ready visual music experiences — automatically.**

🎧 **Listen:** [remaster.freddybremseth.com](https://remaster.freddybremseth.com) · ▶️ **YouTube:** [Re-Master Freddy](https://www.youtube.com/channel/UCPAj3RNC2S_Nv7QV4-oYoIw)

## What it does

Upload an MP3 — the engine does the rest:

- Analyzes the song with AI (genre, mood, energy, visual style)
- Generates cinematic summer visuals (people, beaches, boats, festivals, DJs)
- Renders a Full HD video with logo watermark and branded thumbnails (3 A/B variants)
- Writes CTR-optimized titles, SEO descriptions with chapters, tags and multilingual metadata
- Uploads to YouTube at the optimal publish time, adds it to smart playlists
- Cuts 3 vertical Shorts per song from the strongest sections (chorus detection) with links back to the full track
- Publishes a weekly long-form genre mix with a full tracklist

## Growth system

- Automatic thumbnail A/B testing (rotates variants, keeps the winner by views/hour)
- Bulk library cleanup: regenerate titles + thumbnails for older videos with one-click approval
- Weekly trending-tag refresh, engagement tracking and AI channel recommendations
- Structured data (MusicGroup/WebSite JSON-LD) for AI search visibility (GEO/AEO)

## Stack

- React + Vite
- Three.js / React Three Fiber for the 3D stage
- YouTube IFrame API for channel playback
- Vercel serverless API routes for fresh channel videos and protected admin migration endpoints
- Supabase Auth REST API for administrator login

## YouTube

The site uses the channel `https://www.youtube.com/@remaster-freddy`.

- Channel ID: `UCPAj3RNC2S_Nv7QV4-oYoIw`
- Uploads playlist: `UUPAj3RNC2S_Nv7QV4-oYoIw`

Browsers block autoplay with sound until the visitor interacts with the page, so playback starts muted and the `Unmute` button unlocks audio.

## Admin

The public site contains an Admin entry that opens:

```text
/admin
```

Only the configured Supabase Auth admin user is accepted (see `ADMIN_EMAIL` in `api/_admin.ts`).

Required Vercel environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
REALTYFLOW_API_URL
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the browser login. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are used by the protected serverless API. They can point to the same Supabase project.

`REALTYFLOW_API_URL` is optional during migration and defaults to:

```text
https://realtyflow.chatgenius.pro
```

An optional `REALTYFLOW_MIGRATION_SECRET` can be added to both applications when the old RealtyFlow endpoint is locked down.

## Production migration

The Re-Master Freddy admin now owns the user-facing publishing queue. During the migration period, its protected `/api/neural-beat` endpoint validates the Supabase admin session and proxies jobs to the existing RealtyFlow server pipeline.

The following server functions remain in RealtyFlow until the next migration stage:

- AI song analysis and YouTube metadata generation
- image bank, logo and thumbnail composition
- FFmpeg video rendering
- YouTube OAuth, upload and scheduling
- analytics and recommendations

The old module should not be removed from RealtyFlow until the Re-Master Freddy pipeline has been tested in production.

Operational docs:

- [Production E2E checklist](docs/production-e2e-checklist.md)
- [Domain and OAuth notes](docs/domain-and-oauth.md)

## Run

```bash
npm install
npm run dev
```

Local preview runs on:

```text
http://localhost:5174/
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

The test suite uses Vitest, React Testing Library, and jsdom for focused admin UI coverage.

Deploy the project to Vercel and assign the custom domain:

```text
remaster.freddybremseth.com
```
