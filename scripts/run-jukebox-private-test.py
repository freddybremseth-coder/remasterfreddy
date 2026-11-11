#!/usr/bin/env python3
"""Run ONE verified Jukebox job from an authenticated reservation export.

Requires a local canonical audio master and approved jukebox video asset. First
download the clip-export JSON from the authenticated RealtyFlow admin screen
while the job is queued. This is intentionally NOT an unattended scheduler and
does not connect to YouTube. Upload remains OFF unless separately approved.
"""
import argparse
import hashlib
import json
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location


def load(filename: str, name: str):
    spec = spec_from_file_location(name, Path(__file__).with_name(filename))
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


claim_worker = load("claim-jukebox-render.py", "claim_worker")
render_worker = load("run-jukebox-offline-worker.py", "render_worker")
upload_worker = load("upload-jukebox-private-preview.py", "upload_worker")
finalize_worker = load("finalize-jukebox-private-preview.py", "finalize_worker")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preflight(export: Path, audio: Path, jukebox: Path,
              work: Path, output: Path, job_id: str) -> dict:
    if not export.is_file() or not audio.is_file() or not jukebox.is_file():
        raise ValueError("Private test requires export, local master and jukebox video")
    if work.exists() or output.exists():
        raise ValueError("Private test needs new workspace and output paths")
    if output.name != job_id + ".mp4":
        raise ValueError("Private test MP4 must be named after the immutable job ID")
    if not claim_worker.UUID.fullmatch(job_id):
        raise ValueError("Invalid Jukebox job ID")
    data = json.loads(export.read_text(encoding="utf-8"))
    if (not isinstance(data, dict) or data.get("jobId") != job_id
            or data.get("publish") is not False
            or data.get("approved_for_render") is not False):
        raise ValueError("Expected a nonpublishing clip export for this exact job")
    handoff = data.get("handoff")
    if not isinstance(handoff, dict) or handoff.get("format") not in ("landscape", "portrait"):
        raise ValueError("Missing private Jukebox render handoff")
    if (not isinstance(handoff.get("masterSha256"), str)
            or sha256(audio) != handoff["masterSha256"]):
        raise ValueError("Local audio does not match queued master digest")
    seconds = handoff.get("seconds")
    if seconds is not None and (type(seconds) is not int or seconds not in (15, 30, 60)):
        raise ValueError("Queued Short duration must be 15, 30 or 60")
    if not isinstance(handoff.get("imagePaths"), list):
        raise ValueError("Ordered photo list must be included in handoff")
    if not isinstance(data.get("clips"), list):
        raise ValueError("Missing clip reservation list")
    if not data["clips"] and not handoff["imagePaths"]:
        raise ValueError("Job has no music visuals: add images or approved clips")
    return {
        "master": handoff["masterSha256"],
        "portrait": handoff["format"] == "portrait",
        "seconds": seconds,
    }



@contextmanager
def active_render_lease(job_id: str, attempt: int, origin: str, key: str):
    """Heartbeat through render/upload; reject lease loss before marking ready."""
    stopped = threading.Event()
    failures = []

    # Verify the claim remains active before any expensive media work starts.
    claim_worker.heartbeat(job_id, attempt, origin, key)

    def refresh():
        while not stopped.wait(30):
            try:
                claim_worker.heartbeat(job_id, attempt, origin, key)
            except Exception as error:
                failures.append(error)
                stopped.set()
                break

    thread = threading.Thread(target=refresh, name="jukebox-render-lease", daemon=True)
    thread.start()
    try:
        def check():
            if failures:
                raise ValueError("Jukebox render lease lost; do not finalize") from failures[0]
        yield check
        check()
    finally:
        stopped.set()
        thread.join(timeout=5)


def run_private_test(export: Path, audio: Path, jukebox: Path, workspace: Path,
                     output: Path, job_id: str, approve: bool,
                     upload: bool, project_origin: str, service_key: str,
                     render_enabled: bool, upload_enabled: bool) -> dict:
    if not approve or not render_enabled:
        raise ValueError("Private Jukebox test must be explicitly enabled")
    if upload and not upload_enabled:
        raise ValueError("Private storage upload is disabled")
    if not project_origin or not service_key:
        raise ValueError("Trusted Supabase worker credentials are required")
    values = preflight(export, audio, jukebox, workspace, output, job_id)
    # Claim AFTER local checks. No retry if another worker already holds job.
    claimed = claim_worker.claim(job_id, project_origin, service_key, True, render_enabled)
    if claimed["master_sha256"] != values["master"]:
        raise ValueError("Master changed during render claim")
    if (claimed["format"] != ("portrait" if values["portrait"] else "landscape")
            or claimed["seconds"] != values["seconds"]):
        raise ValueError("Queued output changed during render claim")
    with active_render_lease(
        job_id, claimed["attempt"], project_origin, service_key
    ) as check_lease:
        rendered = render_worker.run(
            export, audio, jukebox, workspace, output,
            values["portrait"], values["seconds"], True,
            project_origin, service_key)
        check_lease()
        result = {
            "job_id": job_id, "attempt": claimed["attempt"],
            "mp4": str(output), "sha256": rendered["sha256"],
            "state": "rendered_private", "youtube_published": False,
        }
        if upload:
            upload_worker.upload(
                workspace / "render-receipt.json", output, job_id,
                values["master"], project_origin, service_key, True, upload_enabled)
            check_lease()
            verified = finalize_worker.finalize(
                workspace / "render-receipt.json", output, job_id,
                values["master"], project_origin, service_key,
                True, upload_enabled, claimed["attempt"])
            result["state"] = verified["status"]
            result["storage_verified"] = True
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export", required=True, type=Path)
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument("--jukebox", required=True, type=Path)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--approve-private-test", action="store_true")
    parser.add_argument("--upload-private-preview", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_private_test(
        args.export, args.audio, args.jukebox, args.workspace, args.output,
        args.job_id, args.approve_private_test, args.upload_private_preview,
        os.environ.get("SUPABASE_URL", ""),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        os.environ.get("REMASTER_JUKEBOX_PRIVATE_RENDER_ENABLED") == "true",
        os.environ.get("REMASTER_JUKEBOX_PRIVATE_UPLOADS_ENABLED") == "true"
    ), indent=2))
