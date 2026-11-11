#!/usr/bin/env python3
"""Trusted worker finalization for a private MP4 (never publication).

Off by default. Read back all private Storage bytes and compare SHA-256 to the
locally verified receipt, then conditionally mark *only* the matching queued
job ready for private admin review. Requires service-role credentials on host.
"""
import argparse
import hashlib
import json
import os
import urllib.parse
import urllib.request
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location("private_upload", Path(__file__).with_name("upload-jukebox-private-preview.py"))
private_upload = module_from_spec(spec)
spec.loader.exec_module(private_upload)


def request_json(opener, request, timeout=45):
    with opener.open(request, timeout=timeout) as response:
        if response.status not in (200, 201):
            raise ValueError("Private job API returned an unexpected response")
        return json.loads(response.read(64 * 1024))


def finalize(receipt_file: Path, video_file: Path, job_id: str,
             master_sha256: str, project_origin: str, service_key: str,
             approved: bool, enabled: bool, attempt: int):
    if approved is not True or enabled is not True:
        raise ValueError("Finalization requires explicit approval and feature flag")
    if not service_key:
        raise ValueError("Trusted service-role credential is required")
    if isinstance(attempt, bool) or not isinstance(attempt, int) or not 1 <= attempt <= 5:
        raise ValueError("Exact active render attempt (1–5) required")
    verified = private_upload.preview_gate.verify(
        receipt_file, video_file, job_id, master_sha256)
    if video_file.name != job_id + ".mp4":
        raise ValueError("Final output filename must equal immutable job ID")
    private_upload.endpoint(project_origin)
    origin = project_origin.rstrip("/")
    opener = urllib.request.build_opener(private_upload.NoRedirect())
    headers = {"Authorization": f"Bearer {service_key}", "apikey": service_key}
    job_url = (origin + "/rest/v1/remaster_jukebox_jobs?"
               + urllib.parse.urlencode({"id": "eq." + job_id,
                                         "select": "id,state,attempts,master_sha256,approved_at,published_at"}))
    jobs = request_json(opener, urllib.request.Request(job_url, headers=headers))
    if (not isinstance(jobs, list) or len(jobs) != 1
            or jobs[0].get("state") != "rendering"
            or jobs[0].get("attempts") != attempt
            or jobs[0].get("master_sha256") != master_sha256
            or jobs[0].get("approved_at") is not None
            or jobs[0].get("published_at") is not None):
        raise ValueError("Active render lease, attempt or original master does not match")
    # Read back the actual private Storage object; metadata alone cannot
    # verify SHA-256 and a successful TUS completion is not sufficient.
    path = urllib.parse.quote(job_id + ".mp4")
    storage_url = origin + "/storage/v1/object/authenticated/remaster-jukebox/" + path
    digest = hashlib.sha256()
    amount = 0
    with opener.open(urllib.request.Request(storage_url, headers=headers), timeout=120) as stream:
        if stream.status != 200:
            raise ValueError("Private stored video unavailable")
        while block := stream.read(1024 * 1024):
            amount += len(block)
            if amount > 209715200 or amount > verified["bytes"]:
                raise ValueError("Stored MP4 exceeds verified output")
            digest.update(block)
    if amount != verified["bytes"] or digest.hexdigest() != verified["sha256"]:
        raise ValueError("Stored MP4 hash or size differs from verified render")
    condition = urllib.parse.urlencode({
        "id": "eq." + job_id,
        "state": "eq.rendering",
        "attempts": "eq." + str(attempt),
        "master_sha256": "eq." + master_sha256,
        "approved_at": "is.null",
        "published_at": "is.null",
    })
    body = json.dumps({
        "state": "ready", "video_path": job_id + ".mp4",
        "video_sha256": verified["sha256"], "video_bytes": amount,
    }).encode()
    updated = request_json(opener, urllib.request.Request(
        origin + "/rest/v1/remaster_jukebox_jobs?" + condition,
        data=body, method="PATCH",
        headers={**headers, "Content-Type": "application/json",
                 "Prefer": "return=representation"}))
    if not isinstance(updated, list) or len(updated) != 1 or updated[0].get("id") != job_id:
        raise ValueError("Job changed during private verification; not marked ready")
    return {"status": "ready_for_private_review", "job_id": job_id,
            "sha256": verified["sha256"], "bytes": amount,
            "approved_for_publication": False, "published": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--expected-job", required=True)
    parser.add_argument("--expected-master-sha256", required=True)
    parser.add_argument("--approve-private-finalization", action="store_true")
    parser.add_argument("--attempt", type=int, required=True, help="Claimed render attempt 1–5")
    args = parser.parse_args()
    print(json.dumps(finalize(
        args.receipt, args.video, args.expected_job, args.expected_master_sha256,
        os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        args.approve_private_finalization,
        os.environ.get("REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED") == "true",
        args.attempt), indent=2))
