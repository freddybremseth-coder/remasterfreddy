#!/usr/bin/env python3
"""Offline tests for the private clip staging handoff."""
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "clip_stager", Path(__file__).with_name("stage-jukebox-clips.py"))
stager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stager)

JOB = "12345678-1234-1234-1234-123456789abc"
OBJECT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def sample():
    return {"version": 1, "jobId": JOB, "clips": [{
        "sceneIndex": 0,
        "path": f"staging/{JOB}/scene-0/{OBJECT}.mp4",
        "contentType": "video/mp4",
        "bytes": 1024,
    }]}


class Response(io.BytesIO):
    status = 200
    def __enter__(self):
        return self
    def __exit__(self, *_args):
        self.close()


class StagingTest(unittest.TestCase):
    def test_reservations_reject_wrong_job_and_duplicate_scene(self):
        export = sample()
        export["clips"][0]["path"] = export["clips"][0]["path"].replace(JOB, OBJECT)
        with self.assertRaises(ValueError):
            stager.validate_manifest(export)
        export = sample()
        export["clips"].append(dict(export["clips"][0]))
        with self.assertRaises(ValueError):
            stager.validate_manifest(export)

    def test_rejects_wrong_type_and_size(self):
        export = sample()
        export["clips"][0]["contentType"] = "application/octet-stream"
        with self.assertRaises(ValueError):
            stager.validate_manifest(export)
        export = sample()
        export["clips"][0]["bytes"] = 50 * 1024 * 1024 + 1
        with self.assertRaises(ValueError):
            stager.validate_manifest(export)

    @patch.object(stager.urllib.request, "build_opener")
    def test_stages_exact_bytes_and_returns_hashes(self, opener_factory):
        opener_factory.return_value.open.return_value = Response(b"x" * 1024)
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            manifest = base / "export.json"
            manifest.write_text(json.dumps(sample()), encoding="utf-8")
            result = stager.stage(manifest, base / "clips", "https://sample.supabase.co", "fake-test-key")
            self.assertEqual(result["clips"][0]["bytes"], 1024)
            self.assertEqual((base / "clips" / "scene-0.mp4").stat().st_size, 1024)
            self.assertFalse(result["approved_for_render"])
            self.assertFalse(result["publish"])

    @patch.object(stager.urllib.request, "build_opener")
    def test_rejects_mismatch_and_cleans_staging(self, opener_factory):
        opener_factory.return_value.open.return_value = Response(b"x" * 1023)
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            manifest = base / "export.json"
            manifest.write_text(json.dumps(sample()), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "reserved size"):
                stager.stage(manifest, base / "clips", "https://sample.supabase.co", "fake-test-key")
            self.assertFalse((base / "clips").exists())


if __name__ == "__main__":
    unittest.main()
