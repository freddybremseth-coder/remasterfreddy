# Re-Master Freddy

A dark liquid-glass 3D music website for `remaster.freddybremseth.com`, powered by the Re-Master Freddy YouTube channel and the `realtyflow.chatgenius.pro` production engine.

## Stack

- React + Vite
- Three.js / React Three Fiber for the 3D stage
- YouTube IFrame API for channel playback
- Vercel serverless API route for fresh channel videos

## YouTube

The site uses the channel `https://www.youtube.com/@remaster-freddy`.

- Channel ID: `UCPAj3RNC2S_Nv7QV4-oYoIw`
- Uploads playlist: `UUPAj3RNC2S_Nv7QV4-oYoIw`

Browsers block autoplay with sound until the visitor interacts with the page, so playback starts muted and the `Unmute` button unlocks audio.

## Production

Production is controlled by `https://realtyflow.chatgenius.pro`.

- Release cadence: 5 new songs per week
- The website pulls fresh channel tracks from YouTube and presents them as the public music layer.

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
