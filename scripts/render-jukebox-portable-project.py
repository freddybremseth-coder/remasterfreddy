#!/usr/bin/env python3
"""Private, manual render from a Jukebox browser photo-project backup.

Requires locally provided original song and a reviewed, licensed Rock-Ola MP4.
Does not contact Supabase, submit queue jobs, or publish anything.
"""
import argparse
import base64
import binascii
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

MAX_BACKUP = 55 * 1024 * 1024
MAX_MEDIA = 40 * 1024 * 1024
MAX_SCENES = 12
MIMES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SECTIONS = {
    "Fri scene": "verse1", "Åpning": "opening", "Vers 1": "verse1",
    "Refreng": "chorus", "Vers 2": "verse2",
    "Bro / mellomspill": "bridge", "Vers 3": "verse2",
    "Avslutning": "outro",
}


def module(name):
    path = Path(__file__).with_name(name)
    spec = spec_from_file_location(name.replace("-", "_"), path)
    result = module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def validate_backup(path: Path, expected_song_id: str | None = None) -> dict:
    if not path.is_file() or path.stat().st_size > MAX_BACKUP:
        raise ValueError("Missing or oversized photo project backup")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError) as error:
        raise ValueError("Invalid Jukebox project JSON") from error
    if (not isinstance(data, dict) or data.get("format") != "remaster-jukebox-portable"
            or type(data.get("version")) is not int or data["version"] != 1):
        raise ValueError("Unsupported Jukebox project format")
    song_id = data.get("songId")
    if not isinstance(song_id, str) or not song_id or len(song_id) > 100:
        raise ValueError("Missing song identifier")
    if expected_song_id is not None and song_id != expected_song_id:
        raise ValueError("Backup does not match expected song identifier")
    if data.get("videoFormat") not in ("landscape", "portrait"):
        raise ValueError("Invalid video format")
    if str(data.get("seconds")) not in ("full", "15", "30", "60"):
        raise ValueError("Invalid video length")
    if type(data.get("endWithLastScene")) is not bool:
        raise ValueError("Invalid ending selection")
    if type(data.get("sceneCount")) is not int or not 1 <= data["sceneCount"] <= MAX_SCENES:
        raise ValueError("Invalid scene count")
    entries = data.get("clips")
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_SCENES:
        raise ValueError("Select between 1 and 12 photo scenes")
    if not data["endWithLastScene"] and any(x.get("finale") for x in entries if isinstance(x, dict)):
        raise ValueError("Pinned finale requires last-image ending")
    if sum(x.get("finale") is True for x in entries if isinstance(x, dict)) > 1:
        raise ValueError("Multiple pinned endings")
    for index, item in enumerate(entries):
        if not isinstance(item, dict) or item.get("kind") != "image":
            raise ValueError("This private import supports image scenes only")
        if (item.get("mime") not in MIMES or type(item.get("name")) is not str
                or not 1 <= len(item["name"]) <= 240):
            raise ValueError("Invalid image type or name")
        if item.get("section", "Fri scene") not in SECTIONS:
            raise ValueError("Unknown song section")
        if type(item.get("weight", 2)) is not int or item.get("weight", 2) not in (1, 2, 3):
            raise ValueError("Invalid scene duration weight")
        if type(item.get("finale")) is not bool or (item["finale"] and index != len(entries)-1):
            raise ValueError("Pinned ending must be the final scene")
        value = item.get("data")
        if not isinstance(value, str) or not value.startswith("data:" + item["mime"] + ";base64,"):
            raise ValueError("Invalid encoded image")
        if len(value) > MAX_MEDIA * 2:
            raise ValueError("Encoded image too large")
    return data


def extract_images(data: dict, directory: Path) -> list[dict]:
    """Write images under generated names, never user-supplied paths."""
    stager = module("stage-jukebox-photos.py")
    directory.mkdir(parents=True, exist_ok=False)
    photos = []
    total = 0
    for index, item in enumerate(data["clips"]):
        encoded = item["data"].split(",", 1)[1]
        try:
            payload = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError("Corrupt image data") from error
        total += len(payload)
        if total > MAX_MEDIA or len(payload) > 10*1024*1024:
            raise ValueError("Photo project exceeds private render size limits")
        extension = MIMES[item["mime"]]
        if len(payload) < 100 or not stager.image_magic(payload, extension[1:]):
            raise ValueError("Invalid photo signature")
        filename = "photo-%02d%s" % (index, extension)
        (directory / filename).write_bytes(payload)
        photos.append({"file": filename, "sha256": hashlib.sha256(payload).hexdigest(),
                       "section": item.get("section", "Fri scene"),
                       "weight": item.get("weight", 2),
                       "finale": item["finale"]})
    return photos


def build_assignments(photos: list[dict], duration: float, portrait: bool,
                      end_with_last: bool) -> list[dict]:
    if not math.isfinite(duration) or not 2 < duration <= 3600:
        raise ValueError("Invalid song duration")
    intro = min(3, duration*.12) if portrait else min(30, duration*.20)
    outro = 0 if end_with_last else (min(3, duration*.12) if portrait else min(15, duration*.10))
    middle = duration-intro-outro
    total = sum(p["weight"] for p in photos)
    cursor = intro
    assignments = []
    for i, photo in enumerate(photos):
        end = duration-outro if i == len(photos)-1 else cursor+middle*photo["weight"]/total
        assignments.append({"section": SECTIONS[photo["section"]],
                            "clip": "photo-scene-%02d.mp4" % i,
                            "start": round(cursor, 4), "end": round(end, 4)})
        cursor = end
    return assignments


def render_project(project: Path, audio: Path, cabinet: Path, output: Path,
                   expected_song_id: str | None = None, dry_run: bool = False) -> dict:
    data = validate_backup(project, expected_song_id)
    composer = module("compose-jukebox-video.py")
    renderer = module("render-jukebox-photos.py")
    sections = module("compose-jukebox-sections.py")
    duration = composer.probe_media(audio, "audio")
    if data["seconds"] != "full":
        duration = min(duration, float(data["seconds"]))
    composer.probe_media(cabinet, "video")
    portrait = data["videoFormat"] == "portrait"
    if output.exists():
        raise ValueError("Will not overwrite an existing MP4")
    if output.resolve() in (audio.resolve(), cabinet.resolve(), project.resolve()):
        raise ValueError("Output overlaps an input")
    with tempfile.TemporaryDirectory(prefix="jukebox-private-") as temp:
        root = Path(temp)
        photos = extract_images(data, root / "photos")
        assignments = build_assignments(photos, duration, portrait, data["endWithLastScene"])
        sections.build_section_plan(duration, assignments)
        manifest = {"songId":data["songId"], "format":data["videoFormat"],
                    "duration":duration, "assignments":assignments, "publish":False}
        if dry_run:
            return manifest
        rendered = []
        for i, photo in enumerate(photos):
            clip = root / ("photo-scene-%02d.mp4" % i)
            window = assignments[i]["end"] - assignments[i]["start"]
            renderer.render_photo(root / "photos" / photo["file"], clip, window, portrait)
            rendered.append(clip)
        sections.compose_sections(audio, cabinet, rendered, assignments, output,
                                  portrait, seconds=duration)
        manifest["sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--project", type=Path, required=True)
    p.add_argument("--audio", type=Path, required=True)
    p.add_argument("--jukebox", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--song-id", help="Expected song ID; prevents wrong-track render")
    p.add_argument("--plan-only", action="store_true")
    args = p.parse_args()
    result = render_project(args.project, args.audio, args.jukebox, args.output,
                            args.song_id, args.plan_only)
    print(json.dumps(result, indent=2, ensure_ascii=False))
