#!/usr/bin/env python3
"""Download server-pinned user images from our own Supabase assets bucket.

Never accept URLs. File paths come from the authenticated RealtyFlow handoff.
No publishing, database state transition or YouTube action happens here.
"""
from __future__ import annotations
import hashlib
import re
import urllib.parse
import urllib.request
from pathlib import Path

BUCKET = "assets"
MAX_BYTES = 10 * 1024 * 1024
PATH = re.compile(r"^neural-beat/[A-Za-z0-9._-]{1,180}\.(jpg|jpeg|png|webp)$")
MIMES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirects are not allowed for private photo downloads")


def image_magic(data: bytes, ext: str) -> bool:
    if ext in ("jpg", "jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == "png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == "webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


def stage_images(paths: list[str], destination: Path, origin: str, key: str) -> list[dict]:
    parsed = urllib.parse.urlparse(origin)
    if (parsed.scheme != "https" or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.port is not None or parsed.path not in ("", "/")
            or not parsed.hostname.endswith(".supabase.co")
            or parsed.hostname.count(".") != 2):
        raise ValueError("Expected HTTPS Supabase project origin")
    if not key:
        raise ValueError("Server-side Supabase key is required")
    if not isinstance(paths, list) or len(paths) > 12 or len(set(paths)) != len(paths):
        raise ValueError("Invalid ordered image list")
    for path in paths:
        if not isinstance(path, str) or not PATH.fullmatch(path):
            raise ValueError("Invalid queued image path")
    if not destination.is_dir():
        raise ValueError("Staging directory is missing")
    opener = urllib.request.build_opener(NoRedirect())
    files = []
    try:
        for index, storage_path in enumerate(paths):
            ext = storage_path.rsplit(".", 1)[-1].lower()
            filename = f"photo-{index:02d}.{ext}"
            target = destination / filename
            url = (origin.rstrip("/") + "/storage/v1/object/authenticated/"
                   + BUCKET + "/" + urllib.parse.quote(storage_path, safe="/"))
            request = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {key}", "apikey": key,
            })
            total = 0
            digest = hashlib.sha256()
            first = bytearray()
            with opener.open(request, timeout=45) as response, target.open("xb") as output:
                if response.status != 200:
                    raise ValueError("Failed to download queued image")
                declared = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if declared and declared != MIMES[ext]:
                    raise ValueError("Queued image content type mismatch")
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise ValueError("Queued image exceeds size limit")
                    if len(first) < 16:
                        first.extend(chunk[:16 - len(first)])
                    digest.update(chunk)
                    output.write(chunk)
            if total < 100 or not image_magic(bytes(first), ext):
                raise ValueError("Invalid queued image content")
            files.append({
                "file": filename, "storagePath": storage_path,
                "bytes": total, "sha256": digest.hexdigest(),
            })
        return files
    except Exception:
        for item in destination.glob("photo-??.*"):
            if item.is_file():
                item.unlink()
        raise
