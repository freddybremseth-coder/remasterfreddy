#!/usr/bin/env python3
"""Service-role-only reservation of ONE queued Jukebox render job.

This does not download a master, render media, upload a preview or publish.
First export the authenticated clip manifest while the job is still queued.
Run only from a trusted operator host; never expose the service key to browsers.
"""
import argparse
import datetime
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location("upload_gate", Path(__file__).with_name("upload-jukebox-private-preview.py"))
upload_gate = module_from_spec(spec)
spec.loader.exec_module(upload_gate)

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
HASH = re.compile(r"^[0-9a-f]{64}$")


def request_json(opener, request):
    with opener.open(request, timeout=45) as response:
        if response.status not in (200, 201):
            raise ValueError("Jukebox claim service returned an invalid status")
        return json.loads(response.read(64 * 1024))


def claim(job_id: str, project_origin: str, service_key: str,
          approved: bool, enabled: bool) -> dict:
    if approved is not True or enabled is not True:
        raise ValueError("Private render claim needs operator approval and enabled flag")
    if not UUID.fullmatch(job_id):
        raise ValueError("Invalid queued Jukebox job ID")
    if not service_key:
        raise ValueError("Service-role credential is required")
    upload_gate.endpoint(project_origin)
    origin = project_origin.rstrip("/")
    headers = {"apikey": service_key, "Authorization": "Bearer " + service_key}
    opener = urllib.request.build_opener(upload_gate.NoRedirect())

    endpoint = origin + "/rest/v1/remaster_jukebox_jobs"
    selector = urllib.parse.urlencode({
        "id": "eq." + job_id,
        "select": "id,state,attempts,master_sha256,format,duration_seconds,template_version,approved_at,published_at",
    })
    rows = request_json(opener, urllib.request.Request(endpoint + "?" + selector, headers=headers))
    if not isinstance(rows, list) or len(rows) != 1:
        raise ValueError("Queued Jukebox job not found")
    job = rows[0]
    current = job.get("attempts")
    if (job.get("state") != "queued"
            or not isinstance(current, int) or isinstance(current, bool) or not 0 <= current < 5
            or job.get("approved_at") is not None or job.get("published_at") is not None
            or not isinstance(job.get("master_sha256"), str)
            or not HASH.fullmatch(job["master_sha256"])
            or job.get("format") not in ("landscape", "portrait")):
        raise ValueError("Jukebox job is not eligible for a new rendering attempt")

    next_attempt = current + 1
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    where = urllib.parse.urlencode({
        "id": "eq." + job_id,
        "state": "eq.queued",
        "attempts": "eq." + str(current),
        "approved_at": "is.null",
        "published_at": "is.null",
        "select": "id,state,attempts,master_sha256,format,duration_seconds",
    })
    body = json.dumps({
        "state": "rendering", "attempts": next_attempt,
        "heartbeat_at": now, "updated_at": now, "error": None,
    }).encode("utf-8")
    claim_request = urllib.request.Request(
        endpoint + "?" + where, data=body, method="PATCH",
        headers={**headers, "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    result = request_json(opener, claim_request)
    if (not isinstance(result, list) or len(result) != 1 or result[0].get("id") != job_id
            or result[0].get("state") != "rendering" or result[0].get("attempts") != next_attempt
            or result[0].get("master_sha256") != job["master_sha256"]):
        raise ValueError("Jukebox render claim lost to a concurrent worker")
    return {
        "job_id": job_id, "attempt": next_attempt,
        "master_sha256": job["master_sha256"],
        "format": job["format"],
        "seconds": job.get("duration_seconds"),
        "state": "rendering", "published": False,
    }


def heartbeat(job_id: str, attempt: int, project_origin: str,
              service_key: str) -> None:
    """Renew only this exact running attempt; fail closed on lost lease."""
    if not UUID.fullmatch(job_id):
        raise ValueError("Invalid Jukebox heartbeat job ID")
    if type(attempt) is not int or not 1 <= attempt <= 5:
        raise ValueError("Invalid Jukebox heartbeat attempt")
    if not service_key:
        raise ValueError("Service-role credential is required")
    upload_gate.endpoint(project_origin)
    origin = project_origin.rstrip("/")
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    where = urllib.parse.urlencode({
        "id": "eq." + job_id,
        "state": "eq.rendering",
        "attempts": "eq." + str(attempt),
        "select": "id,state,attempts",
    })
    body = json.dumps({"heartbeat_at": now, "updated_at": now}).encode("utf-8")
    request = urllib.request.Request(
        origin + "/rest/v1/remaster_jukebox_jobs?" + where,
        data=body, method="PATCH", headers={
            "apikey": service_key,
            "Authorization": "Bearer " + service_key,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        })
    opener = urllib.request.build_opener(upload_gate.NoRedirect())
    rows = request_json(opener, request)
    if (not isinstance(rows, list) or len(rows) != 1
            or rows[0].get("id") != job_id
            or rows[0].get("state") != "rendering"
            or rows[0].get("attempts") != attempt):
        raise ValueError("Jukebox render lease lost")



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--approve-render", action="store_true")
    args = parser.parse_args()
    result = claim(
        args.job_id,
        os.environ.get("SUPABASE_URL", ""),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        args.approve_render,
        os.environ.get("REMASTER_JUKEBOX_PRIVATE_RENDER_ENABLED") == "true")
    print(json.dumps(result, indent=2))
