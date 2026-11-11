#!/usr/bin/env python3
"""Synthetic end-to-end private staging → pinned manifest → MP4 smoke test."""
import importlib.util
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def load(name, module):
    spec = importlib.util.spec_from_file_location(module, Path(__file__).with_name(name))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


stager = load("stage-jukebox-clips.py", "clip_stager")
preparer = load("prepare-jukebox-job.py", "job_preparer")
renderer = load("render-jukebox-job.py", "job_runner")
worker = load("run-jukebox-offline-worker.py", "offline_worker")
preview_gate = load("verify-jukebox-preview.py", "private_preview_gate")


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


@unittest.skipUnless(all(shutil.which(tool) for tool in ("ffmpeg", "ffprobe")),
                     "FFmpeg binaries unavailable")
class SyntheticPipelineTest(unittest.TestCase):
    def test_private_clip_to_unpublished_video(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            original = root / "original.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2:r=25",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(original),
            ], check=True)
            payload = original.read_bytes()
            job_id = "12345678-1234-1234-1234-123456789abc"
            clip_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
            export = {"version": 1, "jobId": job_id, "clips": [{
                "sceneIndex": 0,
                "path": f"staging/{job_id}/scene-0/{clip_id}.mp4",
                "contentType": "video/mp4", "bytes": len(payload),
            }], "publish": False, "approved_for_render": False}
            export_file = root / "reservations.json"
            export_file.write_text(json.dumps(export), encoding="utf-8")
            with patch.object(stager.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = Response(payload)
                receipt = stager.stage(export_file, root / "inputs",
                                       "https://example.supabase.co", "test-only-key")
            staged = root / "inputs"
            receipt_file = root / "receipt.json"
            receipt_file.write_text(json.dumps(receipt), encoding="utf-8")
            song = staged / "audio.wav"
            jukebox = staged / "jukebox.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                str(song),
            ], check=True)
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=25",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(jukebox),
            ], check=True)
            clips = preparer.clips_from_stage_receipt(receipt_file, staged)
            self.assertEqual(clips, ["scene-0.mp4"])
            manifest = preparer.build_manifest(staged, song.name, jukebox.name,
                                               clips, False, 2.0)
            self.assertFalse(manifest["approved_for_render"])
            self.assertFalse(manifest["publish"])
            job_file = root / "job.json"
            job_file.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "approval"):
                renderer.render(job_file, staged, root / "output.mp4")
            # Explicit test-only render approval; publication remains disabled.
            manifest["approved_for_render"] = True
            job_file.write_text(json.dumps(manifest), encoding="utf-8")
            result = renderer.render(job_file, staged, root / "output.mp4")
            self.assertEqual(result["status"], "rendered")
            self.assertFalse(result["published"])
            renderer.verify_rendered_mp4(root / "output.mp4", False, 2.0)
            self.assertEqual(result["sha256"], renderer.digest(root / "output.mp4"))

            # A new RealtyFlow export pins the exact song master, format and
            # duration before any private Storage fetch. Reject mismatches.
            export["handoff"] = {
                "masterSha256": renderer.digest(song),
                "format": "landscape", "seconds": 2,
                "templateVersion": "photo-v1-perspective-2026-11",
            }
            export_file.write_text(json.dumps(export), encoding="utf-8")
            for change, message in [
                ({"masterSha256": "0" * 64}, "song master SHA-256"),
                ({"format": "portrait"}, "Queued format"),
                ({"seconds": 30}, "Queued duration"),
            ]:
                wrong = dict(export)
                wrong["handoff"] = {**export["handoff"], **change}
                export_file.write_text(json.dumps(wrong), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    worker.run(export_file, song, jukebox,
                               root / "forbidden", root / "forbidden.mp4",
                               False, 2, True,
                               "https://example.supabase.co", "test-only-key")
                self.assertFalse((root / "forbidden").exists())
            export_file.write_text(json.dumps(export), encoding="utf-8")

            # One-command worker must refuse to touch private storage without
            # explicit approval, then run the same pipeline when authorized.
            with self.assertRaisesRegex(ValueError, "approve-render"):
                worker.run(export_file, song, jukebox, root / "worker", root / "worker.mp4",
                           False, 2, False, "https://example.supabase.co", "test-only-key")
            self.assertFalse((root / "worker").exists())
            with patch.object(worker.stager.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = Response(payload)
                assembled = worker.run(
                    export_file, song, jukebox, root / "worker", root / "worker.mp4",
                    False, 2, True, "https://example.supabase.co", "test-only-key")
            self.assertEqual(assembled["scene_count"], 1)
            self.assertFalse(assembled["published"])
            renderer.verify_rendered_mp4(root / "worker.mp4", False, 2)
            private_receipt = json.loads((root / "worker" / "render-receipt.json").read_text())
            self.assertEqual(private_receipt["job_id"], job_id)
            self.assertEqual(private_receipt["status"], "rendered_private")
            self.assertEqual(private_receipt["output"]["sha256"],
                             renderer.digest(root / "worker.mp4"))
            self.assertEqual(private_receipt["output"]["bytes"],
                             (root / "worker.mp4").stat().st_size)
            self.assertEqual(private_receipt["source"]["audio_sha256"],
                             renderer.digest(song))
            self.assertEqual(len(private_receipt["source"]["clips"]), 1)
            self.assertFalse(private_receipt["approved_for_upload"])
            self.assertFalse(private_receipt["approved_for_publication"])
            verified = preview_gate.verify(
                root / "worker" / "render-receipt.json", root / "worker.mp4",
                job_id, renderer.digest(song))
            self.assertEqual(verified["status"], "verified_for_private_review")
            self.assertFalse(verified["upload_approved"])
            with self.assertRaisesRegex(ValueError, "Song master"):
                preview_gate.verify(root / "worker" / "render-receipt.json",
                                    root / "worker.mp4", job_id, "0" * 64)
            with self.assertRaisesRegex(ValueError, "queued"):
                preview_gate.verify(root / "worker" / "render-receipt.json",
                                    root / "worker.mp4",
                                    "ffffffff-ffff-ffff-ffff-ffffffffffff",
                                    renderer.digest(song))
            with self.assertRaisesRegex(ValueError, "another output"):
                preview_gate.verify(root / "worker" / "render-receipt.json",
                                    root / "output.mp4", job_id, renderer.digest(song))



if __name__ == "__main__":
    unittest.main()
