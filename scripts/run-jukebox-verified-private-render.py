#!/usr/bin/env python3
"""One-step PRIVATE music-video render from verified photo staging and exported project.

Never accesses a network, credentials, job queue, or YouTube. All source checks
must pass before video rendering. The caller supplies an original audio master,
an approved cabinet MP4 and the expected SHA-256 of each.
"""
import argparse
import json
import os
import tempfile
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location


def load(name):
    spec = spec_from_file_location(name.replace("-", "_"), Path(__file__).with_name(name))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(stage: Path, project: Path, audio: Path, cabinet: Path, output: Path,
        receipt: Path, job_id: str, song_id: str, master_sha: str, cabinet_sha: str,
        plan_only=False):
    planner = load("prepare-jukebox-private-photo-plan.py")
    renderer = load("render-jukebox-staged-private.py")
    if output.exists() or receipt.exists():
        raise ValueError("Private MP4 output or review receipt already exists")
    if output.resolve() == receipt.resolve():
        raise ValueError("Video and review receipt must have separate paths")
    if not output.parent.is_dir() or not receipt.parent.is_dir():
        raise ValueError("Use existing private output directories")
    if output.suffix.lower() != ".mp4" or receipt.suffix.lower() != ".json":
        raise ValueError("Expected MP4 output and JSON review receipt")
    if output.resolve() in (audio.resolve(), cabinet.resolve(), project.resolve())             or receipt.resolve() in (audio.resolve(), cabinet.resolve(), project.resolve()):
        raise ValueError("Output paths must never overwrite input files")
    if stage.is_symlink() or not stage.is_dir():
        raise ValueError("Untrusted private staging directory")

    # Do not stage files or create output if project, source media or SHA pins fail.
    with tempfile.TemporaryDirectory(prefix="jukebox-verified-plan-") as work:
        plan = Path(work) / "verified-scenes.json"
        planner.create_plan(stage, project, plan, job_id, song_id, master_sha)
        # plan_only still checks actual master and Rock-Ola source checksums.
        result = renderer.render_stage(stage, plan, audio, cabinet, output, job_id,
                                       song_id, master_sha, cabinet_sha,
                                       plan_only=plan_only)
    result["status"] = "preflight_verified" if plan_only else "rendered_private"
    result["approvedForPublication"] = False
    result["youtubePublished"] = False
    if plan_only:
        return result
    if not output.is_file() or output.stat().st_size < 20_000:
        raise ValueError("Private output missing or too small")
    # Receipt can only be created after local video has passed the composer checks.
    # Exclusive mode prevents replacement of a previous review receipt.
    with receipt.open("x", encoding="utf-8") as destination:
        json.dump(result, destination, ensure_ascii=False, indent=2)
        destination.write("\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage-dir", type=Path, required=True)
    parser.add_argument("--photo-project", type=Path, required=True)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--cabinet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--song-id", required=True)
    parser.add_argument("--master-sha256", required=True)
    parser.add_argument("--cabinet-sha256", required=True)
    parser.add_argument("--plan-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run(args.stage_dir,args.photo_project,args.audio,args.cabinet,
        args.output,args.receipt,args.job_id,args.song_id,args.master_sha256,
        args.cabinet_sha256,args.plan_only), ensure_ascii=False, indent=2))
