#!/usr/bin/env python3
"""Manually authorized, resumable private MP4 upload. Never publishes.

Requires the same job UUID and source-master hash as the trusted queue. Only
uploads the verified bytes to the private remaster-jukebox bucket. This does
NOT mark a database job ready or approve YouTube publication.
"""
import argparse
import base64
import json
import os
import urllib.parse
import urllib.request
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

spec = spec_from_file_location("preview_gate", Path(__file__).with_name("verify-jukebox-preview.py"))
preview_gate = module_from_spec(spec)
spec.loader.exec_module(preview_gate)

CHUNK = 6 * 1024 * 1024
BUCKET = "remaster-jukebox"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Private upload redirects are not allowed")


def endpoint(project_origin: str) -> str:
    parsed = urllib.parse.urlparse(project_origin)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.username or parsed.password
            or parsed.port is not None or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment or host.count(".") != 2
            or not host.endswith(".supabase.co")):
        raise ValueError("Expected trusted Supabase project origin")
    project = host.removesuffix(".supabase.co")
    return f"https://{project}.storage.supabase.co/storage/v1/upload/resumable"


def metadata(**fields) -> str:
    return ",".join(f"{name} {base64.b64encode(value.encode()).decode()}"
                    for name, value in fields.items())


def upload(receipt: Path, mp4: Path, job_id: str, master_sha256: str,
           project_origin: str, key: str, approved: bool,
           enabled: bool, resume_url: str | None = None):
    if approved is not True or enabled is not True:
        raise ValueError("Private upload requires explicit approval and feature flag")
    if not key:
        raise ValueError("Service role must be configured on the trusted worker")
    verified = preview_gate.verify(receipt, mp4, job_id, master_sha256)
    if mp4.name != job_id + ".mp4":
        raise ValueError("Private preview path must be the immutable job UUID")
    base = endpoint(project_origin)
    origin = urllib.parse.urlsplit(base)
    host_root = f"{origin.scheme}://{origin.netloc}"
    opener = urllib.request.build_opener(NoRedirect())
    headers = {"Authorization": f"Bearer {key}", "apikey": key, "Tus-Resumable": "1.0.0"}
    size = verified["bytes"]
    if resume_url:
        url = resume_url
    else:
        request = urllib.request.Request(base, method="POST", headers={
            **headers,
            "Upload-Length": str(size),
            "Upload-Metadata": metadata(bucketName=BUCKET, objectName=mp4.name,
                                        contentType="video/mp4", cacheControl="0"),
        })
        with opener.open(request, timeout=45) as response:
            if response.status != 201:
                raise ValueError("Storage did not create resumable upload")
            url = urllib.parse.urljoin(base, response.headers.get("Location", ""))
    # The returned or manually resumed URL must be a storage endpoint on the
    # same trusted project, never a redirect or an attacker-controlled domain.
    target = urllib.parse.urlsplit(url)
    if (f"{target.scheme}://{target.netloc}" != host_root
            or not target.path.startswith("/storage/v1/upload/resumable/")
            or target.username or target.password or target.query or target.fragment):
        raise ValueError("Invalid private resumable upload URL")
    check = urllib.request.Request(url, method="HEAD", headers=headers)
    with opener.open(check, timeout=45) as response:
        offset = int(response.headers.get("Upload-Offset", "-1"))
        expected = int(response.headers.get("Upload-Length", "-1"))
    if expected != size or not 0 <= offset <= size:
        raise ValueError("Resumable session differs from verified MP4")
    with mp4.open("rb") as source:
        source.seek(offset)
        while offset < size:
            chunk = source.read(min(CHUNK, size - offset))
            request = urllib.request.Request(url, data=chunk, method="PATCH", headers={
                **headers, "Upload-Offset": str(offset),
                "Content-Type": "application/offset+octet-stream",
            })
            with opener.open(request, timeout=120) as response:
                if response.status not in (200, 204):
                    raise ValueError("Private upload chunk rejected")
                updated = int(response.headers.get("Upload-Offset", "-1"))
            if updated != offset + len(chunk):
                raise ValueError("Server offset differs from transmitted bytes")
            offset = updated
    return {"status": "uploaded_private_unregistered", "job_id": job_id,
            "bytes": size, "sha256": verified["sha256"],
            "requires_server_verification": True, "published": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--expected-job", required=True)
    parser.add_argument("--expected-master-sha256", required=True)
    parser.add_argument("--approve-private-upload", action="store_true")
    parser.add_argument("--resume-url")
    args = parser.parse_args()
    print(json.dumps(upload(
        args.receipt, args.video, args.expected_job, args.expected_master_sha256,
        os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        args.approve_private_upload,
        os.environ.get("REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED") == "true",
        args.resume_url), indent=2))
