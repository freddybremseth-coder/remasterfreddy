#!/usr/bin/env python3
"""Stage one canonical Jukebox audio master from the configured Supabase project.

A caller passes a trusted, server-resolved catalog file_url and the immutable
master SHA-256 pinned in the queued Jukebox export. This code neither trusts
arbitrary audio URLs nor obtains Youtube credentials. Never logs the service key.
"""
from __future__ import annotations

import hashlib
import re
import urllib.parse
import urllib.request
from pathlib import Path

MAX_MASTER_BYTES = 100 * 1024 * 1024
ALLOWED_EXTENSIONS = frozenset((".mp3", ".wav", ".m4a", ".flac"))
HEX_SHA = re.compile(r"^[0-9a-f]{64}$")
SAFE_OBJECT = re.compile(r"^[A-Za-z0-9_./-]{1,500}$")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("External audio redirects are forbidden")


def project_host(origin: str) -> str:
    uri = urllib.parse.urlsplit(origin)
    if (uri.scheme != "https" or uri.username or uri.password or uri.port is not None
            or uri.path not in ("", "/") or uri.query or uri.fragment
            or not re.fullmatch(r"[a-z0-9]{20}\.supabase\.co", uri.hostname or "")):
        raise ValueError("Trusted Supabase project origin required")
    return uri.hostname


def validate_master_path(file_url: str, origin: str) -> tuple[str, str]:
    host = project_host(origin)
    parsed = urllib.parse.urlsplit(file_url)
    if (parsed.scheme != "https" or parsed.hostname != host
            or parsed.port is not None or parsed.username or parsed.password
            or parsed.query or parsed.fragment):
        raise ValueError("Catalog master must be hosted on the exact Supabase project")
    prefix = "/storage/v1/object/public/"
    if not parsed.path.startswith(prefix):
        raise ValueError("Only canonical Supabase Storage master objects are supported")
    name = parsed.path[len(prefix):]
    if (not SAFE_OBJECT.fullmatch(name) or "//" in name or
            any(p in (".", "..") for p in name.split("/"))):
        raise ValueError("Unsafe canonical master object path")
    bucket, sep, object_name = name.partition("/")
    if not sep or not object_name or bucket not in {"songs", "audio", "music", "song-files", "remaster-audio"}:
        raise ValueError("Master bucket must be explicitly allowlisted")
    extension = Path(object_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported canonical master extension")
    return name, extension


def audio_magic(data: bytes, ext: str) -> bool:
    if ext == ".mp3":
        return data[:3] == b"ID3" or (len(data) >= 2 and data[0] == 0xff and (data[1] & 0xe0) == 0xe0)
    if ext == ".wav":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if ext == ".flac":
        return data[:4] == b"fLaC"
    if ext == ".m4a":
        return len(data) >= 12 and data[4:8] == b"ftyp"
    return False


def stage_master(file_url: str, origin: str, expected_sha256: str, destination: Path) -> dict:
    if not isinstance(expected_sha256, str) or not HEX_SHA.fullmatch(expected_sha256):
        raise ValueError("Expected canonical master SHA-256 is required")
    object_path, ext = validate_master_path(file_url, origin)
    if not destination.is_dir() or destination.is_symlink():
        raise ValueError("Trusted staging directory must already exist")
    target = destination / ("master" + ext)
    if target.exists() or target.is_symlink():
        raise ValueError("Master already staged; do not overwrite")
    download = origin.rstrip("/") + "/storage/v1/object/public/" + urllib.parse.quote(object_path, safe="/")
    opener = urllib.request.build_opener(NoRedirect())
    req = urllib.request.Request(download, headers={"Accept": "application/octet-stream"})
    size = 0
    first = bytearray()
    digest = hashlib.sha256()
    try:
        with opener.open(req, timeout=45) as response, target.open("xb") as stream:
            if response.status != 200:
                raise ValueError("Canonical master download failed")
            mime = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            allowed = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav",
                       "audio/mp4", "audio/flac", "audio/x-flac", "application/octet-stream"}
            if mime and mime not in allowed:
                raise ValueError("Canonical master returned non-audio data")
            while part := response.read(1024 * 1024):
                size += len(part)
                if size > MAX_MASTER_BYTES:
                    raise ValueError("Canonical master exceeds size limit")
                if len(first) < 16:
                    first.extend(part[:16-len(first)])
                digest.update(part)
                stream.write(part)
        if size < 1024 or not audio_magic(bytes(first), ext):
            raise ValueError("Canonical master does not contain valid audio headers")
        if digest.hexdigest() != expected_sha256:
            raise ValueError("Canonical master has changed since queue creation")
        return {"file": target.name, "bytes": size,
                "sha256": digest.hexdigest(), "source_object": object_path}
    except Exception:
        target.unlink(missing_ok=True)
        raise
