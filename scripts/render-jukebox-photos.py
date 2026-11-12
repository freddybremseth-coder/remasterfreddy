#!/usr/bin/env python3
"""Create cinematic muted video clips from approved staged photos.

Photos preserve their original ordering. Visual clips have no audio; the Jukebox
composer maps the original song master once and continuously. No publication.
"""
import math
import subprocess
from pathlib import Path

MAX_PHOTOS = 12


def interleave_visuals(original: list[str], photos: list[str]) -> list[str]:
    """Prioritize all chosen photos while keeping up to 12 mixed scenes."""
    if len(photos) > MAX_PHOTOS or len(set(photos)) != len(photos):
        raise ValueError("Invalid photo list")
    allowed_originals = original[:MAX_PHOTOS - len(photos)]
    merged = []
    for index in range(max(len(photos), len(allowed_originals))):
        if index < len(photos):
            merged.append(photos[index])
        if index < len(allowed_originals):
            merged.append(allowed_originals[index])
    if not merged or len(merged) > MAX_PHOTOS:
        raise ValueError("No valid scenes for Jukebox")
    return merged


def render_photo(path: Path, target: Path, duration: float, portrait: bool) -> None:
    if not path.is_file() or target.exists():
        raise ValueError("Photo is missing or scene output already exists")
    if not math.isfinite(duration) or duration <= 0 or duration > 300:
        raise ValueError("Invalid photo scene duration")
    width, height = (540, 960) if portrait else (960, 540)
    # Bound even oversized uploaded images before zoompan. Smooth (small)
    # motion; do not invent lip synchronization or an audio track.
    filters = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        f"zoompan=z='min(zoom+0.00022,1.075)':"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d=1:s={width}x{height}:fps=25,format=yuv420p"
    )
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-loop", "1", "-framerate", "25", "-i", str(path),
        "-vf", filters, "-t", f"{duration:.3f}",
        "-an", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "23", "-movflags", "+faststart", str(target)
    ], check=True, capture_output=True, timeout=max(60, int(duration * 5)))
    if not target.is_file() or target.stat().st_size < 1000:
        raise ValueError("Photo clip could not be produced")


def render_photos(root: Path, receipt: list[dict], duration: float, portrait: bool,
                  number_original_clips: int) -> list[str]:
    if not receipt:
        return []
    if len(receipt) > MAX_PHOTOS:
        raise ValueError("Too many selected photos")
    # Calculate exact segment length using the same three-part timing model
    # as the final composer, rather than estimating from file size.
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("jukebox_photo_composer",
                                   Path(__file__).with_name("compose-jukebox-video.py"))
    composer = module_from_spec(spec)
    spec.loader.exec_module(composer)
    intro, middle, outro = composer.timings(duration, portrait)
    total = min(MAX_PHOTOS, len(receipt) + number_original_clips)
    scene_duration = middle / total
    converted = []
    for index, item in enumerate(receipt):
        source = root / item["file"]
        target = root / f"photo-scene-{index:02d}.mp4"
        render_photo(source, target, scene_duration, portrait)
        converted.append(target.name)
    return converted
