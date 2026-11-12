#!/usr/bin/env python3
"""Download a specifically approved Jukebox cabinet from RealtyFlow assets.

This requires an operator-pinned object path AND exact SHA-256. There is no
auto-selection, public video publishing, filesystem overwrite, or URL fallback.
Run only on the trusted private worker host.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
import re
import urllib.parse
import urllib.request
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

spec=spec_from_file_location("jukebox_master_source",
    Path(__file__).with_name("stage-jukebox-master.py"))
source=module_from_spec(spec)
spec.loader.exec_module(source)

PATH=re.compile(r"^jukebox/[A-Za-z0-9_-]{1,100}/[A-Za-z0-9._-]{1,150}\.mp4$")
MAX_CABINET_BYTES=100*1024*1024


def verify_cabinet_video(path: Path) -> dict:
    """Reject MP4 header-only files; require a decodable video stream."""
    try:
        process = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration:stream=codec_type,width,height",
             "-of", "json", str(path)],
            capture_output=True, text=True, check=True, timeout=30,
        )
        info = json.loads(process.stdout)
        length = float(info.get("format", {}).get("duration", 0))
        tracks = [stream for stream in info.get("streams", [])
                  if stream.get("codec_type") == "video"]
        if (not math.isfinite(length) or not 2 <= length <= 300
                or len(tracks) != 1
                or type(tracks[0].get("width")) is not int
                or type(tracks[0].get("height")) is not int
                or tracks[0]["width"] < 640 or tracks[0]["height"] < 360):
            raise ValueError("Approved cabinet has unsupported video metadata")
        return {"duration_seconds": length,
                "width": tracks[0]["width"], "height": tracks[0]["height"]}
    except (subprocess.CalledProcessError, FileNotFoundError, TimeoutError,
            subprocess.TimeoutExpired, json.JSONDecodeError, TypeError) as exc:
        raise ValueError("Approved cabinet video cannot be probed") from exc


def stage_cabinet(object_path: str, sha256: str, origin: str,
                  directory: Path) -> dict:
    source.project_host(origin)
    if not isinstance(object_path,str) or not PATH.fullmatch(object_path):
        raise ValueError("Exact approved cabinet path in assets/jukebox required")
    if not isinstance(sha256,str) or not source.HEX_SHA.fullmatch(sha256):
        raise ValueError("Approved cabinet SHA-256 required")
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError("Trusted cabinet staging directory required")
    target=directory/"cabinet.mp4"
    if target.exists() or target.is_symlink():
        raise ValueError("Existing cabinet file must be reconciled, not overwritten")
    path="assets/"+object_path
    url=origin.rstrip("/")+"/storage/v1/object/public/"+urllib.parse.quote(path,safe="/")
    opener=urllib.request.build_opener(source.NoRedirect())
    request=urllib.request.Request(url,headers={"Accept":"video/mp4"})
    size=0
    digest=hashlib.sha256()
    header=bytearray()
    try:
        with opener.open(request,timeout=45) as response, target.open("xb") as writer:
            if response.status != 200:
                raise ValueError("Approved cabinet not available")
            mime=response.headers.get("Content-Type","").split(";")[0].strip().lower()
            if mime not in ("video/mp4","application/octet-stream"):
                raise ValueError("Approved cabinet returned incorrect MIME")
            while block := response.read(1024*1024):
                size+=len(block)
                if size>MAX_CABINET_BYTES:
                    raise ValueError("Approved cabinet is larger than allowed")
                if len(header)<16:
                    header.extend(block[:16-len(header)])
                digest.update(block)
                writer.write(block)
        if size<20_000 or header[4:8]!=b"ftyp":
            raise ValueError("Approved cabinet does not have MP4 container header")
        if digest.hexdigest()!=sha256:
            raise ValueError("Approved cabinet digest mismatch")
        video = verify_cabinet_video(target)
        return {"file":target.name,"bytes":size,"sha256":sha256,
                "storage_path":path,"video":video,"published":False}
    except Exception:
        target.unlink(missing_ok=True)
        raise
