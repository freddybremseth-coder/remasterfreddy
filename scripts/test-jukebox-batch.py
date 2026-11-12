#!/usr/bin/env python3
"""Manifest validation and idempotency tests without user music or publication."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("render-jukebox-batch.py")
spec = importlib.util.spec_from_file_location("jukebox_batch", SCRIPT)
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class BatchValidation(unittest.TestCase):
    def test_manifest_rejects_duplicate_slug_and_remote_audio(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "audio.mp3"
            audio.write_bytes(b"test")
            manifest = root / "list.json"
            manifest.write_text(json.dumps({"songs": [
                {"title": "One", "slug": "song", "audio": "audio.mp3"},
                {"title": "Two", "slug": "song", "audio": "audio.mp3"},
            ]}))
            with self.assertRaisesRegex(ValueError, "unique"):
                batch.load_manifest(manifest)
            manifest.write_text(json.dumps({"songs": [
                {"title": "One", "slug": "song", "audio": "https://example.com/file.mp3"},
            ]}))
            with self.assertRaisesRegex(ValueError, "local"):
                batch.load_manifest(manifest)

    def test_existing_output_is_preserved_when_settings_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "song.mp4"
            first.write_bytes(b"existing output")
            target, skip = batch.target_for(root, "song", {"template": "new"})
            self.assertEqual(target.name, "song-v2.mp4")
            self.assertFalse(skip)
            self.assertEqual(first.read_bytes(), b"existing output")


if __name__ == "__main__":
    unittest.main()
