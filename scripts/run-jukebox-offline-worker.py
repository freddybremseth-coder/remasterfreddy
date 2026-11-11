#!/usr/bin/env python3
"""Explicitly approved local jukebox render pipeline; never uploads or publishes.

The operator supplies a trusted reservations export and local original audio/
jukebox sources. Service-role access stays on the worker host. The output
remains a local private MP4 until separately reviewed and approved.
"""
import argparse
import json
import hashlib
import os
import shutil
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location


def load(filename, name):
    spec = spec_from_file_location(name, Path(__file__).with_name(filename))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


stager = load("stage-jukebox-clips.py", "clip_stager")
preparer = load("prepare-jukebox-job.py", "job_preparer")
renderer = load("render-jukebox-job.py", "job_runner")
photo_stager = load("stage-jukebox-photos.py", "photo_stager")
photo_renderer = load("render-jukebox-photos.py", "photo_renderer")


def run(reservations: Path, audio: Path, jukebox: Path,
        workspace: Path, output: Path, portrait: bool, seconds: float | None,
        approved: bool, storage_url: str, storage_key: str):
    if approved is not True:
        raise ValueError("Explicit --approve-render required before any private download")
    if not reservations.is_file() or not audio.is_file() or not jukebox.is_file():
        raise ValueError("Reservations and local audio/jukebox must exist")
    target = output.resolve()
    work = workspace.resolve()
    if work.exists() or target.exists():
        raise FileExistsError("Workspace and MP4 output must be new paths")
    if target.is_relative_to(work) or work.is_relative_to(target):
        raise ValueError("Output must be separate from worker staging")
    if any(source.resolve().is_relative_to(work) for source in (reservations, audio, jukebox)):
        raise ValueError("All source inputs must be outside new workspace")
    # Bind the local master and output format to the server-owned queued job.
    # Existing legacy exports without 'handoff' can still be tested offline,
    # but new production exports must include this pinned metadata.
    exported = json.loads(reservations.read_text(encoding="utf-8"))
    handoff = exported.get("handoff")
    if handoff is not None:
        if not isinstance(handoff, dict) or set(handoff) != {
                "masterSha256", "format", "seconds", "templateVersion", "imagePaths"}:
            raise ValueError("Invalid server-owned Jukebox handoff")
        # The server pins an ordered list, never arbitrary remote URLs.
        images = handoff["imagePaths"]
        if (not isinstance(images, list) or len(images) > 12
                or any(not isinstance(p, str) for p in images)):
            raise ValueError("Invalid queued image selection")
        expected_digest = handoff["masterSha256"]
        if (not isinstance(expected_digest, str)
                or len(expected_digest) != 64
                or any(c not in "0123456789abcdef" for c in expected_digest)):
            raise ValueError("Invalid queued song master checksum")
        with audio.open("rb") as master:
            checksum = hashlib.sha256()
            for part in iter(lambda: master.read(1024 * 1024), b""):
                checksum.update(part)
        if checksum.hexdigest() != expected_digest:
            raise ValueError("Queued song master SHA-256 does not match local audio")
        expected_format = "portrait" if portrait else "landscape"
        if handoff["format"] != expected_format:
            raise ValueError("Queued format does not match local render format")
        requested = handoff["seconds"]
        if requested is None:
            if seconds is not None:
                raise ValueError("Full-length queue requires full-length render")
        elif (isinstance(requested, bool) or not isinstance(requested, int)
              or requested not in (15, 30, 60) or seconds != requested):
            raise ValueError("Queued duration does not match local render duration")
        if (not isinstance(handoff["templateVersion"], str)
                or not handoff["templateVersion"].startswith("photo-v1-")):
            raise ValueError("Unrecognized Jukebox template version")
    clip_root = work / "media"
    # Photo-only songs are valid. When video clips exist they still must be
    # verified by the private reservation stager.
    if exported.get("clips") == [] and handoff and handoff["imagePaths"]:
        clip_root.mkdir(parents=True, exist_ok=False)
        receipt = {"version": 1, "clips": [], "publish": False,
                   "approved_for_render": False}
    else:
        receipt = stager.stage(reservations, clip_root, storage_url, storage_key)
    # Local song master and jukebox visual are copied (not moved or overwritten).
    for source, name in ((audio, "song" + audio.suffix.lower()),
                         (jukebox, "jukebox" + jukebox.suffix.lower())):
        if not name.endswith((".wav", ".mp3", ".flac", ".m4a", ".mp4", ".mov", ".webm")):
            raise ValueError("Unsupported local source extension")
        with source.open("rb") as reader, (clip_root / name).open("xb") as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
    clip_names = [item["file"] for item in receipt["clips"]]
    photos = []
    if handoff and handoff["imagePaths"]:
        photos = photo_stager.stage_images(
            handoff["imagePaths"], clip_root, storage_url, storage_key)
        original_length = renderer.composer.probe_media(
            clip_root / ("song" + audio.suffix.lower()), "audio")
        effective_length = (min(original_length, seconds)
                            if seconds is not None else original_length)
        photo_videos = photo_renderer.render_photos(
            clip_root, photos, effective_length, portrait,
            min(len(clip_names), 12 - len(photos)))
        clip_names = photo_renderer.interleave_visuals(clip_names, photo_videos)
    manifest = preparer.build_manifest(
        clip_root, "song" + audio.suffix.lower(),
        "jukebox" + jukebox.suffix.lower(), clip_names, portrait, seconds,
        approved=True)
    manifest_file = work / "render-manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    result = renderer.render(manifest_file, clip_root, target)
    # A machine-readable, local-only provenance record. It must never be
    # interpreted as permission to upload or publish the finished video.
    exported = json.loads(reservations.read_text(encoding="utf-8"))
    master_hash = renderer.digest(clip_root / ("song" + audio.suffix.lower()))
    manifest_hash = hashlib.sha256(manifest_file.read_bytes()).hexdigest()
    render_receipt = {
        "schema_version": 1,
        "job_id": exported["jobId"],
        "status": "rendered_private",
        "output": {"file": target.name, "sha256": result["sha256"],
                   "bytes": target.stat().st_size,
                   "duration_seconds": result["duration_seconds"]},
        "source": {"audio_sha256": master_hash,
                   "render_manifest_sha256": manifest_hash,
                   "clips": receipt["clips"], "photos": photos},
        "scene_count": len(clip_names),
        "approved_for_render": True,
        "approved_for_upload": False,
        "approved_for_publication": False,
        "published": False,
    }
    receipt_file = work / "render-receipt.json"
    with receipt_file.open("x", encoding="utf-8") as stream:
        json.dump(render_receipt, stream, indent=2)
    return {"status": result["status"], "output": result["output"],
            "sha256": result["sha256"], "scene_count": len(clip_names),
            "receipt": str(receipt_file),
            "published": False, "approval_scope": "render_only"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reservations", required=True, type=Path)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--jukebox", required=True, type=Path)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--portrait", action="store_true")
    parser.add_argument("--seconds", type=float)
    parser.add_argument("--approve-render", action="store_true")
    args = parser.parse_args()
    result = run(args.reservations, args.audio, args.jukebox,
                 args.workspace, args.output, args.portrait, args.seconds,
                 args.approve_render, os.environ.get("SUPABASE_URL", ""),
                 os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    print(json.dumps(result, indent=2))
