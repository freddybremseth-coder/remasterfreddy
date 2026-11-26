# Re-master Freddy — blinded music analysis benchmark (2026-11-26)

## Status

The private, owner-authenticated Studio contains verified labels for the recorded songs and a deterministic five-song calibration list. An optional, explicitly clicked **browser-local CLAP experiment** is now available. It is separate from the existing MP3 loudness/rhythm analyzer. **No paid provider, automatic publishing or automatic genre update is enabled.** The browser model has not yet passed a live end-to-end user test.

At inspection time: 25 author-confirmed song labels, 22 with accessible MP3; the cohort changes as more songs are corrected. The benchmark dynamically recalculates.

## Independent targets

Do not treat all confirmed values as a single genre class.

- **Genre:** rock, power-rock, ballad, chanson, electronic, pop, etc.
- **Mood/use:** relaxing, meditation.
- **Style:** chillout, ambient, lofi, downtempo, cinematic.

Each model output must declare its axis. Predicting a genre does not count as a correct answer to a mood question. Reference truth comes only from `metadata.genreSource=author` and `metadata.authorSelectedGenre` on a song with an MP3. The old `genreReviewLegacyGenre` is never a reference answer.

## Protocol

1. Select the five deterministic, varied audio-only calibration songs from `firstFiveAudioCalibration`.
2. Run an authorized, commercially licensed audio classifier **only if** its inference environment is provisioned and its charges/retention rules have been reviewed.
3. Give the classifier short decoded MP3 excerpts only; never supply song title, old genre, author label or YouTube metadata.
4. Align returned tags with the three target axes before measuring performance. Record the model and version; do not map every low-confidence tag to EDM or Chillout.
5. Freeze the model and tag mapping after the five calibration runs. Evaluate on `splitAudioCalibration(...).holdout` (currently 17 MP3s). Do not use any of these for tuning.
6. Measure coverage, exact matches per axis, abstentions, and false EDM predictions. A model may abstain; do not overwrite owner-confirmed labels or auto-publish.
7. Do not claim production reliability from a 22-song experiment; sample sizes per label are small, and a second independent sample is needed before automatic recommendations.

The implementation provides `verifiedAudioReferences`, `audioBenchmarkSummary`, `firstFiveAudioCalibration`, `splitAudioCalibration` and `compareModelWithOwner`. They are pure functions and do not call any provider or modify data.

## Commercial license decision

- The MTG/Essentia classifiers shown on Replicate are **non-commercially licensed** without separate agreement; they are **not enabled** in this commercial product. Verify current licensing directly with MTG before any use.
- **LAION CLAP HTSAT-unfused** is offered under **Apache-2.0** at https://huggingface.co/laion/clap-htsat-unfused. A quantized ONNX browser export, https://huggingface.co/Xenova/clap-htsat-unfused, is used for a manually initiated trial. The browser downloads roughly 160 MB model weights plus runtime and runs a 10-second first-party audio excerpt locally in a Web Worker. No external inference worker or paid API is involved. Real-world download, inference memory and prediction accuracy are not yet verified. Model weights are served by Hugging Face and library code by a pinned jsDelivr version; audio comes only from the first-party Supabase storage.
- The existing Replicate token is not proof that an appropriate commercially licensed audio classifier is deployed. Do not automatically send MP3 files to Replicate, MTG, Hugging Face or other external providers.

## Security / operations

- Retain owner-only authentication on all model-trial endpoints.
- Bound audio bytes/length and reject arbitrary remote URLs to prevent SSRF.
- Use only a temporary server-side excerpt or first-party signed asset URL with narrow TTL; avoid logging song audio URLs and secrets.
- Model suggestions must be stored separately from `songs.genre` and `songs.ai_metadata.authorSelectedGenre` with run ID, model version, axis, timestamp and error status.
- Trigger only via an explicit owner action, capped by a strict per-run quantity and budget. No cron, GitHub Actions, Gemini image generation or automatic YouTube publishing.
- Before enabling any PAID provider, document an actual end-to-end run on a single song and its unit charge. The browser-only model has zero paid inference charges, but requires network bandwidth, sufficient browser memory and an actual end-to-end test.

## Exit criteria

A genuine five-song browser inference run with documented license, raw outputs, no cross-song metadata leakage, no unexpected song/YouTube mutation, and reproducible evaluation. The model test is **available on click, not automatically run**. A READY Vercel build and passing unit tests do not establish that model loading and inference work on the user’s browser.
