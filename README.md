# Re-Master Freddy

A dark liquid-glass 3D music website for `remaster.freddybremseth.com`, powered by the Re-Master Freddy YouTube channel and the `realtyflow.chatgenius.pro` production engine during the migration period.

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

Only this Supabase Auth user is accepted:

```text
freddy.bremseth@gmail.com
```

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

Deploy the project to Vercel and assign the custom domain:

```text
remaster.freddybremseth.com
```
