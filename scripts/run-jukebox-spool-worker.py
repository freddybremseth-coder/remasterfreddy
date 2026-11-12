#!/usr/bin/env python3
"""Bounded private Jukebox spool worker.

Consumes only trusted, pre-staged manifest/audio/jukebox *local files* from a
dedicated operator-controlled directory. Never fetches arbitrary URLs, auto-
publishes to YouTube, or silently retries an ambiguous render attempt.

This is a single-pass, opt-in dispatcher intended for a durable worker host.
A separate reviewed producer must stage canonical audio + safe JSON jobs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
MAX_JOBS = 5


def load():
    spec = spec_from_file_location("private_jukebox_one_shot",
                                   Path(__file__).with_name("run-jukebox-private-test.py"))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def resolve_inside(directory: Path, name: str, allowed_suffixes: tuple[str, ...]) -> Path:
    if not isinstance(name, str) or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError("Spool input must be a local basename")
    path = directory / name
    if path.suffix.lower() not in allowed_suffixes or path.is_symlink() or not path.is_file():
        raise ValueError("Spool input must be a regular approved local file")
    if path.resolve().parent != directory.resolve():
        raise ValueError("Spool input escapes trusted job directory")
    return path


def inspect_job(spool: Path, folder: Path) -> tuple[Path,Path,Path,Path,Path,str]:
    if not folder.is_dir() or folder.is_symlink() or not UUID.fullmatch(folder.name):
        raise ValueError("Invalid Jukebox spool job folder")
    if folder.resolve().parent != spool.resolve():
        raise ValueError("Spool job outside trusted root")
    config_path = resolve_inside(folder, "job.json", (".json",))
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(config, dict) or set(config) != {"jobId", "audio", "jukebox"}:
        raise ValueError("Invalid private spool job configuration")
    if config["jobId"] != folder.name:
        raise ValueError("Spool job identity mismatch")
    export = resolve_inside(folder, "clip-export.json", (".json",))
    audio = resolve_inside(folder, config["audio"], (".mp3", ".wav", ".m4a", ".flac"))
    jukebox = resolve_inside(folder, config["jukebox"], (".mp4", ".mov", ".webm"))
    # Never let uploaded or downloaded media decide the workspace location.
    work = folder / "render-work"
    output = folder / (folder.name + ".mp4")
    if work.is_symlink() or output.is_symlink() or work.exists() or output.exists():
        raise ValueError("Existing render attempt must be reconciled manually")
    return export, audio, jukebox, work, output, folder.name


def once(spool: Path, *, enabled: bool, upload: bool = False,
         origin: str = "", key: str = "", limit: int = 1,
         runner=None) -> list[dict]:
    if enabled is not True:
        raise ValueError("JUKEBOX_PRIVATE_SPOOL_DISABLED")
    if type(limit) is not int or not 1 <= limit <= MAX_JOBS:
        raise ValueError("Invalid batch limit")
    if upload and os.environ.get("REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED") != "true":
        raise ValueError("Private preview uploads disabled")
    if not spool.is_dir() or spool.is_symlink():
        raise ValueError("Trusted spool root unavailable")
    # Ensure no job state changes until inputs and credentials pass basic checks.
    if not origin or not key:
        raise ValueError("Trusted worker credentials missing")
    runner = runner or load().run_private_test
    results = []
    for folder in sorted(spool.iterdir(), key=lambda p:p.name):
        if len(results) >= limit:
            break
        if not UUID.fullmatch(folder.name):
            continue
        try:
            export, audio, jukebox, work, output, job_id = inspect_job(spool, folder)
            # The inner runner checks exact canonical master SHA *before* claiming.
            result = runner(export, audio, jukebox, work, output, job_id,
                            True, upload, origin, key, True, upload)
            results.append({"job_id":job_id,"ok":True,"state":result["state"],
                            "youtube_published":False})
        except Exception as exc:
            # Do not retry or discard: a failed claim may still be active.
            results.append({"job_id":folder.name,"ok":False,
                            "reason":type(exc).__name__ + ": " + str(exc)[:160],
                            "requires_manual_reconciliation":True,
                            "youtube_published":False})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spool", required=True, type=Path)
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--run-once", action="store_true")
    parser.add_argument("--upload-private-preview", action="store_true")
    args = parser.parse_args()
    if not args.run_once:
        parser.error("Explicit --run-once required; no unattended scheduler is configured")
    response = once(
        args.spool,
        enabled=os.environ.get("REMASTER_JUKEBOX_PRIVATE_SPOOL_ENABLED") == "true",
        upload=args.upload_private_preview,
        origin=os.environ.get("SUPABASE_URL",""),
        key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY",""),
        limit=args.limit,
    )
    print(json.dumps(response, indent=2))
    if any(not row["ok"] for row in response):
        sys.exit(2)
