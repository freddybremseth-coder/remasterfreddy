#!/usr/bin/env python3
"""Fail-closed local gate before a separately approved private MP4 upload.

This command performs no network request, upload or publication. It verifies
that a rendered video still matches the receipt and that the receipt belongs
to the queued job and permanent song master expected by the trusted worker.
"""
import argparse
import json
import re
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("renderer", Path(__file__).with_name("render-jukebox-job.py"))
renderer = module_from_spec(spec)
spec.loader.exec_module(renderer)

SHA = re.compile(r"^[a-f0-9]{64}$")
UUID = re.compile(r"^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$")


def verify(receipt_file: Path, video_file: Path, expected_job: str,
           expected_master_sha256: str) -> dict:
    if not UUID.fullmatch(expected_job) or not SHA.fullmatch(expected_master_sha256):
        raise ValueError("Expected job UUID and master SHA-256 are required")
    receipt = json.loads(receipt_file.read_text(encoding="utf-8"))
    if not isinstance(receipt, dict) or receipt.get("schema_version") != 1:
        raise ValueError("Unknown render receipt")
    if receipt.get("job_id") != expected_job or receipt.get("status") != "rendered_private":
        raise ValueError("Receipt does not match queued private render job")
    if (receipt.get("published") is not False
            or receipt.get("approved_for_upload") is not False
            or receipt.get("approved_for_publication") is not False):
        raise ValueError("Receipt must be unpublished and unapproved for upload")
    source, output = receipt.get("source"), receipt.get("output")
    if not isinstance(source, dict) or not isinstance(output, dict):
        raise ValueError("Incomplete render provenance")
    if source.get("audio_sha256") != expected_master_sha256:
        raise ValueError("Song master hash differs from queued job")
    if not SHA.fullmatch(str(source.get("render_manifest_sha256", ""))):
        raise ValueError("Missing manifest hash")
    clips = source.get("clips")
    if not isinstance(clips, list) or not 1 <= len(clips) <= 12:
        raise ValueError("Missing pinned clips")
    if receipt.get("scene_count") != len(clips):
        raise ValueError("Scene count mismatch")
    for index, clip in enumerate(clips):
        if (not isinstance(clip, dict) or clip.get("sceneIndex") != index
                or not SHA.fullmatch(str(clip.get("sha256", "")))
                or not isinstance(clip.get("bytes"), int) or clip["bytes"] < 1024):
            raise ValueError("Invalid ordered clip provenance")
    if not video_file.is_file() or not video_file.name.endswith(".mp4"):
        raise ValueError("Private MP4 is missing")
    if output.get("file") != video_file.name:
        raise ValueError("Receipt is for another output file")
    amount = video_file.stat().st_size
    if (not isinstance(output.get("bytes"), int)
            or not 20_000 <= amount <= 209_715_200
            or amount != output["bytes"]):
        raise ValueError("Private MP4 size mismatch")
    if not SHA.fullmatch(str(output.get("sha256", ""))):
        raise ValueError("Missing MP4 hash")
    if renderer.digest(video_file) != output["sha256"]:
        raise ValueError("Private MP4 bytes differ from receipt")
    return {"status": "verified_for_private_review", "job_id": expected_job,
            "sha256": output["sha256"], "bytes": amount,
            "upload_approved": False, "published": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--expected-job", required=True)
    parser.add_argument("--expected-master-sha256", required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.receipt, args.video, args.expected_job,
                            args.expected_master_sha256), indent=2))
