#!/usr/bin/env python3
"""Guardrail tests for the approval-gated, hash-pinned local job runner."""
import importlib.util
import json
import shutil
import subprocess
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


@unittest.skipUnless(all(shutil.which(x) for x in ("ffmpeg", "ffprobe")),
                     "FFmpeg unavailable")
class JobEndToEndTest(unittest.TestCase):
    def test_approved_manifest_renders_real_mp4_and_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = Path(tmp)
            media = workspace / "inputs"
            media.mkdir()
            sound = media / "audio.wav"
            jukebox = media / "jukebox.mp4"
            clip = media / "middle.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=330:duration=3",
                str(sound)
            ], check=True)
            for path, color in ((jukebox, "red"), (clip, "blue")):
                subprocess.run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=2:r=25",
                    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    str(path)
                ], check=True)
            item = lambda path: {"file": path.name, "sha256": runner.digest(path)}
            manifest = {
                "schema_version": 1, "approved_for_render": True,
                "publish": False, "format": "landscape",
                "audio": item(sound), "jukebox": item(jukebox),
                "clips": [item(clip)], "seconds": 2
            }
            job_file = workspace / "job.json"
            job_file.write_text(json.dumps(manifest), encoding="utf-8")
            output = workspace / "finished.mp4"
            preflight = runner.render(job_file, media, output, plan_only=True)
            self.assertEqual(preflight["status"], "validated")
            self.assertFalse(output.exists())
            result = runner.render(job_file, media, output)
            self.assertEqual(result["status"], "rendered")
            self.assertFalse(result["published"])
            self.assertEqual(result["sha256"], runner.digest(output))
            self.assertLess(abs(result["duration_seconds"] - 2), .5)
            streams = subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries",
                "stream=codec_type", "-of", "csv=p=0", str(output)
            ], text=True).splitlines()
            self.assertIn("audio", streams)
            self.assertIn("video", streams)
            with self.assertRaises(FileExistsError):
                runner.render(job_file, media, output)


class ManifestPreparationTest(unittest.TestCase):
    def test_creator_defaults_to_unapproved_nonpublishing_job(self):
        spec = importlib.util.spec_from_file_location(
            "job_preparer", Path(__file__).with_name("prepare-jukebox-job.py"))
        preparer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(preparer)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("song.wav", "cabinet.mp4", "scene.mp4"):
                (root / name).write_bytes(name.encode())
            with patch.object(preparer.runner.composer, "probe_media", return_value=30):
                manifest = preparer.build_manifest(
                    root, "song.wav", "cabinet.mp4", ["scene.mp4"], False, 25)
            self.assertFalse(manifest["approved_for_render"])
            self.assertFalse(manifest["publish"])
            self.assertEqual(manifest["clips"][0]["sha256"],
                             runner.digest(root / "scene.mp4"))
            with patch.object(runner.composer, "probe_media", return_value=30):
                with self.assertRaisesRegex(ValueError, "approval"):
                    runner.prepare(manifest, root)
                manifest["approved_for_render"] = True
                self.assertEqual(len(runner.prepare(manifest, root)[2]), 1)


class AdminStoryboardBridgeTest(unittest.TestCase):
    def test_imports_order_and_rejects_missing_scene(self):
        spec = importlib.util.spec_from_file_location(
            "job_preparer", Path(__file__).with_name("prepare-jukebox-job.py"))
        preparer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(preparer)
        storyboard = {
            "version": 1, "renderStatus": "planning_only",
            "localMediaIncluded": False, "style": "hybrid",
            "format": "portrait", "seconds": 30,
            "entries": [
                {"type": "jukebox_intro"},
                {"type": "music_video_scene", "sequence": 1, "filename": "first.mp4"},
                {"type": "music_video_scene", "sequence": 2, "filename": "second.mp4"},
                {"type": "jukebox_outro"},
            ]
        }
        with tempfile.TemporaryDirectory() as temp:
            file = Path(temp) / "storyboard.json"
            file.write_text(json.dumps(storyboard), encoding="utf-8")
            self.assertEqual(
                preparer.clips_from_storyboard(file),
                (["first.mp4", "second.mp4"], True, 30))
            storyboard["entries"][2]["filename"] = None
            file.write_text(json.dumps(storyboard), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "real local video"):
                preparer.clips_from_storyboard(file)
            storyboard["entries"][2]["filename"] = "second.mp4"
            storyboard["entries"][2]["sequence"] = 3
            file.write_text(json.dumps(storyboard), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "contiguous"):
                preparer.clips_from_storyboard(file)


@unittest.skipUnless(all(shutil.which(x) for x in ("ffmpeg", "ffprobe")),
                     "FFmpeg unavailable")
class StoryboardCommandFlowTest(unittest.TestCase):
    def test_storyboard_to_manifest_requires_explicit_render_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            media = base / "media"
            media.mkdir()
            audio, jukebox, scene = (media / name for name in
                                     ("audio.wav", "jukebox.mp4", "scene.mp4"))
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                str(audio)], check=True)
            for file, color in ((jukebox, "red"), (scene, "blue")):
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=320x180:d=2:r=25",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(file)],
                    check=True)
            storyboard = {
                "version": 1, "renderStatus": "planning_only",
                "localMediaIncluded": False, "style": "hybrid",
                "format": "landscape", "seconds": 2,
                "entries": [
                    {"type": "jukebox_intro"},
                    {"type": "music_video_scene", "sequence": 1,
                     "filename": "scene.mp4"},
                    {"type": "jukebox_outro"}
                ]
            }
            storyboard_file = base / "storyboard.json"
            storyboard_file.write_text(json.dumps(storyboard), encoding="utf-8")
            manifest_file = base / "manifest.json"
            subprocess.run([
                "python3", str(Path(__file__).with_name("prepare-jukebox-job.py")),
                "--media-dir", str(media), "--audio", audio.name,
                "--jukebox", jukebox.name, "--storyboard", str(storyboard_file),
                "--output", str(manifest_file)
            ], check=True, capture_output=True, text=True)
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            self.assertFalse(manifest["approved_for_render"])
            self.assertFalse(manifest["publish"])
            with self.assertRaisesRegex(ValueError, "approval"):
                runner.render(manifest_file, media, base / "video.mp4", plan_only=True)
            # Operator approval is explicit and only authorizes rendering.
            manifest["approved_for_render"] = True
            manifest_file.write_text(json.dumps(manifest), encoding="utf-8")
            result = runner.render(manifest_file, media, base / "video.mp4",
                                   plan_only=True)
            self.assertEqual(result["status"], "validated")
            self.assertEqual(result["scene_plan"][1]["clip"], scene.name)
            self.assertFalse((base / "video.mp4").exists())


if __name__ == "__main__":
    unittest.main()
