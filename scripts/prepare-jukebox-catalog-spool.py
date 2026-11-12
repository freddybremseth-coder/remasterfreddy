#!/usr/bin/env python3
"""Stage a canonical RealtyFlow master into an existing private Jukebox job folder.

Input job manifest is exported by the authenticated RealtyFlow admin API. The
song ID is server-pinned; the song catalog is resolved with service-role auth.
No browser URL is used. The source must be in this project's assets bucket and
its downloaded bytes must match the SHA-256 pinned at job creation.

Requires an already approved local cabinet.mp4 visual (separate asset approval).
Never starts a render, changes the job state, or publishes anything.
"""
import argparse
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

def load(name, alias):
    spec=spec_from_file_location(alias,Path(__file__).with_name(name))
    obj=module_from_spec(spec);spec.loader.exec_module(obj)
    return obj

masters=load("stage-jukebox-master.py","canonical_master")
cabinets=load("stage-jukebox-cabinet.py","approved_cabinet")
UUID=re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",re.I)


def lookup_song(origin: str, key: str, song_id: str) -> dict:
    masters.project_host(origin)
    if not key or not UUID.fullmatch(song_id):
        raise ValueError("Trusted catalog identity and service key required")
    query=urllib.parse.urlencode({
        "id":"eq."+song_id,
        "brand":"eq.remasterfreddy",
        "select":"id,brand,file_url,name"
    })
    url=origin.rstrip("/")+"/rest/v1/songs?"+query
    req=urllib.request.Request(url,headers={"apikey":key,"Authorization":"Bearer "+key})
    opener=urllib.request.build_opener(masters.NoRedirect())
    with opener.open(req,timeout=45) as result:
        if result.status!=200:
            raise ValueError("Catalog lookup failed")
        rows=json.loads(result.read(32768))
    if not isinstance(rows,list) or len(rows)!=1:
        raise ValueError("Canonical Re-master Freddy song not found")
    song=rows[0]
    if song.get("id")!=song_id or song.get("brand")!="remasterfreddy":
        raise ValueError("Canonical catalog identity mismatch")
    masters.validate_master_path(song.get("file_url",""),origin)
    return song


def prepare(folder: Path, origin: str, key: str) -> dict:
    if folder.is_symlink() or not folder.is_dir() or not UUID.fullmatch(folder.name):
        raise ValueError("Trusted UUID job directory required")
    manifest_path=folder/"clip-export.json"
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError("Missing verified private job export")
    data=json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data,dict) or data.get("jobId")!=folder.name or data.get("publish") is not False:
        raise ValueError("Private export does not match exact job")
    handoff=data.get("handoff")
    if not isinstance(handoff,dict) or not UUID.fullmatch(str(handoff.get("songId",""))):
        raise ValueError("Server-pinned catalog song ID is required")
    expected=handoff.get("masterSha256")
    if not isinstance(expected,str) or not masters.HEX_SHA.fullmatch(expected):
        raise ValueError("Server-pinned canonical audio SHA is required")
    if not isinstance(data.get("clips"),list) or not isinstance(handoff.get("imagePaths"),list):
        raise ValueError("Unverified media list")
    if not data["clips"] and not handoff["imagePaths"]:
        raise ValueError("No private music visuals")
    cabinet=folder/"cabinet.mp4"
    if cabinet.is_symlink():
        raise ValueError("Cabinet symlink forbidden")
    # Explicitly approved, content-pinned cabinet can be staged automatically.
    # Otherwise only an already-provisioned local file is eligible.
    cabinet_path=os.environ.get("REMASTER_JUKEBOX_APPROVED_CABINET_PATH","")
    cabinet_sha=os.environ.get("REMASTER_JUKEBOX_APPROVED_CABINET_SHA256","")
    if not cabinet.is_file() and (not cabinet_path or not cabinet_sha):
        raise ValueError("Approved cabinet.mp4 missing; no cabinet asset configured")
    if cabinet.is_file() and (cabinet_path or cabinet_sha):
        raise ValueError("Local cabinet and remote pinned cabinet configuration conflict")
    config=folder/"job.json"
    if config.exists() or config.is_symlink():
        raise ValueError("Job already staged; no implicit overwrite or retry")
    song=lookup_song(origin,key,handoff["songId"])
    staged=masters.stage_master(song["file_url"],origin,expected,folder)
    cabinet_staged=False
    try:
        if not cabinet.is_file():
            cabinets.stage_cabinet(cabinet_path,cabinet_sha,origin,folder)
            cabinet_staged=True
        payload={"jobId":folder.name,"audio":staged["file"],"jukebox":"cabinet.mp4"}
        with config.open("x",encoding="utf-8") as stream:
            json.dump(payload,stream,sort_keys=True)
    except Exception:
        (folder/staged["file"]).unlink(missing_ok=True)
        if cabinet_staged:
            cabinet.unlink(missing_ok=True)
        raise
    return {"job_id":folder.name,"song_id":song["id"],
            "audio_sha256":staged["sha256"],"audio_file":staged["file"],
            "cabinet_file":"cabinet.mp4","state":"staged_private","published":False}


if __name__=="__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--job-directory",type=Path,required=True)
    ap.add_argument("--prepare-private",action="store_true")
    args=ap.parse_args()
    if not args.prepare_private or os.environ.get("REMASTER_JUKEBOX_PRIVATE_SPOOL_ENABLED")!="true":
        ap.error("Explicit private staging consent and feature flag required")
    print(json.dumps(prepare(args.job_directory,
        os.environ.get("SUPABASE_URL",""),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY","")),indent=2))
