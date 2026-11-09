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

    def test_empty_title_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "title"):
                renderer.build_art("  ", "Re-master Freddy", Path(temp), False)


if __name__ == "__main__":
    unittest.main()
