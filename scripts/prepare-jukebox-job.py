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


def clips_from_storyboard(path: Path) -> tuple[list[str], bool, float]:
    """Read planning-only JSON exported from the admin scene editor.

    The file is never treated as an approval or as a source of media bytes.
    """
    plan = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(plan, dict) or plan.get("version") != 1:
        raise ValueError("Unsupported storyboard version")
    if plan.get("renderStatus") != "planning_only" or plan.get("localMediaIncluded") is not False:
        raise ValueError("Expected a planning-only storyboard without bundled media")
    if plan.get("style") != "hybrid" or plan.get("format") not in ("landscape", "portrait"):
        raise ValueError("Expected hybrid storyboard with a supported format")
    scenes = [entry for entry in plan.get("entries", [])
              if isinstance(entry, dict) and entry.get("type") == "music_video_scene"]
    if not 1 <= len(scenes) <= 12:
        raise ValueError("Storyboard requires 1–12 scenes")
    if [scene.get("sequence") for scene in scenes] != list(range(1, len(scenes) + 1)):
        raise ValueError("Scene sequence must be contiguous and ordered")
    names = [scene.get("filename") for scene in scenes]
    if any(not isinstance(name, str) or not name for name in names):
        raise ValueError("Select a real local video file for every storyboard scene")
    if not isinstance(plan.get("entries"), list) or (
        [entry.get("type") for entry in plan["entries"]] !=
        ["jukebox_intro", *(["music_video_scene"] * len(scenes)), "jukebox_outro"]
    ):
        raise ValueError("Storyboard must contain intro, ordered scenes and outro")
    seconds = plan.get("seconds")
    if isinstance(seconds, bool) or not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("Invalid storyboard duration")
    return names, plan["format"] == "portrait", seconds


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-dir", type=Path, required=True)
    parser.add_argument("--audio", required=True, help="Filename relative to media directory")
    parser.add_argument("--jukebox", required=True, help="Filename relative to media directory")
    parser.add_argument("--video", action="append", help="Ordered middle clip; repeat 1–12 times")
    parser.add_argument("--storyboard", type=Path, help="Planning-only JSON downloaded from admin editor")
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float)
    parser.add_argument("--approve-render", action="store_true",
                        help="Explicit operator approval for rendering only, never publication")
    parser.add_argument("--output", type=Path, required=True, help="New JSON manifest path")
    args = parser.parse_args()
    if args.storyboard and (args.video or args.portrait or args.seconds is not None):
        parser.error("--storyboard cannot be combined with --video, --portrait or --seconds")
    if args.storyboard:
        clips, portrait, seconds = clips_from_storyboard(args.storyboard)
    else:
        clips, portrait, seconds = args.video or [], args.portrait, args.seconds
    manifest = build_manifest(args.media_dir, args.audio, args.jukebox,
                              clips, portrait, seconds, args.approve_render)
    with args.output.open("x", encoding="utf-8") as destination:
        json.dump(manifest, destination, indent=2)
        destination.write("\n")
    print(f"Prepared {args.output} · approved_for_render={args.approve_render} · publish=false")
