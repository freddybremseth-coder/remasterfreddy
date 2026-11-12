#!/usr/bin/env python3
"""Compose explicitly timed still images and jukebox fallback with one song audio.

Windows are seconds from the ORIGINAL master (not guessed from lyric labels).
Photo clips are muted and already verified by the private worker. All uncovered
time is shown using the approved jukebox video. Public publishing is impossible.
"""
import json
import math
import subprocess
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("jukebox_composer", Path(__file__).with_name("compose-jukebox-video.py"))
composer = module_from_spec(spec)
spec.loader.exec_module(composer)

SECTIONS = {"opening", "verse1", "chorus", "verse2", "bridge", "solo", "outro"}


def build_section_plan(duration: float, assignments: list[dict]) -> list[dict]:
    if not math.isfinite(duration) or not 1 < duration <= 3600:
        raise ValueError("Invalid section song duration")
    if not isinstance(assignments, list) or not 1 <= len(assignments) <= 12:
        raise ValueError("One to twelve section photos required")
    cursor = 0.0
    plan = []
    seen = set()
    for entry in assignments:
        if not isinstance(entry, dict) or set(entry) != {"section", "clip", "start", "end"}:
            raise ValueError("Invalid timed photo assignment")
        clip, kind = entry["clip"], entry["section"]
        a, b = entry["start"], entry["end"]
        if (not isinstance(clip, str) or not clip.startswith("photo-scene-")
                or not clip.endswith(".mp4") or "/" in clip or "\\" in clip
                or clip in seen or kind not in SECTIONS
                or any(type(n) not in (int, float) or not math.isfinite(n) for n in (a, b))
                or a < cursor - 0.000001 or b <= a or b > duration + 0.000001
                or b-a > 300):
            raise ValueError("Overlapping, out-of-range or invalid photo time window")
        if a > cursor + 0.000001:
            plan.append({"kind":"jukebox", "start":cursor, "end":a})
        plan.append({"kind":"photo", "section":kind, "clip":clip, "start":a, "end":b})
        cursor = b
        seen.add(clip)
    if cursor < duration - 0.000001:
        plan.append({"kind":"jukebox", "start":cursor, "end":duration})
    return plan


def compose_sections(audio: Path, jukebox: Path, photo_clips: list[Path],
                     assignments: list[dict], output: Path, portrait: bool,
                     seconds: float | None = None):
    if not audio.is_file() or not jukebox.is_file() or not photo_clips:
        raise ValueError("Song, cabinet and selected photo clips required")
    original_length = composer.probe_media(audio,"audio")
    length = min(original_length, seconds) if seconds is not None else original_length
    composer.probe_media(jukebox,"video")
    plan = build_section_plan(length,assignments)
    photo_map = {p.name:p for p in photo_clips}
    used = [item["clip"] for item in plan if item["kind"]=="photo"]
    if len(photo_map) != len(photo_clips) or set(used) != set(photo_map):
        raise ValueError("All timed photos must be unique and rendered")
    for item in plan:
        if item["kind"] == "photo":
            if composer.probe_media(photo_map[item["clip"]],"video") + .05 < item["end"]-item["start"]:
                raise ValueError("Timed photo clip too short")
    width,height = (1080,1920) if portrait else (1920,1080)
    normalize = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                 f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25")
    # One endlessly looped source per input. Never map any video source audio.
    args = ["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y",
            "-stream_loop","-1","-i",str(jukebox)]
    for video in photo_clips:
        args.extend(["-stream_loop","-1","-i",str(video)])
    args.extend(["-i",str(audio)])
    clip_indexes = {p.name:i+1 for i,p in enumerate(photo_clips)}
    backgrounds = [item for item in plan if item["kind"]=="jukebox"]
    fragments = []
    if len(backgrounds) > 1:
        fragments.append("[0:v]split="+str(len(backgrounds))+
                         "".join(f"[bg{i}]" for i in range(len(backgrounds))))
    bg_index = 0
    for i,item in enumerate(plan):
        if item["kind"] == "jukebox":
            source = f"[bg{bg_index}]" if len(backgrounds)>1 else "[0:v]"
            bg_index += 1
        else:
            source = f"[{clip_indexes[item['clip']]}:v]"
        span = item["end"]-item["start"]
        # Cabinet motion follows the absolute song clock even when it is
        # hidden behind photos. Seeking each gap from frame zero makes the
        # record/light animation visibly jump after every selected image.
        # Photo scenes, by contrast, start at their own local frame zero.
        trim = (f"trim=start={item['start']:.3f}:duration={span:.3f}"
                if item["kind"] == "jukebox"
                else f"trim=duration={span:.3f}")
        fragments.append(f"{source}{normalize},{trim},"
                         f"setpts=PTS-STARTPTS[part{i}]")
    fragments.append("".join(f"[part{i}]" for i in range(len(plan)))+
                     f"concat=n={len(plan)}:v=1:a=0,format=yuv420p[v]")
    args.extend(["-filter_complex",";".join(fragments),"-map","[v]",
                 "-map",f"{len(photo_clips)+1}:a:0","-t",f"{length:.3f}",
                 "-c:v","libx264","-preset","veryfast","-crf","21",
                 "-r","25","-pix_fmt","yuv420p",
                 "-c:a","aac","-b:a","192k","-movflags","+faststart",str(output)])
    output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(args,check=True,capture_output=True,timeout=max(120,int(length*6)))
    actual=composer.media_duration(output)
    if abs(actual-length)>.5:
        raise ValueError("Timed Jukebox MP4 duration mismatch")
    return plan
