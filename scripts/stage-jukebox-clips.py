#!/usr/bin/env python3
"""Stage explicitly reserved private jukebox clips for an offline render worker.

Input is a trusted service-side export, never a browser-supplied URL. The script
does not render, approve, publish, or send any files to YouTube. A service-role
credential remains strictly server-side and must not be passed to the frontend.
"""
import argparse
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_TOTAL_BYTES = 12 * MAX_FILE_BYTES
BUCKET = "remaster-jukebox-clips"
PATH_RE = re.compile(r"^staging/([0-9a-f-]{36})/scene-(0|[1-9]|10|11)/([0-9a-f-]{36})\.(mp4|mov|webm)$")
MIMES = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Private storage redirects are not allowed")


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise ValueError("Unsupported private clip export")
    job_id = manifest.get("jobId")
    if not isinstance(job_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", job_id):
        raise ValueError("Invalid job ID")
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not 1 <= len(clips) <= 12:
        raise ValueError("Expected 1–12 reserved clips")
    seen = set()
    total = 0
    for clip in clips:
        if not isinstance(clip, dict) or set(clip) != {"sceneIndex", "path", "bytes", "contentType"}:
            raise ValueError("Invalid clip reservation")
        index = clip["sceneIndex"]
        path = clip["path"]
        size = clip["bytes"]
        match = PATH_RE.fullmatch(path) if isinstance(path, str) else None
        if (not isinstance(index, int) or isinstance(index, bool)
                or index in seen or index < 0 or index >= 12
                or not match or match.group(1) != job_id
                or int(match.group(2)) != index
                or clip["contentType"] != MIMES[match.group(4)]
                or not isinstance(size, int) or isinstance(size, bool)
                or not 1024 <= size <= MAX_FILE_BYTES):
            raise ValueError("Clip export is inconsistent with its reservation")
        seen.add(index)
        total += size
    if sorted(seen) != list(range(len(clips))) or total > MAX_TOTAL_BYTES:
        raise ValueError("Clip scenes must be contiguous from zero")
    return sorted(clips, key=lambda clip: clip["sceneIndex"])


def stage(manifest_path: Path, destination: Path, supabase_url: str, service_role: str):
    parsed = urllib.parse.urlparse(supabase_url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise ValueError("Expected a plain HTTPS Supabase project origin")
    if not service_role:
        raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required")
    clips = validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
    if destination.exists():
        raise FileExistsError("Staging destination must be a new directory")
    destination.mkdir(parents=True, exist_ok=False)
    opener = urllib.request.build_opener(NoRedirect())
    receipts = []
    try:
        for clip in clips:
            suffix = Path(clip["path"]).suffix
            filename = f"scene-{clip['sceneIndex']}{suffix}"
            output = destination / filename
            # Construct the URL only from the vetted project origin and reserved
            # object path; never follow a URL or redirect from exported metadata.
            quoted_path = urllib.parse.quote(clip["path"], safe="/")
            url = f"{supabase_url.rstrip('/')}/storage/v1/object/authenticated/{BUCKET}/{quoted_path}"
            request = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {service_role}",
                "apikey": service_role,
            })
            digest = hashlib.sha256()
            amount = 0
            with opener.open(request, timeout=45) as response, output.open("xb") as stream:
                if response.status != 200:
                    raise ValueError("Private clip download failed")
                while block := response.read(1024 * 1024):
                    amount += len(block)
                    if amount > MAX_FILE_BYTES or amount > clip["bytes"]:
                        raise ValueError("Private clip exceeds its reserved size")
                    digest.update(block)
                    stream.write(block)
            if amount != clip["bytes"]:
                raise ValueError("Downloaded bytes do not match clip reservation")
            receipts.append({"sceneIndex": clip["sceneIndex"], "file": filename,
                             "sha256": digest.hexdigest(), "bytes": amount})
    except Exception:
        # Do not leave partial files appearing to be successfully staged.
        for child in destination.iterdir():
            if child.is_file():
                child.unlink()
        destination.rmdir()
        raise
    return {"version": 1, "clips": receipts, "publish": False,
            "approved_for_render": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reservations", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    args = parser.parse_args()
    receipt = stage(args.reservations, args.destination,
                    os.environ.get("SUPABASE_URL", ""),
                    os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    print(json.dumps(receipt, indent=2))
