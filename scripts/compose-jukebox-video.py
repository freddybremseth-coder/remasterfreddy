#!/usr/bin/env python3
"""Compose a branded jukebox intro, varied middle video, and jukebox outro.

Input audio is the ONLY soundtrack; both visual sources are treated as silent.
The last two seconds freeze the jukebox platter to signal playback stopping.
The middle can use multiple approved clips, equally distributed across its section.
The source clips must already have been visually reviewed; this script does not
generate or select the middle scenes, approve content, or publish to YouTube.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path
from collections.abc import Sequence


def media_duration(path: Path) -> float:
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path)
    ], text=True)
    duration = float(json.loads(raw)["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid media duration")
    return duration


def timings(duration: float, portrait: bool) -> tuple[float, float, float]:
    """Reserve a real main-video section; shorten endcaps for short songs."""
    if portrait:
        intro, outro = min(3.0, duration * .12), min(3.0, duration * .12)
    else:
        intro, outro = min(30.0, duration * .20), min(15.0, duration * .10)
    middle = duration - intro - outro
    if middle < 1.0:
        raise ValueError("Audio is too short for three-part composition")
    return intro, middle, outro


def scene_plan(duration: float, portrait: bool, clips: Sequence[Path]) -> list[dict]:
    """Return a timeline that reviewers can inspect before rendering."""
    if not clips or len(clips) > 12:
        raise ValueError("Provide between 1 and 12 approved music-video clips")
    intro, middle, outro = timings(duration, portrait)
    plan = [{"kind": "jukebox_intro", "start": 0.0, "duration": intro}]
    for index, clip in enumerate(clips):
        start = intro + middle * index / len(clips)
        end = intro + middle * (index + 1) / len(clips)
        plan.append({
            "kind": "music_video", "clip": clip.name,
            "start": round(start, 3), "duration": round(end - start, 3)
        })
    plan.append({
        "kind": "jukebox_outro", "start": round(duration - outro, 3),
        "duration": round(outro, 3),
        "visual_stop_seconds": min(2.0 if not portrait else .7, outro * .35)
    })
    return plan


def compose(audio: Path, jukebox: Path, middle_video: Path | Sequence[Path],
            output: Path, portrait: bool, seconds: float | None = None) -> tuple[float, float, float]:
    middle_clips = [middle_video] if isinstance(middle_video, Path) else list(middle_video)
    if not middle_clips or len(middle_clips) > 12:
        raise ValueError("Provide between 1 and 12 approved music-video clips")
    for source in (audio, jukebox, *middle_clips):
        if not source.is_file():
            raise FileNotFoundError(source)
    length = media_duration(audio)
    if seconds is not None:
        if not math.isfinite(seconds) or seconds <= 0:
            raise ValueError("Invalid requested duration")
        length = min(length, seconds)
    intro, middle, outro = timings(length, portrait)
    width, height = (1080, 1920) if portrait else (1920, 1080)
    stop = min(2.0 if not portrait else .7, outro * .35)
    active_outro = outro - stop
    if active_outro <= 0:
        raise ValueError("Outro is too short")
    output.parent.mkdir(parents=True, exist_ok=True)
    # Each video input loops when the underlying clip is shorter than the
    # required segment. Overlay original audio once, continuously, at t=0.
    norm = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25"
    # Divide the middle section evenly. Each visual is looped if shorter than
    # its allocation. All input audio tracks are discarded; source audio is continuous.
    segments = []
    for index, _ in enumerate(middle_clips):
        segment_length = middle / len(middle_clips)
        segments.append(
            f"[{index + 1}:v]{norm},trim=duration={segment_length:.3f},"
            f"setpts=PTS-STARTPTS[scene{index}]"
        )
    graph = ";".join([
        f"[0:v]{norm},trim=duration={intro:.3f},setpts=PTS-STARTPTS[intro]",
        *segments,
        f"[0:v]{norm},trim=duration={active_outro:.3f},setpts=PTS-STARTPTS,"
        f"tpad=stop_mode=clone:stop_duration={stop:.3f}[outro]",
        f"[intro]{''.join(f'[scene{i}]' for i in range(len(middle_clips)))}[outro]"
        f"concat=n={len(middle_clips) + 2}:v=1:a=0,format=yuv420p[v]"
    ])
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-stream_loop", "-1", "-i", str(jukebox),
    ]
    for visual in middle_clips:
        command.extend(["-stream_loop", "-1", "-i", str(visual)])
    command.extend([
        "-i", str(audio), "-filter_complex", graph,
        "-map", "[v]", "-map", f"{len(middle_clips) + 1}:a:0", "-t", f"{length:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-r", "25", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(output)
    ])
    subprocess.run(command, check=True, timeout=max(90, int(length * 4)))
    actual = media_duration(output)
    if abs(actual - length) > .5:
        raise RuntimeError(f"Unexpected MP4 duration: {actual:.3f} vs {length:.3f}")
    return intro, middle, outro


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--jukebox", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True, action="append", help="Approved middle video clip (repeat for up to 12 clips)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float)
    parser.add_argument("--plan-only", action="store_true", help="Show exact cut timeline as JSON without rendering")
    args = parser.parse_args()
    if args.plan_only:
        duration = media_duration(args.audio)
        if args.seconds is not None:
            if not math.isfinite(args.seconds) or args.seconds <= 0:
                parser.error("--seconds must be positive")
            duration = min(duration, args.seconds)
        print(json.dumps(scene_plan(duration, args.portrait, args.video), indent=2))
    else:
        result = compose(args.audio, args.jukebox, args.video, args.output, args.portrait, args.seconds)
        print("Jukebox intro %.1fs · music video %.1fs · Jukebox outro %.1fs" % result)
