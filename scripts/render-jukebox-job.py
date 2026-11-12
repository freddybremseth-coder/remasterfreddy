#!/usr/bin/env python3
"""Render an explicitly approved local hybrid job with pinned input hashes.

No network, cloud storage, YouTube upload, or publication happens here.
The caller must stage media files locally and verify rights separately.
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("composer", Path(__file__).with_name("compose-jukebox-video.py"))
composer = module_from_spec(spec)
spec.loader.exec_module(composer)
sections_spec = spec_from_file_location("section_composer", Path(__file__).with_name("compose-jukebox-sections.py"))
section_composer = module_from_spec(sections_spec)
sections_spec.loader.exec_module(section_composer)


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def input_file(root: Path, entry: dict, label: str) -> Path:
    if not isinstance(entry, dict):
        raise ValueError(f"{label} must be an object")
    name, expected = entry.get("file"), entry.get("sha256")
    if not isinstance(name, str) or not name or Path(name).is_absolute():
        raise ValueError(f"Invalid local filename for {label}")
    if not isinstance(expected, str) or len(expected) != 64 or any(
        c not in "0123456789abcdef" for c in expected
    ):
        raise ValueError(f"Invalid SHA-256 for {label}")
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"{label} must be a file inside the media directory")
    if digest(path) != expected:
        raise ValueError(f"SHA-256 mismatch for {label}: {name}")
    return path


def prepare(manifest: dict, root: Path):
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported job schema_version")
    if manifest.get("approved_for_render") is not True:
        raise ValueError("Job requires explicit render approval")
    if manifest.get("publish") is not False:
        raise ValueError("Publication must be explicitly disabled")
    format_value = manifest.get("format")
    if format_value not in ("landscape", "portrait"):
        raise ValueError("format must be landscape or portrait")
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not 1 <= len(clips) <= 12:
        raise ValueError("Job requires 1–12 ordered middle clips")
    audio = input_file(root, manifest.get("audio"), "audio")
    jukebox = input_file(root, manifest.get("jukebox"), "jukebox")
    visuals = [input_file(root, clip, f"clip {i + 1}") for i, clip in enumerate(clips)]
    seconds = manifest.get("seconds")
    if seconds is not None and (
        isinstance(seconds, bool) or not isinstance(seconds, (int, float))
        or not math.isfinite(seconds) or seconds <= 0
    ):
        raise ValueError("seconds must be a positive finite number")
    composer.probe_media(audio, "audio")
    composer.probe_media(jukebox, "video")
    for visual in visuals:
        composer.probe_media(visual, "video")
    storyboard = manifest.get("section_timeline")
    if storyboard is not None:
        length = composer.probe_media(audio,"audio")
        length = min(length,seconds) if seconds is not None else length
        section_composer.build_section_plan(length, storyboard)
        expected = [row["clip"] for row in storyboard]
        if len(expected) != len(visuals) or set(expected) != {v.name for v in visuals}:
            raise ValueError("Storyboard must cover each approved image exactly once")
    return audio, jukebox, visuals, format_value == "portrait", seconds


def verify_complete_video(path: Path) -> None:
    """Decode the whole first video stream; probe headers alone cannot catch
    truncated frames or damaged media after an otherwise valid container header.
    Work stays local, without uploads or external media services.
    """
    duration = composer.probe_media(path, "video")
    if duration > 1800:
        raise ValueError(f"Video exceeds 30-minute validation limit: {path.name}")
    try:
        subprocess.run([
            "ffmpeg", "-hide_banner", "-nostdin", "-v", "error",
            "-xerror", "-i", str(path), "-map", "0:v:0",
            "-f", "null", "-"
        ], check=True, capture_output=True, timeout=max(60, min(600, int(duration * 3))))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as error:
        raise ValueError(f"Video failed full decoding validation: {path.name}") from error


def verify_rendered_mp4(path: Path, portrait: bool, expected_length: float) -> None:
    """Reject wrong codecs, missing soundtrack, wrong geometry or bad length."""
    try:
        raw = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height",
            "-of", "json", str(path)
        ], text=True, stderr=subprocess.PIPE, timeout=30)
        metadata = json.loads(raw)
        duration = float(metadata["format"]["duration"])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
            ValueError, KeyError, TypeError, OSError) as error:
        raise ValueError("Cannot inspect rendered MP4") from error
    expected_width, expected_height = (1080, 1920) if portrait else (1920, 1080)
    tracks = metadata.get("streams", [])
    video = [track for track in tracks if track.get("codec_type") == "video"]
    audio = [track for track in tracks if track.get("codec_type") == "audio"]
    if len(video) != 1 or len(audio) != 1:
        raise ValueError("Rendered MP4 must contain exactly one video and audio stream")
    if (video[0].get("codec_name") != "h264"
            or video[0].get("width") != expected_width
            or video[0].get("height") != expected_height
            or audio[0].get("codec_name") != "aac"):
        raise ValueError("Rendered MP4 has unexpected codecs or dimensions")
    if not math.isfinite(duration) or abs(duration - expected_length) > .5:
        raise ValueError("Rendered MP4 duration does not match source audio")


def render(manifest_path: Path, media_dir: Path, output: Path, plan_only: bool = False):
    root = media_dir.resolve(strict=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    audio, jukebox, clips, portrait, seconds = prepare(manifest, root)
    length = composer.probe_media(audio, "audio")
    length = min(length, seconds) if seconds is not None else length
    storyboard = manifest.get("section_timeline")
    plan = (section_composer.build_section_plan(length, storyboard)
            if storyboard is not None else composer.scene_plan(length, portrait, clips))
    if plan_only:
        return {"status": "validated", "scene_plan": plan,
                "full_decode_checked": False}
    # Validate all frames before generating any output. This is not a review
    # of content rights or visual suitability, which requires human approval.
    for source in (jukebox, *clips):
        verify_complete_video(source)
    # Keep the output out of the input directory; protect staged source files.
    target = output.resolve()
    if target.is_relative_to(root):
        raise ValueError("Output must be outside the media input directory")
    if target.exists():
        raise FileExistsError(f"Output already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Render into a sibling temporary file. Never expose an incomplete final MP4.
    with tempfile.NamedTemporaryFile(
        dir=target.parent, prefix=".jukebox-render-", suffix=".mp4",
        delete=False
    ) as temporary:
        staged = Path(temporary.name)
    try:
        if storyboard is not None:
            section_composer.compose_sections(audio, jukebox, clips,
                                              storyboard, staged, portrait, seconds)
        else:
            composer.compose(audio, jukebox, clips, staged, portrait, seconds)
        output_hash = digest(staged)
        output_duration = composer.media_duration(staged)
        verify_rendered_mp4(staged, portrait, length)
        # Hard link fails if target exists, avoiding accidental replacement.
        os.link(staged, target)
    finally:
        staged.unlink(missing_ok=True)
    return {
        "status": "rendered",
        "output": str(target),
        "sha256": output_hash,
        "duration_seconds": output_duration,
        "scene_plan": plan,
        "published": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--media-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(render(args.manifest, args.media_dir, args.output, args.plan_only), indent=2))
