# Re-Master Freddy

A dark liquid-glass 3D music website for `remaster.freddybremseth.com`, powered by the Re-Master Freddy YouTube channel.

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

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploy the project to Vercel and assign the custom domain:

```text
remaster.freddybremseth.com
```

