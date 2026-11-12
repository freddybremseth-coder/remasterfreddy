#!/usr/bin/env python3
"""Generate a series of Re-master Freddy jukebox videos from a local JSON manifest.

No network upload and no publishing. A failed song does not stop later songs.
The manifest points to local, existing audio files; it cannot provide URLs.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

RENDERER_PATH = Path(__file__).with_name("render-jukebox.py")
spec = importlib.util.spec_from_file_location("remaster_jukebox", RENDERER_PATH)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

TEMPLATE_VERSION = "jukebox-v1"
SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,75}$")


def load_manifest(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("songs"), list):
        raise ValueError("Manifest must contain a songs array")
    if not 1 <= len(data["songs"]) <= 100:
        raise ValueError("Manifest must contain 1–100 songs")
    results = []
    slugs = set()
    for index, item in enumerate(data["songs"], 1):
        if not isinstance(item, dict) or not isinstance(item.get("title"), str) or not item["title"].strip():
            raise ValueError(f"Song {index} needs a nonempty title")
        slug, audio = item.get("slug"), item.get("audio")
        if not isinstance(slug, str) or not SAFE_SLUG.fullmatch(slug) or slug in slugs:
            raise ValueError(f"Song {index} needs a unique lowercase slug (letters, digits, hyphens)")
        if not isinstance(audio, str) or not audio.strip() or "://" in audio:
            raise ValueError(f"Song {index} needs a local audio path")
        audio_path = (path.parent / audio).resolve()
        if not audio_path.is_file() or audio_path.suffix.lower() not in (".mp3", ".wav", ".m4a", ".flac"):
            raise ValueError(f"Song {index} audio file was not found or format unsupported: {audio}")
        slugs.add(slug)
        results.append((slug, item["title"].strip(), audio_path))
    return results


def signature(title, audio, portrait, seconds):
    digest = hashlib.sha256()
    with audio.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"template": TEMPLATE_VERSION, "title": title, "audioSha256": digest.hexdigest(),
            "portrait": portrait, "seconds": seconds}


def valid_mp4(path):
    if not path.is_file() or path.stat().st_size < 2000:
        return False
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
                             "-of", "json", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        return False
    try:
        tracks = {stream["codec_type"] for stream in json.loads(result.stdout)["streams"]}
        return {"audio", "video"} <= tracks
    except (ValueError, KeyError, TypeError):
        return False


def target_for(directory, slug, signature_data):
    base = directory / (slug + ".mp4")
    candidate = base
    for index in range(1, 1000):
        if not candidate.exists():
            return candidate, False
        metadata = candidate.with_suffix(".json")
        try:
            if json.loads(metadata.read_text(encoding="utf-8")) == signature_data and valid_mp4(candidate):
                return candidate, True
        except (OSError, ValueError):
            pass
        candidate = directory / f"{slug}-v{index+1}.mp4"
    raise RuntimeError("Too many existing versions of this song")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float, default=None)
    args = parser.parse_args()
    if args.seconds is not None and not (1 <= args.seconds <= 3600):
        parser.error("--seconds must be between 1 and 3600")
    try:
        songs = load_manifest(args.manifest.resolve())
    except (OSError, ValueError) as error:
        parser.error(str(error))
    directory = args.output_dir.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    failed = 0
    for number, (slug, title, audio) in enumerate(songs, 1):
        try:
            signed = signature(title, audio, args.portrait, args.seconds)
            target, skip = target_for(directory, slug, signed)
            if skip:
                print(f"[{number}/{len(songs)}] Skipping verified existing video: {target}")
                continue
            with tempfile.TemporaryDirectory(prefix="jukebox-batch-", dir=directory) as temp:
                temporary = Path(temp) / "render.mp4"
                renderer.render(audio, title, temporary, args.portrait, args.seconds)
                if not valid_mp4(temporary):
                    raise RuntimeError("Rendered MP4 failed audio/video validation")
                temporary.replace(target)
            target.with_suffix(".json").write_text(json.dumps(signed, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"[{number}/{len(songs)}] Ready: {target}")
        except Exception as error:
            failed += 1
            print(f"[{number}/{len(songs)}] Failed '{title}': {error}", file=sys.stderr)
    print(f"Completed: {len(songs)-failed}/{len(songs)} successful or already rendered; {failed} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
