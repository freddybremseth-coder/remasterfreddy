# Re-master Freddy: 1960s jukebox video prototype

This is an **offline rendering prototype**, not yet a Studio button, background job, or automatic publication feature. It uses original SVG assets, avoiding licensed Rock-Ola imagery. Publication is intentionally out of scope.

## Run locally

Requires Python 3, `ffmpeg`, `ffprobe`, and `inkscape` on the rendering machine.

```bash
python3 scripts/render-jukebox.py --audio ./my-song.mp3 --title 'My Song' --output ./my-song.mp4
python3 scripts/render-jukebox.py --audio ./my-song.mp3 --title 'My Song' --output ./my-short.mp4 --portrait --seconds 30
python3 scripts/test-jukebox.py
```

## Batch rendering (multiple songs)

Use a local JSON file, for example `songs.json` next to your audio files:

```json
{
  "songs": [
    {"slug":"midnight-groove", "title":"Midnight Groove", "audio":"midnight-groove.mp3"},
    {"slug":"sunset-drive", "title":"Sunset Drive", "audio":"sunset-drive.mp3"}
  ]
}
```

```bash
python3 scripts/render-jukebox-batch.py --manifest ./songs.json --output-dir ./jukebox-output
python3 scripts/render-jukebox-batch.py --manifest ./songs.json --output-dir ./jukebox-shorts --portrait --seconds 30
```

Each completed MP4 has a JSON sidecar containing the audio SHA-256 and template settings. Re-running the identical manifest skips verified output. Changed songs, titles or render settings create a new `-v2` file rather than overwriting an existing video. A failed song does not stop the rest of the batch. Everything runs locally; **no files are uploaded or published**.

The source audio starts at the beginning; no extra sound effect or pitch/speed conversion is applied. The record spins at the correct 45 rpm, and the title appears both on its moving label and in a static caption for readability. The plate slides into view during the first three seconds. The next iteration needs a realistic mechanical arm / jukebox selection sequence, artist-approved visual assets, and a seamless intro-to-loop transition.

## Integration needed before production

1. Production backend should accept a verified library `songId`, not arbitrary user-provided file URLs. Fetch the song title and its authenticated master audio server-side.
2. Queue rendering with a unique key `(songId, masterVersion, format, templateVersion)`, prevent duplicates, track heartbeats/errors and retain resumable output metadata.
3. Store completed MP4 in approved media storage, expose preview status and manual approval in the existing admin interface. Never publish on render completion.
4. Use the existing YouTube integration only after explicit approval, and verify output audio, frame dimensions, duration and upload status.
5. Render on a worker with FFmpeg and Inkscape installed, not in the Vercel frontend request lifecycle.

This prototype is intended as the rendering core for issue #55.
