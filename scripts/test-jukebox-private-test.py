#!/usr/bin/env python3
"""No-network orchestration regression tests for the guarded private Jukebox test."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("private_test", Path(__file__).with_name("run-jukebox-private-test.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
JOB = "123e4567-e89b-42d3-a456-426614174000"


class PrivateTestTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.root = Path(self.dir.name)
        self.audio = self.root / "master.mp3"
        self.audio.write_bytes(b"MASTER SONG TEST" * 200)
        self.jukebox = self.root / "jukebox.mp4"
        self.jukebox.write_bytes(b"JUKEBOX VIDEO TEST" * 300)
        self.export = self.root / "export.json"
        self.master = hashlib.sha256(self.audio.read_bytes()).hexdigest()
        self.manifest = {
            "jobId": JOB, "publish": False, "approved_for_render": False,
            "clips": [],
            "handoff": {
                "masterSha256": self.master, "format": "landscape",
                "seconds": None, "imagePaths": ["neural-beat/family-photo.jpg"],
                "templateVersion": "photo-v1-perspective-2026-11",
            },
        }
        self.save()
        self.work = self.root / "new-workspace"
        self.output = self.root / (JOB + ".mp4")

    def save(self):
        self.export.write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_full_private_flow_is_ordered_and_never_publishes(self):
        calls = []
        def claim(*args):
            calls.append("claim")
            return {"attempt": 2, "master_sha256": self.master,
                    "format": "landscape", "seconds": None}
        def render(*args):
            calls.append("render")
            return {"sha256": "b" * 64}
        def upload(*args):
            calls.append("storage_upload")
        def finalize(*args):
            calls.append("verify_storage")
            self.assertEqual(args[-1], 2)
            return {"status": "ready_for_private_review"}
        with (patch.object(module.claim_worker, "claim", side_effect=claim),
              patch.object(module.render_worker, "run", side_effect=render),
              patch.object(module.upload_worker, "upload", side_effect=upload),
              patch.object(module.finalize_worker, "finalize", side_effect=finalize)):
            result = module.run_private_test(
                self.export, self.audio, self.jukebox, self.work, self.output,
                JOB, True, True, "https://example.supabase.co",
                "test-service-role", True, True)
        self.assertEqual(calls, ["claim", "render", "storage_upload", "verify_storage"])
        self.assertEqual(result["state"], "ready_for_private_review")
        self.assertFalse(result["youtube_published"])

    def test_render_only_does_not_upload(self):
        with (patch.object(module.claim_worker, "claim", return_value={
                "attempt": 1, "master_sha256": self.master,
                "format": "landscape", "seconds": None}),
              patch.object(module.render_worker, "run", return_value={
                "sha256": "b" * 64}),
              patch.object(module.upload_worker, "upload", side_effect=AssertionError("Upload forbidden"))):
            result = module.run_private_test(
                self.export, self.audio, self.jukebox, self.work, self.output,
                JOB, True, False, "https://example.supabase.co",
                "test-service-role", True, False)
        self.assertEqual(result["state"], "rendered_private")

    def test_bad_master_and_missing_visuals_prevent_claim(self):
        self.manifest["handoff"]["masterSha256"] = "0" * 64
        self.save()
        with self.assertRaisesRegex(ValueError, "Local audio"):
            module.preflight(self.export, self.audio, self.jukebox,
                             self.work, self.output, JOB)
        self.manifest["handoff"]["masterSha256"] = self.master
        self.manifest["handoff"]["imagePaths"] = []
        self.save()
        with self.assertRaisesRegex(ValueError, "no music visuals"):
            module.preflight(self.export, self.audio, self.jukebox,
                             self.work, self.output, JOB)

    def test_private_upload_needs_separate_flag(self):
        with patch.object(module.claim_worker, "claim", side_effect=AssertionError("No claim expected")):
            with self.assertRaisesRegex(ValueError, "Private storage upload is disabled"):
                module.run_private_test(
                    self.export, self.audio, self.jukebox, self.work, self.output,
                    JOB, True, True, "https://example.supabase.co",
                    "test-service-role", True, False)


if __name__ == "__main__":
    unittest.main()
