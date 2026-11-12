# Approved jukebox cabinet assets

Place the approved **blank-platter, blank-marquee** photographic backgrounds in this folder:

- `cabinet-landscape.png` — exactly **1920 × 1080** (YouTube 16:9)
- `cabinet-portrait.png` — exactly **1080 × 1920** (Shorts 9:16)

The renderer discovers these files automatically. Do not bake a song title, spinning vinyl, or tonearm into either background; those are generated as independent overlays.

The approved landscape PNG was prepared locally from the clean Re-master Freddy photo. SHA-256: `085ff7ab9ee9e6858c294e00875068eda4cb11730ff93570d9e1ed23cfacc7a2`. It must be uploaded to this path before the photographic style becomes the default in CI or production.

The portrait photo has **not** been approved or supplied. Do not crop the landscape photo into portrait without visual review; keep the illustrated fallback until a suitable vertical photo is available.

After uploading the asset, render a short 16:9 MP4 and review the record-to-platter alignment, title legibility and tonearm before merging or publishing.
