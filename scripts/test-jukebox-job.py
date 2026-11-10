#!/usr/bin/env python3
"""Guardrail tests for the approval-gated, hash-pinned local job runner."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "job_runner", Path(__file__).with_name("render-jukebox-job.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class JobValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        for name in ("audio.wav", "jukebox.mp4", "clip-a.mp4", "clip-b.mp4"):
            (self.root / name).write_bytes(name.encode())
        self.entry = lambda name: {
            "file": name, "sha256": runner.digest(self.root / name)}
        self.manifest = {
            "schema_version": 1, "approved_for_render": True, "publish": False,
            "format": "landscape", "audio": self.entry("audio.wav"),
            "jukebox": self.entry("jukebox.mp4"),
            "clips": [self.entry("clip-a.mp4"), self.entry("clip-b.mp4")],
            "seconds": 30
        }

    @patch.object(runner.composer, "probe_media", return_value=60)
    def test_valid_manifest_has_ordered_scenes(self, _probe):
        audio, jukebox, clips, portrait, seconds = runner.prepare(
            self.manifest, self.root)
        self.assertEqual([p.name for p in clips], ["clip-a.mp4", "clip-b.mp4"])
        self.assertEqual((portrait, seconds), (False, 30))
        self.assertEqual(audio.name, "audio.wav")
        self.assertEqual(jukebox.name, "jukebox.mp4")

    @patch.object(runner.composer, "probe_media", return_value=60)
    def test_render_requires_approval_and_no_publish(self, _probe):
        self.manifest["approved_for_render"] = False
        with self.assertRaisesRegex(ValueError, "approval"):
            runner.prepare(self.manifest, self.root)
        self.manifest["approved_for_render"] = True
        self.manifest["publish"] = True
        with self.assertRaisesRegex(ValueError, "disabled"):
            runner.prepare(self.manifest, self.root)

    def test_changed_input_is_rejected(self):
        (self.root / "clip-b.mp4").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            runner.prepare(self.manifest, self.root)

    def test_traversal_and_absolute_paths_are_rejected(self):
        for filename in ("../outside.mp4", "/tmp/outside.mp4"):
            self.manifest["clips"][0]["file"] = filename
            with self.assertRaisesRegex(ValueError, "inside|filename"):
                runner.prepare(self.manifest, self.root)

    def test_wrong_schema_and_unbounded_scene_count(self):
        self.manifest["schema_version"] = 7
        with self.assertRaisesRegex(ValueError, "schema_version"):
            runner.prepare(self.manifest, self.root)
        self.manifest["schema_version"] = 1
        self.manifest["clips"] *= 7
        with self.assertRaisesRegex(ValueError, "1–12"):
            runner.prepare(self.manifest, self.root)


if __name__ == "__main__":
    unittest.main()
