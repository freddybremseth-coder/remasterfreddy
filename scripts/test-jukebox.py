#!/usr/bin/env python3
"""Smoke tests for the standalone jukebox renderer; no publishing or API calls."""
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("render-jukebox.py")
spec = importlib.util.spec_from_file_location("render_jukebox", SCRIPT)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


@unittest.skipUnless(all(shutil.which(x) for x in ("ffmpeg", "ffprobe", "inkscape")), "Render dependencies missing")
class JukeboxSmokeTest(unittest.TestCase):
    def test_landscape_and_portrait_mp4(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            audio = path / "test.wav"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(audio)], check=True)
            for portrait, expected in ((False, (1920, 1080)), (True, (1080, 1920))):
                with self.subTest(portrait=portrait):
                    mp4 = path / ("portrait.mp4" if portrait else "landscape.mp4")
                    renderer.render(audio, "A Song & More", mp4, portrait, seconds=1.5)
                    data = json.loads(subprocess.check_output([
                        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height",
                        "-of", "json", str(mp4)], text=True))
                    video = next(stream for stream in data["streams"] if stream["codec_type"] == "video")
                    self.assertEqual((video["width"], video["height"]), expected)
                    self.assertTrue(any(stream["codec_type"] == "audio" for stream in data["streams"]))

    def test_photographic_cabinet_option(self):
        """An external image can be composited without changing the vinyl pipeline."""
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            audio, photo, output = path / "test.wav", path / "cabinet.png", path / "photo.mp4"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(audio)], check=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=darkred:s=1920x1080", "-frames:v", "1", str(photo)], check=True)
            renderer.render(audio, "Blå natt & kjærlighet", output, False, seconds=0.5, cabinet_image=photo)
            self.assertTrue(output.is_file())
            self.assertGreater(output.stat().st_size, 1000)
            # Confirm the finished video has both video and audio streams.
            streams = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "stream=codec_type",
                "-of", "json", str(output)], text=True))["streams"]
            self.assertIn("video", [s["codec_type"] for s in streams])
            self.assertIn("audio", [s["codec_type"] for s in streams])

    def test_reject_vinyl_offsets_outside_frame(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            audio = path / "test.wav"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi",
                            "-i", "sine=frequency=440:duration=1", str(audio)], check=True)
            with self.assertRaisesRegex(ValueError, "outside"):
                renderer.render(audio, "Offset check", path / "invalid.mp4",
                                False, seconds=0.5, disc_offset_x=2000)
            self.assertFalse((path / "invalid.mp4").exists())

    def test_simple_template_has_no_record_changer(self):
        """The final renderer must not reintroduce the abandoned mechanical arm."""
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            if not shutil.which("inkscape"):
                self.skipTest("Inkscape missing")
            renderer.build_art("Test Song", "Re-master Freddy", directory, False)
            self.assertTrue((directory / "disc.png").exists())
            self.assertTrue((directory / "background.png").exists())
            self.assertTrue((directory / "tonearm.png").exists())
            self.assertFalse((directory / "arm.png").exists())
            self.assertFalse((directory / "arm.svg").exists())

    def test_reject_wrong_cabinet_dimensions(self):
        with tempfile.TemporaryDirectory() as temp:
            image = Path(temp) / "wrong.png"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi",
                            "-i", "color=c=red:s=800x600", "-frames:v", "1",
                            str(image)], check=True)
            with self.assertRaisesRegex(ValueError, "1920x1080"):
                renderer.validate_cabinet_image(image, False)
            with self.assertRaisesRegex(ValueError, "1080x1920"):
                renderer.validate_cabinet_image(image, True)

    def test_cabinet_autoselection_and_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.assertIsNone(renderer.default_cabinet_image(False, root))
            self.assertIsNone(renderer.default_cabinet_image(True, root))
            landscape = root / "cabinet-landscape.png"
            landscape.write_bytes(b"placeholder")
            self.assertEqual(renderer.default_cabinet_image(False, root), landscape)
            self.assertIsNone(renderer.default_cabinet_image(True, root))
            portrait = root / "cabinet-portrait.png"
            portrait.write_bytes(b"placeholder")
            self.assertEqual(renderer.default_cabinet_image(True, root), portrait)

    def test_empty_title_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "title"):
                renderer.build_art("  ", "Re-master Freddy", Path(temp), False)


if __name__ == "__main__":
    unittest.main()
