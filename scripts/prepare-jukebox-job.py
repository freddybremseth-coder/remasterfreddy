#!/usr/bin/env python3
"""Create a pinned, non-publishing jukebox render manifest from staged media.

This prepares a local job but deliberately never renders or uploads anything.
The generated job is unapproved unless --approve-render is explicitly supplied.
"""
import argparse
import json
import math
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("job_runner", Path(__file__).with_name("render-jukebox-job.py"))
runner = module_from_spec(spec)
spec.loader.exec_module(runner)


def prepare_entry(root: Path, filename: str) -> dict:
    file = (root / filename).resolve()
    if Path(filename).is_absolute() or not file.is_relative_to(root) or not file.is_file():
        raise ValueError("Every source must exist within --media-dir")
    return {"file": filename, "sha256": runner.digest(file)}


def build_manifest(media_dir: Path, audio: str, jukebox: str,
                   clips: list[str], portrait: bool, seconds: float | None,
                   approved: bool = False) -> dict:
    root = media_dir.resolve(strict=True)
    if not 1 <= len(clips) <= 12:
        raise ValueError("Provide 1–12 music-video clips in intended order")
    if seconds is not None and (not math.isfinite(seconds) or seconds <= 0):
        raise ValueError("seconds must be positive")
    # Inspect all inputs before generating a durable approval request.
    for filename, kind in [(audio, "audio"), (jukebox, "video"), *[(clip, "video") for clip in clips]]:
        path = (root / filename).resolve()
        if Path(filename).is_absolute() or not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f"Invalid staged {kind} input: {filename}")
        runner.composer.probe_media(path, kind)
    return {
        "schema_version": 1,
        "approved_for_render": approved,
        "publish": False,
        "format": "portrait" if portrait else "landscape",
        "audio": prepare_entry(root, audio),
        "jukebox": prepare_entry(root, jukebox),
        "clips": [prepare_entry(root, clip) for clip in clips],
        "seconds": seconds,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-dir", type=Path, required=True)
    parser.add_argument("--audio", required=True, help="Filename relative to media directory")
    parser.add_argument("--jukebox", required=True, help="Filename relative to media directory")
    parser.add_argument("--video", required=True, action="append", help="Ordered middle clip; repeat 1–12 times")
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float)
    parser.add_argument("--approve-render", action="store_true",
                        help="Explicit operator approval for rendering only, never publication")
    parser.add_argument("--output", type=Path, required=True, help="New JSON manifest path")
    args = parser.parse_args()
    manifest = build_manifest(args.media_dir, args.audio, args.jukebox,
                              args.video, args.portrait, args.seconds, args.approve_render)
    with args.output.open("x", encoding="utf-8") as destination:
        json.dump(manifest, destination, indent=2)
        destination.write("\n")
    print(f"Prepared {args.output} · approved_for_render={args.approve_render} · publish=false")
