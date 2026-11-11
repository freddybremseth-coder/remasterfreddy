#!/usr/bin/env python3
"""Explicitly approved local jukebox render pipeline; never uploads or publishes.

The operator supplies a trusted reservations export and local original audio/
jukebox sources. Service-role access stays on the worker host. The output
remains a local private MP4 until separately reviewed and approved.
"""
import argparse
import json
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
    clip_root = work / "media"
    receipt = stager.stage(reservations, clip_root, storage_url, storage_key)
    # Local song master and jukebox visual are copied (not moved or overwritten).
    for source, name in ((audio, "song" + audio.suffix.lower()),
                         (jukebox, "jukebox" + jukebox.suffix.lower())):
        if not name.endswith((".wav", ".mp3", ".flac", ".m4a", ".mp4", ".mov", ".webm")):
            raise ValueError("Unsupported local source extension")
        with source.open("rb") as reader, (clip_root / name).open("xb") as writer:
            shutil.copyfileobj(reader, writer, 1024 * 1024)
    clip_names = [item["file"] for item in receipt["clips"]]
    manifest = preparer.build_manifest(
        clip_root, "song" + audio.suffix.lower(),
        "jukebox" + jukebox.suffix.lower(), clip_names, portrait, seconds,
        approved=True)
    manifest_file = work / "render-manifest.json"
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    result = renderer.render(manifest_file, clip_root, target)
    return {"status": result["status"], "output": result["output"],
            "sha256": result["sha256"], "scene_count": len(clip_names),
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
