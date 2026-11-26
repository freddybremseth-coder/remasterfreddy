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

## Outcome of the first real five-song browser test (2026-11-26)

A screenshot submitted by the owner after analyzing all five calibration songs shows:
- 5 analyzed, 4 non-abstained suggestions, 1 exact match, 3 incorrect suggestions, 1 abstention.
- One confirmed rock genre abstained; the electronic genre was suggested as pop; the confirmed ballad matched ballad; a relaxing mood was called energetic; chillout style was called lo-fi.
- Accuracy **among non-abstained suggestions**: 1/4 (25%). This is not a robust estimate of future accuracy and does not authorize auto classification.
- These results are manually transcribed from the owner-provided UI screenshot, **not** persisted model predictions or a blinded independent test. Subsequent local changes to audio sampling and prompts are not independently evaluated until the owner runs new comparisons.

Decision: **CLAP is rejected as the sole automatic genre decision-maker for Re-master.** Keep it as an optional research tool with no path to change `songs.genre`, `authorSelectedGenre`, video visuals or YouTube.

## Alternative classifiers considered

- `dima806/music_genres_classification` (https://huggingface.co/dima806/music_genres_classification) is a dedicated wav2vec2-based classifier with Apache-2.0 listed on its model card. It supports the ten GTZAN labels (blues, classical, country, disco, hip-hop, jazz, metal, pop, reggae, rock). Its model card reports 94.6M parameters and a roughly 378 MB float-weight file. It **does not support electronic, chillout, relaxing or a power-rock subclass**, so it cannot replace the current label taxonomy as-is. The model is not deployed by a hosted inference provider on its page. Research candidate only; **no API calls, downloads or charges have been made**.
- `ccmusic-database/music_genre` (https://huggingface.co/ccmusic-database/music_genre) lists an MIT license and 16 fine-tuning genre categories, but requires its own spectrogram/vision architecture. Category mapping, dataset rights, inference compatibility and independent accuracy need checking. Research candidate only.
- Specialist classifier licensing and target-label coverage must be verified *before* implementing or paying for inference. In particular, do not treat GTZAN's disco class as equivalent to all electronic music or chillout.

## Go / no-go gate

A separate genre model may only **suggest** labels when a technically verified, independently evaluated and license-appropriate deployment exists. The five calibration cases cannot greenlight the automated path regardless of score. User-confirmed genre metadata always takes precedence. Visual selection requires a separate content/theme decision; no model may inject neon, yacht or DJ imagery based solely on a broad genre guess.
