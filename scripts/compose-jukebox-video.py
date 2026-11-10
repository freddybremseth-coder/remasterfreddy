#!/usr/bin/env python3
"""Compose a branded jukebox intro, varied middle video, and jukebox outro.

Input audio is the ONLY soundtrack; both visual sources are treated as silent.
The last two seconds freeze the jukebox platter to signal playback stopping.
The source clips must already have been visually reviewed; this script does not
generate or select the middle scenes, approve content, or publish to YouTube.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path


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


def compose(audio: Path, jukebox: Path, middle_video: Path,
            output: Path, portrait: bool, seconds: float | None = None) -> tuple[float, float, float]:
    for source in (audio, jukebox, middle_video):
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
    graph = (
        f"[0:v]{norm},trim=duration={intro:.3f},setpts=PTS-STARTPTS[intro];"
        f"[1:v]{norm},trim=duration={middle:.3f},setpts=PTS-STARTPTS[middle];"
        f"[0:v]{norm},trim=duration={active_outro:.3f},setpts=PTS-STARTPTS,"
        f"tpad=stop_mode=clone:stop_duration={stop:.3f}[outro];"
        f"[intro][middle][outro]concat=n=3:v=1:a=0,format=yuv420p[v]"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-stream_loop", "-1", "-i", str(jukebox),
        "-stream_loop", "-1", "-i", str(middle_video),
        "-i", str(audio), "-filter_complex", graph,
        "-map", "[v]", "-map", "2:a:0", "-t", f"{length:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-r", "25", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(output)
    ]
    subprocess.run(command, check=True, timeout=max(90, int(length * 4)))
    actual = media_duration(output)
    if abs(actual - length) > .5:
        raise RuntimeError(f"Unexpected MP4 duration: {actual:.3f} vs {length:.3f}")
    return intro, middle, outro


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--jukebox", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True, help="Video used during the middle section")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float)
    args = parser.parse_args()
    result = compose(args.audio, args.jukebox, args.video, args.output, args.portrait, args.seconds)
    print("Jukebox intro %.1fs · music video %.1fs · Jukebox outro %.1fs" % result)
