#!/usr/bin/env python3
"""Offline tests for protected user-photo intake and cinematic composition."""
import importlib.util
import io
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def load(filename, name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


stager = load("stage-jukebox-photos.py", "private_photos")
renderer = load("render-jukebox-photos.py", "photo_renderer")
worker = load("run-jukebox-offline-worker.py", "offline_worker")
composer = load("compose-jukebox-video.py", "jukebox_composer")


class Response(io.BytesIO):
    status = 200
    headers = {"content-type": "image/png"}
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.close()


class PhotoIntakeTests(unittest.TestCase):
    def test_rejects_external_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for path in ("https://evil.example/x.png", "../secret.png", "neural-beat/../../secret.png"):
                with self.assertRaisesRegex(ValueError, "Invalid queued image path"):
                    stager.stage_images([path], root, "https://example.supabase.co", "test-only")
            with self.assertRaisesRegex(ValueError, "Invalid ordered image list"):
                stager.stage_images(["neural-beat/a.png"] * 2, root,
                                    "https://example.supabase.co", "test-only")

    def test_preserves_priority_and_relative_order(self):
        self.assertEqual(renderer.interleave_visuals(
            ["clip-1.mp4", "clip-2.mp4"],
            ["photo-a.mp4", "photo-b.mp4"]),
            ["photo-a.mp4", "clip-1.mp4", "photo-b.mp4", "clip-2.mp4"])
        self.assertEqual(len(renderer.interleave_visuals(
            ["clip.mp4"], [f"photo-{i}.mp4" for i in range(12)])), 12)


@unittest.skipUnless(all(shutil.which(s) for s in ("ffmpeg", "ffprobe")),
                     "FFmpeg binaries unavailable")
class PhotoRenderTests(unittest.TestCase):
    def test_download_and_render_photo_video_with_no_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_file = root / "fixture.png"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "color=c=orange:s=640x360:d=0.2",
                            "-frames:v", "1", "-update", "1", str(image_file)],
                           check=True, capture_output=True)
            raw = image_file.read_bytes()
            self.assertGreater(len(raw), 100)
            with patch.object(stager.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = Response(raw)
                photos = stager.stage_images(["neural-beat/portrait.png"], root,
                                             "https://example.supabase.co", "test-only")
            self.assertEqual(len(photos), 1)
            self.assertEqual(photos[0]["storagePath"], "neural-beat/portrait.png")
            self.assertTrue((root / photos[0]["file"]).is_file())
            clips = renderer.render_photos(root, photos, duration=10,
                                           portrait=False, number_original_clips=1)
            self.assertEqual(len(clips), 1)
            self.assertTrue((root / clips[0]).is_file())
            self.assertGreater(composer.probe_media(root / clips[0], "video"), 2)
            raw_probe = subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
                "-of", "json", str(root / clips[0])], text=True)
            streams = json.loads(raw_probe)["streams"]
            self.assertEqual([track["codec_type"] for track in streams], ["video"])
            # Source photo remains unchanged after conversion.
            self.assertEqual((root / photos[0]["file"]).read_bytes(), raw)


    def test_complete_private_render_includes_custom_photo(self):
        """One synthetic full worker run, with all network interactions mocked."""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.mp4"
            jukebox = root / "jukebox.mp4"
            audio = root / "song.wav"
            photo = root / "photo.png"
            for output, color in ((source, "blue"), (jukebox, "red")):
                subprocess.run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=2:r=25",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(output)
                ], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "sine=frequency=330:duration=3",
                            str(audio)], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "color=c=orange:s=640x360:d=0.2",
                            "-frames:v", "1", "-update", "1", str(photo)],
                           check=True, capture_output=True)
            master = hashlib.sha256(audio.read_bytes()).hexdigest()
            export = {
                "version": 1, "jobId": "12345678-1234-1234-1234-123456789abc",
                "clips": [],
                "handoff": {
                    "masterSha256": master, "format": "landscape",
                    "seconds": 15, "templateVersion": "photo-v1-perspective-2026-11",
                    "imagePaths": ["neural-beat/photo.png"],
                },
                "publish": False, "approved_for_render": False,
            }
            manifest = root / "export.json"
            manifest.write_text(json.dumps(export), encoding="utf-8")

            def stage_clips(_manifest, dest, _origin, _key):
                dest.mkdir(parents=True)
                shutil.copyfile(source, dest / "scene-0.mp4")
                return {"clips": [{"sceneIndex": 0, "file": "scene-0.mp4",
                                   "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}]}

            def stage_photos(_paths, dest, _origin, _key):
                shutil.copyfile(photo, dest / "photo-00.png")
                return [{"file": "photo-00.png",
                         "storagePath": "neural-beat/photo.png",
                         "bytes": photo.stat().st_size,
                         "sha256": hashlib.sha256(photo.read_bytes()).hexdigest()}]

            with (patch.object(worker.stager, "stage", side_effect=stage_clips),
                  patch.object(worker.photo_stager, "stage_images", side_effect=stage_photos)):
                result = worker.run(
                    manifest, audio, jukebox, root / "work", root / "finished.mp4",
                    False, 15, True, "https://example.supabase.co", "test-only")
            self.assertEqual(result["scene_count"], 2)
            self.assertFalse(result["published"])
            receipt = json.loads(Path(result["receipt"]).read_text(encoding="utf-8"))
            self.assertEqual(receipt["source"]["photos"][0]["storagePath"],
                             "neural-beat/photo.png")
            rendered = json.loads((root / "work" / "render-manifest.json").read_text())
            self.assertEqual(len(rendered["clips"]), 2)
            self.assertTrue(rendered["clips"][0]["file"].startswith("photo-scene-"))
            self.assertTrue((root / "finished.mp4").is_file())
            self.assertGreater(composer.probe_media(root / "finished.mp4", "audio"), 2)


if __name__ == "__main__":
    unittest.main()
