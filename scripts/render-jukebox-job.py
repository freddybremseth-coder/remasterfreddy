#!/usr/bin/env python3
"""Render an explicitly approved local hybrid job with pinned input hashes.

No network, cloud storage, YouTube upload, or publication happens here.
The caller must stage media files locally and verify rights separately.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("composer", Path(__file__).with_name("compose-jukebox-video.py"))
composer = module_from_spec(spec)
spec.loader.exec_module(composer)


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
    return audio, jukebox, visuals, format_value == "portrait", seconds


def render(manifest_path: Path, media_dir: Path, output: Path, plan_only: bool = False):
    root = media_dir.resolve(strict=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    audio, jukebox, clips, portrait, seconds = prepare(manifest, root)
    length = composer.probe_media(audio, "audio")
    length = min(length, seconds) if seconds is not None else length
    plan = composer.scene_plan(length, portrait, clips)
    if plan_only:
        return {"status": "validated", "scene_plan": plan}
    # Keep the output out of the input directory; protect staged source files.
    target = output.resolve()
    if target.is_relative_to(root):
        raise ValueError("Output must be outside the media input directory")
    if target.exists():
        raise FileExistsError(f"Output already exists: {target}")
    composer.compose(audio, jukebox, clips, target, portrait, seconds)
    return {
        "status": "rendered",
        "output": str(target),
        "sha256": digest(target),
        "duration_seconds": composer.media_duration(target),
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
