#!/usr/bin/env python3
"""Match an exported Jukebox photo project against trusted private stage files.

Produces a *local* scene-plan JSON for render-jukebox-staged-private.py.
All image bytes must match the staging receipt in the same order. This does
not upload, queue, render, approve, or publish a video.
"""
import argparse
import base64
import binascii
import hashlib
import json
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

MAX_BACKUP_BYTES=55*1024*1024
MAX_TOTAL_MEDIA_BYTES=40*1024*1024
MIME_EXT={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}
SECTIONS={
    "Fri scene":"verse1", "Åpning":"opening", "Vers 1":"verse1",
    "Refreng":"chorus", "Vers 2":"verse2", "Bro / mellomspill":"bridge",
    "Vers 3":"verse3", "Avslutning":"outro",
}

def stage_validator():
    spec=spec_from_file_location(
        "jukebox_verified_staging",
        Path(__file__).with_name("render-jukebox-staged-private.py"))
    module=module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def create_plan(stage_dir:Path, project:Path, output:Path, expected_job_id:str,
                expected_song_id:str, expected_master_sha:str)->dict:
    validator=stage_validator()
    if not validator.UUID_RE.fullmatch(expected_job_id) or not validator.UUID_RE.fullmatch(expected_song_id):
        raise ValueError("Invalid expected job or song identifier")
    if not validator.SHA_RE.fullmatch(expected_master_sha):
        raise ValueError("Invalid approved master checksum")
    receipt=validator.read_json(stage_dir/"private-stage-receipt.json")
    if (receipt.get("version")!=1 or receipt.get("jobId")!=expected_job_id
        or receipt.get("songId")!=expected_song_id or receipt.get("masterSha256")!=expected_master_sha
        or receipt.get("publish") is not False
        or receipt.get("workerStatus")!="images_decoded_staged_only"):
        raise ValueError("Untrusted staged receipt identity")
    if not project.is_file() or project.stat().st_size>MAX_BACKUP_BYTES:
        raise ValueError("Missing or oversized exported project")
    try:
        data=json.loads(project.read_text(encoding="utf-8"))
    except (ValueError,OSError,UnicodeError) as error:
        raise ValueError("Invalid exported photo project") from error
    if (not isinstance(data,dict) or data.get("format")!="remaster-jukebox-portable"
        or type(data.get("version")) is not int or data["version"]!=1
        or data.get("songId")!=expected_song_id
        or data.get("videoFormat") not in ("landscape","portrait")
        or str(data.get("seconds")) not in ("full","15","30","60")
        or type(data.get("endWithLastScene")) is not bool):
        raise ValueError("Exported project does not match selected song")
    images=receipt.get("images")
    clips=data.get("clips")
    if (not isinstance(images,list) or not isinstance(clips,list)
        or not 1<=len(images)==len(clips)<=12
        or type(receipt.get("imageCount")) is not int
        or receipt["imageCount"]!=len(images)):
        raise ValueError("The photo project and private stage have different image counts")
    if (type(data.get("sceneCount")) is not int
        or not len(clips)<=data["sceneCount"]<=12):
        raise ValueError("Project scene count is smaller than selected photos")
    if any(not isinstance(clip,dict) for clip in clips):
        raise ValueError("Invalid photo entry")
    if sum(clip.get("finale") is True for clip in clips)>1:
        raise ValueError("Only one final scene may be pinned")
    if any(clip.get("finale") is True and index!=len(clips)-1
           for index,clip in enumerate(clips)):
        raise ValueError("The pinned final scene must be last")
    if any(clip.get("finale") is True for clip in clips) and not data["endWithLastScene"]:
        raise ValueError("Pinned final scene requires last-image ending")

    total=0
    scenes=[]
    for index,(item,clip) in enumerate(zip(images,clips)):
        if not isinstance(item,dict) or clip.get("kind")!="image":
            raise ValueError("Private render requires a project of still images")
        mime=clip.get("mime")
        encoded=clip.get("data")
        if mime not in MIME_EXT or not isinstance(encoded,str):
            raise ValueError("Unsupported photo MIME")
        prefix="data:"+mime+";base64,"
        if not encoded.startswith(prefix) or len(encoded)>14*1024*1024+100:
            raise ValueError("Invalid or oversized encoded photo")
        try:
            raw=base64.b64decode(encoded[len(prefix):],validate=True)
        except (ValueError,binascii.Error) as error:
            raise ValueError("Corrupt exported photo bytes") from error
        total+=len(raw)
        if len(raw)<1024 or len(raw)>10*1024*1024 or total>MAX_TOTAL_MEDIA_BYTES:
            raise ValueError("Photo project media quota exceeded")
        filename=f"photo-{index:02d}.{MIME_EXT[mime]}"
        stage_file=stage_dir/filename
        if (item.get("index")!=index or item.get("filename")!=filename
            or item.get("mime")!=mime or item.get("bytes")!=len(raw)
            or item.get("sha256")!=hashlib.sha256(raw).hexdigest()
            or stage_file.is_symlink() or not stage_file.is_file()
            or stage_file.stat().st_size!=len(raw)
            or validator.file_sha256(stage_file)!=item.get("sha256")):
            raise ValueError(f"Photo {index+1} does not match trusted staged bytes")
        section=clip.get("section","Fri scene")
        weight=clip.get("weight",2)
        if section not in SECTIONS or type(weight) is not int or weight not in (1,2,3):
            raise ValueError("Invalid photo section or timing weight")
        if clip.get("finale") is not True and clip.get("finale") is not False:
            raise ValueError("Invalid final-scene flag")
        scenes.append({"filename":filename,
                       "section":"outro" if clip["finale"] else SECTIONS[section],
                       "weight":weight})
    plan={"version":1,"jobId":expected_job_id,"songId":expected_song_id,
          "format":data["videoFormat"],
          "seconds":"full" if data["seconds"]=="full" else int(data["seconds"]),
          "endWithLastScene":data["endWithLastScene"],
          "scenes":scenes,"publish":False}
    if output.exists():
        raise ValueError("Refusing to overwrite an existing private plan")
    # Validate with the same rules as the actual private renderer.
    with __import__("tempfile").TemporaryDirectory(prefix="jukebox-plan-check-") as tmp:
        candidate=Path(tmp)/"scene-plan.json"
        candidate.write_text(json.dumps(plan),encoding="utf-8")
        validator.validate_staged_scene_plan(stage_dir,candidate,expected_job_id,
                                             expected_song_id,expected_master_sha)
    output.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+"\n",
                      encoding="utf-8")
    return {"jobId":expected_job_id,"songId":expected_song_id,
            "sceneCount":len(scenes),"plan":str(output),"publish":False}

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage-dir",type=Path,required=True)
    parser.add_argument("--photo-project",type=Path,required=True)
    parser.add_argument("--output-plan",type=Path,required=True)
    parser.add_argument("--job-id",required=True)
    parser.add_argument("--song-id",required=True)
    parser.add_argument("--master-sha256",required=True)
    args=parser.parse_args()
    result=create_plan(args.stage_dir,args.photo_project,args.output_plan,
                       args.job_id,args.song_id,args.master_sha256)
    print(json.dumps(result,ensure_ascii=False,indent=2))
